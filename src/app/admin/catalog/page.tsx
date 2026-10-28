import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { JOB_TYPES, type JobType } from "@/server/db/schema";
import {
  JOB_TYPE_LABELS,
  listCategories,
  listEquipmentTypes,
  listQualificationTypes,
  upsertCategory,
  upsertEquipmentType,
} from "@/server/domain/catalog";
import { requireSession, runAction, type ActionState } from "@/server/session";

export const metadata: Metadata = { title: "Catalog admin" };

function readCategoryForm(form: FormData) {
  return {
    name: String(form.get("name") ?? ""),
    slug: String(form.get("slug") ?? ""),
    parentId: String(form.get("parentId") ?? "") || null,
    isUmbrella: form.get("isUmbrella") === "on",
    allowedJobTypes: JOB_TYPES.filter((j) => form.get(`job_${j}`) === "on"),
    defaultJobType: String(form.get("defaultJobType") ?? "") as JobType,
    sort: Number(form.get("sort") ?? 100),
    active: form.get("active") === "on",
  };
}

async function saveCategory(id: string | undefined, _: ActionState, form: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireSession();
  return runAction(async () => {
    await upsertCategory(ctx, readCategoryForm(form), id);
    revalidatePath("/admin/catalog");
    return "Saved.";
  });
}

async function addEquipment(_: ActionState, form: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireSession();
  return runAction(async () => {
    await upsertEquipmentType(ctx, { name: String(form.get("name") ?? ""), slug: String(form.get("slug") ?? "") });
    revalidatePath("/admin/catalog");
    return "Added.";
  });
}

type Category = Awaited<ReturnType<typeof listCategories>>[number];

function CategoryFields({ c, parents }: { c?: Category; parents: Category[] }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" defaultValue={c?.name} required />
        </Field>
        <Field label="Slug" hint="Lowercase letters, numbers, dashes">
          <Input name="slug" defaultValue={c?.slug} required pattern="[a-z0-9-]{2,60}" />
        </Field>
        <Field label="Parent (umbrella)">
          <Select name="parentId" defaultValue={c?.parentId ?? ""}>
            <option value="">None</option>
            {parents
              .filter((p) => p.id !== c?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Sort order">
          <Input name="sort" type="number" defaultValue={c?.sort ?? 100} />
        </Field>
      </div>
      <fieldset>
        <legend className="font-semibold">Allowed job types</legend>
        {JOB_TYPES.map((j) => (
          <label key={j} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name={`job_${j}`}
              defaultChecked={c ? c.allowedJobTypes.includes(j) : true}
              className="h-5 w-5 accent-[var(--brand)]"
            />
            {JOB_TYPE_LABELS[j]}
          </label>
        ))}
      </fieldset>
      <Field label="Default job type">
        <Select name="defaultJobType" defaultValue={c?.defaultJobType ?? "delivery"}>
          {JOB_TYPES.map((j) => (
            <option key={j} value={j}>
              {JOB_TYPE_LABELS[j]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-4">
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="isUmbrella" defaultChecked={c?.isUmbrella} className="h-5 w-5" />
          Umbrella (navigation only)
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={c?.active ?? true} className="h-5 w-5" />
          Active
        </label>
      </div>
    </>
  );
}

export default async function CatalogAdmin() {
  const ctx = await requireSession("/admin/catalog");
  if (!ctx.isPlatformAdmin) notFound();
  const [cats, equipment, quals] = await Promise.all([
    listCategories(ctx, { includeInactive: true }),
    listEquipmentTypes(ctx),
    listQualificationTypes(ctx),
  ]);
  const umbrellas = cats.filter((c) => c.isUmbrella);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <PageTitle sub="Platform admin. Changes are audited.">Catalog</PageTitle>

      <h2 className="mb-3 text-xl font-bold">Building categories</h2>
      <div className="space-y-3">
        {cats.map((c) => (
          <details key={c.id} className="rounded-xl border-2 border-line bg-white">
            <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-4 font-semibold">
              <span>
                {c.parentId && <span className="text-muted">↳ </span>}
                {c.name} {!c.active && <span className="text-danger">(inactive)</span>}
              </span>
              <span className="text-sm font-normal text-muted">
                {c.isUmbrella ? "Umbrella" : c.allowedJobTypes.map((j) => JOB_TYPE_LABELS[j]).join(", ")}
              </span>
            </summary>
            <div className="border-t-2 border-line p-4">
              <ActionForm action={saveCategory.bind(null, c.id)} submitLabel="Save category">
                <CategoryFields c={c} parents={umbrellas} />
              </ActionForm>
            </div>
          </details>
        ))}
      </div>
      <Card className="mt-4">
        <h3 className="mb-3 text-lg font-bold">Add a category</h3>
        <ActionForm action={saveCategory.bind(null, undefined)} submitLabel="Add category" resetOnSuccess>
          <CategoryFields parents={umbrellas} />
        </ActionForm>
      </Card>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-xl font-bold">Equipment types</h2>
          <ul className="mb-4 list-disc pl-6">
            {equipment.map((e) => (
              <li key={e.id}>{e.name}</li>
            ))}
          </ul>
          <Card>
            <ActionForm action={addEquipment} submitLabel="Add equipment type" resetOnSuccess>
              <Field label="Name">
                <Input name="name" required />
              </Field>
              <Field label="Slug">
                <Input name="slug" required pattern="[a-z0-9-]{2,60}" />
              </Field>
            </ActionForm>
          </Card>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-bold">Qualification types</h2>
          <ul className="list-disc pl-6">
            {quals.map((q) => (
              <li key={q.id}>
                {q.name} {q.requiresDocument && <span className="text-muted">(document)</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">Document review arrives in Phase 3.</p>
        </section>
      </div>
    </main>
  );
}
