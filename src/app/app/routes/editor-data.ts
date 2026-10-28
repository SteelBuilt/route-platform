import { listCategories, listEquipmentTypes, listQualificationTypes } from "@/server/domain/catalog";
import { listPreferredProviders } from "@/server/domain/routes";
import type { RequestContext } from "@/server/context";

export async function editorOptions(ctx: RequestContext) {
  const [categories, equipment, qualifications, preferred] = await Promise.all([
    listCategories(ctx),
    listEquipmentTypes(ctx),
    listQualificationTypes(ctx),
    listPreferredProviders(ctx),
  ]);
  return {
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      isUmbrella: c.isUmbrella,
      parentId: c.parentId,
      allowedJobTypes: c.allowedJobTypes as string[],
      defaultJobType: c.defaultJobType as string,
    })),
    equipment: equipment.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name })),
    qualifications: qualifications.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name })),
    preferred: preferred.map((p) => ({ id: p.id, name: p.name })),
  };
}
