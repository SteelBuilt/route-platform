import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink, Card, EmptyState, PageTitle } from "@/components/ui";
import { formatInZone, formatWindow } from "@/lib/time";
import { listMyWork } from "@/server/domain/marketplace";
import { requireOrgSession } from "@/server/session";
import { StatusBadge } from "../format";

export const metadata: Metadata = { title: "My work" };

export default async function MyWorkPage() {
  const ctx = await requireOrgSession("/app/work");
  if (!ctx.capabilities.has("marketplace.browse") || !ctx.org.canProvide) redirect("/app");
  const work = await listMyWork(ctx);
  const awardedRoutes = new Set(work.pendingAwards.map((a) => a.routeId));
  return (
    <>
      <PageTitle sub="Awards waiting for you, accepted assignments, and your applications.">My work</PageTitle>

      {work.pendingAwards.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xl font-bold">Waiting for your answer</h2>
          <ul className="space-y-3">
            {work.applications
              .filter((a) => awardedRoutes.has(a.app.routeId))
              .map((a) => {
                const w = work.pendingAwards.find((x) => x.routeId === a.app.routeId)!;
                return (
                  <li key={a.app.id}>
                    <Link href={`/app/find/${a.app.routeId}`} className="block">
                      <Card className="border-amber-500 hover:border-brand">
                        <p className="text-lg font-semibold">{a.title}</p>
                        <p>Accept by {formatInZone(w.acceptBy, a.pickupTimezone ?? "America/Chicago")}</p>
                      </Card>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-xl font-bold">Accepted assignments</h2>
        {work.assignments.length === 0 ? (
          <EmptyState title="No accepted assignments yet" />
        ) : (
          <ul className="space-y-3">
            {work.assignments.map(({ a, title, referenceCode }) => (
              <li key={a.id}>
                <Link href={`/app/find/${a.routeId}`} className="block">
                  <Card className="hover:border-brand">
                    <p className="text-lg font-semibold">{title}</p>
                    <p className="text-sm text-muted">{referenceCode}</p>
                    <p>{formatWindow(a.scheduledStart, a.scheduledEnd, "America/Chicago")}</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xl font-bold">Applications</h2>
        {work.applications.length === 0 ? (
          <EmptyState title="You haven't applied to any routes yet">
            <ButtonLink href="/app/find" className="mt-2">
              Find work
            </ButtonLink>
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {work.applications.map((a) => (
              <li key={a.app.id}>
                <Link href={`/app/find/${a.app.routeId}`} className="block">
                  <Card className="hover:border-brand">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-semibold">{a.title}</p>
                        <p className="text-sm text-muted">
                          {a.posterName} · {a.referenceCode}
                        </p>
                      </div>
                      <StatusBadge status={a.app.status} kind="application" />
                    </div>
                    {a.pickupWindowStart && (
                      <p className="mt-1">
                        Pickup {a.pickupCity}, {a.pickupState} · {formatInZone(a.pickupWindowStart, a.pickupTimezone ?? "America/Chicago")}
                      </p>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
