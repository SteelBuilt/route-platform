"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ROLES, type Role } from "@/server/db/schema";
import { createInvitation, revokeInvitation } from "@/server/domain/invitations";
import {
  changeMemberRole,
  dismissSectorPrompt,
  removeMember,
  setActiveOrg,
  setPermissionOverrides,
  setPrimarySector,
} from "@/server/domain/orgs";
import { getAuth } from "@/server/auth";
import { Invalid } from "@/server/errors";
import { hit } from "@/server/ratelimit";
import { requireOrgSession, requireSession, runAction, type ActionState } from "@/server/session";

export async function resendVerificationAction(_: ActionState): Promise<ActionState> {
  const ctx = await requireSession();
  return runAction(async () => {
    if (ctx.emailVerified) return "Your email is already confirmed.";
    await hit(`verify-resend:${ctx.userId}`, 5, 3600);
    await getAuth().api.sendVerificationEmail({ body: { email: ctx.email, callbackURL: "/app" } });
    return `Confirmation email sent to ${ctx.email}.`;
  });
}

export async function setPrimarySectorAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await setPrimarySector(ctx, String(form.get("primarySector") ?? ""));
    revalidatePath("/app", "layout");
    return "Primary sector saved.";
  });
}

export async function dismissSectorPromptAction(_: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await dismissSectorPrompt(ctx);
    revalidatePath("/app", "layout");
  });
}

export async function switchOrgAction(form: FormData) {
  const ctx = await requireSession();
  const orgId = String(form.get("orgId") ?? "");
  if (ctx.sessionId && orgId) await setActiveOrg(ctx.sessionId, ctx.userId, orgId);
  redirect("/app");
}

function readRole(form: FormData): Role {
  const role = String(form.get("role") ?? "");
  if (!ROLES.includes(role as Role)) throw new Invalid("Choose a role");
  return role as Role;
}

export async function inviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    const email = String(form.get("email") ?? "");
    await createInvitation(ctx, { email, role: readRole(form) });
    revalidatePath("/app/team");
    return `Invitation sent to ${email.trim().toLowerCase()}.`;
  });
}

export async function revokeInvitationAction(invitationId: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await revokeInvitation(ctx, invitationId);
    revalidatePath("/app/team");
    return "Invitation revoked.";
  });
}

export async function changeRoleAction(membershipId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await changeMemberRole(ctx, membershipId, readRole(form));
    revalidatePath("/app/team");
    return "Role updated.";
  });
}

export async function overridesAction(membershipId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await setPermissionOverrides(ctx, membershipId, {
      view_compensation: form.get("view_compensation") === "on",
      browse: form.get("browse") === "on",
      apply: form.get("apply") === "on",
      post_routes: form.get("post_routes") === "on",
    });
    revalidatePath("/app/team");
    return "Permissions updated.";
  });
}

export async function removeMemberAction(membershipId: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await removeMember(ctx, membershipId);
    revalidatePath("/app/team");
    return "Member removed.";
  });
}
