import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, PageTitle } from "@/components/ui";
import { ROLE_TITLES } from "@/lib/sectors";
import { requireOrgSession } from "@/server/session";
import { setPrimarySectorAction } from "../actions";
import { SectorSelect } from "../sector-select";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireOrgSession("/app/settings");
  if (!ctx.capabilities.has("org.manage")) redirect("/app");
  return (
    <>
      <PageTitle sub="Company settings for your organization.">Settings</PageTitle>
      <div className="max-w-xl space-y-4">
        <Card>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm font-semibold text-muted">Company</dt>
              <dd className="text-lg font-semibold">{ctx.org.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-muted">Company type</dt>
              <dd>{ROLE_TITLES[ctx.org.kind]}</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <ActionForm action={setPrimarySectorAction} submitLabel="Save primary sector">
            <SectorSelect kind={ctx.org.kind} value={ctx.org.primarySector} />
          </ActionForm>
        </Card>
        {ctx.org.canProvide && (
          <p>
            List every building system you work on in your{" "}
            <Link href="/app/profile" className="font-semibold text-brand underline">
              company profile
            </Link>
            . Search and applicant comparison use that list.
          </p>
        )}
      </div>
    </>
  );
}
