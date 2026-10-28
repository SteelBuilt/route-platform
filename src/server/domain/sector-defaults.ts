// The org's primary sector as a default building category (never a limit).
import { eq } from "drizzle-orm";
import { SECTOR_DEFAULT_CATEGORY } from "@/lib/sectors";
import type { RequestContext } from "../context";
import { buildingCategories } from "../db/schema";
import { withTenant } from "../tenant";

export async function defaultCategoryId(ctx: RequestContext): Promise<string | null> {
  const sector = ctx.org?.primarySector;
  if (!sector) return null;
  return withTenant(ctx, async (tx) => {
    const [c] = await tx
      .select({ id: buildingCategories.id, active: buildingCategories.active })
      .from(buildingCategories)
      .where(eq(buildingCategories.slug, SECTOR_DEFAULT_CATEGORY[sector]));
    return c?.active ? c.id : null;
  });
}
