// Route posting input (brief §6). Times arrive as local wall-clock strings in
// the location's timezone; the domain converts them to UTC instants.
import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";
import { JOB_TYPES, SERVICES, VISIBILITIES } from "../db/schema";

// Form fields arrive as "" when left blank; treat that as "not provided".
const opt = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess((v) => (v === "" ? null : v), s.optional().nullable()) as unknown as z.ZodOptional<z.ZodNullable<T>>;
const text = (max = 2000) => opt(z.string().trim().max(max)).transform((v) => (v ? v : null));
const localDateTime = opt(
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use a valid date and time"),
).transform((v) => v || null);
const num = opt(z.coerce.number().min(0).max(1_000_000)).transform((v) => (v == null || Number.isNaN(v) ? null : v));
const int = opt(z.coerce.number().int().min(0).max(1_000_000)).transform((v) =>
  v == null || Number.isNaN(v) ? null : v,
);
const tz = z
  .string()
  .default("America/Chicago")
  .refine(isValidTimeZone, "Unknown timezone");
const state = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use a 2-letter state");
const zip = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "Use a 5-digit ZIP");

export const addressInput = z.object({
  line1: z.string().trim().min(3, "Enter the street address").max(200),
  line2: text(200),
  city: z.string().trim().min(2, "Enter the city").max(100),
  state,
  zip,
});

const docStatus = z.enum(["not_required", "pending", "provided", "unknown"]).default("unknown");

export const stopInput = z.object({
  address: addressInput,
  timezone: tz,
  services: z.array(z.enum(SERVICES)).optional(), // derived from job type when omitted
  deliveryWindowStart: localDateTime,
  deliveryWindowEnd: localDateTime,
  installWindowStart: localDateTime,
  installWindowEnd: localDateTime,
  appointmentWindowStart: localDateTime,
  appointmentWindowEnd: localDateTime,
  customerAvailabilityNotes: text(),
  buildingWidthFt: num,
  buildingLengthFt: num,
  buildingHeightFt: num,
  buildingSystem: text(200),
  manufacturerName: text(200),
  openings: text(), // doors, windows, framed openings, lean-tos
  otherDetails: text(),
  loadLengthFt: num,
  loadWidthFt: num,
  loadHeightFt: num,
  loadWeightLbs: int,
  pieceCount: int,
  siteAccessNotes: text(),
  unloadingConstraints: text(),
  surface: opt(z.enum(["ground", "gravel", "concrete", "asphalt", "other"])).transform((v) => v ?? null),
  surfaceNotes: text(),
  siteReadiness: z.enum(["unknown", "not_ready", "ready", "verified"]).default("unknown"),
  plansStatus: docStatus,
  permitStatus: docStatus,
  engineeringStatus: docStatus,
  safetyNotes: text(), // private until acceptance
  accessInstructions: text(), // private until acceptance (gate codes etc.)
  contactName: text(120),
  contactPhone: text(40),
  contactEmail: opt(z.string().trim().email().max(200).or(z.literal(""))).transform((v) => v || null),
  equipmentTypeIds: z.array(z.string().uuid()).default([]),
});

export const routeInput = z.object({
  title: z.string().trim().min(3, "Give the route a short title").max(120),
  buildingCategoryId: z.string().uuid("Choose a building category"),
  jobType: z.enum(JOB_TYPES),
  visibility: z.enum(VISIBILITIES).default("marketplace"),
  invitedProviderOrgIds: z.array(z.string().uuid()).default([]),
  pickup: opt(addressInput).transform((v) => v ?? null),
  pickupTimezone: tz,
  pickupWindowStart: localDateTime,
  pickupWindowEnd: localDateTime,
  estimatedDurationMinutes: int,
  crewSizeRequired: int,
  loadingResponsibility: opt(z.enum(["poster", "provider", "customer", "other"])).transform((v) => v ?? null),
  unloadingResponsibility: opt(z.enum(["poster", "provider", "customer", "other"])).transform((v) => v ?? null),
  responsibilityNotes: text(),
  compensationMode: z.enum(["fixed", "proposals"]).default("fixed"),
  compensationBasis: z.enum(["route_total", "per_stop", "per_unit"]).default("route_total"),
  compensationUnitLabel: text(40),
  compensationCents: int,
  providerNotes: text(4000),
  assignmentNotes: text(4000),
  internalNotes: text(4000),
  applicationDeadline: localDateTime,
  expiresAt: localDateTime,
  equipmentTypeIds: z.array(z.string().uuid()).default([]),
  qualificationTypeIds: z.array(z.string().uuid()).default([]),
  stops: z.array(stopInput).max(25, "A route can have at most 25 stops"),
});

export type RouteInput = z.output<typeof routeInput>;
export type RouteInputRaw = z.input<typeof routeInput>;
export type StopInput = z.output<typeof stopInput>;

export function servicesForJobType(jobType: (typeof JOB_TYPES)[number]): ("delivery" | "installation")[] {
  if (jobType === "delivery") return ["delivery"];
  if (jobType === "installation") return ["installation"];
  return ["delivery", "installation"];
}

// Fields whose change after publishing counts as material (brief §6, §8).
export const MATERIAL_FIELDS = [
  "buildingCategoryId",
  "jobType",
  "pickup",
  "pickupWindowStart",
  "pickupWindowEnd",
  "compensationMode",
  "compensationBasis",
  "compensationCents",
  "crewSizeRequired",
  "equipmentTypeIds",
  "qualificationTypeIds",
  "stops",
] as const;
