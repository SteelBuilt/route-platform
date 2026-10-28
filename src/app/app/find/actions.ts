"use server";

import { acceptAward, applyToRoute, declineAward, withdrawApplication } from "@/server/domain/marketplace";
import { requireOrgSession, runActionAndRedirect, type ActionState } from "@/server/session";

export async function applyAction(routeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runActionAndRedirect(async () => {
    const price = String(form.get("price") ?? "").trim();
    await applyToRoute(ctx, routeId, {
      message: String(form.get("message") ?? "") || null,
      proposedAvailability: String(form.get("availability") ?? "") || null,
      proposedCompensationCents: price ? Math.round(Number(price) * 100) : null,
    });
  }, `/app/find/${routeId}`, "applied");
}

export async function withdrawAction(routeId: string, applicationId: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runActionAndRedirect(async () => {
    await withdrawApplication(ctx, applicationId);
  }, `/app/find/${routeId}`, "withdrawn");
}

export async function acceptAction(routeId: string, awardId: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runActionAndRedirect(async () => {
    await acceptAward(ctx, awardId);
  }, `/app/find/${routeId}`, "accepted");
}

export async function declineAction(routeId: string, awardId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runActionAndRedirect(async () => {
    await declineAward(ctx, awardId, String(form.get("reason") ?? "") || undefined);
  }, `/app/find/${routeId}`, "declined");
}
