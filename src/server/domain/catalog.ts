// Admin-managed catalog: building categories, equipment and qualification types.
// Job types are a fixed enum because they drive scheduling logic (brief §3).
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "../audit";
import type { RequestContext } from "../context";
import {
  JOB_TYPES,
  buildingCategories,
  equipmentTypes,
  qualificationTypes,
  type JobType,
} from "../db/schema";
import { Forbidden, Invalid, NotFound } from "../errors";
import { withPlatformAdmin, withTenant } from "../tenant";

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  delivery: "Delivery only",
  installation: "Installation / erection only",
  delivery_installation: "Delivery and installation",
};

export async function listCategories(ctx: RequestContext, opts: { includeInactive?: boolean } = {}) {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.select().from(buildingCategories).orderBy(asc(buildingCategories.sort));
    return opts.includeInactive ? rows : rows.filter((r) => r.active);
  });
}

export async function listEquipmentTypes(ctx: RequestContext) {
  return withTenant(ctx, (tx) => tx.select().from(equipmentTypes).orderBy(asc(equipmentTypes.name)));
}

export async function listQualificationTypes(ctx: RequestContext) {
  return withTenant(ctx, (tx) => tx.select().from(qualificationTypes).orderBy(asc(qualificationTypes.name)));
}

export const categoryInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{2,60}$/),
    parentId: z.string().uuid().nullable().optional(),
    isUmbrella: z.boolean().default(false),
    allowedJobTypes: z.array(z.enum(JOB_TYPES)).min(1),
    defaultJobType: z.enum(JOB_TYPES),
    sort: z.number().int().default(100),
    active: z.boolean().default(true),
  })
  .refine((c) => c.allowedJobTypes.includes(c.defaultJobType), {
    message: "Default job type must be one of the allowed job types",
  });

function requireAdmin(ctx: RequestContext) {
  if (!ctx.isPlatformAdmin) throw new Forbidden();
}

export async function upsertCategory(ctx: RequestContext, input: z.input<typeof categoryInput>, id?: string) {
  requireAdmin(ctx);
  const parsed = categoryInput.safeParse(input);
  if (!parsed.success) throw new Invalid(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;
  return withPlatformAdmin(ctx, async (tx) => {
    if (data.parentId) {
      const [p] = await tx.select().from(buildingCategories).where(eq(buildingCategories.id, data.parentId));
      if (!p) throw new Invalid("Parent category not found");
      if (p.id === id) throw new Invalid("A category can't be its own parent");
    }
    let row;
    if (id) {
      [row] = await tx.update(buildingCategories).set(data).where(eq(buildingCategories.id, id)).returning();
      if (!row) throw new NotFound("Category not found");
    } else {
      [row] = await tx.insert(buildingCategories).values(data).returning();
    }
    await audit(tx, ctx, {
      action: id ? "catalog.category_update" : "catalog.category_create",
      targetType: "building_category",
      targetId: row.id,
      metadata: data,
    });
    return row;
  });
}

const simpleInput = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/),
  active: z.boolean().default(true),
});

export async function upsertEquipmentType(ctx: RequestContext, input: z.input<typeof simpleInput>, id?: string) {
  requireAdmin(ctx);
  const data = simpleInput.parse(input);
  return withPlatformAdmin(ctx, async (tx) => {
    const [row] = id
      ? await tx.update(equipmentTypes).set(data).where(eq(equipmentTypes.id, id)).returning()
      : await tx.insert(equipmentTypes).values(data).returning();
    if (!row) throw new NotFound();
    await audit(tx, ctx, { action: "catalog.equipment_upsert", targetType: "equipment_type", targetId: row.id });
    return row;
  });
}

export async function upsertQualificationType(
  ctx: RequestContext,
  input: z.input<typeof simpleInput> & { requiresDocument?: boolean },
  id?: string,
) {
  requireAdmin(ctx);
  const data = { ...simpleInput.parse(input), requiresDocument: !!input.requiresDocument };
  return withPlatformAdmin(ctx, async (tx) => {
    const [row] = id
      ? await tx.update(qualificationTypes).set(data).where(eq(qualificationTypes.id, id)).returning()
      : await tx.insert(qualificationTypes).values(data).returning();
    if (!row) throw new NotFound();
    await audit(tx, ctx, {
      action: "catalog.qualification_upsert",
      targetType: "qualification_type",
      targetId: row.id,
    });
    return row;
  });
}
