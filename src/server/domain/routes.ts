// Route posting (brief §6): drafts, publish, duplicate, templates, version
// history. Private data (exact addresses, contacts, internal/assignment notes,
// safety notes) is written to separate RLS-protected tables.
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { zonedLocalToUtc } from "@/lib/time";
import { audit } from "../audit";
import { requireCapability, requireVerifiedEmail, type OrgContext, type RequestContext } from "../context";
import {
  buildingCategories,
  locations,
  organizations,
  preferredProviders,
  routeInternal,
  routeInvitations,
  routePrivate,
  routeRequirements,
  routeTemplates,
  routeVersions,
  routes,
  stopContacts,
  stopEquipment,
  stopPrivate,
  stops,
  zipCentroids,
  applications,
} from "../db/schema";
import { Conflict, Forbidden, Invalid, NotEntitled, NotFound } from "../errors";
import { withTenant, type TenantTx } from "../tenant";
import { checkEntitlement } from "./entitlements";
import { MATERIAL_FIELDS, routeInput, servicesForJobType, type RouteInput, type RouteInputRaw } from "./route-input";
import { assertTransition } from "./transitions";

function requirePoster(ctx: RequestContext): asserts ctx is OrgContext {
  requireCapability(ctx, "routes.post");
  if (!ctx.org.canPost) throw new Forbidden("Only posting companies can create routes");
}

export function parseRouteInput(raw: RouteInputRaw): RouteInput {
  const r = routeInput.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new Invalid(`${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`);
  }
  return r.data;
}

const toUtc = (local: string | null, tz: string) => (local ? zonedLocalToUtc(local, tz) : null);

function referenceCode() {
  return `RY-${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`;
}

async function centroids(tx: TenantTx, zips: string[]) {
  if (!zips.length) return new Map<string, typeof zipCentroids.$inferSelect>();
  const rows = await tx.select().from(zipCentroids).where(inArray(zipCentroids.zip, zips));
  return new Map(rows.map((r) => [r.zip, r]));
}

// Rough city-level point for the pickup: the average of known centroids in the
// same city/state, else the ZIP's centroid. Never the exact address.
async function cityPoint(tx: TenantTx, city: string, state: string, zip: string) {
  const [r] = await tx
    .select({ lat: sql<number>`avg(${zipCentroids.lat})`, lng: sql<number>`avg(${zipCentroids.lng})` })
    .from(zipCentroids)
    .where(and(sql`lower(${zipCentroids.city}) = lower(${city})`, eq(zipCentroids.state, state)));
  if (r?.lat != null) return { lat: Math.round(r.lat * 100) / 100, lng: Math.round(r.lng * 100) / 100 };
  const [z] = await tx.select().from(zipCentroids).where(eq(zipCentroids.zip, zip));
  return z ? { lat: Math.round(z.lat * 10) / 10, lng: Math.round(z.lng * 10) / 10 } : null;
}

// Writes the route and everything under it. On update, stops and their private
// rows are replaced (allowed only before an award exists).
async function persist(tx: TenantTx, ctx: OrgContext, input: RouteInput, existingId: string | null) {
  const pickupTz = input.pickupTimezone;
  let pickupLocationId: string | null = null;
  let pickupPublic: { city: string; state: string; lat: number | null; lng: number | null } | null = null;

  if (existingId) {
    const old = await tx
      .select({ id: stops.id, locationId: stops.locationId })
      .from(stops)
      .where(eq(stops.routeId, existingId));
    const [r] = await tx.select({ p: routes.pickupLocationId }).from(routes).where(eq(routes.id, existingId));
    await tx.delete(stops).where(eq(stops.routeId, existingId));
    const locIds = [...old.map((o) => o.locationId), r?.p].filter((x): x is string => !!x);
    await tx.update(routes).set({ pickupLocationId: null }).where(eq(routes.id, existingId));
    if (locIds.length) await tx.delete(locations).where(inArray(locations.id, locIds));
    await tx.delete(routeRequirements).where(eq(routeRequirements.routeId, existingId));
    await tx.delete(routeInvitations).where(eq(routeInvitations.routeId, existingId));
  }

  if (input.pickup) {
    const [loc] = await tx
      .insert(locations)
      .values({ orgId: ctx.orgId, ...input.pickup, timezone: pickupTz })
      .returning({ id: locations.id });
    pickupLocationId = loc.id;
    const pt = await cityPoint(tx, input.pickup.city, input.pickup.state, input.pickup.zip);
    pickupPublic = { city: input.pickup.city, state: input.pickup.state, lat: pt?.lat ?? null, lng: pt?.lng ?? null };
  }

  const values = {
    title: input.title,
    buildingCategoryId: input.buildingCategoryId,
    jobType: input.jobType,
    visibility: input.visibility,
    pickupLocationId,
    pickupCity: pickupPublic?.city ?? null,
    pickupState: pickupPublic?.state ?? null,
    pickupApproxLat: pickupPublic?.lat ?? null,
    pickupApproxLng: pickupPublic?.lng ?? null,
    pickupWindowStart: toUtc(input.pickupWindowStart, pickupTz),
    pickupWindowEnd: toUtc(input.pickupWindowEnd, pickupTz),
    pickupTimezone: pickupTz,
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    crewSizeRequired: input.crewSizeRequired,
    loadingResponsibility: input.loadingResponsibility,
    unloadingResponsibility: input.unloadingResponsibility,
    responsibilityNotes: input.responsibilityNotes,
    compensationMode: input.compensationMode,
    compensationBasis: input.compensationBasis,
    compensationUnitLabel: input.compensationUnitLabel,
    compensationCents: input.compensationCents,
    providerNotes: input.providerNotes,
    applicationDeadline: toUtc(input.applicationDeadline, pickupTz),
    expiresAt: toUtc(input.expiresAt, pickupTz),
    stopCount: input.stops.length,
  };

  let routeId = existingId;
  if (routeId) {
    await tx.update(routes).set(values).where(eq(routes.id, routeId));
  } else {
    const [row] = await tx
      .insert(routes)
      .values({ ...values, orgId: ctx.orgId, referenceCode: referenceCode(), createdBy: ctx.userId })
      .returning({ id: routes.id });
    routeId = row.id;
  }

  await tx
    .insert(routeInternal)
    .values({ routeId, orgId: ctx.orgId, internalNotes: input.internalNotes })
    .onConflictDoUpdate({ target: routeInternal.routeId, set: { internalNotes: input.internalNotes } });
  await tx
    .insert(routePrivate)
    .values({ routeId, orgId: ctx.orgId, assignmentNotes: input.assignmentNotes })
    .onConflictDoUpdate({ target: routePrivate.routeId, set: { assignmentNotes: input.assignmentNotes } });

  const reqs = [
    ...input.equipmentTypeIds.map((refId) => ({ kind: "equipment" as const, refId })),
    ...input.qualificationTypeIds.map((refId) => ({ kind: "qualification" as const, refId })),
  ];
  if (reqs.length) {
    await tx.insert(routeRequirements).values(reqs.map((r) => ({ ...r, routeId: routeId!, orgId: ctx.orgId })));
  }
  if (input.visibility === "invitation" && input.invitedProviderOrgIds.length) {
    await tx.insert(routeInvitations).values(
      [...new Set(input.invitedProviderOrgIds)].map((providerOrgId) => ({
        routeId: routeId!,
        orgId: ctx.orgId,
        providerOrgId,
      })),
    );
  }

  const cmap = await centroids(
    tx,
    input.stops.map((s) => s.address.zip),
  );
  const services = servicesForJobType(input.jobType);
  for (const [i, s] of input.stops.entries()) {
    const [loc] = await tx
      .insert(locations)
      .values({ orgId: ctx.orgId, ...s.address, timezone: s.timezone })
      .returning({ id: locations.id });
    const c = cmap.get(s.address.zip);
    const [stop] = await tx
      .insert(stops)
      .values({
        routeId,
        orgId: ctx.orgId,
        sequence: i + 1,
        locationId: loc.id,
        city: s.address.city,
        state: s.address.state,
        zip: s.address.zip,
        approxLat: c?.lat ?? null,
        approxLng: c?.lng ?? null,
        timezone: s.timezone,
        services: s.services?.length ? s.services : services,
        deliveryWindowStart: toUtc(s.deliveryWindowStart, s.timezone),
        deliveryWindowEnd: toUtc(s.deliveryWindowEnd, s.timezone),
        installWindowStart: toUtc(s.installWindowStart, s.timezone),
        installWindowEnd: toUtc(s.installWindowEnd, s.timezone),
        appointmentWindowStart: toUtc(s.appointmentWindowStart, s.timezone),
        appointmentWindowEnd: toUtc(s.appointmentWindowEnd, s.timezone),
        customerAvailabilityNotes: s.customerAvailabilityNotes,
        buildingWidthFt: s.buildingWidthFt,
        buildingLengthFt: s.buildingLengthFt,
        buildingHeightFt: s.buildingHeightFt,
        buildingSystem: s.buildingSystem,
        manufacturerName: s.manufacturerName,
        openings: s.openings ? { text: s.openings } : null,
        otherDetails: s.otherDetails,
        loadLengthFt: s.loadLengthFt,
        loadWidthFt: s.loadWidthFt,
        loadHeightFt: s.loadHeightFt,
        loadWeightLbs: s.loadWeightLbs,
        pieceCount: s.pieceCount,
        siteAccessNotes: s.siteAccessNotes,
        unloadingConstraints: s.unloadingConstraints,
        surface: s.surface,
        surfaceNotes: s.surfaceNotes,
        siteReadiness: s.siteReadiness,
        plansStatus: s.plansStatus,
        permitStatus: s.permitStatus,
        engineeringStatus: s.engineeringStatus,
      })
      .returning({ id: stops.id });
    await tx.insert(stopPrivate).values({
      stopId: stop.id,
      orgId: ctx.orgId,
      safetyNotes: s.safetyNotes,
      accessInstructions: s.accessInstructions,
    });
    if (s.contactName) {
      await tx.insert(stopContacts).values({
        stopId: stop.id,
        orgId: ctx.orgId,
        name: s.contactName,
        phone: s.contactPhone,
        email: s.contactEmail,
        role: "customer",
      });
    }
    if (s.equipmentTypeIds.length) {
      await tx
        .insert(stopEquipment)
        .values(s.equipmentTypeIds.map((equipmentTypeId) => ({ stopId: stop.id, orgId: ctx.orgId, equipmentTypeId })));
    }
  }
  return routeId;
}

// Key order-independent JSON (snapshots come back from jsonb with keys reordered).
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

function changedFields(prev: RouteInput, next: RouteInput): { fields: string[]; material: boolean } {
  const keys = Object.keys(next) as (keyof RouteInput)[];
  const fields = keys.filter((k) => stable(prev[k]) !== stable(next[k]));
  return { fields, material: fields.some((f) => (MATERIAL_FIELDS as readonly string[]).includes(f)) };
}

export async function createDraft(ctx: RequestContext, raw: RouteInputRaw) {
  requirePoster(ctx);
  const input = parseRouteInput(raw);
  return withTenant(ctx, async (tx) => {
    const id = await persist(tx, ctx, input, null);
    await tx.insert(routeVersions).values({
      routeId: id,
      orgId: ctx.orgId,
      version: 1,
      changedBy: ctx.userId,
      changeKind: "created",
      snapshot: input,
    });
    await audit(tx, ctx, { action: "route.create", targetType: "route", targetId: id });
    return id;
  });
}

async function loadOwnRoute(tx: TenantTx, ctx: OrgContext, id: string, lock = false) {
  const q = tx
    .select()
    .from(routes)
    .where(and(eq(routes.id, id), eq(routes.orgId, ctx.orgId), isNull(routes.deletedAt)));
  const [r] = lock ? await q.for("update") : await q;
  if (!r) throw new NotFound("Route not found");
  return r;
}

export async function latestSnapshot(tx: TenantTx, routeId: string) {
  const [v] = await tx
    .select()
    .from(routeVersions)
    .where(eq(routeVersions.routeId, routeId))
    .orderBy(desc(routeVersions.version))
    .limit(1);
  return v ? (v.snapshot as RouteInput) : null;
}

export async function updateRoute(ctx: RequestContext, id: string, raw: RouteInputRaw) {
  requirePoster(ctx);
  const input = parseRouteInput(raw);
  return withTenant(ctx, async (tx) => {
    const r = await loadOwnRoute(tx, ctx, id, true);
    if (r.status !== "draft" && r.status !== "published") {
      throw new Conflict("This route has an award in progress. Changes after award need a change request (Phase 2).");
    }
    const prev = await latestSnapshot(tx, id);
    const diff = prev ? changedFields(prev, input) : { fields: ["*"], material: true };
    if (!diff.fields.length) return { version: r.version, material: false };
    if (r.status === "published") await validateForPublish(tx, ctx, input);
    await persist(tx, ctx, input, id);
    const version = r.version + 1;
    await tx.update(routes).set({ version }).where(eq(routes.id, id));
    await tx.insert(routeVersions).values({
      routeId: id,
      orgId: ctx.orgId,
      version,
      changedBy: ctx.userId,
      changeKind: diff.material ? "material" : "minor",
      changedFields: diff.fields,
      snapshot: input,
    });
    await audit(tx, ctx, {
      action: diff.material ? "route.update_material" : "route.update",
      targetType: "route",
      targetId: id,
      metadata: { version, fields: diff.fields, status: r.status },
    });
    return { version, material: diff.material };
  });
}

export async function validateForPublish(tx: TenantTx, ctx: OrgContext, input: RouteInput, now = new Date()) {
  const problems: string[] = [];
  const [cat] = await tx.select().from(buildingCategories).where(eq(buildingCategories.id, input.buildingCategoryId));
  if (!cat || !cat.active) problems.push("Choose an active building category");
  else if (cat.isUmbrella) problems.push(`"${cat.name}" is a group. Choose a specific category`);
  else if (!cat.allowedJobTypes.includes(input.jobType)) problems.push(`${cat.name} doesn't allow this job type`);

  if (!input.stops.length) problems.push("Add at least one stop");
  const needsPickup = input.jobType !== "installation";
  if (needsPickup) {
    if (!input.pickup) problems.push("Add the pickup location");
    if (!input.pickupWindowStart || !input.pickupWindowEnd) problems.push("Set the pickup window");
  }
  const tzp = input.pickupTimezone;
  const ps = toUtc(input.pickupWindowStart, tzp);
  const pe = toUtc(input.pickupWindowEnd, tzp);
  if (ps && pe && pe <= ps) problems.push("Pickup window must end after it starts");
  if (ps && ps < now) problems.push("Pickup window is in the past");

  for (const [i, s] of input.stops.entries()) {
    const n = i + 1;
    const services = s.services?.length ? s.services : servicesForJobType(input.jobType);
    if (services.includes("delivery") && !s.deliveryWindowStart) problems.push(`Stop ${n}: set the delivery window`);
    if (services.includes("installation") && !s.installWindowStart) {
      problems.push(`Stop ${n}: set the installation window`);
    }
    for (const [a, b, label] of [
      [s.deliveryWindowStart, s.deliveryWindowEnd, "delivery"],
      [s.installWindowStart, s.installWindowEnd, "installation"],
      [s.appointmentWindowStart, s.appointmentWindowEnd, "appointment"],
    ] as const) {
      const sa = toUtc(a, s.timezone);
      const sb = toUtc(b, s.timezone);
      if (sa && sb && sb <= sa) problems.push(`Stop ${n}: ${label} window must end after it starts`);
    }
  }

  if (input.compensationMode === "fixed" && !input.compensationCents) problems.push("Enter the compensation");
  if (input.compensationBasis === "per_unit" && !input.compensationUnitLabel) {
    problems.push("Name the compensation unit (e.g. per building)");
  }
  const deadline = toUtc(input.applicationDeadline, tzp);
  const expires = toUtc(input.expiresAt, tzp);
  if (deadline && deadline < now) problems.push("Application deadline is in the past");
  if (expires && expires < now) problems.push("Expiration is in the past");
  if (deadline && expires && expires < deadline) problems.push("Expiration must be after the application deadline");

  if (input.visibility === "invitation" && !input.invitedProviderOrgIds.length) {
    problems.push("Invite at least one provider, or change visibility");
  }
  if (input.visibility === "preferred") {
    const prefs = await tx.select().from(preferredProviders).where(eq(preferredProviders.orgId, ctx.orgId));
    if (!prefs.length) problems.push("You have no preferred providers yet. Add some, or change visibility");
  }
  if (problems.length) throw new Invalid(problems.join(". "));
}

export async function publishRoute(ctx: RequestContext, id: string, now = new Date()) {
  requirePoster(ctx);
  requireVerifiedEmail(ctx);
  const ent = await checkEntitlement(ctx.orgId, "route.publish");
  if (!ent.allowed) throw new NotEntitled("Your posting plan isn't active, so new routes can't be published.");
  return withTenant(ctx, async (tx) => {
    const r = await loadOwnRoute(tx, ctx, id, true);
    assertTransition("route", r.status, "published");
    const input = await latestSnapshot(tx, id);
    if (!input) throw new Invalid("Route has no saved details");
    await validateForPublish(tx, ctx, input, now);

    if (r.visibility === "preferred") {
      const prefs = await tx.select().from(preferredProviders).where(eq(preferredProviders.orgId, ctx.orgId));
      await tx.delete(routeInvitations).where(eq(routeInvitations.routeId, id));
      await tx
        .insert(routeInvitations)
        .values(prefs.map((p) => ({ routeId: id, orgId: ctx.orgId, providerOrgId: p.providerOrgId })));
    }
    await tx.update(routes).set({ status: "published", publishedAt: now }).where(eq(routes.id, id));
    await audit(tx, ctx, { action: "route.publish", targetType: "route", targetId: id });
  });
}

export async function unpublishRoute(ctx: RequestContext, id: string) {
  requirePoster(ctx);
  return withTenant(ctx, async (tx) => {
    const r = await loadOwnRoute(tx, ctx, id, true);
    assertTransition("route", r.status, "draft");
    const [open] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(applications)
      .where(and(eq(applications.routeId, id), inArray(applications.status, ["submitted", "shortlisted"])));
    if (open.n > 0) throw new Conflict("Providers have applied, so this route can't go back to draft. Cancel it instead.");
    await tx.update(routes).set({ status: "draft" }).where(eq(routes.id, id));
    await audit(tx, ctx, { action: "route.unpublish", targetType: "route", targetId: id });
  });
}

export async function cancelRoute(ctx: RequestContext, id: string, reason: string) {
  requirePoster(ctx);
  if (reason.trim().length < 3) throw new Invalid("Give a reason for cancelling");
  return withTenant(ctx, async (tx) => {
    const r = await loadOwnRoute(tx, ctx, id, true);
    if (r.status === "draft") {
      await tx.update(routes).set({ deletedAt: new Date() }).where(eq(routes.id, id));
    } else {
      if (r.status === "assigned" || r.status === "in_progress") {
        throw new Conflict("Cancelling an accepted assignment arrives with route execution (Phase 2).");
      }
      assertTransition("route", r.status, "cancelled");
      await tx.update(routes).set({ status: "cancelled" }).where(eq(routes.id, id));
      await tx
        .update(applications)
        .set({ status: "not_selected" })
        .where(and(eq(applications.routeId, id), inArray(applications.status, ["submitted", "shortlisted", "awarded"])));
    }
    await audit(tx, ctx, { action: "route.cancel", targetType: "route", targetId: id, metadata: { reason } });
  });
}

export async function duplicateRoute(ctx: RequestContext, id: string) {
  requirePoster(ctx);
  const input = await withTenant(ctx, async (tx) => {
    await loadOwnRoute(tx, ctx, id);
    return latestSnapshot(tx, id);
  });
  if (!input) throw new NotFound();
  return createDraft(ctx, { ...input, title: `${input.title} (copy)` });
}

// Templates keep the reusable shape of a route: no dates, addresses or contacts.
function templatePayload(input: RouteInput): RouteInputRaw {
  return {
    ...input,
    pickupWindowStart: null,
    pickupWindowEnd: null,
    applicationDeadline: null,
    expiresAt: null,
    invitedProviderOrgIds: [],
    stops: input.stops.map((s) => ({
      ...s,
      deliveryWindowStart: null,
      deliveryWindowEnd: null,
      installWindowStart: null,
      installWindowEnd: null,
      appointmentWindowStart: null,
      appointmentWindowEnd: null,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      customerAvailabilityNotes: null,
      address: { line1: "", line2: null, city: "", state: s.address.state, zip: "" },
    })),
  };
}

export async function saveAsTemplate(ctx: RequestContext, routeId: string, name: string) {
  requirePoster(ctx);
  if (name.trim().length < 2) throw new Invalid("Name the template");
  return withTenant(ctx, async (tx) => {
    await loadOwnRoute(tx, ctx, routeId);
    const input = await latestSnapshot(tx, routeId);
    if (!input) throw new NotFound();
    const [t] = await tx
      .insert(routeTemplates)
      .values({ orgId: ctx.orgId, name: name.trim(), payload: templatePayload(input), createdBy: ctx.userId })
      .returning({ id: routeTemplates.id });
    await audit(tx, ctx, { action: "template.create", targetType: "route_template", targetId: t.id });
    return t.id;
  });
}

export async function listTemplates(ctx: RequestContext) {
  requirePoster(ctx);
  return withTenant(ctx, (tx) =>
    tx
      .select({ id: routeTemplates.id, name: routeTemplates.name, createdAt: routeTemplates.createdAt })
      .from(routeTemplates)
      .where(eq(routeTemplates.orgId, ctx.orgId))
      .orderBy(desc(routeTemplates.createdAt)),
  );
}

export async function getTemplate(ctx: RequestContext, id: string) {
  requirePoster(ctx);
  return withTenant(ctx, async (tx) => {
    const [t] = await tx
      .select()
      .from(routeTemplates)
      .where(and(eq(routeTemplates.id, id), eq(routeTemplates.orgId, ctx.orgId)));
    if (!t) throw new NotFound("Template not found");
    return { ...t, payload: t.payload as RouteInputRaw };
  });
}

export async function listMyRoutes(ctx: RequestContext) {
  requirePoster(ctx);
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        route: routes,
        applicants: sql<number>`(select count(*)::int from applications a where a.route_id = ${routes.id} and a.status not in ('withdrawn'))`,
      })
      .from(routes)
      .where(and(eq(routes.orgId, ctx.orgId), isNull(routes.deletedAt)))
      .orderBy(desc(routes.updatedAt));
    return rows.map((r) => ({ ...r.route, applicants: r.applicants }));
  });
}

// Full poster view, including private data and edit snapshot.
export async function getRouteForPoster(ctx: RequestContext, id: string) {
  requirePoster(ctx);
  return withTenant(ctx, async (tx) => {
    const r = await loadOwnRoute(tx, ctx, id);
    const stopRows = await tx.select().from(stops).where(eq(stops.routeId, id)).orderBy(asc(stops.sequence));
    const snapshot = await latestSnapshot(tx, id);
    const versions = await tx
      .select({
        version: routeVersions.version,
        changeKind: routeVersions.changeKind,
        changedFields: routeVersions.changedFields,
        createdAt: routeVersions.createdAt,
      })
      .from(routeVersions)
      .where(eq(routeVersions.routeId, id))
      .orderBy(desc(routeVersions.version));
    const [internal] = await tx.select().from(routeInternal).where(eq(routeInternal.routeId, id));
    const invited = await tx
      .select({ id: organizations.id, name: organizations.name })
      .from(routeInvitations)
      .innerJoin(organizations, eq(organizations.id, routeInvitations.providerOrgId))
      .where(eq(routeInvitations.routeId, id));
    return { route: r, stops: stopRows, snapshot, versions, internalNotes: internal?.internalNotes ?? null, invited };
  });
}

export async function listPreferredProviders(ctx: RequestContext) {
  requirePoster(ctx);
  return withTenant(ctx, (tx) =>
    tx
      .select({ id: organizations.id, name: organizations.name, kind: organizations.kind, note: preferredProviders.note })
      .from(preferredProviders)
      .innerJoin(organizations, eq(organizations.id, preferredProviders.providerOrgId))
      .where(eq(preferredProviders.orgId, ctx.orgId)),
  );
}

export async function searchProviderOrgs(ctx: RequestContext, q: string) {
  requirePoster(ctx);
  const term = q.trim();
  if (term.length < 2) return [];
  return withTenant(ctx, (tx) =>
    tx
      .select({ id: organizations.id, name: organizations.name, hqState: organizations.hqState })
      .from(organizations)
      .where(
        and(
          eq(organizations.canProvide, true),
          eq(organizations.status, "active"),
          sql`${organizations.name} ilike ${`%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`}`,
        ),
      )
      .limit(20),
  );
}

export async function addPreferredProvider(ctx: RequestContext, providerOrgId: string, note?: string) {
  requirePoster(ctx);
  return withTenant(ctx, async (tx) => {
    const [o] = await tx.select().from(organizations).where(eq(organizations.id, providerOrgId));
    if (!o || !o.canProvide) throw new NotFound("Provider not found");
    await tx
      .insert(preferredProviders)
      .values({ orgId: ctx.orgId, providerOrgId, note: note ?? null, createdBy: ctx.userId })
      .onConflictDoNothing();
    await audit(tx, ctx, { action: "preferred.add", targetType: "organization", targetId: providerOrgId });
  });
}

export async function removePreferredProvider(ctx: RequestContext, providerOrgId: string) {
  requirePoster(ctx);
  return withTenant(ctx, async (tx) => {
    await tx
      .delete(preferredProviders)
      .where(and(eq(preferredProviders.orgId, ctx.orgId), eq(preferredProviders.providerOrgId, providerOrgId)));
    await audit(tx, ctx, { action: "preferred.remove", targetType: "organization", targetId: providerOrgId });
  });
}
