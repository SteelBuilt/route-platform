import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { auditLogs, buildingCategories, memberships, subscriptions } from "@/server/db/schema";
import { listCategories, upsertCategory } from "@/server/domain/catalog";
import {
  changeMemberRole,
  createOrganization,
  removeMember,
  setPermissionOverrides,
} from "@/server/domain/orgs";
import { buildContext } from "@/server/context";
import { withTenant } from "@/server/tenant";
import { addMember, ctxFor, expectDbError, freshDb, makeOrg, makeUser } from "../helpers";

beforeAll(async () => {
  await freshDb();
});

describe("catalog", () => {
  it("seeds the brief's categories with metal buildings as an umbrella", async () => {
    const { ctx } = await makeOrg("poster");
    const cats = await listCategories(ctx);
    const bySlug = Object.fromEntries(cats.map((c) => [c.slug, c]));
    expect(bySlug["portable-buildings"]).toMatchObject({ defaultJobType: "delivery", allowedJobTypes: ["delivery"] });
    expect(bySlug["metal-buildings"].isUmbrella).toBe(true);
    expect(bySlug["tube-steel"].parentId).toBe(bySlug["metal-buildings"].id);
    expect(bySlug["red-iron"].parentId).toBe(bySlug["metal-buildings"].id);
    expect(bySlug["red-iron"].allowedJobTypes).toEqual(["delivery", "installation", "delivery_installation"]);
    expect(bySlug["other-systems"]).toBeTruthy();
  });

  it("only platform admins can manage categories, and changes are audited", async () => {
    const { ctx } = await makeOrg("poster");
    const input = {
      name: "Carports",
      slug: "carports",
      allowedJobTypes: ["delivery", "installation"] as const,
      defaultJobType: "installation" as const,
    };
    await expect(upsertCategory(ctx, { ...input, allowedJobTypes: [...input.allowedJobTypes] })).rejects.toMatchObject({
      status: 403,
    });
    // Even bypassing the app check, RLS blocks a non-admin write.
    await expectDbError(
      withTenant(ctx, (tx) =>
        tx.insert(buildingCategories).values({ ...input, allowedJobTypes: [...input.allowedJobTypes] }),
      ),
      /row-level security/,
    );

    const admin = await makeUser({ platformAdmin: true });
    const adminCtx = await ctxFor(admin.id);
    const row = await upsertCategory(adminCtx, { ...input, allowedJobTypes: [...input.allowedJobTypes] });
    expect(row.slug).toBe("carports");
    const logs = await getDb().select().from(auditLogs).where(eq(auditLogs.targetId, row.id));
    expect(logs[0].action).toBe("catalog.category_create");
  });

  it("rejects a default job type outside the allowed list", async () => {
    const admin = await makeUser({ platformAdmin: true });
    await expect(
      upsertCategory(await ctxFor(admin.id), {
        name: "Bad",
        slug: "bad",
        allowedJobTypes: ["delivery"],
        defaultJobType: "installation",
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("organizations", () => {
  it.each([
    ["poster", true, false, ["poster"]],
    ["installer", false, true, ["provider"]],
    ["transporter", false, true, ["provider"]],
    ["delivery_installer", false, true, ["provider"]],
  ] as const)("%s orgs: canPost=%s canProvide=%s, subscriptions %j", async (kind, canPost, canProvide, audiences) => {
    const u = await makeUser();
    const { org } = await createOrganization(u.id, { name: `${kind} co`, kind });
    expect(org).toMatchObject({ canPost, canProvide });
    const subs = await getDb().select().from(subscriptions).where(eq(subscriptions.orgId, org.id));
    expect(subs.map((s) => s.audience).sort()).toEqual([...audiences]);
    const ctx = await buildContext(u.id);
    expect(ctx.role).toBe("owner");
  });

  it("free roles don't take leader seats; leader roles do", async () => {
    const { org } = await makeOrg("installer");
    for (const role of ["crew_member", "staff", "crew_leader", "dispatcher"] as const) {
      const c = await addMember(org.id, role);
      const [m] = await getDb().select().from(memberships).where(eq(memberships.id, c.membershipId!));
      expect(m.isLeaderSeat).toBe(role === "crew_leader" || role === "dispatcher");
    }
  });

  it("role changes update seat flags, keep at least one owner, and are audited", async () => {
    const { org, ctx } = await makeOrg("installer");
    const crew = await addMember(org.id, "crew_member");
    await changeMemberRole(ctx, crew.membershipId!, "crew_leader");
    const [m] = await getDb().select().from(memberships).where(eq(memberships.id, crew.membershipId!));
    expect(m).toMatchObject({ role: "crew_leader", isLeaderSeat: true });
    await expect(changeMemberRole(ctx, ctx.membershipId!, "dispatcher")).rejects.toMatchObject({ status: 409 });
    await expect(removeMember(ctx, ctx.membershipId!)).rejects.toMatchObject({ status: 409 });
    const logs = await getDb().select().from(auditLogs).where(eq(auditLogs.targetId, crew.membershipId!));
    expect(logs.map((l) => l.action)).toContain("membership.role_change");
  });

  it("dispatchers can't promote to owner or demote an owner", async () => {
    const { org, ctx: owner } = await makeOrg("installer");
    const dispatcher = await addMember(org.id, "dispatcher");
    const crew = await addMember(org.id, "crew_member");
    await expect(changeMemberRole(dispatcher, crew.membershipId!, "owner")).rejects.toMatchObject({ status: 403 });
    await expect(changeMemberRole(dispatcher, owner.membershipId!, "staff")).rejects.toMatchObject({ status: 403 });
  });

  it("can't manage members of another org (404)", async () => {
    const A = await makeOrg("installer");
    const B = await makeOrg("installer");
    const bCrew = await addMember(B.org.id, "crew_member");
    await expect(changeMemberRole(A.ctx, bCrew.membershipId!, "dispatcher")).rejects.toMatchObject({ status: 404 });
    await expect(removeMember(A.ctx, bCrew.membershipId!)).rejects.toMatchObject({ status: 404 });
  });

  it("permission overrides only apply to free roles and widen their capabilities", async () => {
    const { org, ctx } = await makeOrg("installer");
    const crew = await addMember(org.id, "crew_member");
    expect(crew.capabilities.has("compensation.view")).toBe(false);
    await setPermissionOverrides(ctx, crew.membershipId!, { view_compensation: true });
    const after = await buildContext(crew.userId, org.id);
    expect(after.capabilities.has("compensation.view")).toBe(true);
    expect(after.capabilities.has("marketplace.browse")).toBe(false);
    const leader = await addMember(org.id, "crew_leader");
    await expect(setPermissionOverrides(ctx, leader.membershipId!, { browse: true })).rejects.toMatchObject({
      status: 422,
    });
  });

  it("removed members lose access to the org", async () => {
    const { org, ctx } = await makeOrg("installer");
    const crew = await addMember(org.id, "crew_member");
    await removeMember(ctx, crew.membershipId!);
    const after = await buildContext(crew.userId);
    expect(after.orgId).toBeNull();
  });
});
