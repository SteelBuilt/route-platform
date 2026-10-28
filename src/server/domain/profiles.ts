// Basic provider profile (brief §9, Phase 1 subset): service regions, systems,
// services, crew size, equipment. All self-reported; documents and admin
// verification arrive in Phase 3.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "../audit";
import { requireCapability, type RequestContext } from "../context";
import {
  JOB_TYPES,
  buildingCategories,
  equipmentTypes,
  organizations,
  providerEquipment,
  providerProfiles,
  serviceRegions,
} from "../db/schema";
import { Forbidden, Invalid, NotFound } from "../errors";
import { withTenant } from "../tenant";

export const profileInput = z
  .object({
    summary: z.string().trim().max(2000).nullable().optional(),
    yearsExperience: z.coerce.number().int().min(0).max(100).nullable().optional(),
    crewSizeMin: z.coerce.number().int().min(1).max(200).nullable().optional(),
    crewSizeMax: z.coerce.number().int().min(1).max(200).nullable().optional(),
    buildingCategoryIds: z.array(z.string().uuid()).default([]),
    jobTypes: z.array(z.enum(JOB_TYPES)).default([]),
    availabilityNotes: z.string().trim().max(2000).nullable().optional(),
    preferredLeadDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
    regions: z
      .array(
        z.union([
          z.object({ type: z.literal("state"), state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/) }),
          z.object({
            type: z.literal("zip_radius"),
            zip: z.string().regex(/^\d{5}$/),
            radiusMiles: z.coerce.number().int().min(5).max(1000),
          }),
        ]),
      )
      .default([]),
    equipment: z
      .array(z.object({ equipmentTypeId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(999) }))
      .default([]),
  })
  .refine((p) => !p.crewSizeMin || !p.crewSizeMax || p.crewSizeMax >= p.crewSizeMin, {
    message: "Maximum crew size must be at least the minimum",
  });

export type ProfileInput = z.input<typeof profileInput>;

export async function saveProviderProfile(ctx: RequestContext, raw: ProfileInput) {
  requireCapability(ctx, "org.manage");
  if (!ctx.org.canProvide) throw new Forbidden("Only provider organizations have a provider profile");
  const r = profileInput.safeParse(raw);
  if (!r.success) throw new Invalid(r.error.issues[0].message);
  const p = r.data;
  await withTenant(ctx, async (tx) => {
    const values = {
      summary: p.summary ?? null,
      yearsExperience: p.yearsExperience ?? null,
      crewSizeMin: p.crewSizeMin ?? null,
      crewSizeMax: p.crewSizeMax ?? null,
      buildingCategoryIds: p.buildingCategoryIds,
      jobTypes: p.jobTypes,
      availabilityNotes: p.availabilityNotes ?? null,
      preferredLeadDays: p.preferredLeadDays ?? null,
    };
    await tx
      .insert(providerProfiles)
      .values({ orgId: ctx.orgId, ...values })
      .onConflictDoUpdate({ target: providerProfiles.orgId, set: values });
    await tx.delete(serviceRegions).where(eq(serviceRegions.orgId, ctx.orgId));
    if (p.regions.length) {
      await tx.insert(serviceRegions).values(
        p.regions.map((g) =>
          g.type === "state"
            ? { orgId: ctx.orgId, type: "state" as const, state: g.state }
            : { orgId: ctx.orgId, type: "zip_radius" as const, zip: g.zip, radiusMiles: g.radiusMiles },
        ),
      );
    }
    await tx.delete(providerEquipment).where(eq(providerEquipment.orgId, ctx.orgId));
    if (p.equipment.length) {
      await tx.insert(providerEquipment).values(p.equipment.map((e) => ({ orgId: ctx.orgId, ...e })));
    }
    await audit(tx, ctx, { action: "profile.update", targetType: "organization", targetId: ctx.orgId });
  });
}

// Public profile: self-reported information only, labeled as such in the UI.
export async function getProviderProfile(ctx: RequestContext, orgId: string) {
  return withTenant(ctx, async (tx) => {
    const [org] = await tx
      .select({
        id: organizations.id,
        name: organizations.name,
        kind: organizations.kind,
        hqCity: organizations.hqCity,
        hqState: organizations.hqState,
        canProvide: organizations.canProvide,
        isDemo: organizations.isDemo,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!org || !org.canProvide) throw new NotFound("Provider not found");
    const [profile] = await tx.select().from(providerProfiles).where(eq(providerProfiles.orgId, orgId));
    const regions = await tx.select().from(serviceRegions).where(eq(serviceRegions.orgId, orgId));
    const equipment = await tx
      .select({ name: equipmentTypes.name, quantity: providerEquipment.quantity, id: equipmentTypes.id })
      .from(providerEquipment)
      .innerJoin(equipmentTypes, eq(equipmentTypes.id, providerEquipment.equipmentTypeId))
      .where(eq(providerEquipment.orgId, orgId));
    const cats = profile?.buildingCategoryIds.length
      ? await tx.select({ id: buildingCategories.id, name: buildingCategories.name }).from(buildingCategories)
      : [];
    return {
      org,
      profile: profile ?? null,
      regions,
      equipment,
      categories: cats.filter((c) => profile?.buildingCategoryIds.includes(c.id)),
      verification: "self_reported" as const,
    };
  });
}

export function profileCompleteness(p: Awaited<ReturnType<typeof getProviderProfile>>) {
  const missing: string[] = [];
  if (!p.regions.length) missing.push("service regions");
  if (!p.profile?.buildingCategoryIds.length) missing.push("building systems");
  if (!p.profile?.jobTypes.length) missing.push("services");
  if (!p.profile?.crewSizeMin) missing.push("crew size");
  return { complete: missing.length === 0, missing };
}
