// Request context: who is calling and in which org. Built from the session on
// the server; the active org is never taken from client input directly.
import { and, asc, eq } from "drizzle-orm";
import type { IndustrySector } from "@/lib/sectors";
import { capabilitiesFor, type Capability } from "./authz/roles";
import { EmailNotVerified, Forbidden, Unauthenticated } from "./errors";
import { getDb, type Executor } from "./db/client";
import { memberships, organizations, sessions, users, type OrgKind, type Role } from "./db/schema";

export type RequestContext = {
  userId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  isPlatformAdmin: boolean;
  orgId: string | null;
  membershipId: string | null;
  role: Role | null;
  org: {
    id: string;
    name: string;
    kind: OrgKind;
    canPost: boolean;
    canProvide: boolean;
    timezone: string;
    isDemo: boolean;
    primarySector: IndustrySector | null;
  } | null;
  capabilities: Set<Capability>;
  sessionId?: string;
};

// Resolves the context for a user. If `preferredOrgId` names an org the user
// is an active member of, that org is used; otherwise the first membership.
export async function buildContext(
  userId: string,
  preferredOrgId?: string | null,
  db: Executor = getDb(),
): Promise<RequestContext> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.status !== "active") throw new Unauthenticated();

  const rows = await db
    .select({ m: memberships, o: organizations })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")))
    .orderBy(asc(memberships.createdAt));
  const usable = rows.filter((r) => r.o.status === "active");
  const pick = usable.find((r) => r.o.id === preferredOrgId) ?? usable[0];

  return {
    userId: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.name,
    isPlatformAdmin: user.platformRole === "platform_admin",
    orgId: pick?.o.id ?? null,
    membershipId: pick?.m.id ?? null,
    role: pick?.m.role ?? null,
    org: pick
      ? {
          id: pick.o.id,
          name: pick.o.name,
          kind: pick.o.kind,
          canPost: pick.o.canPost,
          canProvide: pick.o.canProvide,
          timezone: pick.o.timezone,
          isDemo: pick.o.isDemo,
          primarySector: pick.o.industrySector,
        }
      : null,
    capabilities: pick ? capabilitiesFor(pick.m.role, pick.m.permissionOverrides) : new Set(),
  };
}

export async function contextForSession(sessionId: string, userId: string): Promise<RequestContext> {
  const [s] = await getDb().select().from(sessions).where(eq(sessions.id, sessionId));
  const ctx = await buildContext(userId, s?.activeOrgId ?? null);
  ctx.sessionId = sessionId;
  return ctx;
}

export type OrgContext = RequestContext & {
  orgId: string;
  role: Role;
  membershipId: string;
  org: NonNullable<RequestContext["org"]>;
};

export function requireOrg(ctx: RequestContext): asserts ctx is OrgContext {
  if (!ctx.orgId || !ctx.role || !ctx.org) throw new Forbidden("Join or create an organization first");
}

// Posting and applying to routes require a verified email (owner decision 2026-10-28).
export function requireVerifiedEmail(ctx: RequestContext) {
  if (!ctx.emailVerified) {
    throw new EmailNotVerified();
  }
}

export function requireCapability(ctx: RequestContext, cap: Capability): asserts ctx is OrgContext {
  requireOrg(ctx);
  if (!ctx.capabilities.has(cap)) throw new Forbidden();
}
