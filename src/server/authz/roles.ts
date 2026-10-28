// Role capabilities inside an org (docs/ARCHITECTURE.md §4.2). Pure functions;
// every handler checks these before touching data.
import { LEADER_ROLES, type PermissionOverride, type Role } from "../db/schema";

export type Capability =
  | "org.manage" // org profile, members, invitations
  | "org.billing"
  | "routes.post" // create/edit/publish routes (poster orgs)
  | "marketplace.browse"
  | "applications.submit"
  | "awards.accept"
  | "compensation.view"
  | "work.all" // see all of the org's assignments (vs. only their own)
  | "audit.view";

const BASE: Record<Role, Capability[]> = {
  owner: [
    "org.manage",
    "org.billing",
    "routes.post",
    "marketplace.browse",
    "applications.submit",
    "awards.accept",
    "compensation.view",
    "work.all",
    "audit.view",
  ],
  dispatcher: [
    "org.manage",
    "routes.post",
    "marketplace.browse",
    "applications.submit",
    "awards.accept",
    "compensation.view",
    "work.all",
    "audit.view",
  ],
  crew_leader: ["marketplace.browse", "applications.submit", "compensation.view", "work.all"],
  crew_member: [],
  staff: [],
};

const OVERRIDE_GRANTS: Record<PermissionOverride, Capability[]> = {
  view_compensation: ["compensation.view"],
  browse: ["marketplace.browse"],
  apply: ["applications.submit"],
  post_routes: ["routes.post"],
};

// Overrides can only widen the free roles; leader roles already have them.
export function capabilitiesFor(
  role: Role,
  overrides: Partial<Record<PermissionOverride, boolean>> = {},
): Set<Capability> {
  const caps = new Set(BASE[role]);
  if (role === "crew_member" || role === "staff") {
    for (const [key, on] of Object.entries(overrides)) {
      if (on) for (const c of OVERRIDE_GRANTS[key as PermissionOverride] ?? []) caps.add(c);
    }
  }
  return caps;
}

export function isLeaderRole(role: Role): boolean {
  return (LEADER_ROLES as readonly string[]).includes(role);
}

// Which roles an inviter may grant. Only owners can create other owners.
export function canAssignRole(actorRole: Role, target: Role): boolean {
  if (actorRole === "owner") return true;
  if (actorRole === "dispatcher") return target !== "owner";
  return false;
}
