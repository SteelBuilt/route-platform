// Applications, awards and acceptance (brief §8). Applying never locks a
// route. Award and accept are transaction-safe: row locks + a unique partial
// index (one live award per route) + idempotency keys.
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "../audit";
import { RELEASED_ASSIGNMENT_STATUSES, releasedAssignmentFor } from "../authz/privacy";
import { getNumberConfig } from "../config";
import { requireCapability, requireVerifiedEmail, type RequestContext } from "../context";
import {
  applications,
  assignmentStops,
  assignments,
  awards,
  buildingCategories,
  files,
  locations,
  organizations,
  providerProfiles,
  routeInvitations,
  routePrivate,
  routeRequirements,
  routes,
  serviceRegions,
  stopContacts,
  stopPrivate,
  stops,
  type ApplicationStatus,
} from "../db/schema";
import { Conflict, Forbidden, Invalid, NotEntitled, NotFound } from "../errors";
import { withSystem, withTenant, type SystemTx, type TenantTx } from "../tenant";
import { checkEntitlement } from "./entitlements";
import { assertTransition } from "./transitions";

async function isInvited(tx: TenantTx | SystemTx, routeId: string, orgId: string) {
  const [r] = await tx
    .select({ x: sql<number>`1` })
    .from(routeInvitations)
    .where(and(eq(routeInvitations.routeId, routeId), eq(routeInvitations.providerOrgId, orgId)));
  return !!r;
}

// ---------------------------------------------------------------------------
// Provider view of a route (public fields; private ones only once released)

export async function getRouteForProvider(ctx: RequestContext, routeId: string) {
  requireCapability(ctx, "marketplace.browse");
  return withTenant(ctx, async (tx) => {
    const [r] = await tx
      .select({ route: routes, categoryName: buildingCategories.name, posterName: organizations.name })
      .from(routes)
      .innerJoin(buildingCategories, eq(buildingCategories.id, routes.buildingCategoryId))
      .innerJoin(organizations, eq(organizations.id, routes.orgId))
      .where(eq(routes.id, routeId));
    if (!r || r.route.orgId === ctx.orgId || r.route.deletedAt) throw new NotFound("Route not found");
    const invited = await isInvited(tx, routeId, ctx.orgId);
    const [myApp] = await tx
      .select()
      .from(applications)
      .where(
        and(eq(applications.routeId, routeId), eq(applications.providerOrgId, ctx.orgId), ne(applications.status, "withdrawn")),
      );
    if (r.route.visibility === "marketplace" && !invited && !myApp) {
      const ent = await checkEntitlement(ctx.orgId, "marketplace.browse", tx);
      if (!ent.allowed) throw new NotEntitled("A provider plan is needed to view marketplace routes.");
    }
    const [myAward] = await tx
      .select()
      .from(awards)
      .where(and(eq(awards.routeId, routeId), eq(awards.providerOrgId, ctx.orgId)))
      .orderBy(desc(awards.issuedAt))
      .limit(1);

    const stopRows = await tx.select().from(stops).where(eq(stops.routeId, routeId)).orderBy(asc(stops.sequence));
    const reqs = await tx.select().from(routeRequirements).where(eq(routeRequirements.routeId, routeId));
    const showPay = ctx.capabilities.has("compensation.view");
    const { pickupLocationId: _p, ...publicRoute } = r.route;

    const [profile] = await tx
      .select({ ids: providerProfiles.buildingCategoryIds })
      .from(providerProfiles)
      .where(eq(providerProfiles.orgId, ctx.orgId));
    const mySystems = profile?.ids ?? [];

    const released = await releasedAssignmentFor(tx, ctx, routeId);
    let privateDetails = null;
    if (released) {
      privateDetails = await loadPrivateDetails(tx, routeId, r.route.pickupLocationId, stopRows.map((s) => s.id));
      await audit(tx, ctx, {
        action: "private.view_route",
        targetType: "route",
        targetId: routeId,
        orgIds: [r.route.orgId],
      });
    }

    return {
      route: { ...publicRoute, compensationCents: showPay ? r.route.compensationCents : null },
      compensationHidden: !showPay,
      categoryName: r.categoryName,
      posterName: r.posterName,
      stops: stopRows.map(({ locationId: _l, ...s }) => s),
      requirements: reqs,
      invited,
      // Matching is by the profile's building systems (not the primary sector).
      inMySystems: mySystems.includes(r.route.buildingCategoryId),
      hasProfileSystems: mySystems.length > 0,
      myApplication: myApp ?? null,
      myAward: myAward ?? null,
      assignment: released,
      privateDetails,
    };
  });
}

async function loadPrivateDetails(tx: TenantTx, routeId: string, pickupLocationId: string | null, stopIds: string[]) {
  const stopRows = await tx
    .select({ id: stops.id, locationId: stops.locationId })
    .from(stops)
    .where(eq(stops.routeId, routeId));
  const locIds = [pickupLocationId, ...stopRows.map((s) => s.locationId)].filter((x): x is string => !!x);
  const locs = locIds.length ? await tx.select().from(locations).where(inArray(locations.id, locIds)) : [];
  const byId = new Map(locs.map((l) => [l.id, l]));
  const contacts = stopIds.length ? await tx.select().from(stopContacts).where(inArray(stopContacts.stopId, stopIds)) : [];
  const priv = stopIds.length ? await tx.select().from(stopPrivate).where(inArray(stopPrivate.stopId, stopIds)) : [];
  const [rp] = await tx.select().from(routePrivate).where(eq(routePrivate.routeId, routeId));
  const docs = await tx
    .select({ id: files.id, name: files.originalName, stopId: files.stopId, purpose: files.purpose, visibilityClass: files.visibilityClass })
    .from(files)
    .where(and(eq(files.routeId, routeId), sql`${files.deletedAt} is null`));
  return {
    pickup: pickupLocationId ? (byId.get(pickupLocationId) ?? null) : null,
    stops: Object.fromEntries(
      stopRows.map((s) => [
        s.id,
        {
          location: s.locationId ? (byId.get(s.locationId) ?? null) : null,
          contacts: contacts.filter((c) => c.stopId === s.id),
          safetyNotes: priv.find((p) => p.stopId === s.id)?.safetyNotes ?? null,
          accessInstructions: priv.find((p) => p.stopId === s.id)?.accessInstructions ?? null,
        },
      ]),
    ),
    assignmentNotes: rp?.assignmentNotes ?? null,
    files: docs,
  };
}

// ---------------------------------------------------------------------------
// Applications

export const applyInput = z.object({
  message: z.string().trim().max(2000).optional().nullable(),
  proposedCompensationCents: z.coerce.number().int().min(1).max(100_000_000).optional().nullable(),
  proposedAvailability: z.string().trim().max(1000).optional().nullable(),
});

export async function applyToRoute(ctx: RequestContext, routeId: string, raw: z.input<typeof applyInput>, now = new Date()) {
  requireCapability(ctx, "applications.submit");
  if (!ctx.org.canProvide) throw new Forbidden("Only provider organizations can apply to routes");
  requireVerifiedEmail(ctx);
  const input = applyInput.parse(raw);
  return withTenant(ctx, async (tx) => {
    const [r] = await tx.select().from(routes).where(eq(routes.id, routeId));
    if (!r || r.orgId === ctx.orgId || r.deletedAt) throw new NotFound("Route not found");
    if (r.status !== "published") throw new Conflict("This route isn't accepting applications right now.");
    if (r.applicationDeadline && r.applicationDeadline <= now) throw new Conflict("The application deadline has passed.");
    if (r.expiresAt && r.expiresAt <= now) throw new Conflict("This route has expired.");

    const invited = await isInvited(tx, routeId, ctx.orgId);
    if (r.visibility !== "marketplace" && !invited) throw new NotFound("Route not found");
    const ent = await checkEntitlement(ctx.orgId, invited ? "invited.apply" : "marketplace.apply", tx);
    if (!ent.allowed) throw new NotEntitled("A provider plan is needed to apply to marketplace routes.");

    if (r.compensationMode === "fixed" && input.proposedCompensationCents) {
      throw new Invalid("This route has fixed compensation, so leave the price blank.");
    }
    if (r.compensationMode === "proposals" && !input.proposedCompensationCents) {
      throw new Invalid("Enter your proposed price.");
    }

    const [existing] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(eq(applications.routeId, routeId), eq(applications.providerOrgId, ctx.orgId), ne(applications.status, "withdrawn")),
      );
    if (existing) throw new Conflict("Your company has already applied to this route.");

    const [app] = await tx
      .insert(applications)
      .values({
        routeId,
        posterOrgId: r.orgId,
        providerOrgId: ctx.orgId,
        submittedBy: ctx.userId,
        message: input.message ?? null,
        proposedCompensationCents: input.proposedCompensationCents ?? null,
        proposedBasis: input.proposedCompensationCents ? r.compensationBasis : null,
        proposedAvailability: input.proposedAvailability ?? null,
      })
      .returning();
    await audit(tx, ctx, {
      action: "application.submit",
      targetType: "application",
      targetId: app.id,
      orgIds: [r.orgId],
      metadata: { routeId },
    });
    return app;
  });
}

export async function withdrawApplication(ctx: RequestContext, applicationId: string, reason?: string) {
  requireCapability(ctx, "applications.submit");
  return withTenant(ctx, async (tx) => {
    const [a] = await tx
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.providerOrgId, ctx.orgId)))
      .for("update");
    if (!a) throw new NotFound("Application not found");
    assertTransition("application", a.status, "withdrawn");
    await tx
      .update(applications)
      .set({ status: "withdrawn", withdrawnReason: reason ?? null })
      .where(eq(applications.id, applicationId));
    await audit(tx, ctx, { action: "application.withdraw", targetType: "application", targetId: a.id, orgIds: [a.posterOrgId] });
  });
}

// Poster's applicant comparison: applications plus self-reported profile facts.
export async function listApplicants(ctx: RequestContext, routeId: string) {
  requireCapability(ctx, "routes.post");
  return withTenant(ctx, async (tx) => {
    const [r] = await tx.select().from(routes).where(and(eq(routes.id, routeId), eq(routes.orgId, ctx.orgId)));
    if (!r) throw new NotFound("Route not found");
    const rows = await tx
      .select({ app: applications, orgName: organizations.name, orgKind: organizations.kind, profile: providerProfiles })
      .from(applications)
      .innerJoin(organizations, eq(organizations.id, applications.providerOrgId))
      .leftJoin(providerProfiles, eq(providerProfiles.orgId, applications.providerOrgId))
      .where(and(eq(applications.routeId, routeId), ne(applications.status, "withdrawn")))
      .orderBy(asc(applications.createdAt));
    const orgIds = rows.map((r) => r.app.providerOrgId);
    const regions = orgIds.length ? await tx.select().from(serviceRegions).where(inArray(serviceRegions.orgId, orgIds)) : [];
    const completed = orgIds.length
      ? await tx
          .select({ orgId: assignments.providerOrgId, n: sql<number>`count(*)::int` })
          .from(assignments)
          .where(and(inArray(assignments.providerOrgId, orgIds), eq(assignments.status, "completed")))
          .groupBy(assignments.providerOrgId)
      : [];
    const invitedRows = await tx.select().from(routeInvitations).where(eq(routeInvitations.routeId, routeId));
    const cats = await tx.select({ id: buildingCategories.id, name: buildingCategories.name }).from(buildingCategories);
    return rows.map((row) => ({
      systems: (row.profile?.buildingCategoryIds ?? []).map((id) => cats.find((c) => c.id === id)?.name).filter(Boolean) as string[],
      listsThisSystem: row.profile?.buildingCategoryIds.includes(r.buildingCategoryId) ?? false,
      ...row.app,
      orgName: row.orgName,
      orgKind: row.orgKind,
      invited: invitedRows.some((i) => i.providerOrgId === row.app.providerOrgId),
      crewSize: row.profile ? { min: row.profile.crewSizeMin, max: row.profile.crewSizeMax } : null,
      yearsExperience: row.profile?.yearsExperience ?? null,
      jobTypes: row.profile?.jobTypes ?? [],
      regions: regions
        .filter((g) => g.orgId === row.app.providerOrgId)
        .map((g) => (g.type === "state" ? g.state! : `${g.radiusMiles} mi of ${g.zip}`)),
      completedJobs: completed.find((c) => c.orgId === row.app.providerOrgId)?.n ?? 0,
    }));
  });
}

export async function setApplicationReview(ctx: RequestContext, applicationId: string, to: "shortlisted" | "declined" | "submitted") {
  requireCapability(ctx, "routes.post");
  return withTenant(ctx, async (tx) => {
    const [a] = await tx
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.posterOrgId, ctx.orgId)))
      .for("update");
    if (!a) throw new NotFound("Application not found");
    assertTransition("application", a.status, to);
    await tx.update(applications).set({ status: to }).where(eq(applications.id, applicationId));
    await audit(tx, ctx, { action: `application.${to}`, targetType: "application", targetId: a.id, orgIds: [a.providerOrgId] });
  });
}

// ---------------------------------------------------------------------------
// Awards

export async function issueAward(
  ctx: RequestContext,
  routeId: string,
  applicationId: string,
  opts: { idempotencyKey: string; acceptHours?: number; now?: Date },
) {
  requireCapability(ctx, "routes.post");
  const ent = await checkEntitlement(ctx.orgId, "route.award");
  if (!ent.allowed) throw new NotEntitled("Your posting plan isn't active, so new awards can't be issued.");
  const now = opts.now ?? new Date();
  const hours = opts.acceptHours ?? (await getNumberConfig("award.accept_hours"));
  if (hours < 1 || hours > 24 * 14) throw new Invalid("Acceptance deadline must be between 1 hour and 14 days");

  return withTenant(ctx, async (tx) => {
    const [dup] = await tx.select().from(awards).where(eq(awards.idempotencyKey, opts.idempotencyKey));
    if (dup) {
      if (dup.routeId !== routeId || dup.applicationId !== applicationId) throw new Conflict("Duplicate request key");
      return dup;
    }
    const [r] = await tx
      .select()
      .from(routes)
      .where(and(eq(routes.id, routeId), eq(routes.orgId, ctx.orgId)))
      .for("update");
    if (!r) throw new NotFound("Route not found");
    assertTransition("route", r.status, "awarding");
    const [a] = await tx
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.routeId, routeId)))
      .for("update");
    if (!a) throw new NotFound("Application not found");
    assertTransition("application", a.status, "awarded");

    const stopRows = await tx.select({ id: stops.id, services: stops.services }).from(stops).where(eq(stops.routeId, routeId));
    const services = [...new Set(stopRows.flatMap((s) => s.services))];
    let award;
    try {
      [award] = await tx
        .insert(awards)
        .values({
          routeId,
          applicationId,
          posterOrgId: ctx.orgId,
          providerOrgId: a.providerOrgId,
          scopeIsWholeRoute: true,
          scopeStopIds: stopRows.map((s) => s.id),
          scopeServices: services,
          compensationCents: a.proposedCompensationCents ?? r.compensationCents,
          compensationBasis: a.proposedBasis ?? r.compensationBasis,
          issuedBy: ctx.userId,
          issuedAt: now,
          acceptBy: new Date(now.getTime() + hours * 3_600_000),
          idempotencyKey: opts.idempotencyKey,
        })
        .returning();
    } catch {
      // awards_one_live_whole_route: another award won the race.
      throw new Conflict("This route already has a live award.");
    }
    await tx
      .update(applications)
      .set({ status: "awarded", statusBeforeAward: a.status })
      .where(eq(applications.id, applicationId));
    await tx.update(routes).set({ status: "awarding" }).where(eq(routes.id, routeId));
    await audit(tx, ctx, {
      action: "award.issue",
      targetType: "award",
      targetId: award.id,
      orgIds: [a.providerOrgId],
      metadata: { routeId, applicationId, acceptBy: award.acceptBy },
    });
    return award;
  });
}

// Shared by revoke / decline / expire: the award ends and the route reopens.
async function endPendingAward(
  tx: TenantTx | SystemTx,
  awardId: string,
  to: "revoked" | "declined" | "expired",
  by: { userId: string | null; reason?: string | null },
  now: Date,
) {
  const [w] = await tx.select().from(awards).where(eq(awards.id, awardId)).for("update");
  if (!w) throw new NotFound("Award not found");
  assertTransition("award", w.status, to);
  await tx
    .update(awards)
    .set({ status: to, respondedBy: by.userId, respondedAt: now, declineReason: by.reason ?? null })
    .where(eq(awards.id, awardId));
  const [a] = await tx.select().from(applications).where(eq(applications.id, w.applicationId)).for("update");
  if (a?.status === "awarded") {
    // A provider who declines the award withdraws; otherwise the application
    // returns to where it was so the poster can award it again.
    const next: ApplicationStatus = to === "declined" ? "withdrawn" : (a.statusBeforeAward ?? "submitted");
    assertTransition("application", a.status, next);
    await tx
      .update(applications)
      .set({
        status: next,
        statusBeforeAward: null,
        withdrawnReason: to === "declined" ? (by.reason ?? "Declined the award") : a.withdrawnReason,
      })
      .where(eq(applications.id, a.id));
  }
  const [r] = await tx.select().from(routes).where(eq(routes.id, w.routeId)).for("update");
  if (r?.status === "awarding") await tx.update(routes).set({ status: "published" }).where(eq(routes.id, r.id));
  return w;
}

export async function revokeAward(ctx: RequestContext, awardId: string, now = new Date()) {
  requireCapability(ctx, "routes.post");
  return withTenant(ctx, async (tx) => {
    const [w] = await tx.select().from(awards).where(and(eq(awards.id, awardId), eq(awards.posterOrgId, ctx.orgId)));
    if (!w) throw new NotFound("Award not found");
    await endPendingAward(tx, awardId, "revoked", { userId: ctx.userId }, now);
    await audit(tx, ctx, { action: "award.revoke", targetType: "award", targetId: awardId, orgIds: [w.providerOrgId] });
  });
}

// Declining reopens the poster's route, so like accept it runs on the
// trusted path after checking the award belongs to the caller's org.
export async function declineAward(ctx: RequestContext, awardId: string, reason?: string, now = new Date()) {
  requireCapability(ctx, "awards.accept");
  return withSystem(async (tx) => {
    const [w] = await tx.select().from(awards).where(eq(awards.id, awardId));
    if (!w || w.providerOrgId !== ctx.orgId) throw new NotFound("Award not found");
    await endPendingAward(tx, awardId, "declined", { userId: ctx.userId, reason }, now);
    await audit(tx, ctx, { action: "award.decline", targetType: "award", targetId: awardId, orgIds: [w.posterOrgId] });
  });
}

// Accepting crosses tenants (it changes the poster's route and other
// providers' applications), so it runs on the trusted path with explicit
// checks. The award row lock serializes concurrent accepts.
export async function acceptAward(ctx: RequestContext, awardId: string, now = new Date()) {
  requireCapability(ctx, "awards.accept");
  const result = await withSystem(async (tx) => {
    const [w] = await tx.select().from(awards).where(eq(awards.id, awardId)).for("update");
    if (!w || w.providerOrgId !== ctx.orgId) throw new NotFound("Award not found");
    if (w.status === "accepted") throw new Conflict("This assignment has already been accepted.");
    if (w.status !== "pending") throw new Conflict(`This award was ${w.status}.`);
    if (w.acceptBy <= now) {
      await endPendingAward(tx, awardId, "expired", { userId: null }, now);
      await audit(tx, "system", { action: "award.expire", targetType: "award", targetId: awardId, orgIds: [w.posterOrgId, w.providerOrgId] });
      return { expired: true as const };
    }
    const invited = await isInvited(tx, w.routeId, ctx.orgId);
    const ent = await checkEntitlement(ctx.orgId, invited ? "invited.accept" : "marketplace.accept", tx);
    if (!ent.allowed) throw new NotEntitled("A provider plan is needed to accept marketplace routes.");

    const [r] = await tx.select().from(routes).where(eq(routes.id, w.routeId)).for("update");
    if (!r) throw new NotFound("Route not found");
    assertTransition("route", r.status, "assigned");

    await tx.update(awards).set({ status: "accepted", respondedBy: ctx.userId, respondedAt: now }).where(eq(awards.id, awardId));
    const stopRows = await tx.select().from(stops).where(eq(stops.routeId, r.id));
    const starts = [r.pickupWindowStart, ...stopRows.flatMap((s) => [s.deliveryWindowStart, s.installWindowStart])].filter(
      (d): d is Date => !!d,
    );
    const ends = [r.pickupWindowEnd, ...stopRows.flatMap((s) => [s.deliveryWindowEnd, s.installWindowEnd])].filter(
      (d): d is Date => !!d,
    );
    const [assignment] = await tx
      .insert(assignments)
      .values({
        routeId: r.id,
        awardId,
        posterOrgId: r.orgId,
        providerOrgId: ctx.orgId,
        scopeServices: w.scopeServices,
        acceptedBy: ctx.userId,
        acceptedAt: now,
        compensationCents: w.compensationCents,
        agreedVersion: r.version,
        scheduledStart: starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null,
        scheduledEnd: ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null,
      })
      .returning();
    const covered = stopRows.filter((s) => w.scopeIsWholeRoute || w.scopeStopIds.includes(s.id));
    if (covered.length) {
      await tx.insert(assignmentStops).values(
        covered.map((s) => ({
          assignmentId: assignment.id,
          stopId: s.id,
          posterOrgId: r.orgId,
          providerOrgId: ctx.orgId,
          services: s.services.filter((x) => w.scopeServices.includes(x)),
        })),
      );
    }
    await tx.update(routes).set({ status: "assigned" }).where(eq(routes.id, r.id));
    await tx.update(applications).set({ status: "accepted", statusBeforeAward: null }).where(eq(applications.id, w.applicationId));
    await tx
      .update(applications)
      .set({ status: "not_selected" })
      .where(
        and(
          eq(applications.routeId, r.id),
          ne(applications.id, w.applicationId),
          inArray(applications.status, ["submitted", "shortlisted"]),
        ),
      );
    await audit(tx, ctx, {
      action: "assignment.accept",
      targetType: "assignment",
      targetId: assignment.id,
      orgIds: [r.orgId],
      metadata: { awardId, routeId: r.id, version: r.version },
    });
    return { expired: false as const, assignment };
  });
  if (result.expired) throw new Conflict("The acceptance deadline for this award has passed.");
  return result.assignment;
}

// Cron sweep (also triggered lazily on accept): expire overdue awards.
export async function expireOverdueAwards(now = new Date()) {
  return withSystem(async (tx) => {
    const due = await tx
      .select({ id: awards.id, posterOrgId: awards.posterOrgId, providerOrgId: awards.providerOrgId })
      .from(awards)
      .where(and(eq(awards.status, "pending"), sql`${awards.acceptBy} <= ${now}`));
    for (const w of due) {
      await endPendingAward(tx, w.id, "expired", { userId: null }, now);
      await audit(tx, "system", { action: "award.expire", targetType: "award", targetId: w.id, orgIds: [w.posterOrgId, w.providerOrgId] });
    }
    return due.length;
  });
}

// ---------------------------------------------------------------------------
// Provider's "my work": applications, pending awards, accepted assignments

export async function listMyWork(ctx: RequestContext) {
  requireCapability(ctx, "marketplace.browse");
  return withTenant(ctx, async (tx) => {
    const apps = await tx
      .select({
        app: applications,
        title: routes.title,
        referenceCode: routes.referenceCode,
        routeStatus: routes.status,
        pickupCity: routes.pickupCity,
        pickupState: routes.pickupState,
        pickupWindowStart: routes.pickupWindowStart,
        pickupTimezone: routes.pickupTimezone,
        posterName: organizations.name,
      })
      .from(applications)
      .innerJoin(routes, eq(routes.id, applications.routeId))
      .innerJoin(organizations, eq(organizations.id, applications.posterOrgId))
      .where(and(eq(applications.providerOrgId, ctx.orgId), ne(applications.status, "withdrawn")))
      .orderBy(desc(applications.updatedAt));
    const pendingAwards = await tx
      .select()
      .from(awards)
      .where(and(eq(awards.providerOrgId, ctx.orgId), eq(awards.status, "pending")));
    const myAssignments = await tx
      .select({ a: assignments, title: routes.title, referenceCode: routes.referenceCode })
      .from(assignments)
      .innerJoin(routes, eq(routes.id, assignments.routeId))
      .where(and(eq(assignments.providerOrgId, ctx.orgId), inArray(assignments.status, [...RELEASED_ASSIGNMENT_STATUSES])))
      .orderBy(asc(assignments.scheduledStart));
    return { applications: apps, pendingAwards, assignments: myAssignments };
  });
}

// Poster side: the award/assignment state of one of its routes.
export async function getAwardState(ctx: RequestContext, routeId: string) {
  requireCapability(ctx, "routes.post");
  return withTenant(ctx, async (tx) => {
    const [live] = await tx
      .select({ award: awards, providerName: organizations.name })
      .from(awards)
      .innerJoin(organizations, eq(organizations.id, awards.providerOrgId))
      .where(and(eq(awards.routeId, routeId), eq(awards.posterOrgId, ctx.orgId), inArray(awards.status, ["pending", "accepted"])));
    const [assignment] = await tx
      .select()
      .from(assignments)
      .where(and(eq(assignments.routeId, routeId), eq(assignments.posterOrgId, ctx.orgId)));
    return { live: live ?? null, assignment: assignment ?? null };
  });
}
