// Loads required reference data (catalog, plans, config defaults). This is not
// demo data: production needs it too. Existing rows are left untouched, so
// admin edits survive re-running it.
import { eq, sql } from "drizzle-orm";
import defaults from "../../../config/defaults.json";
import type { DB } from "./client";
import {
  appConfig,
  buildingCategories,
  equipmentTypes,
  plans,
  qualificationTypes,
  type JobType,
} from "./schema";

type CategoryDefault = {
  slug: string;
  name: string;
  parent?: string;
  is_umbrella?: boolean;
  allowed_job_types: JobType[];
  default_job_type: JobType;
  sort: number;
};

// A JSON null must be written as the jsonb value 'null', not SQL NULL.
export function jsonValue(value: unknown) {
  return value === null ? sql`'null'::jsonb` : value;
}

export async function seedBase(db: DB) {
  for (const [key, value] of Object.entries(defaults.app_config)) {
    await db.insert(appConfig).values({ key, value: jsonValue(value) }).onConflictDoNothing();
  }

  for (const p of defaults.plans) {
    await db
      .insert(plans)
      .values({
        code: p.code,
        audience: p.audience as "poster" | "provider",
        name: p.name,
        basePriceCents: p.base_price_cents,
        includedLeaderSeats: p.included_leader_seats,
        extraSeatPriceCents: p.extra_seat_price_cents,
        interval: p.interval as "month" | "year",
        trialDays: p.trial_days,
      })
      .onConflictDoNothing();
  }

  const cats = defaults.building_categories as CategoryDefault[];
  for (const c of cats.filter((c) => !c.parent)) {
    await db
      .insert(buildingCategories)
      .values({
        slug: c.slug,
        name: c.name,
        isUmbrella: c.is_umbrella ?? false,
        allowedJobTypes: c.allowed_job_types,
        defaultJobType: c.default_job_type,
        sort: c.sort,
      })
      .onConflictDoNothing();
  }
  for (const c of cats.filter((c) => c.parent)) {
    const [parent] = await db
      .select({ id: buildingCategories.id })
      .from(buildingCategories)
      .where(eq(buildingCategories.slug, c.parent!));
    await db
      .insert(buildingCategories)
      .values({
        slug: c.slug,
        name: c.name,
        parentId: parent?.id ?? null,
        allowedJobTypes: c.allowed_job_types,
        defaultJobType: c.default_job_type,
        sort: c.sort,
      })
      .onConflictDoNothing();
  }

  for (const e of defaults.equipment_types) {
    await db.insert(equipmentTypes).values(e).onConflictDoNothing();
  }
  for (const q of defaults.qualification_types) {
    await db
      .insert(qualificationTypes)
      .values({
        slug: q.slug,
        name: q.name,
        requiresDocument: q.requires_document,
        documentKind: q.document_kind ?? null,
      })
      .onConflictDoNothing();
  }
}
