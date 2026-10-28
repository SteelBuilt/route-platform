// Route discovery list (brief §8; map view is Phase 2). Results come from the
// public route/stop columns only; private tables are never touched here.
import { and, asc, eq, gt, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { zonedLocalToUtc } from "@/lib/time";
import { requireCapability, type RequestContext } from "../context";
import {
  JOB_TYPES,
  applications,
  buildingCategories,
  organizations,
  routeInvitations,
  routes,
  stops,
  zipCentroids,
} from "../db/schema";
import { Invalid } from "../errors";
import { withTenant } from "../tenant";
import { checkEntitlement } from "./entitlements";

export const discoveryFilters = z.object({
  categoryId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || undefined),
  jobType: z.enum(JOB_TYPES).optional().or(z.literal("")).transform((v) => v || undefined),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  radiusMiles: z.coerce.number().int().min(5).max(1000).default(100),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  minCompensation: z.coerce.number().min(0).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  stops: z.enum(["any", "single", "multi"]).default("any"),
  scope: z.enum(["all", "invited"]).default("all"),
});

export type DiscoveryFilters = z.input<typeof discoveryFilters>;

const MILES_PER_DEG_LAT = 69.0;

// Great-circle distance in miles between a point column pair and a fixed point.
function milesFrom(latCol: SQL | typeof stops.approxLat, lngCol: SQL | typeof stops.approxLng, lat: number, lng: number) {
  return sql`(3958.8 * 2 * asin(sqrt(power(sin(radians((${latCol} - ${lat}) / 2)), 2) + cos(radians(${lat})) * cos(radians(${latCol})) * power(sin(radians((${lngCol} - ${lng}) / 2)), 2))))`;
}

export async function searchRoutes(ctx: RequestContext, raw: DiscoveryFilters, now = new Date()) {
  requireCapability(ctx, "marketplace.browse");
  const parsed = discoveryFilters.safeParse(raw);
  if (!parsed.success) throw new Invalid(parsed.error.issues[0].message);
  const f = parsed.data;
  const marketplace = await checkEntitlement(ctx.orgId, "marketplace.browse");
  const seeMarketplace = marketplace.allowed && f.scope === "all";
  const showPay = ctx.capabilities.has("compensation.view");

  return withTenant(ctx, async (tx) => {
    const invitedExists = sql`exists (select 1 from ${routeInvitations} ri where ri.route_id = ${routes.id} and ri.provider_org_id = ${ctx.orgId})`;
    const conds: SQL[] = [
      eq(routes.status, "published"),
      isNull(routes.deletedAt),
      ne(routes.orgId, ctx.orgId),
      or(isNull(routes.applicationDeadline), gt(routes.applicationDeadline, now))!,
      or(isNull(routes.expiresAt), gt(routes.expiresAt, now))!,
      seeMarketplace ? or(eq(routes.visibility, "marketplace"), invitedExists)! : invitedExists,
    ];

    if (f.categoryId) {
      const kids = await tx
        .select({ id: buildingCategories.id })
        .from(buildingCategories)
        .where(eq(buildingCategories.parentId, f.categoryId));
      conds.push(inArray(routes.buildingCategoryId, [f.categoryId, ...kids.map((k) => k.id)]));
    }
    if (f.jobType) conds.push(eq(routes.jobType, f.jobType));
    if (f.state) {
      conds.push(
        or(
          eq(routes.pickupState, f.state),
          sql`exists (select 1 from ${stops} s where s.route_id = ${routes.id} and s.state = ${f.state})`,
        )!,
      );
    }
    let distanceNote: string | null = null;
    if (f.zip) {
      const [c] = await tx.select().from(zipCentroids).where(eq(zipCentroids.zip, f.zip));
      if (!c) {
        distanceNote = `ZIP ${f.zip} isn't in the ZIP location table yet, so the distance filter was skipped.`;
      } else {
        const latPad = f.radiusMiles / MILES_PER_DEG_LAT;
        conds.push(
          or(
            sql`exists (select 1 from ${stops} s where s.route_id = ${routes.id} and s.approx_lat between ${c.lat - latPad} and ${c.lat + latPad} and ${milesFrom(sql`s.approx_lat`, sql`s.approx_lng`, c.lat, c.lng)} <= ${f.radiusMiles})`,
            and(
              sql`${routes.pickupApproxLat} is not null`,
              sql`${milesFrom(sql`${routes.pickupApproxLat}`, sql`${routes.pickupApproxLng}`, c.lat, c.lng)} <= ${f.radiusMiles}`,
            ),
          )!,
        );
      }
    }
    if (f.dateFrom || f.dateTo) {
      const tz = ctx.org.timezone; // date filters mean calendar days where the viewer's org is
      const from = f.dateFrom ? zonedLocalToUtc(`${f.dateFrom}T00:00`, tz) : new Date(0);
      const to = f.dateTo ? zonedLocalToUtc(`${f.dateTo}T23:59`, tz) : new Date("2999-01-01");
      const overlaps = (s: SQL, e: SQL) => sql`(${s} is not null and ${s} <= ${to} and coalesce(${e}, ${s}) >= ${from})`;
      conds.push(
        or(
          overlaps(sql`${routes.pickupWindowStart}`, sql`${routes.pickupWindowEnd}`),
          sql`exists (select 1 from ${stops} s where s.route_id = ${routes.id} and (${overlaps(sql`s.delivery_window_start`, sql`s.delivery_window_end`)} or ${overlaps(sql`s.install_window_start`, sql`s.install_window_end`)}))`,
        )!,
      );
    }
    if (f.minCompensation != null && showPay) {
      conds.push(sql`${routes.compensationCents} >= ${Math.round(f.minCompensation * 100)}`);
    }
    if (f.stops === "single") conds.push(eq(routes.stopCount, 1));
    if (f.stops === "multi") conds.push(gt(routes.stopCount, 1));

    const rows = await tx
      .select({
        id: routes.id,
        referenceCode: routes.referenceCode,
        title: routes.title,
        jobType: routes.jobType,
        visibility: routes.visibility,
        categoryName: buildingCategories.name,
        posterName: organizations.name,
        posterIsDemo: organizations.isDemo,
        pickupCity: routes.pickupCity,
        pickupState: routes.pickupState,
        pickupWindowStart: routes.pickupWindowStart,
        pickupWindowEnd: routes.pickupWindowEnd,
        pickupTimezone: routes.pickupTimezone,
        compensationMode: routes.compensationMode,
        compensationBasis: routes.compensationBasis,
        compensationUnitLabel: routes.compensationUnitLabel,
        compensationCents: routes.compensationCents,
        stopCount: routes.stopCount,
        applicationDeadline: routes.applicationDeadline,
        invited: sql<boolean>`${invitedExists}`,
        stopZips: sql<string[]>`(select coalesce(array_agg(s.zip order by s.sequence), '{}') from ${stops} s where s.route_id = ${routes.id})`,
        firstServiceDate: sql<Date | null>`(select min(coalesce(s.delivery_window_start, s.install_window_start)) from ${stops} s where s.route_id = ${routes.id})`,
        myApplicationStatus: sql<string | null>`(select a.status from ${applications} a where a.route_id = ${routes.id} and a.provider_org_id = ${ctx.orgId} and a.status <> 'withdrawn' limit 1)`,
      })
      .from(routes)
      .innerJoin(buildingCategories, eq(buildingCategories.id, routes.buildingCategoryId))
      .innerJoin(organizations, eq(organizations.id, routes.orgId))
      .where(and(...conds))
      .orderBy(asc(sql`coalesce(${routes.pickupWindowStart}, (select min(coalesce(s.delivery_window_start, s.install_window_start)) from ${stops} s where s.route_id = ${routes.id}))`))
      .limit(100);

    return {
      results: rows.map((r) => ({
        ...r,
        firstServiceDate: r.firstServiceDate ? new Date(r.firstServiceDate) : null,
        compensationCents: showPay ? r.compensationCents : null,
        compensationHidden: !showPay,
      })),
      marketplaceAccess: marketplace.allowed,
      distanceNote,
    };
  });
}
