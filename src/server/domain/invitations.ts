// Email invitations to join an org. The raw token exists only in the emailed
// link; the database stores its SHA-256 hash. Tokens expire (config), are
// single-use, revocable, and only usable by the invited email address.
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { brand } from "@/config/brand";
import { env } from "@/config/env";
import { sendEmail } from "../adapters/email";
import { audit } from "../audit";
import { canAssignRole, isLeaderRole } from "../authz/roles";
import { getNumberConfig } from "../config";
import { requireCapability, type RequestContext } from "../context";
import { invitations, memberships, organizations, users, ROLES } from "../db/schema";
import { Conflict, Forbidden, Invalid, NotFound } from "../errors";
import { hit } from "../ratelimit";
import { withSystem, withTenant } from "../tenant";

export const inviteInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES),
});

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const ROLE_LABEL: Record<(typeof ROLES)[number], string> = {
  owner: "Owner",
  dispatcher: "Administrator / dispatcher",
  crew_leader: "Crew leader / driver",
  crew_member: "Crew member",
  staff: "Staff",
};

export async function createInvitation(
  ctx: RequestContext,
  input: z.input<typeof inviteInput>,
  now = new Date(),
): Promise<{ id: string; token: string; expiresAt: Date }> {
  requireCapability(ctx, "org.manage");
  const data = inviteInput.parse(input);
  if (!canAssignRole(ctx.role, data.role)) throw new Forbidden("You can't invite someone with that role");

  await hit(`invite:${ctx.orgId}`, await getNumberConfig("rate_limit.invitations_per_hour"), 3600, now);

  const ttlDays = await getNumberConfig("invitation.ttl_days");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + ttlDays * 86_400_000);

  const row = await withTenant(ctx, async (tx) => {
    const existing = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(eq(memberships.orgId, ctx.orgId), eq(users.email, data.email), eq(memberships.status, "active")),
      );
    if (existing.length) throw new Conflict("That person is already a member");

    // A newer invite replaces any pending one for the same email.
    await tx
      .update(invitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(invitations.orgId, ctx.orgId),
          eq(invitations.email, data.email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );
    const [inv] = await tx
      .insert(invitations)
      .values({
        orgId: ctx.orgId,
        email: data.email,
        role: data.role,
        tokenHash: hashToken(token),
        invitedBy: ctx.userId,
        expiresAt,
      })
      .returning();
    await audit(tx, ctx, {
      action: "invitation.create",
      targetType: "invitation",
      targetId: inv.id,
      metadata: { email: data.email, role: data.role },
    });
    return inv;
  });

  const link = `${env().APP_URL}/invite/${token}`;
  await sendEmail({
    to: data.email,
    subject: `${ctx.name} invited you to ${ctx.org.name} on ${brand.productName}`,
    text: [
      `${ctx.name} invited you to join ${ctx.org.name} on ${brand.productName} as ${ROLE_LABEL[data.role]}.`,
      "",
      `Accept the invitation: ${link}`,
      "",
      `This link expires on ${expiresAt.toUTCString()} and can be used once.`,
      "If you weren't expecting this, you can ignore this email.",
    ].join("\n"),
  });

  return { id: row.id, token, expiresAt };
}

export async function listPendingInvitations(ctx: RequestContext, now = new Date()) {
  requireCapability(ctx, "org.manage");
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.orgId, ctx.orgId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .orderBy(desc(invitations.createdAt)),
  );
}

export async function revokeInvitation(ctx: RequestContext, invitationId: string, now = new Date()) {
  requireCapability(ctx, "org.manage");
  await withTenant(ctx, async (tx) => {
    const [inv] = await tx
      .update(invitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.orgId, ctx.orgId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning();
    if (!inv) throw new NotFound("Invitation not found");
    await audit(tx, ctx, { action: "invitation.revoke", targetType: "invitation", targetId: inv.id });
  });
}

export type InvitationPreview =
  | { state: "valid"; orgName: string; role: string; email: string; expiresAt: Date }
  | { state: "invalid" | "expired" | "used" | "revoked" };

// Safe to show to anyone holding the link; reveals nothing for a bad token.
export async function previewInvitation(token: string, now = new Date()): Promise<InvitationPreview> {
  return withSystem(async (tx) => {
    const [row] = await tx
      .select({ inv: invitations, orgName: organizations.name })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.orgId))
      .where(eq(invitations.tokenHash, hashToken(token)));
    if (!row) return { state: "invalid" };
    if (row.inv.acceptedAt) return { state: "used" };
    if (row.inv.revokedAt) return { state: "revoked" };
    if (row.inv.expiresAt <= now) return { state: "expired" };
    return {
      state: "valid",
      orgName: row.orgName,
      role: ROLE_LABEL[row.inv.role],
      email: row.inv.email,
      expiresAt: row.inv.expiresAt,
    };
  });
}

// Accepting is a trusted path: the user isn't a member yet. The checks here
// (token hash, expiry, single use, email match) are the authorization.
export async function acceptInvitation(
  userId: string,
  token: string,
  meta: { ip?: string | null; now?: Date } = {},
) {
  const now = meta.now ?? new Date();
  await hit(`invite-accept:${userId}`, await getNumberConfig("rate_limit.invitation_accept_per_hour"), 3600, now);
  return withSystem(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user || user.status !== "active") throw new Forbidden();

    // Claim the invitation atomically so it can only be used once.
    const [inv] = await tx
      .update(invitations)
      .set({ acceptedAt: now, acceptedUserId: userId })
      .where(
        and(
          eq(invitations.tokenHash, hashToken(token)),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
          sql`lower(${invitations.email}) = lower(${user.email})`,
        ),
      )
      .returning();
    if (!inv) {
      const [any] = await tx
        .select({ email: invitations.email })
        .from(invitations)
        .where(eq(invitations.tokenHash, hashToken(token)));
      if (any && any.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new Forbidden("This invitation was sent to a different email address");
      }
      throw new Invalid("This invitation is invalid, expired, or already used");
    }

    const [existing] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, inv.orgId), eq(memberships.userId, userId)));
    let membershipId: string;
    if (existing) {
      if (existing.status === "active") throw new Conflict("You're already a member of this organization");
      await tx
        .update(memberships)
        .set({ status: "active", role: inv.role, isLeaderSeat: isLeaderRole(inv.role), permissionOverrides: {} })
        .where(eq(memberships.id, existing.id));
      membershipId = existing.id;
    } else {
      const [m] = await tx
        .insert(memberships)
        .values({ orgId: inv.orgId, userId, role: inv.role, isLeaderSeat: isLeaderRole(inv.role) })
        .returning();
      membershipId = m.id;
    }
    // Following the emailed link proves control of the address.
    if (!user.emailVerified) await tx.update(users).set({ emailVerified: true }).where(eq(users.id, userId));

    await audit(tx, "system", {
      action: "invitation.accept",
      targetType: "invitation",
      targetId: inv.id,
      orgIds: [inv.orgId],
      ip: meta.ip,
      metadata: { userId, role: inv.role, membershipId },
    });
    return { orgId: inv.orgId, membershipId, role: inv.role };
  });
}
