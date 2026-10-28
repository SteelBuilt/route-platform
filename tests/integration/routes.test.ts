import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { routeTemplates, routeVersions, routes, subscriptions } from "@/server/db/schema";
import { searchRoutes } from "@/server/domain/discovery";
import { uploadRouteFile } from "@/server/domain/files";
import { acceptAward, applyToRoute, getRouteForProvider, issueAward } from "@/server/domain/marketplace";
import { setPermissionOverrides } from "@/server/domain/orgs";
import {
  addPreferredProvider,
  createDraft,
  duplicateRoute,
  getTemplate,
  publishRoute,
  saveAsTemplate,
  unpublishRoute,
  updateRoute,
} from "@/server/domain/routes";
import { categoryId, local, loadTestCentroids, routeFixture } from "../fixtures";
import { addMember, freshDb, makeOrg } from "../helpers";

let P: Awaited<ReturnType<typeof makeOrg>>;
let X: Awaited<ReturnType<typeof makeOrg>>;
let Y: Awaited<ReturnType<typeof makeOrg>>;

beforeAll(async () => {
  await freshDb();
  await loadTestCentroids();
  P = await makeOrg("poster", "Poster Co");
  X = await makeOrg("delivery_installer", "Provider X");
  Y = await makeOrg("installer", "Provider Y");
});

describe("drafts, versions, duplicates, templates", () => {
  it("records material vs minor changes in version history", async () => {
    const id = await createDraft(P.ctx, await routeFixture());
    const base = await routeFixture();
    expect(await updateRoute(P.ctx, id, { ...base, providerNotes: "Bring straps." })).toMatchObject({
      version: 2,
      material: false,
    });
    expect(await updateRoute(P.ctx, id, { ...base, providerNotes: "Bring straps.", compensationCents: 500000 })).toMatchObject({
      version: 3,
      material: true,
    });
    const v = await getDb().select().from(routeVersions).where(eq(routeVersions.routeId, id));
    expect(v.map((x) => x.changeKind).sort()).toEqual(["created", "material", "minor"]);
    expect(v.find((x) => x.changeKind === "material")!.changedFields).toEqual(["compensationCents"]);
  });

  it("duplicates a route as a new draft", async () => {
    const id = await createDraft(P.ctx, await routeFixture({ title: "Weekly Tyler run" }));
    const copy = await duplicateRoute(P.ctx, id);
    const [r] = await getDb().select().from(routes).where(eq(routes.id, copy));
    expect(r).toMatchObject({ status: "draft", title: "Weekly Tyler run (copy)", stopCount: 2 });
  });

  it("templates drop dates, addresses and contacts", async () => {
    const id = await createDraft(P.ctx, await routeFixture());
    const t = await saveAsTemplate(P.ctx, id, "East Texas pair");
    const tpl = await getTemplate(P.ctx, t);
    const json = JSON.stringify(tpl.payload);
    expect(json).not.toContain("Pine Hollow");
    expect(json).not.toContain("903-555");
    expect(tpl.payload.pickupWindowStart).toBeNull();
    expect(tpl.payload.stops[0].buildingWidthFt).toBe(30);
    const [row] = await getDb().select().from(routeTemplates).where(eq(routeTemplates.id, t));
    expect(row.orgId).toBe(P.org.id);
  });

  it("other orgs can't read, edit or duplicate a draft", async () => {
    const id = await createDraft(P.ctx, await routeFixture());
    const other = await makeOrg("poster");
    await expect(updateRoute(other.ctx, id, await routeFixture())).rejects.toMatchObject({ status: 404 });
    await expect(duplicateRoute(other.ctx, id)).rejects.toMatchObject({ status: 404 });
  });

  it("a published route with applicants can't go back to draft", async () => {
    const id = await createDraft(P.ctx, await routeFixture());
    await publishRoute(P.ctx, id);
    await applyToRoute(X.ctx, id, {});
    await expect(unpublishRoute(P.ctx, id)).rejects.toMatchObject({ status: 409 });
  });

  it("free crew members and staff can't post routes", async () => {
    const crew = await addMember(P.org.id, "crew_member");
    await expect(createDraft(crew, await routeFixture())).rejects.toMatchObject({ status: 403 });
  });
});

describe("visibility and free invited work", () => {
  it("invitation-only routes are invisible to uninvited providers", async () => {
    const id = await createDraft(
      P.ctx,
      await routeFixture({ title: "Invite only", visibility: "invitation", invitedProviderOrgIds: [X.org.id] }),
    );
    await publishRoute(P.ctx, id);
    expect((await searchRoutes(X.ctx, {})).results.some((r) => r.id === id)).toBe(true);
    expect((await searchRoutes(Y.ctx, {})).results.some((r) => r.id === id)).toBe(false);
    await expect(getRouteForProvider(Y.ctx, id)).rejects.toMatchObject({ status: 404 });
    await expect(applyToRoute(Y.ctx, id, {})).rejects.toMatchObject({ status: 404 });
  });

  it("an unpaid provider can apply to and accept invited work but not marketplace work", async () => {
    const unpaid = await makeOrg("installer", "Unpaid Crew");
    await getDb()
      .update(subscriptions)
      .set({ status: "canceled" })
      .where(and(eq(subscriptions.orgId, unpaid.org.id), eq(subscriptions.audience, "provider")));

    const invited = await createDraft(
      P.ctx,
      await routeFixture({ visibility: "invitation", invitedProviderOrgIds: [unpaid.org.id] }),
    );
    await publishRoute(P.ctx, invited);
    const market = await createDraft(P.ctx, await routeFixture({ title: "Open market" }));
    await publishRoute(P.ctx, market);

    const found = await searchRoutes(unpaid.ctx, {});
    expect(found.marketplaceAccess).toBe(false);
    expect(found.results.map((r) => r.id)).toEqual([invited]);
    await expect(applyToRoute(unpaid.ctx, market, {})).rejects.toMatchObject({ code: "not_entitled" });

    const app = await applyToRoute(unpaid.ctx, invited, {});
    const w = await issueAward(P.ctx, invited, app.id, { idempotencyKey: `unpaid-${invited}` });
    await expect(acceptAward(unpaid.ctx, w.id)).resolves.toBeTruthy();
  });

  it("preferred visibility snapshots the poster's preferred providers at publish", async () => {
    const poster = await makeOrg("poster");
    await addPreferredProvider(poster.ctx, Y.org.id);
    const id = await createDraft(poster.ctx, await routeFixture({ visibility: "preferred" }));
    await publishRoute(poster.ctx, id);
    expect((await searchRoutes(Y.ctx, {})).results.some((r) => r.id === id)).toBe(true);
    expect((await searchRoutes(X.ctx, {})).results.some((r) => r.id === id)).toBe(false);
  });
});

describe("discovery filters", () => {
  let tube: string;
  let portable: string;
  beforeAll(async () => {
    const poster = await makeOrg("poster", "Filter Poster");
    tube = await createDraft(
      poster.ctx,
      await routeFixture({
        title: "Single tube-steel install near Austin",
        buildingCategoryId: await categoryId("tube-steel"),
        jobType: "installation",
        pickup: null,
        pickupWindowStart: null,
        pickupWindowEnd: null,
        compensationCents: 90000,
        stops: [
          {
            address: { line1: "1 Main", city: "Austin", state: "TX", zip: "78701" },
            timezone: "America/Chicago",
            installWindowStart: local(20, 8),
            installWindowEnd: local(20, 17),
          },
        ],
      }),
    );
    await publishRoute(poster.ctx, tube);
    portable = await createDraft(
      poster.ctx,
      await routeFixture({
        title: "Shed to OKC",
        buildingCategoryId: await categoryId("portable-buildings"),
        jobType: "delivery",
        compensationCents: 35000,
        stops: [
          {
            address: { line1: "9 Elm", city: "Oklahoma City", state: "OK", zip: "73102" },
            timezone: "America/Chicago",
            deliveryWindowStart: local(5, 9),
            deliveryWindowEnd: local(5, 12),
          },
        ],
      }),
    );
    await publishRoute(poster.ctx, portable);
  });

  const ids = async (f: Parameters<typeof searchRoutes>[1]) => (await searchRoutes(X.ctx, f)).results.map((r) => r.id);

  it("category (umbrella includes children), job type, state", async () => {
    expect(await ids({ categoryId: await categoryId("metal-buildings") })).toContain(tube);
    expect(await ids({ categoryId: await categoryId("metal-buildings") })).not.toContain(portable);
    expect(await ids({ jobType: "delivery" })).toContain(portable);
    expect(await ids({ jobType: "delivery" })).not.toContain(tube);
    expect(await ids({ state: "OK" })).toEqual([portable]);
  });

  it("distance from a ZIP", async () => {
    expect(await ids({ zip: "78701", radiusMiles: 25 })).toEqual([tube]);
    expect(await ids({ zip: "73102", radiusMiles: 25 })).toContain(portable);
    const res = await searchRoutes(X.ctx, { zip: "99999" });
    expect(res.distanceNote).toMatch(/isn't in the ZIP location table/);
  });

  it("dates, compensation, single vs multi-stop", async () => {
    const d = local(20, 0).slice(0, 10);
    expect(await ids({ dateFrom: d, dateTo: d })).toContain(tube);
    expect(await ids({ dateFrom: d, dateTo: d })).not.toContain(portable);
    expect(await ids({ minCompensation: 800 })).toContain(tube);
    expect(await ids({ minCompensation: 800 })).not.toContain(portable);
    const single = await ids({ stops: "single" });
    expect(single).toContain(tube);
    expect((await ids({ stops: "multi" })).some((id) => id === tube)).toBe(false);
  });

  it("crew members can't browse; a browse override shows routes but hides pay", async () => {
    const crew = await addMember(X.org.id, "crew_member");
    await expect(searchRoutes(crew, {})).rejects.toMatchObject({ status: 403 });
    await setPermissionOverrides(X.ctx, crew.membershipId!, { browse: true });
    const { buildContext } = await import("@/server/context");
    const crew2 = await buildContext(crew.userId, X.org.id);
    const res = await searchRoutes(crew2, {});
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results.every((r) => r.compensationCents === null && r.compensationHidden)).toBe(true);
  });
});

describe("upload validation", () => {
  it("accepts real PDFs/images by content and rejects everything else", async () => {
    const id = await createDraft(P.ctx, await routeFixture());
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    await expect(uploadRouteFile(P.ctx, { routeId: id, visibility: "listing", name: "a.png", bytes: png })).resolves.toMatchObject({
      contentType: "image/png",
    });
    const exe = new TextEncoder().encode("MZ\x90\x00 this is not a pdf");
    await expect(uploadRouteFile(P.ctx, { routeId: id, visibility: "listing", name: "plans.pdf", bytes: exe })).rejects.toMatchObject({
      status: 422,
    });
    const big = new Uint8Array(26 * 1024 * 1024);
    big.set(new TextEncoder().encode("%PDF-1.4"));
    await expect(uploadRouteFile(P.ctx, { routeId: id, visibility: "listing", name: "big.pdf", bytes: big })).rejects.toThrow(
      /too large/,
    );
  });

  it("can't upload to another org's route", async () => {
    const id = await createDraft(P.ctx, await routeFixture());
    const pdf = new TextEncoder().encode("%PDF-1.4");
    const other = await makeOrg("poster");
    await expect(uploadRouteFile(other.ctx, { routeId: id, visibility: "listing", name: "x.pdf", bytes: pdf })).rejects.toMatchObject({
      status: 404,
    });
  });
});
