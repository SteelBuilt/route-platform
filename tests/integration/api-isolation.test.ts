// Acceptance test 15: a direct API request for another organization's job,
// stop address or file returns 403/404, for every role. Requests go through
// the real route handlers with real session cookies. (Messages arrive in
// Phase 2; their table and endpoint get the same test then.)
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as getFile } from "@/app/api/files/[id]/route";
import { GET as getRoute } from "@/app/api/routes/[id]/route";
import { getAuth } from "@/server/auth";
import { buildContext, type RequestContext } from "@/server/context";
import { getDb } from "@/server/db/client";
import { ROLES, locations, memberships, stopContacts, stopPrivate, stops, users, type Role } from "@/server/db/schema";
import { uploadRouteFile } from "@/server/domain/files";
import { createOrganization } from "@/server/domain/orgs";
import { createDraft, publishRoute } from "@/server/domain/routes";
import { withTenant } from "@/server/tenant";
import { loadTestCentroids, routeFixture } from "../fixtures";
import { freshDb } from "../helpers";

const PASSWORD = "test password 123";
let n = 0;

async function account(orgId: string | null, role: Role | null) {
  const email = `u${++n}@iso.test`;
  const res = await getAuth().api.signUpEmail({ body: { email, password: PASSWORD, name: `User ${n}` } });
  await getDb().update(users).set({ emailVerified: true }).where(eq(users.id, res.user.id));
  if (orgId && role) {
    await getDb()
      .insert(memberships)
      .values({ orgId, userId: res.user.id, role, isLeaderSeat: ["owner", "dispatcher", "crew_leader"].includes(role) });
  }
  const signIn = await getAuth().api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  const cookie = signIn.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { userId: res.user.id, cookie };
}

const call = (handler: typeof getRoute, path: string, id: string, cookie: string) =>
  handler(new Request(`http://localhost${path}/${id}`, { headers: { cookie } }), { params: Promise.resolve({ id }) });

let poster: RequestContext;
let draftRouteId: string;
let publishedRouteId: string;
let privateFileId: string;
let internalFileId: string;
const outsiders: { label: string; cookie: string; ctx: RequestContext }[] = [];

beforeAll(async () => {
  await freshDb();
  await loadTestCentroids();
  const owner = await account(null, null);
  const { org } = await createOrganization(owner.userId, { industrySector: "red_iron", name: "Target Dealer", kind: "poster" });
  poster = await buildContext(owner.userId, org.id);
  draftRouteId = await createDraft(poster, await routeFixture({ title: "Draft route" }));
  publishedRouteId = await createDraft(poster, await routeFixture({ title: "Published route" }));
  await publishRoute(poster, publishedRouteId);
  privateFileId = (
    await uploadRouteFile(poster, {
      routeId: publishedRouteId,
      visibility: "assignment",
      name: "plans.pdf",
      bytes: new TextEncoder().encode("%PDF-1.4 x"),
    })
  ).id;
  internalFileId = (
    await uploadRouteFile(poster, {
      routeId: publishedRouteId,
      visibility: "internal",
      name: "costs.pdf",
      bytes: new TextEncoder().encode("%PDF-1.4 y"),
    })
  ).id;

  // Every role in another poster org and in a provider org.
  for (const kind of ["poster", "delivery_installer"] as const) {
    const o = await account(null, null);
    const { org: other } = await createOrganization(o.userId, { industrySector: "red_iron", name: `Other ${kind}`, kind });
    for (const role of ROLES) {
      const acct = role === "owner" ? { ...o } : await account(other.id, role);
      outsiders.push({
        label: `${kind}/${role}`,
        cookie: role === "owner" ? (await signInExisting(o.userId)) : acct.cookie,
        ctx: await buildContext(acct.userId, other.id),
      });
    }
  }
});

async function signInExisting(userId: string) {
  const [u] = await getDb().select().from(users).where(eq(users.id, userId));
  const res = await getAuth().api.signInEmail({ body: { email: u.email, password: PASSWORD }, asResponse: true });
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("15. direct API access to another org's data", () => {
  it("the poster itself can read its route and file (sanity check)", async () => {
    const owner = await signInExisting(poster.userId);
    expect((await call(getRoute, "/api/routes", draftRouteId, owner)).status).toBe(200);
    expect((await call(getFile, "/api/files", internalFileId, owner)).status).toBe(302);
  });

  it("unauthenticated requests get 401", async () => {
    expect((await call(getRoute, "/api/routes", draftRouteId, "")).status).toBe(401);
    expect((await call(getFile, "/api/files", privateFileId, "")).status).toBe(401);
  });

  it("every outsider role gets 403/404 for a draft route, private and internal files", async () => {
    expect(outsiders).toHaveLength(ROLES.length * 2);
    for (const o of outsiders) {
      const draft = await call(getRoute, "/api/routes", draftRouteId, o.cookie);
      expect([403, 404], `${o.label} draft route`).toContain(draft.status);
      for (const f of [privateFileId, internalFileId]) {
        const res = await call(getFile, "/api/files", f, o.cookie);
        expect([403, 404], `${o.label} file`).toContain(res.status);
      }
    }
  });

  it("outsiders who can see a published route never receive its addresses, contacts or private notes", async () => {
    for (const o of outsiders) {
      const res = await call(getRoute, "/api/routes", publishedRouteId, o.cookie);
      const body = await res.text();
      if (res.status === 200) {
        expect(body, o.label).not.toContain("Pine Hollow");
        expect(body, o.label).not.toContain("Factory Rd");
        expect(body, o.label).not.toContain("903-555-0100");
        expect(body, o.label).not.toContain("Gate code");
        expect(body, o.label).not.toContain("margin is thin");
        expect(body, o.label).not.toContain("Call dispatch");
      } else {
        expect([403, 404], o.label).toContain(res.status);
      }
    }
  });

  it("the database itself returns no private rows to any outsider role (RLS backstop)", async () => {
    for (const o of outsiders) {
      const rows = await withTenant(o.ctx, async (tx) => ({
        locations: await tx.select().from(locations),
        contacts: await tx.select().from(stopContacts),
        stopPrivate: await tx.select().from(stopPrivate),
      }));
      expect(rows.locations.filter((l) => l.orgId === poster.orgId), o.label).toHaveLength(0);
      expect(rows.contacts, o.label).toHaveLength(0);
      expect(rows.stopPrivate, o.label).toHaveLength(0);
      const draftStops = await withTenant(o.ctx, (tx) => tx.select().from(stops).where(eq(stops.routeId, draftRouteId)));
      expect(draftStops, o.label).toHaveLength(0);
    }
  });
});
