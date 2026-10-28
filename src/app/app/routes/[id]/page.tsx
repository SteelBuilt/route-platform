import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, ButtonLink, Card, EmptyState, Field, Input, PageTitle, Select } from "@/components/ui";
import { formatInZone, formatMoney, formatWindow } from "@/lib/time";
import { listRouteFilesForPoster } from "@/server/domain/files";
import { getAwardState, listApplicants } from "@/server/domain/marketplace";
import { getRouteForPoster } from "@/server/domain/routes";
import { requireOrgSession } from "@/server/session";
import { JOB_TYPE_LABEL, StatusBadge, compensationText } from "../../format";
import {
  awardAction,
  cancelAction,
  duplicateAction,
  publishAction,
  reviewAction,
  revokeAwardAction,
  templateAction,
  unpublishAction,
  uploadAction,
} from "../actions";

export const metadata: Metadata = { title: "Route" };

const DONE: Record<string, string> = {
  published: "Published. Matching providers can now find this route.",
  unpublished: "Moved back to draft.",
  cancelled: "Route cancelled.",
  awarded: "Award sent. The provider has until the deadline to accept.",
  revoked: "Award revoked. The route is open again.",
};

export default async function RouteDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; done?: string }>;
}) {
  const { id } = await params;
  const { saved, done } = await searchParams;
  const ctx = await requireOrgSession(`/app/routes/${id}`);
  if (!ctx.capabilities.has("routes.post")) redirect("/app");
  const [data, applicants, awardState, docs] = await Promise.all([
    getRouteForPoster(ctx, id),
    listApplicants(ctx, id),
    getAwardState(ctx, id),
    listRouteFilesForPoster(ctx, id),
  ]);
  const { route, stops, versions, internalNotes, invited } = data;
  const tz = route.pickupTimezone ?? "America/Chicago";
  const editable = route.status === "draft" || route.status === "published";
  const canAward = route.status === "published";
  const key = randomUUID();

  return (
    <>
      <div className="mb-2">
        <StatusBadge status={route.status} />
      </div>
      <PageTitle sub={`${route.referenceCode} · ${JOB_TYPE_LABEL[route.jobType]} · ${route.stopCount} stop(s)`}>
        {route.title}
      </PageTitle>
      {(saved || (done && DONE[done])) && (
        <div className="mb-4">
          <Alert kind="ok">{saved ? "Saved." : DONE[done!]}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {awardState.live && (
            <Card>
              <h2 className="text-lg font-bold">
                {awardState.live.award.status === "accepted" ? "Accepted by" : "Awarded to"} {awardState.live.providerName}
              </h2>
              <p className="mt-1">
                {formatMoney(awardState.live.award.compensationCents)} ·{" "}
                {awardState.live.award.status === "pending"
                  ? `must accept by ${formatInZone(awardState.live.award.acceptBy, tz)}`
                  : `accepted ${formatInZone(awardState.live.award.respondedAt, tz)}`}
              </p>
              {awardState.live.award.status === "pending" && (
                <ActionForm
                  action={revokeAwardAction.bind(null, id, awardState.live.award.id)}
                  submitLabel="Revoke award"
                  variant="danger"
                  className="mt-3 space-y-3"
                />
              )}
              {awardState.assignment && (
                <p className="mt-2 text-muted">
                  Exact addresses, contacts and assignment files are now visible to the provider&apos;s owners,
                  dispatchers and crew leaders. Route execution tracking arrives in the next phase.
                </p>
              )}
            </Card>
          )}

          <section aria-labelledby="applicants">
            <h2 id="applicants" className="mb-3 text-xl font-bold">
              Applicants ({applicants.length})
            </h2>
            {applicants.length === 0 ? (
              <EmptyState title={route.status === "draft" ? "Publish the route to receive applications" : "No applications yet"}>
                {route.visibility === "marketplace"
                  ? "Matching providers can find it in their search."
                  : "Only the providers you invited can see it."}
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {applicants.map((a) => (
                  <li key={a.id}>
                    <Card>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-lg font-semibold">{a.orgName}</p>
                          <p className="text-sm text-muted">
                            {a.invited ? "Invited · " : ""}
                            {a.completedJobs} completed job{a.completedJobs === 1 ? "" : "s"} on the platform
                          </p>
                        </div>
                        <StatusBadge status={a.status} kind="application" />
                      </div>
                      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="inline font-semibold">Crew size: </dt>
                          <dd className="inline">{a.crewSize?.min ? `${a.crewSize.min}–${a.crewSize.max ?? a.crewSize.min}` : "Not given"}</dd>
                        </div>
                        <div>
                          <dt className="inline font-semibold">Experience: </dt>
                          <dd className="inline">{a.yearsExperience != null ? `${a.yearsExperience} years` : "Not given"}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="inline font-semibold">Building systems: </dt>
                          <dd className="inline">
                            {a.systems.join(", ") || "Not given"}
                            {!a.listsThisSystem && <span className="ml-1 font-semibold text-amber-800">(doesn&apos;t list this route&apos;s type)</span>}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="inline font-semibold">Serves: </dt>
                          <dd className="inline">{a.regions.join(", ") || "Not given"}</dd>
                        </div>
                        {a.proposedCompensationCents && (
                          <div>
                            <dt className="inline font-semibold">Proposed: </dt>
                            <dd className="inline">{formatMoney(a.proposedCompensationCents)}</dd>
                          </div>
                        )}
                        {a.proposedAvailability && (
                          <div className="sm:col-span-2">
                            <dt className="inline font-semibold">Availability: </dt>
                            <dd className="inline">{a.proposedAvailability}</dd>
                          </div>
                        )}
                      </dl>
                      <p className="mt-1 text-xs text-muted">Profile details are self-reported by the provider.</p>
                      {a.message && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface p-3">{a.message}</p>}
                      {canAward && (a.status === "submitted" || a.status === "shortlisted") && (
                        <div className="mt-4 space-y-3">
                          <ActionForm
                            action={awardAction.bind(null, id, a.id)}
                            submitLabel={`Award to ${a.orgName}`}
                            className="flex flex-wrap items-end gap-3"
                          >
                            <input type="hidden" name="idempotencyKey" value={`${key}-${a.id}`} />
                            <div className="min-w-40">
                              <Field label="Time to accept">
                                <Select name="acceptHours" defaultValue="24">
                                  <option value="4">4 hours</option>
                                  <option value="12">12 hours</option>
                                  <option value="24">24 hours</option>
                                  <option value="48">48 hours</option>
                                  <option value="72">3 days</option>
                                </Select>
                              </Field>
                            </div>
                          </ActionForm>
                          <div className="flex flex-wrap gap-2">
                            {a.status === "submitted" ? (
                              <ActionForm action={reviewAction.bind(null, id, a.id, "shortlisted")} submitLabel="Shortlist" variant="secondary" className="" />
                            ) : (
                              <ActionForm action={reviewAction.bind(null, id, a.id, "submitted")} submitLabel="Remove from shortlist" variant="secondary" className="" />
                            )}
                            <ActionForm action={reviewAction.bind(null, id, a.id, "declined")} submitLabel="Decline" variant="danger" className="" />
                          </div>
                        </div>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="stops">
            <h2 id="stops" className="mb-3 text-xl font-bold">Stops</h2>
            {route.pickupCity && (
              <Card className="mb-3">
                <p className="font-semibold">Pickup · {route.pickupCity}, {route.pickupState}</p>
                <p>{formatWindow(route.pickupWindowStart, route.pickupWindowEnd, tz)}</p>
              </Card>
            )}
            <ol className="space-y-3">
              {stops.map((s) => (
                <li key={s.id}>
                  <Card>
                    <p className="font-semibold">
                      {s.sequence}. {s.city}, {s.state} {s.zip}
                    </p>
                    {s.deliveryWindowStart && <p>Delivery: {formatWindow(s.deliveryWindowStart, s.deliveryWindowEnd, s.timezone)}</p>}
                    {s.installWindowStart && <p>Install: {formatWindow(s.installWindowStart, s.installWindowEnd, s.timezone)}</p>}
                    {(s.buildingWidthFt || s.buildingLengthFt) && (
                      <p className="text-muted">
                        {s.buildingWidthFt}×{s.buildingLengthFt}
                        {s.buildingHeightFt ? `×${s.buildingHeightFt}` : ""} ft {s.buildingSystem ?? ""}
                      </p>
                    )}
                  </Card>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="files">
            <h2 id="files" className="mb-3 text-xl font-bold">Files</h2>
            {docs.length > 0 && (
              <ul className="mb-3 space-y-2">
                {docs.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-line p-3">
                    <a className="font-semibold text-brand underline" href={`/api/files/${f.id}`}>
                      {f.originalName}
                    </a>
                    <span className="text-sm text-muted">
                      {f.visibilityClass === "listing" ? "Visible to applicants" : f.visibilityClass === "assignment" ? "After acceptance" : "Internal"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Card>
              <ActionForm action={uploadAction.bind(null, id)} submitLabel="Upload" pendingLabel="Uploading…" resetOnSuccess>
                <Field label="File" hint="PDF, JPEG, PNG or WebP. Images up to 15 MB, PDFs up to 25 MB.">
                  <input name="file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" required className="block min-h-12 w-full" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Who can see it">
                    <Select name="visibility" defaultValue="assignment">
                      <option value="assignment">Accepted provider only</option>
                      <option value="listing">Anyone who can see the route</option>
                      <option value="internal">My team only</option>
                    </Select>
                  </Field>
                  <Field label="Stop">
                    <Select name="stopId" defaultValue="">
                      <option value="">Whole route</option>
                      {stops.map((s) => (
                        <option key={s.id} value={s.id}>
                          Stop {s.sequence} ({s.zip})
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </ActionForm>
            </Card>
          </section>
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="font-bold">Compensation</h2>
            <p className="text-lg">{compensationText(route)}</p>
            <h2 className="mt-3 font-bold">Visibility</h2>
            <p>
              {route.visibility === "marketplace"
                ? "Marketplace"
                : route.visibility === "preferred"
                  ? "Preferred providers"
                  : "Invitation only"}
            </p>
            {invited.length > 0 && <p className="text-sm text-muted">Invited: {invited.map((i) => i.name).join(", ")}</p>}
            {route.applicationDeadline && (
              <p className="mt-2 text-sm">Applications close {formatInZone(route.applicationDeadline, tz)}</p>
            )}
            {internalNotes && (
              <>
                <h2 className="mt-3 font-bold">Internal notes</h2>
                <p className="whitespace-pre-wrap text-sm">{internalNotes}</p>
              </>
            )}
          </Card>

          <Card className="space-y-3">
            {editable && <ButtonLink href={`/app/routes/${id}/edit`} className="w-full">Edit</ButtonLink>}
            {route.status === "draft" && <ActionForm action={publishAction.bind(null, id)} submitLabel="Publish" pendingLabel="Publishing…" />}
            {route.status === "published" && (
              <ActionForm action={unpublishAction.bind(null, id)} submitLabel="Move back to draft" variant="secondary" />
            )}
            <ActionForm action={duplicateAction.bind(null, id)} submitLabel="Duplicate" variant="secondary" />
            <ActionForm action={templateAction.bind(null, id)} submitLabel="Save as template" variant="secondary">
              <Field label="Template name">
                <Input name="name" defaultValue={route.title} required />
              </Field>
            </ActionForm>
            {(route.status === "draft" || route.status === "published" || route.status === "awarding") && (
              <details>
                <summary className="min-h-12 cursor-pointer py-3 font-semibold text-danger">Cancel route…</summary>
                <ActionForm action={cancelAction.bind(null, id)} submitLabel="Cancel route" variant="danger">
                  <Field label="Reason">
                    <Input name="reason" required minLength={3} />
                  </Field>
                </ActionForm>
              </details>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 font-bold">Version history</h2>
            <ol className="space-y-2 text-sm">
              {versions.map((v) => (
                <li key={v.version}>
                  <span className="font-semibold">v{v.version}</span> ·{" "}
                  {v.changeKind === "created" ? "Created" : v.changeKind === "material" ? "Material change" : "Minor edit"} ·{" "}
                  {formatInZone(v.createdAt, tz, { withZone: false })}
                  {v.changedFields.length > 0 && v.changeKind !== "created" && (
                    <span className="block text-muted">{v.changedFields.join(", ")}</span>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </>
  );
}
