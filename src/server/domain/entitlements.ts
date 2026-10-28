// Entitlement service (docs/ARCHITECTURE.md §5). Reads the subscriptions table;
// Stripe (Phase 3) becomes the writer of that table, this module stays the reader.
import { and, eq } from "drizzle-orm";
import { getConfig } from "../config";
import { getDb, type Executor } from "../db/client";
import { subscriptions, type Audience, type SubscriptionStatus } from "../db/schema";

export type Feature =
  // Poster plan
  | "route.publish"
  | "route.award"
  // Provider plan
  | "marketplace.browse"
  | "marketplace.apply"
  | "marketplace.accept"
  // Free for any org: invited work and anything already committed to
  | "invited.apply"
  | "invited.accept"
  | "assignment.execute"
  | "messages.active_assignment"
  | "history.read"
  | "org.export";

const FEATURE_AUDIENCE: Record<Feature, Audience | null> = {
  "route.publish": "poster",
  "route.award": "poster",
  "marketplace.browse": "provider",
  "marketplace.apply": "provider",
  "marketplace.accept": "provider",
  "invited.apply": null,
  "invited.accept": null,
  "assignment.execute": null,
  "messages.active_assignment": null,
  "history.read": null,
  "org.export": null,
};

export type EntitlementResult = {
  allowed: boolean;
  reason: string;
  status: SubscriptionStatus;
  warning?: string;
};

export async function checkEntitlement(
  orgId: string,
  feature: Feature,
  db: Executor = getDb(),
  now: Date = new Date(),
): Promise<EntitlementResult> {
  const audience = FEATURE_AUDIENCE[feature];
  if (!audience) return { allowed: true, reason: "always_available", status: "none" };

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.audience, audience)));
  if (!sub) return { allowed: false, reason: `no_${audience}_plan`, status: "none" };

  switch (sub.status) {
    case "beta": {
      const billingEnabled = (await getConfig("billing.enabled", db)) === true;
      // While billing is off, beta orgs never lose access when the beta window ends.
      if (!billingEnabled || !sub.betaEndsAt || sub.betaEndsAt > now) {
        return { allowed: true, reason: "beta", status: "beta" };
      }
      return { allowed: false, reason: "beta_ended", status: "beta" };
    }
    case "trialing":
      if (sub.trialEndsAt && sub.trialEndsAt > now) {
        return { allowed: true, reason: "trial", status: "trialing" };
      }
      return { allowed: false, reason: "trial_ended", status: "trialing" };
    case "active":
      return { allowed: true, reason: "active", status: "active" };
    case "past_due":
    case "grace":
      if (sub.status === "past_due" || (sub.graceEndsAt && sub.graceEndsAt > now)) {
        return {
          allowed: true,
          reason: "grace",
          status: sub.status,
          warning: "Payment failed. Update your billing details to keep access.",
        };
      }
      return { allowed: false, reason: "grace_ended", status: sub.status };
    default:
      return { allowed: false, reason: sub.status, status: sub.status };
  }
}
