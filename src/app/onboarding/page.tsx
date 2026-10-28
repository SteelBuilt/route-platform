import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Field, Input, PageTitle } from "@/components/ui";
import { createOrganization, setActiveOrg } from "@/server/domain/orgs";
import { requireSession, runAction, type ActionState } from "@/server/session";
import { ORG_KINDS, type OrgKind } from "@/server/db/schema";
import { Invalid } from "@/server/errors";

export const metadata: Metadata = { title: "Set up your organization" };

const KIND_OPTIONS: Record<OrgKind, { title: string; body: string }> = {
  poster: {
    title: "Manufacturer, supplier or dealer",
    body: "You post delivery and installation work, and manage crews you already use.",
  },
  installer: { title: "Installation company or crew", body: "You install or erect buildings." },
  transporter: { title: "Delivery / transport company", body: "You haul and deliver buildings." },
  delivery_installer: {
    title: "Delivery and installation provider",
    body: "You deliver and install.",
  },
};

async function createOrgAction(_: ActionState, form: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireSession();
  const result = await runAction(async () => {
    const kind = String(form.get("kind") ?? "");
    if (!ORG_KINDS.includes(kind as OrgKind)) throw new Invalid("Choose what your company does");
    const { org } = await createOrganization(ctx.userId, {
      name: String(form.get("name") ?? ""),
      kind: kind as OrgKind,
      hqState: String(form.get("hqState") ?? "") || undefined,
      hqZip: String(form.get("hqZip") ?? "") || undefined,
    });
    if (ctx.sessionId) await setActiveOrg(ctx.sessionId, ctx.userId, org.id);
  });
  if (result?.error) return result;
  redirect("/app");
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  await requireSession("/onboarding");
  const { as } = await searchParams;
  const kinds = as === "provider" ? ORG_KINDS.filter((k) => k !== "poster") : ORG_KINDS;
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <PageTitle sub="You can invite your team and crews next.">Set up your organization</PageTitle>
      <ActionForm action={createOrgAction} submitLabel="Create organization" pendingLabel="Creating…">
        <Field label="Company name">
          <Input name="name" required minLength={2} maxLength={120} autoComplete="organization" />
        </Field>
        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">What does your company do?</legend>
          {kinds.map((k) => (
            <label
              key={k}
              className="flex min-h-14 cursor-pointer gap-3 rounded-lg border-2 border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-surface"
            >
              <input
                type="radio"
                name="kind"
                value={k}
                required
                defaultChecked={as === "poster" && k === "poster"}
                className="mt-1 h-5 w-5 accent-[var(--brand)]"
              />
              <span>
                <span className="block font-semibold">{KIND_OPTIONS[k].title}</span>
                <span className="block text-sm text-muted">{KIND_OPTIONS[k].body}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="State" hint="e.g. TX">
            <Input name="hqState" maxLength={2} className="uppercase" autoComplete="address-level1" />
          </Field>
          <Field label="ZIP">
            <Input name="hqZip" inputMode="numeric" pattern="\d{5}" maxLength={5} autoComplete="postal-code" />
          </Field>
        </div>
      </ActionForm>
    </main>
  );
}
