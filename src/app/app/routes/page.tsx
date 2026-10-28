import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink, Card, EmptyState, PageTitle } from "@/components/ui";
import { formatWindow } from "@/lib/time";
import { listMyRoutes, listTemplates } from "@/server/domain/routes";
import { requireOrgSession } from "@/server/session";
import { JOB_TYPE_LABEL, StatusBadge } from "../format";

export const metadata: Metadata = { title: "Routes" };

export default async function RoutesPage() {
  const ctx = await requireOrgSession("/app/routes");
  if (!ctx.capabilities.has("routes.post") || !ctx.org.canPost) redirect("/app");
  const [routes, templates] = await Promise.all([listMyRoutes(ctx), listTemplates(ctx)]);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <PageTitle sub="Draft, publish and award delivery and installation work.">Routes</PageTitle>
        <ButtonLink href="/app/routes/new">+ New route</ButtonLink>
      </div>

      {templates.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-bold">Start from a template</h2>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <ButtonLink key={t.id} variant="secondary" href={`/app/routes/new?template=${t.id}`}>
                {t.name}
              </ButtonLink>
            ))}
          </div>
        </section>
      )}

      {routes.length === 0 ? (
        <EmptyState title="No routes yet">
          Post your first route. You can keep it invitation-only for crews you already work with.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {routes.map((r) => (
            <li key={r.id}>
              <Link href={`/app/routes/${r.id}`} className="block">
                <Card className="hover:border-brand">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold">{r.title}</p>
                      <p className="text-sm text-muted">
                        {r.referenceCode} · {JOB_TYPE_LABEL[r.jobType]} · {r.stopCount} stop{r.stopCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-2">
                    {r.pickupWindowStart
                      ? `Pickup ${formatWindow(r.pickupWindowStart, r.pickupWindowEnd, r.pickupTimezone ?? "America/Chicago")}`
                      : "Installation only"}
                  </p>
                  {r.applicants > 0 && (
                    <p className="mt-1 font-semibold text-brand">
                      {r.applicants} applicant{r.applicants === 1 ? "" : "s"}
                    </p>
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
