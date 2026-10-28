import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, EmptyState, Field, Input, PageTitle, Select } from "@/components/ui";
import { canAssignRole } from "@/server/authz/roles";
import { ROLES } from "@/server/db/schema";
import { listPendingInvitations } from "@/server/domain/invitations";
import { leaderSeatCount, listMembers } from "@/server/domain/orgs";
import { requireOrgSession } from "@/server/session";
import {
  changeRoleAction,
  inviteAction,
  overridesAction,
  removeMemberAction,
  revokeInvitationAction,
} from "../actions";
import { ROLE_LABELS } from "../labels";

export const metadata: Metadata = { title: "Team" };

const OVERRIDE_LABELS = {
  view_compensation: "See compensation",
  browse: "Browse the marketplace",
  apply: "Apply to routes",
  post_routes: "Post routes",
} as const;

export default async function TeamPage() {
  const ctx = await requireOrgSession("/app/team");
  if (!ctx.capabilities.has("org.manage")) redirect("/app");
  const [members, pending, seats] = await Promise.all([
    listMembers(ctx),
    listPendingInvitations(ctx),
    leaderSeatCount(ctx.orgId),
  ]);
  const assignable = ROLES.filter((r) => canAssignRole(ctx.role, r));

  return (
    <>
      <PageTitle sub={`${seats} leader seat${seats === 1 ? "" : "s"} in use. Crew members and staff are free.`}>
        Team
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-3" aria-label="Members">
          {members.map((m) => {
            const isSelf = m.userId === ctx.userId;
            const editable = !isSelf && (m.role !== "owner" || ctx.role === "owner");
            const free = m.role === "crew_member" || m.role === "staff";
            return (
              <Card key={m.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {m.name} {isSelf && <span className="text-muted">(you)</span>}
                    </p>
                    <p className="break-all text-muted">{m.email}</p>
                  </div>
                  <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold">{ROLE_LABELS[m.role]}</span>
                </div>
                {editable && (
                  <div className="mt-4 space-y-4">
                    <ActionForm
                      action={changeRoleAction.bind(null, m.id)}
                      submitLabel="Change role"
                      variant="secondary"
                      className="flex flex-wrap items-end gap-2"
                    >
                      <div className="min-w-48 flex-1">
                        <Field label="Role">
                          <Select name="role" defaultValue={m.role}>
                            {assignable.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    </ActionForm>
                    {free && (
                      <ActionForm
                        action={overridesAction.bind(null, m.id)}
                        submitLabel="Save permissions"
                        variant="secondary"
                      >
                        <fieldset>
                          <legend className="mb-1 font-semibold">Extra permissions</legend>
                          <div className="grid gap-1 sm:grid-cols-2">
                            {(Object.keys(OVERRIDE_LABELS) as (keyof typeof OVERRIDE_LABELS)[]).map((k) => (
                              <label key={k} className="flex min-h-11 items-center gap-2">
                                <input
                                  type="checkbox"
                                  name={k}
                                  defaultChecked={!!m.permissionOverrides?.[k]}
                                  className="h-5 w-5 accent-[var(--brand)]"
                                />
                                {OVERRIDE_LABELS[k]}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      </ActionForm>
                    )}
                    <ActionForm action={removeMemberAction.bind(null, m.id)} submitLabel="Remove from team" variant="danger" />
                  </div>
                )}
              </Card>
            );
          })}
        </section>

        <aside className="space-y-6">
          <Card>
            <h2 className="mb-3 text-lg font-bold">Invite someone</h2>
            <ActionForm action={inviteAction} submitLabel="Send invitation" pendingLabel="Sending…">
              <Field label="Email">
                <Input name="email" type="email" required autoComplete="off" />
              </Field>
              <Field label="Role">
                <Select name="role" defaultValue="crew_member">
                  {assignable.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            </ActionForm>
          </Card>

          <section aria-label="Pending invitations">
            <h2 className="mb-3 text-lg font-bold">Pending invitations</h2>
            {pending.length === 0 ? (
              <EmptyState title="No pending invitations" />
            ) : (
              <ul className="space-y-3">
                {pending.map((i) => (
                  <li key={i.id}>
                    <Card>
                      <p className="break-all font-semibold">{i.email}</p>
                      <p className="text-sm text-muted">
                        {ROLE_LABELS[i.role]} · expires {i.expiresAt.toLocaleDateString("en-US")}
                      </p>
                      <ActionForm
                        action={revokeInvitationAction.bind(null, i.id)}
                        submitLabel="Revoke"
                        variant="danger"
                        className="mt-3"
                      />
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
