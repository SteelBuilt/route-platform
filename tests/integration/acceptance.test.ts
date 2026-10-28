// Brief acceptance tests 1 (minus subscription checkout, Phase 3), 2, 3, 4, 5, 6.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth";
import { buildContext, type RequestContext } from "@/server/context";
import { getDb } from "@/server/db/client";
import { applications, auditLogs, routes, users } from "@/server/db/schema";
import { searchRoutes } from "@/server/domain/discovery";
import { getFileLink, uploadRouteFile } from "@/server/domain/files";
import {
  acceptAward,
  applyToRoute,
  declineAward,
  getRouteForProvider,
  issueAward,
  listApplicants,
} from "@/server/domain/marketplace";
import { createOrganization } from "@/server/domain/orgs";
import { getProviderProfile, profileCompleteness, saveProviderProfile } from "@/server/domain/profiles";
import { createDraft, getRouteForPoster, publishRoute } from "@/server/domain/routes";
import { categoryId, loadTestCentroids, routeFixture } from "../fixtures";
import { addMember, freshDb } from "../helpers";

const PDF = new TextEncoder().encode("%PDF-1.4\n% test drawing\n");

async function signUp(email: string, name: string, verify = true) {
  const res = await getAuth().api.signUpEmail({ body: { email, password: "test password 123", name } });
  if (verify) await getDb().update(users).set({ emailVerified: true }).where(eq(users.id, res.user.id));
  return res.user.id;
}

let poster: RequestContext;
let providerA: RequestContext;
let providerB: RequestContext;
let routeId: string;
let appA: string;
let appB: string;
let fileId: string;

beforeAll(async () => {
  await freshDb();
  await loadTestCentroids();
});

describe("1. posting company signs up, creates a route and publishes it", () => {
  it("works end to end (subscription checkout is Phase 3; beta plan applies)", async () => {
    const uid = await signUp("dispatch@dealer.test", "Dana Dispatch");
    const { org } = await createOrganization(uid, { name: "East Texas Buildings", kind: "poster", hqState: "TX" });
    poster = await buildContext(uid, org.id);
    routeId = await createDraft(poster, await routeFixture());
    await publishRoute(poster, routeId);
    const [r] = await getDb().select().from(routes).where(eq(routes.id, routeId));
    expect(r.status).toBe("published");
    expect(r.pickupCity).toBe("Tyler");
    expect(r.stopCount).toBe(2);
    const doc = await uploadRouteFile(poster, {
      routeId,
      stopId: null,
      visibility: "assignment",
      name: "site-plan.pdf",
      bytes: PDF,
    });
    fileId = doc.id;
  });

  it("an unverified user can draft but not publish", async () => {
    const uid = await signUp("new@dealer.test", "New Person", false);
    const { org } = await createOrganization(uid, { name: "Unverified Dealer", kind: "poster" });
    const ctx = await buildContext(uid, org.id);
    const id = await createDraft(ctx, await routeFixture());
    await expect(publishRoute(ctx, id)).rejects.toMatchObject({ code: "email_not_verified" });
  });

  it("publishing validates the route (pickup window for delivery, stop windows, category)", async () => {
    const id = await createDraft(poster, await routeFixture({ pickupWindowStart: null, pickupWindowEnd: null }));
    await expect(publishRoute(poster, id)).rejects.toThrow(/pickup window/);
    const umbrella = await createDraft(poster, await routeFixture({ buildingCategoryId: await categoryId("metal-buildings") }));
    await expect(publishRoute(poster, umbrella)).rejects.toThrow(/group/);
    const portableInstall = await createDraft(
      poster,
      await routeFixture({ buildingCategoryId: await categoryId("portable-buildings"), jobType: "installation" }),
    );
    await expect(publishRoute(poster, portableInstall)).rejects.toThrow(/doesn't allow this job type/);
  });

  it("installation-only routes don't need a pickup", async () => {
    const base = await routeFixture();
    const id = await createDraft(poster, {
      ...base,
      jobType: "installation",
      pickup: null,
      pickupWindowStart: null,
      pickupWindowEnd: null,
      stops: base.stops.map((s) => ({ ...s, deliveryWindowStart: null, deliveryWindowEnd: null })),
    });
    await expect(publishRoute(poster, id)).resolves.toBeUndefined();
  });
});

describe("2. provider signs up, completes a profile, and applies", () => {
  it("works end to end", async () => {
    const uidA = await signUp("owner@crewa.test", "Alex Erector");
    const { org: a } = await createOrganization(uidA, { name: "Piney Woods Erectors", kind: "delivery_installer" });
    providerA = await buildContext(uidA, a.id);
    await saveProviderProfile(providerA, {
      summary: "Red iron and tube steel crews out of Longview.",
      yearsExperience: 12,
      crewSizeMin: 3,
      crewSizeMax: 6,
      buildingCategoryIds: [await categoryId("red-iron"), await categoryId("tube-steel")],
      jobTypes: ["delivery", "installation", "delivery_installation"],
      regions: [{ type: "state", state: "TX" }, { type: "zip_radius", zip: "75601", radiusMiles: 150 }],
    });
    const profile = await getProviderProfile(providerA, a.id);
    expect(profileCompleteness(profile).complete).toBe(true);
    expect(profile.verification).toBe("self_reported");

    const found = await searchRoutes(providerA, { zip: "75601", radiusMiles: 50, jobType: "delivery_installation" });
    expect(found.results.map((r) => r.id)).toContain(routeId);

    const app = await applyToRoute(providerA, routeId, { message: "Two crews available that week." });
    appA = app.id;

    // Applying doesn't lock the route: it stays published and others can apply.
    const uidB = await signUp("owner@crewb.test", "Blake Builder");
    const { org: b } = await createOrganization(uidB, { name: "Lone Star Steel Crew", kind: "installer" });
    providerB = await buildContext(uidB, b.id);
    appB = (await applyToRoute(providerB, routeId, { message: "Available." })).id;
    const [r] = await getDb().select().from(routes).where(eq(routes.id, routeId));
    expect(r.status).toBe("published");
  });

  it("the same org can't apply twice; posters can't apply to their own route", async () => {
    await expect(applyToRoute(providerA, routeId, {})).rejects.toMatchObject({ status: 409 });
    await expect(applyToRoute(poster, routeId, {})).rejects.toMatchObject({ status: 403 });
  });
});

describe("3. posting company reviews applicants and awards the route", () => {
  it("compares applicants and issues an award with an acceptance deadline", async () => {
    const list = await listApplicants(poster, routeId);
    expect(list).toHaveLength(2);
    const a = list.find((x) => x.id === appA)!;
    expect(a.orgName).toBe("Piney Woods Erectors");
    expect(a.crewSize).toEqual({ min: 3, max: 6 });
    expect(a.regions).toContain("TX");

    const now = new Date();
    const award = await issueAward(poster, routeId, appA, { idempotencyKey: "award-1", now });
    expect(award.acceptBy.getTime() - now.getTime()).toBe(24 * 3_600_000);
    // Same key again returns the same award (idempotent).
    expect((await issueAward(poster, routeId, appA, { idempotencyKey: "award-1" })).id).toBe(award.id);
    // A second, different award while one is live is rejected.
    await expect(issueAward(poster, routeId, appB, { idempotencyKey: "award-2" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("4. provider accepts; authorized assignment details become available", () => {
  it("private details are hidden before acceptance and released after", async () => {
    const before = await getRouteForProvider(providerA, routeId);
    expect(before.privateDetails).toBeNull();
    expect(JSON.stringify(before)).not.toContain("Pine Hollow");
    expect(JSON.stringify(before)).not.toContain("Gate code");
    expect(JSON.stringify(before)).not.toContain("margin is thin");
    expect(before.route.pickupCity).toBe("Tyler");
    expect(before.stops.map((s) => s.zip)).toEqual(["75601", "75901"]);
    await expect(getFileLink(providerA, fileId)).rejects.toMatchObject({ status: 404 });

    const [award] = await getDb()
      .select()
      .from((await import("@/server/db/schema")).awards)
      .where(eq((await import("@/server/db/schema")).awards.routeId, routeId));
    const assignment = await acceptAward(providerA, award.id);
    expect(assignment.status).toBe("scheduled");

    const after = await getRouteForProvider(providerA, routeId);
    expect(after.privateDetails).not.toBeNull();
    expect(after.privateDetails!.pickup!.line1).toBe("100 Factory Rd");
    const firstStop = after.stops[0];
    expect(after.privateDetails!.stops[firstStop.id].location!.line1).toBe("12 Pine Hollow Ln");
    expect(after.privateDetails!.stops[firstStop.id].contacts[0].phone).toBe("903-555-0100");
    expect(after.privateDetails!.stops[firstStop.id].accessInstructions).toBe("Gate code 4417");
    expect(after.privateDetails!.assignmentNotes).toBe("Call dispatch at pickup gate 3.");
    // Internal notes are never released.
    expect(JSON.stringify(after)).not.toContain("margin is thin");

    const link = await getFileLink(providerA, fileId);
    expect(link.url).toContain("/api/files/local/");

    const views = await getDb().select().from(auditLogs).where(eq(auditLogs.action, "private.view_route"));
    expect(views.length).toBeGreaterThan(0);

    const [r] = await getDb().select().from(routes).where(eq(routes.id, routeId));
    expect(r.status).toBe("assigned");
    const [other] = await getDb().select().from(applications).where(eq(applications.id, appB));
    expect(other.status).toBe("not_selected");
  });
});

describe("5. another applicant cannot accept the same assignment", () => {
  it("rejects the other applicant, a repeat accept, and concurrent accepts", async () => {
    const { awards } = await import("@/server/db/schema");
    const [award] = await getDb().select().from(awards).where(eq(awards.routeId, routeId));
    await expect(acceptAward(providerB, award.id)).rejects.toMatchObject({ status: 404 });
    await expect(acceptAward(providerA, award.id)).rejects.toMatchObject({ status: 409 });

    // Fresh route: two people from the awarded org race to accept.
    const id = await createDraft(poster, await routeFixture({ title: "Race test" }));
    await publishRoute(poster, id);
    const app = await applyToRoute(providerB, id, {});
    const w = await issueAward(poster, id, app.id, { idempotencyKey: "race" });
    const second = await addMember(providerB.orgId!, "dispatcher");
    const results = await Promise.allSettled([acceptAward(providerB, w.id), acceptAward(second, w.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("an expired award can't be accepted and reopens the route", async () => {
    const id = await createDraft(poster, await routeFixture({ title: "Expiry test" }));
    await publishRoute(poster, id);
    const app = await applyToRoute(providerA, id, {});
    const w = await issueAward(poster, id, app.id, { idempotencyKey: "exp", acceptHours: 1 });
    await expect(acceptAward(providerA, w.id, new Date(Date.now() + 2 * 3_600_000))).rejects.toThrow(/deadline/);
    const [r] = await getDb().select().from(routes).where(eq(routes.id, id));
    expect(r.status).toBe("published");
  });

  it("a declined award reopens the route for another award", async () => {
    const id = await createDraft(poster, await routeFixture({ title: "Decline test" }));
    await publishRoute(poster, id);
    const a1 = await applyToRoute(providerA, id, {});
    const a2 = await applyToRoute(providerB, id, {});
    const w = await issueAward(poster, id, a1.id, { idempotencyKey: "dec-1" });
    await declineAward(providerA, w.id, "Crew double-booked");
    const [r] = await getDb().select().from(routes).where(eq(routes.id, id));
    expect(r.status).toBe("published");
    await expect(issueAward(poster, id, a2.id, { idempotencyKey: "dec-2" })).resolves.toBeTruthy();
  });

  it("crew leaders can't accept awards", async () => {
    const leader = await addMember(providerA.orgId!, "crew_leader");
    await expect(acceptAward(leader, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 403 });
  });
});

describe("6. an unauthorized account cannot retrieve private addresses or documents", () => {
  it("other providers, unreleased roles and other posters are refused", async () => {
    const crewMember = await addMember(providerA.orgId!, "crew_member");
    const staff = await addMember(providerA.orgId!, "staff");
    const uid = await signUp("other@dealer2.test", "Other Poster");
    const { org } = await createOrganization(uid, { name: "Some Other Dealer", kind: "poster" });
    const otherPoster = await buildContext(uid, org.id);

    const b = await getRouteForProvider(providerB, routeId);
    expect(b.privateDetails).toBeNull();
    expect(JSON.stringify(b)).not.toContain("Pine Hollow");
    await expect(getFileLink(providerB, fileId)).rejects.toMatchObject({ status: 404 });

    for (const ctx of [crewMember, staff]) {
      await expect(getRouteForProvider(ctx, routeId)).rejects.toMatchObject({ status: 403 });
      await expect(getFileLink(ctx, fileId)).rejects.toMatchObject({ status: 404 });
    }
    await expect(getRouteForPoster(otherPoster, routeId)).rejects.toMatchObject({ status: 404 });
    await expect(getFileLink(otherPoster, fileId)).rejects.toMatchObject({ status: 404 });
  });
});
