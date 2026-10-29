import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Card, Field, Input, PageTitle } from "@/components/ui";
import { formatInZone, formatMoney, formatWindow } from "@/lib/time";
import { getRouteForProvider } from "@/server/domain/marketplace";
import { requireOrgSession } from "@/server/session";
import { JOB_TYPE_LABEL, StatusBadge, compensationText } from "../../format";
import { acceptAction, applyAction, declineAction, withdrawAction } from "../actions";

export const metadata: Metadata = { title: "Route", robots: { index: false } };

const READINESS: Record<string, string> = {
  unknown: "Unknown",
  not_ready: "Not ready",
  ready: "Ready (per customer)",
  verified: "Verified by poster",
};

const DONE: Record<string, string> = {
  applied: "Application sent. The posting company will review applicants and may award the route.",
  withdrawn: "Application withdrawn.",
  accepted: "Assignment accepted. Exact addresses, contacts and files are below.",
  declined: "Award declined.",
};

export default async function ProviderRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { id } = await params;
  const { done } = await searchParams;
  const ctx = await requireOrgSession(`/app/find/${id}`);
  if (!ctx.capabilities.has("marketplace.browse")) redirect("/app");
  const d = await getRouteForProvider(ctx, id);
  const r = d.route;
  const tz = r.pickupTimezone ?? "America/Chicago";
  const canApply = ctx.capabilities.has("applications.submit") && r.status === "published" && !d.myApplication;
  const pendingAward = d.myAward?.status === "pending" ? d.myAward : null;
  const canAccept = ctx.capabilities.has("awards.accept");
  const p = d.privateDetails;

  return (
    <>
      <div className="mb-2 flex flex-wrap gap-2">
        {d.invited && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Invited</span>}
        {d.myApplication && <StatusBadge status={d.myApplication.status} kind="application" />}
      </div>
      <PageTitle sub={`${d.posterName} · ${r.referenceCode}`}>{r.title}</PageTitle>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {done && DONE[done] && <Alert kind="ok">{DONE[done]}</Alert>}
          {d.assignment && done !== "accepted" && (
            <Alert kind="ok">You accepted this assignment. Exact addresses, contacts and files are shown below.</Alert>
          )}
          <Card>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-semibold text-muted">Pay</dt>
                <dd className="text-lg font-semibold">{compensationText(r, d.compensationHidden)}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted">Work</dt>
                <dd>
                  {d.categoryName} · {JOB_TYPE_LABEL[r.jobType]}
                </dd>
              </div>
              {r.crewSizeRequired && (
                <div>
                  <dt className="text-sm font-semibold text-muted">Crew size</dt>
                  <dd>{r.crewSizeRequired}</dd>
                </div>
              )}
              {r.applicationDeadline && (
                <div>
                  <dt className="text-sm font-semibold text-muted">Apply by</dt>
                  <dd>{formatInZone(r.applicationDeadline, tz)}</dd>
                </div>
              )}
            </dl>
            {r.providerNotes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface p-3">{r.providerNotes}</p>}
            {p?.assignmentNotes && (
              <div className="mt-3 rounded-lg border-2 border-ok p-3">
                <p className="font-semibold">Assignment notes</p>
                <p className="whitespace-pre-wrap">{p.assignmentNotes}</p>
              </div>
            )}
          </Card>

          {r.pickupCity && (
            <Card>
              <h2 className="font-bold">Pickup</h2>
              <p>{p?.pickup ? `${p.pickup.line1}${p.pickup.line2 ? `, ${p.pickup.line2}` : ""}, ${p.pickup.city}, ${p.pickup.state} ${p.pickup.zip}` : `${r.pickupCity}, ${r.pickupState}`}</p>
              <p>{formatWindow(r.pickupWindowStart, r.pickupWindowEnd, tz)}</p>
            </Card>
          )}

          <ol className="space-y-3">
            {d.stops.map((s) => {
              const sp = p?.stops[s.id];
              return (
                <li key={s.id}>
                  <Card>
                    <h2 className="font-bold">
                      Stop {s.sequence}:{" "}
                      {sp?.location
                        ? `${sp.location.line1}${sp.location.line2 ? `, ${sp.location.line2}` : ""}, ${sp.location.city}, ${sp.location.state} ${sp.location.zip}`
                        : `${s.city ?? ""} ${s.state ?? ""} ${s.zip}`}
                    </h2>
                    {s.deliveryWindowStart && <p>Delivery: {formatWindow(s.deliveryWindowStart, s.deliveryWindowEnd, s.timezone)}</p>}
                    {s.installWindowStart && <p>Install: {formatWindow(s.installWindowStart, s.installWindowEnd, s.timezone)}</p>}
                    <ul className="mt-2 space-y-1 text-sm">
                      {(s.buildingWidthFt || s.buildingLengthFt) && (
                        <li>
                          Building: {s.buildingWidthFt}×{s.buildingLengthFt}
                          {s.buildingHeightFt ? `×${s.buildingHeightFt}` : ""} ft {s.buildingSystem ?? ""} {s.manufacturerName ? `· ${s.manufacturerName}` : ""}
                        </li>
                      )}
                      {(s.openings as { text?: string } | null)?.text ? (
                        <li>Openings: {(s.openings as { text: string }).text}</li>
                      ) : null}
                      {(s.loadWeightLbs || s.pieceCount) && (
                        <li>
                          Load: {s.loadWeightLbs ? `${s.loadWeightLbs.toLocaleString()} lbs` : ""} {s.pieceCount ? `· ${s.pieceCount} pieces` : ""}
                        </li>
                      )}
                      {s.surface && <li>Surface: {s.surface}</li>}
                      <li>Site readiness: {READINESS[s.siteReadiness]}</li>
                      <li>
                        Plans: {s.plansStatus.replace("_", " ")} · Permit: {s.permitStatus.replace("_", " ")} · Engineering:{" "}
                        {s.engineeringStatus.replace("_", " ")}
                      </li>
                      {s.siteAccessNotes && <li>Access: {s.siteAccessNotes}</li>}
                    </ul>
                    {sp && (
                      <div className="mt-3 space-y-1 rounded-lg border-2 border-ok p-3 text-sm">
                        {sp.contacts.map((c) => (
                          <p key={c.id}>
                            <strong>{c.name}</strong>
                            {c.phone && (
                              <>
                                {" "}·{" "}
                                <a className="text-brand underline" href={`tel:${c.phone}`}>
                                  {c.phone}
                                </a>
                              </>
                            )}
                            {c.email && ` · ${c.email}`}
                          </p>
                        ))}
                        {sp.accessInstructions && <p>Access instructions: {sp.accessInstructions}</p>}
                        {sp.safetyNotes && <p>Safety: {sp.safetyNotes}</p>}
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ol>

          {p && p.files.length > 0 && (
            <Card>
              <h2 className="mb-2 font-bold">Files</h2>
              <ul className="space-y-2">
                {p.files.map((f) => (
                  <li key={f.id}>
                    <a className="font-semibold text-brand underline" href={`/api/files/${f.id}`}>
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* On phones, an award waiting for an answer goes above the route details. */}
        <aside className={pendingAward ? "order-first space-y-4 lg:order-none" : "space-y-4"}>
          {pendingAward && (
            <Card className="border-amber-500">
              <h2 className="text-lg font-bold">You&apos;ve been awarded this route</h2>
              <p className="mt-1">
                {formatMoney(pendingAward.compensationCents)} · accept by {formatInZone(pendingAward.acceptBy, tz)}
              </p>
              {canAccept ? (
                <div className="mt-4 space-y-3">
                  <ActionForm action={acceptAction.bind(null, id, pendingAward.id)} submitLabel="Accept assignment" pendingLabel="Accepting…" />
                  <details>
                    <summary className="min-h-12 cursor-pointer py-3 font-semibold">Decline…</summary>
                    <ActionForm action={declineAction.bind(null, id, pendingAward.id)} submitLabel="Decline award" variant="danger">
                      <Field label="Reason (optional)">
                        <Input name="reason" />
                      </Field>
                    </ActionForm>
                  </details>
                </div>
              ) : (
                <p className="mt-2 text-muted">An owner or dispatcher in your company needs to accept.</p>
              )}
            </Card>
          )}

          {canApply && (
            <Card>
              <h2 className="mb-3 text-lg font-bold">{r.compensationMode === "proposals" ? "Send a proposal" : "Express interest"}</h2>
              <ActionForm action={applyAction.bind(null, id)} submitLabel="Apply" pendingLabel="Sending…">
                {r.compensationMode === "proposals" && (
                  <Field label="Your price (USD)">
                    <Input name="price" type="number" min={1} step="0.01" inputMode="decimal" required />
                  </Field>
                )}
                <Field label="Your availability" hint="e.g. Crew free Tue–Thu that week">
                  <Input name="availability" maxLength={1000} />
                </Field>
                <Field label="Message to the poster">
                  <textarea
                    name="message"
                    rows={4}
                    maxLength={2000}
                    className="block w-full rounded-lg border-2 border-line px-3 py-2 text-base focus:border-brand"
                  />
                </Field>
              </ActionForm>
              {!d.inMySystems && (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
                  {d.hasProfileSystems
                    ? `${d.categoryName} isn't in the building systems on your profile. The poster will see that when comparing applicants.`
                    : "Your profile doesn't list your building systems yet. Posters compare applicants on them."}{" "}
                  {ctx.capabilities.has("org.manage") && (
                    <a href="/app/profile" className="font-semibold underline">
                      Update profile
                    </a>
                  )}
                </p>
              )}
              <p className="mt-3 text-sm text-muted">Applying doesn&apos;t commit you or hold the route. You confirm only if you&apos;re awarded.</p>
            </Card>
          )}

          {d.myApplication && ["submitted", "shortlisted"].includes(d.myApplication.status) && (
            <Card>
              <p>You applied {formatInZone(d.myApplication.createdAt, tz)}.</p>
              {d.myApplication.proposedCompensationCents && <p>Your price: {formatMoney(d.myApplication.proposedCompensationCents)}</p>}
              <ActionForm
                action={withdrawAction.bind(null, id, d.myApplication.id)}
                submitLabel="Withdraw application"
                variant="danger"
                className="mt-3 space-y-3"
              />
            </Card>
          )}
          {!ctx.emailVerified && canApply && <Alert>Confirm your email before applying.</Alert>}
        </aside>
      </div>
    </>
  );
}
