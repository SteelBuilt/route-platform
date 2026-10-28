// Every valid status transition (docs/ARCHITECTURE.md §3). Status columns are
// only changed by code that calls assertTransition first.
import type {
  ApplicationStatus,
  AssignmentStatus,
  AwardStatus,
  RouteStatus,
  StopStatus,
} from "../db/schema";
import { Conflict } from "../errors";

export const ROUTE_TRANSITIONS: Record<RouteStatus, RouteStatus[]> = {
  draft: ["published"],
  published: ["draft", "awarding", "expired", "cancelled"],
  awarding: ["assigned", "published", "cancelled"],
  assigned: ["in_progress", "published", "cancelled"],
  in_progress: ["pending_review", "cancelled"],
  pending_review: ["completed", "in_progress"],
  completed: [],
  expired: ["published"],
  cancelled: [],
};

export const STOP_TRANSITIONS: Record<StopStatus, StopStatus[]> = {
  pending: ["in_progress", "rescheduling", "cancelled"],
  in_progress: ["completed", "partially_completed", "rescheduling", "cancelled"],
  rescheduling: ["pending", "cancelled"],
  completed: [],
  partially_completed: [],
  cancelled: [],
};

export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["shortlisted", "declined", "withdrawn", "awarded", "not_selected"],
  shortlisted: ["submitted", "declined", "withdrawn", "awarded", "not_selected"],
  awarded: ["submitted", "shortlisted", "accepted", "not_selected", "withdrawn"],
  not_selected: ["submitted"],
  declined: [],
  withdrawn: [],
  accepted: [],
};

export const AWARD_TRANSITIONS: Record<AwardStatus, AwardStatus[]> = {
  pending: ["accepted", "declined", "expired", "revoked"],
  accepted: [],
  declined: [],
  expired: [],
  revoked: [],
};

export const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["pending_review", "cancelled"],
  pending_review: ["completed", "in_progress"],
  completed: [],
  cancelled: [],
};

const TABLES = {
  route: ROUTE_TRANSITIONS,
  stop: STOP_TRANSITIONS,
  application: APPLICATION_TRANSITIONS,
  award: AWARD_TRANSITIONS,
  assignment: ASSIGNMENT_TRANSITIONS,
} as const;

type Kind = keyof typeof TABLES;

export function canTransition(kind: Kind, from: string, to: string): boolean {
  const table = TABLES[kind] as Record<string, string[]>;
  return (table[from] ?? []).includes(to);
}

export function assertTransition(kind: Kind, from: string, to: string) {
  if (!canTransition(kind, from, to)) {
    throw new Conflict(`This ${kind} is ${from.replace("_", " ")} and can't move to ${to.replace("_", " ")}.`);
  }
}
