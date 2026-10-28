// Organizations and memberships.
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "../audit";
import { getConfig } from "../config";
import { requireCapability, requireOrg, type RequestContext } from "../context";
import { canAssignRole, isLeaderRole } from "../authz/roles";
import { getDb } from "../db/client";
import {
  ORG_KINDS,
  PERMISSION_OVERRIDES,
  ROLES,
  memberships,
  organizations,
  sessions,
  subscriptions,
  users,
  type Audience,
  type OrgKind,
  type Role,
} from "../db/schema";
import { Conflict, Forbidden, Invalid, NotFound } from "../errors";
import { withSystem, withTenant } from "../tenant";

export const createOrgInput = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(ORG_KINDS),
  hqState: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  hqZip: z
    .string()
    .trim()
    .regex(/^\d{5}$/)
    .optional(),
  timezone: z.string().default("America/Chicago"),
});

export function capabilitiesForKind(kind: OrgKind) {
  return { canPost: kind === "poster", canProvide: kind !== "poster" };
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${base || "org"}-${Math.random().toString(36).slice(2, 7)}`;
}

// Creating an org is a trusted path (the creator isn't a member yet). It makes
// the creator the owner and starts a beta subscription for each audience the
// org can use, per the 90-day beta (brief §19).
export async function createOrganization(
  userId: string,
  input: z.input<typeof createOrgInput>,
  opts: { isDemo?: boolean; now?: Date } = {},
) {
  const data = createOrgInput.parse(input);
  const now = opts.now ?? new Date();
  const caps = capabilitiesForKind(data.kind);
  return withSystem(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({
        name: data.name,
        slug: slugify(data.name),
        kind: data.kind,
        canPost: caps.canPost,
        canProvide: caps.canProvide,
        hqState: data.hqState,
        hqZip: data.hqZip,
        timezone: data.timezone,
        isDemo: opts.isDemo ?? false,
      })
      .returning();
    const [m] = await tx
      .insert(memberships)
      .values({ orgId: org.id, userId, role: "owner", isLeaderSeat: true })
      .returning();

    const audiences: Audience[] = [];
    if (caps.canPost) audiences.push("poster");
    if (caps.canProvide) audiences.push("provider");
    const betaOn = (await getConfig("beta.enabled", tx)) === true;
    const betaDays = (await getConfig("beta.length_days", tx)) ?? 90;
    const betaStart = await getConfig("beta.started_at", tx);
    const start = betaStart ? new Date(betaStart as string) : now;
    for (const audience of audiences) {
      await tx.insert(subscriptions).values({
        orgId: org.id,
        audience,
        status: betaOn ? "beta" : "none",
        betaEndsAt: betaOn ? new Date(start.getTime() + Number(betaDays) * 86_400_000) : null,
        founderEligible: betaOn,
      });
    }

    await audit(tx, "system", {
      action: "org.create",
      targetType: "organization",
      targetId: org.id,
      orgIds: [org.id],
      metadata: { createdBy: userId, kind: org.kind },
    });
    return { org, membership: m };
  });
}

export async function setActiveOrg(sessionId: string, userId: string, orgId: string) {
  const db = getDb();
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId), eq(memberships.status, "active")));
  if (!m) throw new NotFound("Organization not found");
  await db.update(sessions).set({ activeOrgId: orgId }).where(eq(sessions.id, sessionId));
}

export async function listMyOrgs(ctx: RequestContext) {
  return withTenant(ctx, (tx) =>
    tx
      .select({ id: organizations.id, name: organizations.name, kind: organizations.kind, role: memberships.role })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(and(eq(memberships.userId, ctx.userId), eq(memberships.status, "active"))),
  );
}

export async function getOrg(ctx: RequestContext, orgId: string) {
  return withTenant(ctx, async (tx) => {
    const [o] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
    if (!o) throw new NotFound();
    // Non-members only get the public view.
    if (o.id !== ctx.orgId) {
      return { id: o.id, name: o.name, kind: o.kind, hqState: o.hqState, publicOnly: true as const };
    }
    return { ...o, publicOnly: false as const };
  });
}

export async function listMembers(ctx: RequestContext) {
  requireOrg(ctx);
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: memberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        isLeaderSeat: memberships.isLeaderSeat,
        permissionOverrides: memberships.permissionOverrides,
        status: memberships.status,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.status, "active")))
      .orderBy(memberships.createdAt),
  );
}

async function loadMember(ctx: RequestContext & { orgId: string }, membershipId: string) {
  return withTenant(ctx, async (tx) => {
    const [m] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.id, membershipId), eq(memberships.orgId, ctx.orgId)));
    if (!m) throw new NotFound("Member not found");
    return m;
  });
}

async function ownerCount(ctx: RequestContext & { orgId: string }) {
  return withTenant(ctx, async (tx) => {
    const [r] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(memberships)
      .where(
        and(eq(memberships.orgId, ctx.orgId), eq(memberships.role, "owner"), eq(memberships.status, "active")),
      );
    return r.n;
  });
}

export async function changeMemberRole(ctx: RequestContext, membershipId: string, role: Role) {
  requireCapability(ctx, "org.manage");
  if (!ROLES.includes(role)) throw new Invalid("Unknown role");
  const m = await loadMember(ctx, membershipId);
  if (!canAssignRole(ctx.role, role) || (m.role === "owner" && ctx.role !== "owner")) throw new Forbidden();
  if (m.role === "owner" && role !== "owner" && (await ownerCount(ctx)) <= 1) {
    throw new Conflict("An organization needs at least one owner");
  }
  await withTenant(ctx, async (tx) => {
    await tx
      .update(memberships)
      .set({ role, isLeaderSeat: isLeaderRole(role) })
      .where(eq(memberships.id, membershipId));
    await audit(tx, ctx, {
      action: "membership.role_change",
      targetType: "membership",
      targetId: membershipId,
      metadata: { from: m.role, to: role },
    });
  });
}

export const overridesInput = z.object(
  Object.fromEntries(PERMISSION_OVERRIDES.map((k) => [k, z.boolean().optional()])) as Record<
    (typeof PERMISSION_OVERRIDES)[number],
    z.ZodOptional<z.ZodBoolean>
  >,
);

export async function setPermissionOverrides(
  ctx: RequestContext,
  membershipId: string,
  overrides: z.input<typeof overridesInput>,
) {
  requireCapability(ctx, "org.manage");
  const data = overridesInput.parse(overrides);
  const m = await loadMember(ctx, membershipId);
  if (m.role !== "crew_member" && m.role !== "staff") {
    throw new Invalid("Permission overrides apply only to crew members and staff");
  }
  await withTenant(ctx, async (tx) => {
    await tx.update(memberships).set({ permissionOverrides: data }).where(eq(memberships.id, membershipId));
    await audit(tx, ctx, {
      action: "membership.permissions_change",
      targetType: "membership",
      targetId: membershipId,
      metadata: { from: m.permissionOverrides, to: data },
    });
  });
}

export async function removeMember(ctx: RequestContext, membershipId: string) {
  requireCapability(ctx, "org.manage");
  const m = await loadMember(ctx, membershipId);
  if (m.role === "owner" && ctx.role !== "owner") throw new Forbidden();
  if (m.role === "owner" && (await ownerCount(ctx)) <= 1) {
    throw new Conflict("An organization needs at least one owner");
  }
  await withTenant(ctx, async (tx) => {
    await tx.update(memberships).set({ status: "removed" }).where(eq(memberships.id, membershipId));
    await audit(tx, ctx, {
      action: "membership.remove",
      targetType: "membership",
      targetId: membershipId,
      metadata: { userId: m.userId, role: m.role },
    });
  });
}

export async function leaderSeatCount(orgId: string) {
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.isLeaderSeat, true), eq(memberships.status, "active")));
  return r.n;
}
