// Privacy release (brief §7, ARCHITECTURE §4.3). App-layer half of the rule;
// the database enforces the same predicate in RLS (app_released_stop/route).
import { and, eq, inArray } from "drizzle-orm";
import type { Executor } from "../db/client";
import { assignments } from "../db/schema";
import type { RequestContext } from "../context";

export const RELEASED_ASSIGNMENT_STATUSES = ["scheduled", "in_progress", "pending_review", "completed"] as const;

// Roles that may see released details for their org's assignments in Phase 1.
// Free crew members/staff get access per assignment in Phase 2 (assignment_members).
const RELEASE_ROLES = new Set(["owner", "dispatcher", "crew_leader"]);

export async function releasedAssignmentFor(db: Executor, ctx: RequestContext, routeId: string) {
  if (!ctx.orgId || !ctx.role || !RELEASE_ROLES.has(ctx.role)) return null;
  const [a] = await db
    .select()
    .from(assignments)
    .where(
      and(
        eq(assignments.routeId, routeId),
        eq(assignments.providerOrgId, ctx.orgId),
        inArray(assignments.status, [...RELEASED_ASSIGNMENT_STATUSES]),
      ),
    );
  return a ?? null;
}
