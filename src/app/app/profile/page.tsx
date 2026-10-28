import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Field, Input, PageTitle } from "@/components/ui";
import { JOB_TYPES, type JobType } from "@/server/db/schema";
import { listCategories, listEquipmentTypes } from "@/server/domain/catalog";
import { getProviderProfile, profileCompleteness, saveProviderProfile } from "@/server/domain/profiles";
import { requireOrgSession, runAction, type ActionState } from "@/server/session";
import { JOB_TYPE_LABEL } from "../format";

export const metadata: Metadata = { title: "Company profile" };

async function saveProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireOrgSession();
  return runAction(async () => {
    const states = String(form.get("states") ?? "")
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const radiusZip = String(form.get("radiusZip") ?? "").trim();
    const regions = [
      ...states.map((state) => ({ type: "state" as const, state })),
      ...(radiusZip ? [{ type: "zip_radius" as const, zip: radiusZip, radiusMiles: Number(form.get("radiusMiles") || 100) }] : []),
    ];
    const num = (k: string) => (form.get(k) ? Number(form.get(k)) : null);
    await saveProviderProfile(ctx, {
      summary: String(form.get("summary") ?? "") || null,
      yearsExperience: num("yearsExperience"),
      crewSizeMin: num("crewSizeMin"),
      crewSizeMax: num("crewSizeMax"),
      buildingCategoryIds: form.getAll("categoryIds").map(String),
      jobTypes: form.getAll("jobTypes").map(String) as JobType[],
      availabilityNotes: String(form.get("availabilityNotes") ?? "") || null,
      regions,
      equipment: form
        .getAll("equipmentIds")
        .map(String)
        .map((equipmentTypeId) => ({ equipmentTypeId, quantity: Number(form.get(`qty_${equipmentTypeId}`) || 1) })),
    });
    revalidatePath("/app/profile");
    return "Profile saved.";
  });
}

export default async function ProfilePage() {
  const ctx = await requireOrgSession("/app/profile");
  if (!ctx.org.canProvide || !ctx.capabilities.has("org.manage")) redirect("/app");
  const [p, categories, equipment] = await Promise.all([
    getProviderProfile(ctx, ctx.orgId),
    listCategories(ctx),
    listEquipmentTypes(ctx),
  ]);
  const done = profileCompleteness(p);
  const states = p.regions.filter((r) => r.type === "state").map((r) => r.state).join(", ");
  const radius = p.regions.find((r) => r.type === "zip_radius");

  return (
    <>
      <PageTitle sub="Posting companies see this when you apply. Everything here is shown as self-reported.">
        Company profile
      </PageTitle>
      {!done.complete && (
        <div className="mb-4">
          <Alert kind="info">Add your {done.missing.join(", ")} so posters can compare you quickly.</Alert>
        </div>
      )}
      <ActionForm action={saveProfileAction} submitLabel="Save profile" className="max-w-3xl space-y-6">
        <Field label="About your company">
          <textarea
            name="summary"
            rows={4}
            defaultValue={p.profile?.summary ?? ""}
            className="block w-full rounded-lg border-2 border-line px-3 py-2 text-base"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Years in business">
            <Input name="yearsExperience" type="number" min={0} defaultValue={p.profile?.yearsExperience ?? ""} />
          </Field>
          <Field label="Crew size from">
            <Input name="crewSizeMin" type="number" min={1} defaultValue={p.profile?.crewSizeMin ?? ""} />
          </Field>
          <Field label="to">
            <Input name="crewSizeMax" type="number" min={1} defaultValue={p.profile?.crewSizeMax ?? ""} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1 font-semibold">Services</legend>
          {JOB_TYPES.map((j) => (
            <label key={j} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="jobTypes" value={j} defaultChecked={p.profile?.jobTypes.includes(j)} className="h-5 w-5" />
              {JOB_TYPE_LABEL[j]}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend className="mb-1 font-semibold">Building systems</legend>
          {categories
            .filter((c) => !c.isUmbrella)
            .map((c) => (
              <label key={c.id} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={c.id}
                  defaultChecked={p.profile?.buildingCategoryIds.includes(c.id)}
                  className="h-5 w-5"
                />
                {c.name}
              </label>
            ))}
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-1 font-semibold">Service area</legend>
          <Field label="States you cover" hint="e.g. TX, OK, LA">
            <Input name="states" defaultValue={states} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Or around ZIP">
              <Input name="radiusZip" inputMode="numeric" maxLength={5} defaultValue={radius?.zip ?? ""} />
            </Field>
            <Field label="Miles">
              <Input name="radiusMiles" type="number" min={5} defaultValue={radius?.radiusMiles ?? 100} />
            </Field>
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 font-semibold">Equipment</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {equipment.map((e) => {
              const have = p.equipment.find((x) => x.id === e.id);
              return (
                <div key={e.id} className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" name="equipmentIds" value={e.id} id={`eq-${e.id}`} defaultChecked={!!have} className="h-5 w-5" />
                  <label htmlFor={`eq-${e.id}`} className="flex-1">
                    {e.name}
                  </label>
                  <input
                    name={`qty_${e.id}`}
                    type="number"
                    min={1}
                    defaultValue={have?.quantity ?? 1}
                    aria-label={`${e.name} quantity`}
                    className="min-h-11 w-16 rounded-lg border-2 border-line px-2"
                  />
                </div>
              );
            })}
          </div>
        </fieldset>
        <Field label="Availability and scheduling preferences">
          <Input name="availabilityNotes" defaultValue={p.profile?.availabilityNotes ?? ""} />
        </Field>
        <p className="text-sm text-muted">
          Insurance and other documents, with administrator review, arrive in a later release. Until then, nothing
          on your profile is marked as verified.
        </p>
      </ActionForm>
    </>
  );
}
