import type { Metadata } from "next";
import Link from "next/link";
import { Alert, ButtonLink, Card, PageTitle } from "@/components/ui";
import { checkEntitlement } from "@/server/domain/entitlements";
import { listMyWork } from "@/server/domain/marketplace";
import { getProviderProfile, profileCompleteness } from "@/server/domain/profiles";
import { listMyRoutes } from "@/server/domain/routes";
import { requireOrgSession } from "@/server/session";
import { ROLE_LABELS } from "./labels";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const ctx = await requireOrgSession("/app");
  const posting = ctx.org.canPost ? await checkEntitlement(ctx.orgId, "route.publish") : null;
  const providing = ctx.org.canProvide ? await checkEntitlement(ctx.orgId, "marketplace.browse") : null;
  const plan = posting ?? providing;
  const isPoster = ctx.org.canPost && ctx.capabilities.has("routes.post");
  const isProvider = ctx.org.canProvide && ctx.capabilities.has("marketplace.browse");
  const [routes, work, profile] = await Promise.all([
    isPoster ? listMyRoutes(ctx) : null,
    isProvider ? listMyWork(ctx) : null,
    ctx.org.canProvide && ctx.capabilities.has("org.manage") ? getProviderProfile(ctx, ctx.orgId) : null,
  ]);
  const count = (s: string[]) => routes?.filter((r) => s.includes(r.status)).length ?? 0;
  const profileState = profile ? profileCompleteness(profile) : null;

  return (
    <>
      <PageTitle sub={`You're signed in as ${ROLE_LABELS[ctx.role]}.`}>{ctx.org.name}</PageTitle>
      <div className="space-y-4">
        {plan?.status === "beta" && <Alert kind="info">Free beta: every feature is available, no card required.</Alert>}
        {plan?.warning && <Alert>{plan.warning}</Alert>}

        {isPoster && routes && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Routes</h2>
              <ButtonLink href="/app/routes/new">+ New route</ButtonLink>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Drafts", count(["draft"])],
                ["Open", count(["published"])],
                ["Award pending", count(["awarding"])],
                ["Assigned", count(["assigned", "in_progress"])],
              ].map(([label, n]) => (
                <Link key={label} href="/app/routes" className="rounded-lg bg-surface p-3 hover:ring-2 hover:ring-brand">
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="text-2xl font-bold">{n}</dd>
                </Link>
              ))}
            </dl>
            {routes.length === 0 && (
              <p className="mt-3 text-muted">
                Post your first route. Keep it invitation-only to dispatch crews you already use, or open it to the
                marketplace.
              </p>
            )}
          </Card>
        )}

        {isProvider && work && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Your work</h2>
              <ButtonLink href="/app/find">Find work</ButtonLink>
            </div>
            {work.pendingAwards.length > 0 && (
              <div className="mt-3">
                <Alert>
                  You have {work.pendingAwards.length} award{work.pendingAwards.length === 1 ? "" : "s"} waiting for an answer.{" "}
                  <Link href="/app/work" className="underline">
                    Review now
                  </Link>
                </Alert>
              </div>
            )}
            <p className="mt-3">
              {work.assignments.length} accepted assignment{work.assignments.length === 1 ? "" : "s"} ·{" "}
              {work.applications.filter((a) => ["submitted", "shortlisted"].includes(a.app.status)).length} open application(s)
            </p>
          </Card>
        )}

        {profileState && !profileState.complete && (
          <Card>
            <h2 className="text-lg font-bold">Finish your company profile</h2>
            <p className="mt-1 text-muted">Posting companies compare applicants on it. Missing: {profileState.missing.join(", ")}.</p>
            <ButtonLink href="/app/profile" variant="secondary" className="mt-3">
              Edit profile
            </ButtonLink>
          </Card>
        )}

        {ctx.capabilities.has("org.manage") && (
          <Card>
            <h2 className="text-lg font-bold">Bring your team</h2>
            <p className="mt-1 text-muted">
              Invite dispatchers, crew leaders and crew members. Crew members and staff are free and only see work
              assigned to them.
            </p>
            <ButtonLink href="/app/team" variant="secondary" className="mt-3">
              Invite people
            </ButtonLink>
          </Card>
        )}

        {!isPoster && !isProvider && (
          <Card>
            <h2 className="text-lg font-bold">Your assigned work</h2>
            <p className="mt-1 text-muted">
              Your itinerary for assignments you&apos;re on arrives with route execution in the next release.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
