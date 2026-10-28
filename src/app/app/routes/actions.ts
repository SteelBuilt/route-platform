"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { uploadRouteFile } from "@/server/domain/files";
import { issueAward, revokeAward, setApplicationReview } from "@/server/domain/marketplace";
import type { RouteInputRaw } from "@/server/domain/route-input";
import {
  addPreferredProvider,
  cancelRoute,
  createDraft,
  duplicateRoute,
  publishRoute,
  removePreferredProvider,
  saveAsTemplate,
  unpublishRoute,
  updateRoute,
} from "@/server/domain/routes";
import { Invalid } from "@/server/errors";
import { requireOrgSession, runAction, runActionAndRedirect, type ActionState } from "@/server/session";

function readPayload(form: FormData): RouteInputRaw {
  let data: RouteInputRaw;
  try {
    data = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {
    throw new Invalid("Couldn't read the form. Please try again.");
  }
  // Installation-only routes have no pickup.
  if (data.jobType === "installation") return { ...data, pickup: null, pickupWindowStart: null, pickupWindowEnd: null };
  return data;
}

export async function saveRouteAction(routeId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  let id = routeId;
  const res = await runAction(async () => {
    const input = readPayload(form);
    if (id) await updateRoute(ctx, id, input);
    else id = await createDraft(ctx, input);
  });
  if (res?.error) return res;
  redirect(`/app/routes/${id}?saved=1`);
}

export async function publishAction(routeId: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runActionAndRedirect(async () => {
    await publishRoute(ctx, routeId);
  }, `/app/routes/${routeId}`, "published");
}

export async function unpublishAction(routeId: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runActionAndRedirect(async () => {
    await unpublishRoute(ctx, routeId);
  }, `/app/routes/${routeId}`, "unpublished");
}

export async function cancelAction(routeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runActionAndRedirect(async () => {
    await cancelRoute(ctx, routeId, String(form.get("reason") ?? ""));
  }, `/app/routes/${routeId}`, "cancelled");
}

export async function duplicateAction(routeId: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  let id = "";
  const res = await runAction(async () => {
    id = await duplicateRoute(ctx, routeId);
  });
  if (res?.error) return res;
  redirect(`/app/routes/${id}/edit`);
}

export async function templateAction(routeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await saveAsTemplate(ctx, routeId, String(form.get("name") ?? ""));
    return "Saved as a template.";
  });
}

export async function reviewAction(
  routeId: string,
  applicationId: string,
  to: "shortlisted" | "declined" | "submitted",
  _: ActionState,
): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await setApplicationReview(ctx, applicationId, to);
    revalidatePath(`/app/routes/${routeId}`);
  });
}

export async function awardAction(routeId: string, applicationId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runActionAndRedirect(async () => {
    const hours = Number(form.get("acceptHours") || 24);
    // One key per form render: a double-submitted form returns the same award.
    const key = String(form.get("idempotencyKey") || randomUUID());
    await issueAward(ctx, routeId, applicationId, { idempotencyKey: key, acceptHours: hours });
  }, `/app/routes/${routeId}`, "awarded");
}

export async function revokeAwardAction(routeId: string, awardId: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runActionAndRedirect(async () => {
    await revokeAward(ctx, awardId);
  }, `/app/routes/${routeId}`, "revoked");
}

export async function uploadAction(routeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Invalid("Choose a file to upload.");
    const visibility = String(form.get("visibility") ?? "assignment") as "listing" | "assignment" | "internal";
    if (!["listing", "assignment", "internal"].includes(visibility)) throw new Invalid("Choose who can see the file.");
    await uploadRouteFile(ctx, {
      routeId,
      stopId: String(form.get("stopId") ?? "") || null,
      visibility,
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    revalidatePath(`/app/routes/${routeId}`);
    return "File uploaded.";
  });
}

export async function addPreferredAction(providerOrgId: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await addPreferredProvider(ctx, providerOrgId);
    revalidatePath("/app/providers");
    return "Added to your preferred providers.";
  });
}

export async function removePreferredAction(providerOrgId: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireOrgSession();
  return runAction(async () => {
    await removePreferredProvider(ctx, providerOrgId);
    revalidatePath("/app/providers");
    return "Removed.";
  });
}
