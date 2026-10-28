import type { Metadata } from "next";
import { Alert, ButtonLink, Card, PageTitle } from "@/components/ui";
import { checkEntitlement } from "@/server/domain/entitlements";
import { requireOrgSession } from "@/server/session";
import { ROLE_LABELS } from "./labels";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const ctx = await requireOrgSession("/app");
  const posting = ctx.org.canPost ? await checkEntitlement(ctx.orgId, "route.publish") : null;
  const providing = ctx.org.canProvide ? await checkEntitlement(ctx.orgId, "marketplace.browse") : null;
  const plan = posting ?? providing;

  return (
    <>
      <PageTitle sub={`You're signed in as ${ROLE_LABELS[ctx.role]}.`}>{ctx.org.name}</PageTitle>
      <div className="space-y-4">
        {plan?.status === "beta" && (
          <Alert kind="info">Free beta: every feature is available, no card required.</Alert>
        )}
        {plan?.warning && <Alert>{plan.warning}</Alert>}

        {ctx.capabilities.has("org.manage") && (
          <Card>
            <h2 className="text-lg font-bold">Bring your team</h2>
            <p className="mt-1 text-muted">
              Invite dispatchers, crew leaders and crew members. Crew members and staff are free and only see work
              assigned to them.
            </p>
            <ButtonLink href="/app/team" className="mt-4">
              Invite people
            </ButtonLink>
          </Card>
        )}

        {ctx.org.canPost && (
          <Card>
            <h2 className="text-lg font-bold">Routes</h2>
            <p className="mt-1 text-muted">Route posting arrives in the next build step.</p>
          </Card>
        )}
        {ctx.org.canProvide && (
          <Card>
            <h2 className="text-lg font-bold">Find work</h2>
            <p className="mt-1 text-muted">Route discovery arrives in the next build step.</p>
          </Card>
        )}
      </div>
    </>
  );
}
