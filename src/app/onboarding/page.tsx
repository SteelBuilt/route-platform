import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Field, Input, PageTitle } from "@/components/ui";
import type { CompanyRole, IndustrySector } from "@/lib/sectors";
import { createOrganization, setActiveOrg } from "@/server/domain/orgs";
import { requireSession, runAction, type ActionState } from "@/server/session";
import { SectorRoleFields } from "./sector-role-fields";

export const metadata: Metadata = { title: "Set up your organization" };

async function createOrgAction(_: ActionState, form: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireSession();
  const result = await runAction(async () => {
    // Sector and role are validated as a pair by createOrganization.
    const { org } = await createOrganization(ctx.userId, {
      name: String(form.get("name") ?? ""),
      industrySector: String(form.get("industrySector") ?? "") as IndustrySector,
      kind: String(form.get("kind") ?? "") as CompanyRole,
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
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <PageTitle sub="You can invite your team and crews next.">Set up your organization</PageTitle>
      <ActionForm action={createOrgAction} submitLabel="Create organization" pendingLabel="Creating…">
        <Field label="Company name">
          <Input name="name" required minLength={2} maxLength={120} autoComplete="organization" />
        </Field>
        <SectorRoleFields audience={as === "poster" || as === "provider" ? as : null} />
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
