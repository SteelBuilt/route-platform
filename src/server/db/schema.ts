// Database schema. Phase 1 tables in full; later-phase columns are included
// where they avoid a migration (see docs/ARCHITECTURE.md §2).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const id = () => uuid("id").primaryKey().defaultRandom();

export const ORG_KINDS = ["poster", "installer", "transporter", "delivery_installer"] as const;
export const ROLES = ["owner", "dispatcher", "crew_leader", "crew_member", "staff"] as const;
export const LEADER_ROLES = ["owner", "dispatcher", "crew_leader"] as const;
export const JOB_TYPES = ["delivery", "installation", "delivery_installation"] as const;
export const SERVICES = ["delivery", "installation"] as const;
export const VISIBILITIES = ["marketplace", "preferred", "invitation"] as const;
export const ROUTE_STATUSES = [
  "draft",
  "published",
  "awarding",
  "assigned",
  "in_progress",
  "pending_review",
  "completed",
  "expired",
  "cancelled",
] as const;
export const STOP_STATUSES = [
  "pending",
  "in_progress",
  "rescheduling",
  "completed",
  "partially_completed",
  "cancelled",
] as const;
export const APPLICATION_STATUSES = [
  "submitted",
  "shortlisted",
  "declined",
  "withdrawn",
  "awarded",
  "accepted",
  "not_selected",
] as const;
export const AWARD_STATUSES = ["pending", "accepted", "declined", "expired", "revoked"] as const;
export const ASSIGNMENT_STATUSES = [
  "scheduled",
  "in_progress",
  "pending_review",
  "completed",
  "cancelled",
] as const;
export const SUBSCRIPTION_STATUSES = [
  "none",
  "beta",
  "trialing",
  "active",
  "past_due",
  "grace",
  "restricted",
  "canceled",
] as const;
export const AUDIENCES = ["poster", "provider"] as const;
export const FILE_VISIBILITY = [
  "listing",
  "assignment",
  "internal",
  "profile_private",
  "profile_public",
] as const;
export const FILE_PURPOSES = [
  "route_doc",
  "stop_photo",
  "assignment_doc",
  "qualification_doc",
  "portfolio",
  "message_attachment",
  "milestone_photo",
  "issue_photo",
] as const;

export type OrgKind = (typeof ORG_KINDS)[number];
export type Role = (typeof ROLES)[number];
export type JobType = (typeof JOB_TYPES)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type RouteStatus = (typeof ROUTE_STATUSES)[number];
export type StopStatus = (typeof STOP_STATUSES)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type AwardStatus = (typeof AWARD_STATUSES)[number];
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type Audience = (typeof AUDIENCES)[number];

// ---------------------------------------------------------------------------
// Identity (Better Auth tables + our fields)

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  phone: text("phone"),
  platformRole: text("platform_role", { enum: ["none", "platform_admin"] })
    .notNull()
    .default("none"),
  status: text("status", { enum: ["active", "suspended", "deleted"] })
    .notNull()
    .default("active"),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    activeOrgId: uuid("active_org_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authRateLimits = pgTable("auth_rate_limits", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ---------------------------------------------------------------------------
// Organizations

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  kind: text("kind", { enum: ORG_KINDS }).notNull(),
  canPost: boolean("can_post").notNull().default(false),
  canProvide: boolean("can_provide").notNull().default(false),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  hqCity: text("hq_city"),
  hqState: text("hq_state"),
  hqZip: text("hq_zip"),
  timezone: text("timezone").notNull().default("America/Chicago"),
  status: text("status", { enum: ["active", "suspended", "deleted"] })
    .notNull()
    .default("active"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull(),
    isLeaderSeat: boolean("is_leader_seat").notNull(),
    permissionOverrides: jsonb("permission_overrides")
      .$type<Partial<Record<PermissionOverride, boolean>>>()
      .notNull()
      .default({}),
    status: text("status", { enum: ["active", "removed"] })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("memberships_org_user_uq").on(t.orgId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const PERMISSION_OVERRIDES = ["view_compensation", "browse", "apply", "post_routes"] as const;
export type PermissionOverride = (typeof PERMISSION_OVERRIDES)[number];

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    acceptedUserId: text("accepted_user_id").references(() => users.id),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.orgId)],
);

export const crews = pgTable("crews", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  leaderMembershipId: uuid("leader_membership_id").references(() => memberships.id),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const vehicles = pgTable("vehicles", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  type: text("type", {
    enum: ["truck", "trailer", "tilt_bed", "rollback", "toter", "crane", "other"],
  }).notNull(),
  capacityNotes: text("capacity_notes"),
  deckLengthFt: real("deck_length_ft"),
  maxWeightLbs: integer("max_weight_lbs"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const preferredProviders = pgTable(
  "preferred_providers",
  {
    id: id(),
    orgId: uuid("org_id") // the poster org
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    providerOrgId: uuid("provider_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    note: text("note"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("preferred_providers_uq").on(t.orgId, t.providerOrgId)],
);

// ---------------------------------------------------------------------------
// Catalog (platform-admin managed, readable by everyone signed in)

export const buildingCategories = pgTable("building_categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  isUmbrella: boolean("is_umbrella").notNull().default(false),
  allowedJobTypes: text("allowed_job_types", { enum: JOB_TYPES }).array().notNull(),
  defaultJobType: text("default_job_type", { enum: JOB_TYPES }).notNull(),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const equipmentTypes = pgTable("equipment_types", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const qualificationTypes = pgTable("qualification_types", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  requiresDocument: boolean("requires_document").notNull().default(false),
  documentKind: text("document_kind"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Provider profile

export const providerProfiles = pgTable("provider_profiles", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  summary: text("summary"),
  yearsExperience: integer("years_experience"),
  crewSizeMin: integer("crew_size_min"),
  crewSizeMax: integer("crew_size_max"),
  buildingCategoryIds: uuid("building_category_ids").array().notNull().default(sql`'{}'`),
  jobTypes: text("job_types", { enum: JOB_TYPES }).array().notNull().default(sql`'{}'`),
  availabilityNotes: text("availability_notes"),
  preferredLeadDays: integer("preferred_lead_days"),
  public: boolean("public").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const serviceRegions = pgTable("service_regions", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["state", "zip_radius"] }).notNull(),
  state: text("state"),
  zip: text("zip"),
  radiusMiles: integer("radius_miles"),
  createdAt: createdAt(),
});

export const providerEquipment = pgTable(
  "provider_equipment",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    equipmentTypeId: uuid("equipment_type_id")
      .notNull()
      .references(() => equipmentTypes.id),
    quantity: integer("quantity").notNull().default(1),
    notes: text("notes"),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.equipmentTypeId] })],
);

// ---------------------------------------------------------------------------
// Geography

export const zipCentroids = pgTable("zip_centroids", {
  zip: text("zip").primaryKey(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  city: text("city"),
  state: text("state").notNull(),
  timezone: text("timezone"),
});

// Exact, private locations. Readable only under the privacy release rule.
export const locations = pgTable("locations", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  lat: real("lat"),
  lng: real("lng"),
  timezone: text("timezone").notNull(),
  geocodeSource: text("geocode_source"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Routes

export const routeTemplates = pgTable("route_templates", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  payload: jsonb("payload").notNull(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const routes = pgTable(
  "routes",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    referenceCode: text("reference_code").notNull().unique(),
    title: text("title").notNull(),
    buildingCategoryId: uuid("building_category_id")
      .notNull()
      .references(() => buildingCategories.id),
    jobType: text("job_type", { enum: JOB_TYPES }).notNull(),
    status: text("status", { enum: ROUTE_STATUSES }).notNull().default("draft"),
    visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("marketplace"),
    pickupLocationId: uuid("pickup_location_id").references(() => locations.id),
    pickupCity: text("pickup_city"),
    pickupState: text("pickup_state"),
    pickupApproxLat: real("pickup_approx_lat"),
    pickupApproxLng: real("pickup_approx_lng"),
    pickupWindowStart: ts("pickup_window_start"),
    pickupWindowEnd: ts("pickup_window_end"),
    pickupTimezone: text("pickup_timezone"),
    estimatedDurationMinutes: integer("estimated_duration_minutes"),
    crewSizeRequired: integer("crew_size_required"),
    loadingResponsibility: text("loading_responsibility", {
      enum: ["poster", "provider", "customer", "other"],
    }),
    unloadingResponsibility: text("unloading_responsibility", {
      enum: ["poster", "provider", "customer", "other"],
    }),
    responsibilityNotes: text("responsibility_notes"),
    compensationMode: text("compensation_mode", { enum: ["fixed", "proposals"] })
      .notNull()
      .default("fixed"),
    compensationBasis: text("compensation_basis", {
      enum: ["route_total", "per_stop", "per_unit"],
    })
      .notNull()
      .default("route_total"),
    compensationUnitLabel: text("compensation_unit_label"),
    compensationCents: integer("compensation_cents"),
    currency: text("currency").notNull().default("USD"),
    providerNotes: text("provider_notes"),
    applicationDeadline: ts("application_deadline"),
    expiresAt: ts("expires_at"),
    publishedAt: ts("published_at"),
    version: integer("version").notNull().default(1),
    awardMode: text("award_mode", { enum: ["whole_route", "split"] })
      .notNull()
      .default("whole_route"),
    stopCount: integer("stop_count").notNull().default(0),
    createdBy: text("created_by").references(() => users.id),
    isDemo: boolean("is_demo").notNull().default(false),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("routes_org_idx").on(t.orgId),
    index("routes_status_idx").on(t.status, t.visibility),
    check(
      "routes_pickup_window_for_delivery",
      sql`${t.status} = 'draft' OR ${t.jobType} = 'installation' OR (${t.pickupWindowStart} IS NOT NULL AND ${t.pickupWindowEnd} IS NOT NULL)`,
    ),
  ],
);

// Private route text lives in separate tables so row-level security can gate
// it independently of the public route row.
export const routeInternal = pgTable("route_internal", {
  routeId: uuid("route_id")
    .primaryKey()
    .references(() => routes.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull(),
  internalNotes: text("internal_notes"), // poster org only, ever
  updatedAt: updatedAt(),
});

export const routePrivate = pgTable("route_private", {
  routeId: uuid("route_id")
    .primaryKey()
    .references(() => routes.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull(),
  assignmentNotes: text("assignment_notes"), // released to the accepted provider
  updatedAt: updatedAt(),
});

export const stopPrivate = pgTable("stop_private", {
  stopId: uuid("stop_id")
    .primaryKey()
    .references(() => stops.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull(),
  safetyNotes: text("safety_notes"),
  accessInstructions: text("access_instructions"),
  updatedAt: updatedAt(),
});

export const routeRequirements = pgTable("route_requirements", {
  id: id(),
  routeId: uuid("route_id")
    .notNull()
    .references(() => routes.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull(),
  kind: text("kind", { enum: ["equipment", "qualification", "document"] }).notNull(),
  refId: uuid("ref_id"),
  required: boolean("required").notNull().default(true),
  note: text("note"),
});

export const routeInvitations = pgTable(
  "route_invitations",
  {
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull(), // poster org
    providerOrgId: uuid("provider_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invitedAt: ts("invited_at").notNull().defaultNow(),
    viewedAt: ts("viewed_at"),
  },
  (t) => [primaryKey({ columns: [t.routeId, t.providerOrgId] })],
);

export const stops = pgTable(
  "stops",
  {
    id: id(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull(),
    sequence: integer("sequence").notNull(),
    locationId: uuid("location_id").references(() => locations.id),
    city: text("city"),
    state: text("state"),
    zip: text("zip").notNull(),
    approxLat: real("approx_lat"),
    approxLng: real("approx_lng"),
    timezone: text("timezone").notNull().default("America/Chicago"),
    services: text("services", { enum: SERVICES }).array().notNull(),
    deliveryWindowStart: ts("delivery_window_start"),
    deliveryWindowEnd: ts("delivery_window_end"),
    installWindowStart: ts("install_window_start"),
    installWindowEnd: ts("install_window_end"),
    appointmentWindowStart: ts("appointment_window_start"),
    appointmentWindowEnd: ts("appointment_window_end"),
    customerAvailabilityNotes: text("customer_availability_notes"),
    buildingWidthFt: real("building_width_ft"),
    buildingLengthFt: real("building_length_ft"),
    buildingHeightFt: real("building_height_ft"),
    buildingSystem: text("building_system"),
    manufacturerName: text("manufacturer_name"),
    openings: jsonb("openings"),
    otherDetails: text("other_details"),
    loadLengthFt: real("load_length_ft"),
    loadWidthFt: real("load_width_ft"),
    loadHeightFt: real("load_height_ft"),
    loadWeightLbs: integer("load_weight_lbs"),
    pieceCount: integer("piece_count"),
    siteAccessNotes: text("site_access_notes"),
    unloadingConstraints: text("unloading_constraints"),
    surface: text("surface", { enum: ["ground", "gravel", "concrete", "asphalt", "other"] }),
    surfaceNotes: text("surface_notes"),
    siteReadiness: text("site_readiness", { enum: ["unknown", "not_ready", "ready", "verified"] })
      .notNull()
      .default("unknown"),
    plansStatus: text("plans_status", { enum: ["not_required", "pending", "provided", "unknown"] })
      .notNull()
      .default("unknown"),
    permitStatus: text("permit_status", {
      enum: ["not_required", "pending", "provided", "unknown"],
    })
      .notNull()
      .default("unknown"),
    engineeringStatus: text("engineering_status", {
      enum: ["not_required", "pending", "provided", "unknown"],
    })
      .notNull()
      .default("unknown"),
    status: text("status", { enum: STOP_STATUSES }).notNull().default("pending"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("stops_route_idx").on(t.routeId, t.sequence)],
);

export const stopContacts = pgTable("stop_contacts", {
  id: id(),
  stopId: uuid("stop_id")
    .notNull()
    .references(() => stops.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  role: text("role", { enum: ["customer", "site_contact"] }).notNull(),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const stopEquipment = pgTable(
  "stop_equipment",
  {
    stopId: uuid("stop_id")
      .notNull()
      .references(() => stops.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull(),
    equipmentTypeId: uuid("equipment_type_id")
      .notNull()
      .references(() => equipmentTypes.id),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.stopId, t.equipmentTypeId] })],
);

export const routeVersions = pgTable(
  "route_versions",
  {
    id: id(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull(),
    version: integer("version").notNull(),
    changedBy: text("changed_by").references(() => users.id),
    changeKind: text("change_kind", { enum: ["material", "minor", "created"] }).notNull(),
    changedFields: text("changed_fields").array().notNull().default(sql`'{}'`),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("route_versions_uq").on(t.routeId, t.version)],
);

// ---------------------------------------------------------------------------
// Applications, awards, assignments

export const applications = pgTable(
  "applications",
  {
    id: id(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    posterOrgId: uuid("poster_org_id").notNull(),
    providerOrgId: uuid("provider_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    submittedBy: text("submitted_by").references(() => users.id),
    status: text("status", { enum: APPLICATION_STATUSES }).notNull().default("submitted"),
    statusBeforeAward: text("status_before_award", { enum: APPLICATION_STATUSES }),
    message: text("message"),
    proposedCompensationCents: integer("proposed_compensation_cents"),
    proposedBasis: text("proposed_basis", { enum: ["route_total", "per_stop", "per_unit"] }),
    proposedAvailability: text("proposed_availability"),
    proposedCrewId: uuid("proposed_crew_id"),
    withdrawnReason: text("withdrawn_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("applications_one_open_per_org")
      .on(t.routeId, t.providerOrgId)
      .where(sql`${t.status} <> 'withdrawn'`),
    index("applications_provider_idx").on(t.providerOrgId),
  ],
);

export const awards = pgTable(
  "awards",
  {
    id: id(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    posterOrgId: uuid("poster_org_id").notNull(),
    providerOrgId: uuid("provider_org_id")
      .notNull()
      .references(() => organizations.id),
    scopeIsWholeRoute: boolean("scope_is_whole_route").notNull().default(true),
    scopeStopIds: uuid("scope_stop_ids").array().notNull().default(sql`'{}'`),
    scopeServices: text("scope_services", { enum: SERVICES }).array().notNull(),
    compensationCents: integer("compensation_cents"),
    compensationBasis: text("compensation_basis", {
      enum: ["route_total", "per_stop", "per_unit"],
    }),
    status: text("status", { enum: AWARD_STATUSES }).notNull().default("pending"),
    issuedBy: text("issued_by").references(() => users.id),
    issuedAt: ts("issued_at").notNull().defaultNow(),
    acceptBy: ts("accept_by").notNull(),
    respondedBy: text("responded_by").references(() => users.id),
    respondedAt: ts("responded_at"),
    declineReason: text("decline_reason"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [
    // Whole-route awards: at most one live award per route.
    uniqueIndex("awards_one_live_whole_route")
      .on(t.routeId)
      .where(sql`${t.status} IN ('pending','accepted') AND ${t.scopeIsWholeRoute}`),
  ],
);

export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    awardId: uuid("award_id")
      .notNull()
      .unique()
      .references(() => awards.id),
    posterOrgId: uuid("poster_org_id").notNull(),
    providerOrgId: uuid("provider_org_id")
      .notNull()
      .references(() => organizations.id),
    status: text("status", { enum: ASSIGNMENT_STATUSES }).notNull().default("scheduled"),
    scopeServices: text("scope_services", { enum: SERVICES }).array().notNull(),
    acceptedBy: text("accepted_by").references(() => users.id),
    acceptedAt: ts("accepted_at").notNull().defaultNow(),
    compensationCents: integer("compensation_cents"),
    agreedVersion: integer("agreed_version").notNull(),
    crewId: uuid("crew_id"),
    vehicleId: uuid("vehicle_id"),
    scheduledStart: ts("scheduled_start"),
    scheduledEnd: ts("scheduled_end"),
    cancelledByOrgId: uuid("cancelled_by_org_id"),
    cancelReason: text("cancel_reason"),
    completedAt: ts("completed_at"),
    posterApprovedAt: ts("poster_approved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("assignments_provider_idx").on(t.providerOrgId)],
);

export const assignmentStops = pgTable(
  "assignment_stops",
  {
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    stopId: uuid("stop_id")
      .notNull()
      .references(() => stops.id, { onDelete: "cascade" }),
    posterOrgId: uuid("poster_org_id").notNull(),
    providerOrgId: uuid("provider_org_id").notNull(),
    services: text("services", { enum: SERVICES }).array().notNull(),
  },
  (t) => [primaryKey({ columns: [t.assignmentId, t.stopId] })],
);

// ---------------------------------------------------------------------------
// Files

export const files = pgTable("files", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull().unique(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  purpose: text("purpose", { enum: FILE_PURPOSES }).notNull(),
  visibilityClass: text("visibility_class", { enum: FILE_VISIBILITY }).notNull(),
  routeId: uuid("route_id").references(() => routes.id, { onDelete: "set null" }),
  stopId: uuid("stop_id").references(() => stops.id, { onDelete: "set null" }),
  assignmentId: uuid("assignment_id"),
  uploadedBy: text("uploaded_by").references(() => users.id),
  scanStatus: text("scan_status", { enum: ["not_scanned", "clean", "infected"] })
    .notNull()
    .default("not_scanned"),
  deletedAt: ts("deleted_at"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Billing and entitlements

export const plans = pgTable("plans", {
  id: id(),
  code: text("code").notNull().unique(),
  audience: text("audience", { enum: AUDIENCES }).notNull(),
  name: text("name").notNull(),
  basePriceCents: integer("base_price_cents").notNull(),
  includedLeaderSeats: integer("included_leader_seats"), // null = unlimited
  extraSeatPriceCents: integer("extra_seat_price_cents"),
  interval: text("interval", { enum: ["month", "year"] }).notNull(),
  trialDays: integer("trial_days").notNull().default(0),
  stripePriceId: text("stripe_price_id"),
  stripeSeatPriceId: text("stripe_seat_price_id"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    audience: text("audience", { enum: AUDIENCES }).notNull(),
    planId: uuid("plan_id").references(() => plans.id),
    status: text("status", { enum: SUBSCRIPTION_STATUSES }).notNull().default("none"),
    betaEndsAt: ts("beta_ends_at"),
    trialEndsAt: ts("trial_ends_at"),
    currentPeriodEnd: ts("current_period_end"),
    graceEndsAt: ts("grace_ends_at"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    leaderSeatQuantity: integer("leader_seat_quantity"),
    founderEligible: boolean("founder_eligible").notNull().default(false),
    founderDiscountPercent: integer("founder_discount_percent"),
    stripeCouponId: text("stripe_coupon_id"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    updatedFromEventId: text("updated_from_event_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("subscriptions_org_audience_uq").on(t.orgId, t.audience)],
);

export const billingEvents = pgTable("billing_events", {
  id: id(),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: ts("processed_at"),
  error: text("error"),
  createdAt: createdAt(),
});

export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Platform

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    actorUserId: text("actor_user_id"),
    actorOrgId: uuid("actor_org_id"),
    actingAs: text("acting_as", { enum: ["user", "platform_admin", "system"] })
      .notNull()
      .default("user"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    orgIds: uuid("org_ids").array().notNull().default(sql`'{}'`),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    index("audit_logs_org_ids_idx").using("gin", t.orgIds),
    index("audit_logs_occurred_idx").on(t.occurredAt),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    kind: text("kind").notNull(),
    runAt: ts("run_at").notNull().defaultNow(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status", { enum: ["queued", "running", "done", "failed"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key").unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("jobs_due_idx").on(t.status, t.runAt)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

// Local email adapter: messages "sent" in development are stored here and
// shown at /dev/outbox. Never used when a real provider is configured.
export const devOutbox = pgTable("dev_outbox", {
  id: id(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  text: text("text").notNull(),
  html: text("html"),
  createdAt: createdAt(),
});
