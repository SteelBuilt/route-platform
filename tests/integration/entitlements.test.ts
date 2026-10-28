import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { setConfig } from "@/server/config";
import { getDb } from "@/server/db/client";
import { subscriptions, type SubscriptionStatus } from "@/server/db/schema";
import { checkEntitlement, type Feature } from "@/server/domain/entitlements";
import { freshDb, makeOrg } from "../helpers";

let poster: Awaited<ReturnType<typeof makeOrg>>;
let provider: Awaited<ReturnType<typeof makeOrg>>;

beforeAll(async () => {
  await freshDb();
  poster = await makeOrg("poster");
  provider = await makeOrg("delivery_installer");
});

async function setSub(orgId: string, audience: "poster" | "provider", patch: Partial<typeof subscriptions.$inferInsert>) {
  await getDb()
    .update(subscriptions)
    .set(patch)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.audience, audience)));
}

const ALWAYS: Feature[] = [
  "invited.apply",
  "invited.accept",
  "assignment.execute",
  "messages.active_assignment",
  "history.read",
  "org.export",
];

describe("beta", () => {
  it("new orgs start in the beta with founder eligibility and a 90-day window", async () => {
    const [sub] = await getDb().select().from(subscriptions).where(eq(subscriptions.orgId, poster.org.id));
    expect(sub.status).toBe("beta");
    expect(sub.founderEligible).toBe(true);
    const days = (sub.betaEndsAt!.getTime() - sub.createdAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
  });

  it("poster orgs get poster features; provider orgs get provider features", async () => {
    expect((await checkEntitlement(poster.org.id, "route.publish")).allowed).toBe(true);
    expect((await checkEntitlement(poster.org.id, "marketplace.browse")).allowed).toBe(false);
    expect((await checkEntitlement(provider.org.id, "marketplace.apply")).allowed).toBe(true);
    expect((await checkEntitlement(provider.org.id, "route.publish")).allowed).toBe(false);
  });

  it("beta access continues after the window while billing is disabled", async () => {
    const later = new Date(Date.now() + 200 * 86_400_000);
    expect((await checkEntitlement(poster.org.id, "route.publish", getDb(), later)).allowed).toBe(true);
  });

  it("beta access ends after the window once billing is enabled", async () => {
    await setConfig("billing.enabled", true);
    const later = new Date(Date.now() + 200 * 86_400_000);
    expect((await checkEntitlement(poster.org.id, "route.publish", getDb(), later)).reason).toBe("beta_ended");
    await setConfig("billing.enabled", false);
  });
});

describe("restriction policy", () => {
  const cases: [SubscriptionStatus, Partial<typeof subscriptions.$inferInsert>, boolean][] = [
    ["active", {}, true],
    ["trialing", { trialEndsAt: new Date(Date.now() + 86_400_000) }, true],
    ["trialing", { trialEndsAt: new Date(Date.now() - 86_400_000) }, false],
    ["past_due", {}, true],
    ["grace", { graceEndsAt: new Date(Date.now() + 86_400_000) }, true],
    ["grace", { graceEndsAt: new Date(Date.now() - 86_400_000) }, false],
    ["restricted", {}, false],
    ["canceled", {}, false],
  ];

  it.each(cases)("%s %j → new commitments allowed: %s", async (status, patch, allowed) => {
    await setSub(provider.org.id, "provider", { status, trialEndsAt: null, graceEndsAt: null, ...patch });
    expect((await checkEntitlement(provider.org.id, "marketplace.apply")).allowed).toBe(allowed);
    // Existing work and invited work are never blocked by subscription status.
    for (const f of ALWAYS) expect((await checkEntitlement(provider.org.id, f)).allowed).toBe(true);
  });

  it("grace status carries a payment warning", async () => {
    await setSub(provider.org.id, "provider", { status: "past_due" });
    expect((await checkEntitlement(provider.org.id, "marketplace.browse")).warning).toMatch(/Payment failed/);
  });
});
