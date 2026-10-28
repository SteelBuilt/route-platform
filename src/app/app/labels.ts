import type { Role } from "@/server/db/schema";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  dispatcher: "Administrator / dispatcher",
  crew_leader: "Crew leader / driver",
  crew_member: "Crew member (free)",
  staff: "Staff, limited (free)",
};
