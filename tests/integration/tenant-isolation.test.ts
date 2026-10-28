// Tenant isolation is enforced by the database (RLS), not just by app code.
// These tests go straight at the tables through withTenant, for every role.
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import {
  ROLES,
  auditLogs,
  crews,
  invitations,
  locations,
  memberships,
  organizations,
  preferredProviders,
  routeTemplates,
  subscriptions,
  users,
  vehicles,
  type Role,
} from "@/server/db/schema";
import type { RequestContext } from "@/server/context";
import { getOrg, listMembers } from "@/server/domain/orgs";
import { createInvitation } from "@/server/domain/invitations";
import { withPlatformAdmin, withTenant } from "@/server/tenant";
import { addMember, ctxFor, expectDbError, freshDb, makeOrg, makeUser } from "../helpers";

let A: Awaited<ReturnType<typeof makeOrg>>;
let B: Awaited<ReturnType<typeof makeOrg>>;
const roleCtx: Partial<Record<Role, RequestContext>> = {};

beforeAll(async () => {
  await freshDb();
  A = await makeOrg("poster", "Org A");
  B = await makeOrg("installer", "Org B");
  for (const role of ROLES) roleCtx[role] = role === "owner" ? A.ctx : await addMember(A.org.id, role);

  // Give B some private data of every kind.
  const db = getDb();
  await db.insert(crews).values({ orgId: B.org.id, name: "B crew" });
  await db.insert(vehicles).values({ orgId: B.org.id, label: "B truck", type: "truck" });
  await db.insert(preferredProviders).values({ orgId: B.org.id, providerOrgId: A.org.id });
  await db.insert(routeTemplates).values({ orgId: B.org.id, name: "B template", payload: {} });
  await db.insert(locations).values({
    orgId: B.org.id,
    line1: "123 Private Rd",
    city: "Tyler",
    state: "TX",
    zip: "75701",
    timezone: "America/Chicago",
  });
  await createInvitation(B.ctx, { email: "new.hire@example.test", role: "crew_member" });
});

const tables = {
  memberships,
  invitations,
  crews,
  vehicles,
  preferredProviders,
  routeTemplates,
  locations,
  subscriptions,
  auditLogs,
} as const;

describe.each(ROLES)("as %s of org A", (role) => {
  it.each(Object.keys(tables) as (keyof typeof tables)[])("cannot read org B's %s", async (name) => {
    const t = tables[name];
    const rows = await withTenant(roleCtx[role]!, (tx) => tx.select().from(t));
    for (const r of rows as Record<string, unknown>[]) {
      const orgId = r.orgId ?? (r.orgIds as string[] | undefined)?.[0];
      if (name === "auditLogs") {
        expect(r.orgIds as string[]).not.toContain(B.org.id);
      } else {
        expect(orgId).not.toBe(B.org.id);
      }
    }
  });

  it("cannot read org B's users", async () => {
    const rows = await withTenant(roleCtx[role]!, (tx) => tx.select().from(users).where(eq(users.id, B.owner.id)));
    expect(rows).toHaveLength(0);
  });

  it("cannot write into org B's tables", async () => {
    await expectDbError(
      withTenant(roleCtx[role]!, (tx) => tx.insert(crews).values({ orgId: B.org.id, name: "sneaky" })),
      /row-level security/,
    );
    await expectDbError(
      withTenant(roleCtx[role]!, (tx) =>
        tx.insert(memberships).values({ orgId: B.org.id, userId: roleCtx[role]!.userId, role: "owner", isLeaderSeat: true }),
      ),
      /row-level security/,
    );
  });

  it("cannot update org B's rows (no rows match)", async () => {
    const updated = await withTenant(roleCtx[role]!, (tx) =>
      tx.update(crews).set({ name: "renamed" }).where(eq(crews.orgId, B.org.id)).returning(),
    );
    expect(updated).toHaveLength(0);
    const updatedOrg = await withTenant(roleCtx[role]!, (tx) =>
      tx.update(organizations).set({ name: "hijacked" }).where(eq(organizations.id, B.org.id)).returning(),
    );
    expect(updatedOrg).toHaveLength(0);
  });

  it("gets only the public view of org B through the API", async () => {
    const o = await getOrg(roleCtx[role]!, B.org.id);
    expect(o.publicOnly).toBe(true);
    expect(o).not.toHaveProperty("phone");
    expect(o).not.toHaveProperty("email");
  });
});

describe("system tables are not reachable by the app role", () => {
  it.each(["sessions", "accounts", "verifications", "jobs", "billing_events", "dev_outbox", "rate_limits"])(
    "%s",
    async (table) => {
      await expectDbError(
        withTenant(A.ctx, (tx) => tx.execute(sql.raw(`select * from ${table} limit 1`))),
        /permission denied/,
      );
    },
  );
});

describe("audit log is append-only for the app role", () => {
  it("rejects update and delete", async () => {
    await expectDbError(
      withTenant(A.ctx, (tx) => tx.execute(sql`update audit_logs set action = 'x'`)),
      /permission denied/,
    );
    await expectDbError(withTenant(A.ctx, (tx) => tx.execute(sql`delete from audit_logs`)), /permission denied/);
  });
});

describe("own-org access still works", () => {
  it("lists only own members", async () => {
    const members = await listMembers(A.ctx);
    expect(members.length).toBe(ROLES.length);
    expect(members.every((m) => m.userId !== B.owner.id)).toBe(true);
  });

  it("a user in two orgs sees each org's data only while that org is active", async () => {
    const u = await makeUser();
    await getDb().insert(memberships).values([
      { orgId: A.org.id, userId: u.id, role: "dispatcher", isLeaderSeat: true },
      { orgId: B.org.id, userId: u.id, role: "dispatcher", isLeaderSeat: true },
    ]);
    const inA = await ctxFor(u.id, A.org.id);
    const inB = await ctxFor(u.id, B.org.id);
    const crewsA = await withTenant(inA, (tx) => tx.select().from(crews));
    const crewsB = await withTenant(inB, (tx) => tx.select().from(crews));
    expect(crewsA.some((c) => c.orgId === B.org.id)).toBe(false);
    expect(crewsB.some((c) => c.orgId === B.org.id)).toBe(true);
  });

  it("a forged active org that the user doesn't belong to falls back to their own org", async () => {
    const ctx = await ctxFor(A.owner.id, B.org.id);
    expect(ctx.orgId).toBe(A.org.id);
  });
});

describe("platform admin path", () => {
  it("can read across orgs only through withPlatformAdmin", async () => {
    const admin = await makeUser({ platformAdmin: true });
    const ctx = await ctxFor(admin.id);
    const viaTenant = await withTenant(ctx, (tx) => tx.select().from(crews));
    expect(viaTenant).toHaveLength(0);
    const viaAdmin = await withPlatformAdmin(ctx, (tx) => tx.select().from(crews));
    expect(viaAdmin.some((c) => c.orgId === B.org.id)).toBe(true);
  });

  it("refuses non-admins", async () => {
    await expect(withPlatformAdmin(A.ctx, async () => 1)).rejects.toThrow();
  });
});
