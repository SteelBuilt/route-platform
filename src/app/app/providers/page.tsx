// Poster's preferred-provider network: used for "preferred" and invitation-only routes.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Button, Card, EmptyState, Input, PageTitle } from "@/components/ui";
import { listPreferredProviders, searchProviderOrgs } from "@/server/domain/routes";
import { requireOrgSession } from "@/server/session";
import { addPreferredAction, removePreferredAction } from "../routes/actions";

export const metadata: Metadata = { title: "Providers" };

export default async function ProvidersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireOrgSession("/app/providers");
  if (!ctx.capabilities.has("routes.post") || !ctx.org.canPost) redirect("/app");
  const { q } = await searchParams;
  const preferred = await listPreferredProviders(ctx);
  const results = q ? await searchProviderOrgs(ctx, q) : [];

  return (
    <>
      <PageTitle sub="Crews you already work with. Use them for preferred and invitation-only routes.">
        Preferred providers
      </PageTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          {preferred.length === 0 ? (
            <EmptyState title="No preferred providers yet">
              Search for a provider company, or invite a crew to join and then add their company here.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {preferred.map((p) => (
                <li key={p.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{p.name}</span>
                    <ActionForm action={removePreferredAction.bind(null, p.id)} submitLabel="Remove" variant="secondary" className="" />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <form method="get" className="mb-3 flex gap-2">
            <Input name="q" defaultValue={q ?? ""} placeholder="Search provider companies" aria-label="Search provider companies" />
            <Button type="submit">Search</Button>
          </form>
          <ul className="space-y-3">
            {results
              .filter((r) => !preferred.some((p) => p.id === r.id))
              .map((r) => (
                <li key={r.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-semibold">{r.name}</span> {r.hqState && <span className="text-muted">· {r.hqState}</span>}
                    </span>
                    <ActionForm action={addPreferredAction.bind(null, r.id)} submitLabel="Add" className="" />
                  </Card>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </>
  );
}
