"use server";

import { revalidatePath } from "next/cache";
import { acceptAward, applyToRoute, declineAward, withdrawApplication } from "@/server/domain/marketplace";
import { requireOrgSession, runAction, type ActionState } from "@/server/session";

export async function applyAction(routeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    const price = String(form.get("price") ?? "").trim();
    await applyToRoute(ctx, routeId, {
      message: String(form.get("message") ?? "") || null,
      proposedAvailability: String(form.get("availability") ?? "") || null,
      proposedCompensationCents: price ? Math.round(Number(price) * 100) : null,
    });
    revalidatePath(`/app/find/${routeId}`);
    return "Application sent. The posting company will review applicants and may award the route.";
  });
}

export async function withdrawAction(routeId: string, applicationId: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await withdrawApplication(ctx, applicationId);
    revalidatePath(`/app/find/${routeId}`);
    return "Application withdrawn.";
  });
}

export async function acceptAction(routeId: string, awardId: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await acceptAward(ctx, awardId);
    revalidatePath(`/app/find/${routeId}`);
    return "Assignment accepted. Exact addresses, contacts and files are below.";
  });
}

export async function declineAction(routeId: string, awardId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await declineAward(ctx, awardId, String(form.get("reason") ?? "") || undefined);
    revalidatePath(`/app/find/${routeId}`);
    return "Award declined.";
  });
}
