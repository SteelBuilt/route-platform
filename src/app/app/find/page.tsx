import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Button, ButtonLink, Card, EmptyState, Field, Input, PageTitle, Select } from "@/components/ui";
import { formatInZone, formatWindow } from "@/lib/time";
import { listCategories } from "@/server/domain/catalog";
import { searchRoutes, type DiscoveryFilters } from "@/server/domain/discovery";
import { defaultCategoryId } from "@/server/domain/sector-defaults";
import { AppError } from "@/server/errors";
import { requireOrgSession } from "@/server/session";
import { JOB_TYPE_LABEL, StatusBadge, compensationText } from "../format";

export const metadata: Metadata = { title: "Find work" };

export default async function FindPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireOrgSession("/app/find");
  if (!ctx.capabilities.has("marketplace.browse") || !ctx.org.canProvide) redirect("/app");
  const sp = await searchParams;
  // First visit (no filters in the URL): preselect the primary sector's
  // category. Any submitted or cleared filter state is respected as-is.
  const firstVisit = Object.keys(sp).length === 0;
  const sectorCategory = firstVisit ? await defaultCategoryId(ctx) : null;
  const filters: DiscoveryFilters = {
    categoryId: sectorCategory ?? sp.categoryId ?? "",
    mySystems: sp.mySystems === "1",
    jobType: (sp.jobType ?? "") as DiscoveryFilters["jobType"],
    state: sp.state ?? "",
    zip: sp.zip ?? "",
    radiusMiles: sp.radiusMiles ? Number(sp.radiusMiles) : 100,
    dateFrom: sp.dateFrom ?? "",
    dateTo: sp.dateTo ?? "",
    minCompensation: (sp.minCompensation ?? "") as unknown as number,
    stops: (sp.stops ?? "any") as DiscoveryFilters["stops"],
    scope: (sp.scope ?? "all") as DiscoveryFilters["scope"],
  };
  const categories = await listCategories(ctx);
  let data: Awaited<ReturnType<typeof searchRoutes>> | null = null;
  let error: string | null = null;
  try {
    data = await searchRoutes(ctx, filters);
  } catch (e) {
    if (e instanceof AppError) error = e.message;
    else throw e;
  }
  const active = !!sectorCategory || Object.entries(sp).some(([k, v]) => v && k !== "scope" && k !== "radiusMiles" && k !== "stops");
  const sectorCategoryName = sectorCategory ? categories.find((c) => c.id === sectorCategory)?.name : null;

  return (
    <>
      <PageTitle sub="Routes you can apply to. Exact addresses are shared after you accept an award.">Find work</PageTitle>

      <details className="mb-4 rounded-xl border-2 border-line bg-white" open={active}>
        <summary className="min-h-12 cursor-pointer px-4 py-3 font-semibold">Filters{active ? " (on)" : ""}</summary>
        <form method="get" className="grid gap-3 border-t-2 border-line p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Building category">
            <Select name="categoryId" defaultValue={filters.categoryId}>
              <option value="">Any</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? "– " : ""}
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Job type">
            <Select name="jobType" defaultValue={filters.jobType}>
              <option value="">Any</option>
              {Object.entries(JOB_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="State">
            <Input name="state" defaultValue={filters.state} maxLength={2} className="uppercase" placeholder="TX" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Near ZIP">
              <Input name="zip" defaultValue={filters.zip} inputMode="numeric" maxLength={5} />
            </Field>
            <Field label="Within (mi)">
              <Select name="radiusMiles" defaultValue={String(filters.radiusMiles)}>
                {[25, 50, 100, 200, 400].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From date">
              <Input type="date" name="dateFrom" defaultValue={filters.dateFrom} />
            </Field>
            <Field label="To date">
              <Input type="date" name="dateTo" defaultValue={filters.dateTo} />
            </Field>
          </div>
          {ctx.capabilities.has("compensation.view") && (
            <Field label="Minimum pay (USD)">
              <Input type="number" name="minCompensation" min={0} defaultValue={sp.minCompensation ?? ""} />
            </Field>
          )}
          <Field label="Stops">
            <Select name="stops" defaultValue={filters.stops}>
              <option value="any">Single or multi-stop</option>
              <option value="single">Single stop</option>
              <option value="multi">Multi-stop routes</option>
            </Select>
          </Field>
          <Field label="Show">
            <Select name="scope" defaultValue={filters.scope}>
              <option value="all">All I can see</option>
              <option value="invited">Only routes I&apos;m invited to</option>
            </Select>
          </Field>
          <label className="flex min-h-12 items-center gap-2 self-end">
            <input type="checkbox" name="mySystems" value="1" defaultChecked={filters.mySystems as boolean} className="h-5 w-5" />
            Only my building systems
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit">Apply filters</Button>
            <ButtonLink href="/app/find?categoryId=" variant="secondary">
              Clear
            </ButtonLink>
          </div>
        </form>
      </details>

      {sectorCategoryName && (
        <div className="mb-4">
          <Alert kind="info">
            Showing {sectorCategoryName}, your primary sector.{" "}
            <Link href="/app/find?categoryId=" className="font-semibold underline">
              Show all building types
            </Link>
          </Alert>
        </div>
      )}
      {data?.systemsNote && (
        <div className="mb-4">
          <Alert kind="info">{data.systemsNote}</Alert>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {data && !data.marketplaceAccess && (
        <div className="mb-4">
          <Alert kind="info">
            You&apos;re seeing routes you were invited to. A provider plan unlocks the open marketplace.
          </Alert>
        </div>
      )}
      {data?.distanceNote && (
        <div className="mb-4">
          <Alert kind="info">{data.distanceNote}</Alert>
        </div>
      )}

      {data && data.results.length === 0 && (
        <EmptyState title="No matching routes right now">
          New routes are posted every week. Try widening your filters, or check back soon.
        </EmptyState>
      )}
      <ul className="space-y-3">
        {data?.results.map((r) => {
          const tz = r.pickupTimezone ?? "America/Chicago";
          return (
            <li key={r.id}>
              <Link href={`/app/find/${r.id}`} className="block">
                <Card className="hover:border-brand">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold">{r.title}</p>
                      <p className="text-sm text-muted">
                        {r.posterName}
                        {r.posterIsDemo && !/\(demo\)/i.test(r.posterName) ? " (demo)" : ""} · {r.categoryName} ·{" "}
                        {JOB_TYPE_LABEL[r.jobType]}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {r.invited && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Invited</span>}
                      {r.myApplicationStatus && <StatusBadge status={r.myApplicationStatus} kind="application" />}
                      {data.hasProfileSystems && !r.inMySystems && (
                        <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold text-muted">Not in your listed systems</span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-lg font-semibold">{compensationText(r, r.compensationHidden)}</p>
                  <p>
                    {r.pickupCity ? `From ${r.pickupCity}, ${r.pickupState} · ` : ""}
                    {r.stopCount} stop{r.stopCount === 1 ? "" : "s"}: {r.stopZips.join(" → ")}
                  </p>
                  <p className="text-muted">
                    {r.pickupWindowStart
                      ? `Pickup ${formatWindow(r.pickupWindowStart, r.pickupWindowEnd, tz)}`
                      : r.firstServiceDate
                        ? `Starts ${formatInZone(r.firstServiceDate, tz)}`
                        : ""}
                  </p>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
