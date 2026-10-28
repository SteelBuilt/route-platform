// Route editor state shape and defaults. Plain module (no "use client") so
// server pages can build the initial state.

export type Category = { id: string; name: string; isUmbrella: boolean; parentId: string | null; allowedJobTypes: string[]; defaultJobType: string };
export type Option = { id: string; name: string };

export type Address = { line1: string; line2?: string | null; city: string; state: string; zip: string };
export type StopState = {
  address: Address;
  timezone: string;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
  installWindowStart?: string | null;
  installWindowEnd?: string | null;
  appointmentWindowStart?: string | null;
  appointmentWindowEnd?: string | null;
  customerAvailabilityNotes?: string | null;
  buildingWidthFt?: number | string | null;
  buildingLengthFt?: number | string | null;
  buildingHeightFt?: number | string | null;
  buildingSystem?: string | null;
  manufacturerName?: string | null;
  openings?: string | null;
  otherDetails?: string | null;
  loadLengthFt?: number | string | null;
  loadWidthFt?: number | string | null;
  loadHeightFt?: number | string | null;
  loadWeightLbs?: number | string | null;
  pieceCount?: number | string | null;
  siteAccessNotes?: string | null;
  unloadingConstraints?: string | null;
  surface?: string | null;
  surfaceNotes?: string | null;
  siteReadiness?: string;
  plansStatus?: string;
  permitStatus?: string;
  engineeringStatus?: string;
  safetyNotes?: string | null;
  accessInstructions?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  equipmentTypeIds?: string[];
};
export type RouteState = {
  title: string;
  buildingCategoryId: string;
  jobType: string;
  visibility: string;
  invitedProviderOrgIds: string[];
  pickup: Address | null;
  pickupTimezone: string;
  pickupWindowStart?: string | null;
  pickupWindowEnd?: string | null;
  estimatedDurationMinutes?: number | string | null;
  crewSizeRequired?: number | string | null;
  loadingResponsibility?: string | null;
  unloadingResponsibility?: string | null;
  responsibilityNotes?: string | null;
  compensationMode: string;
  compensationBasis: string;
  compensationUnitLabel?: string | null;
  compensationCents?: number | string | null;
  providerNotes?: string | null;
  assignmentNotes?: string | null;
  internalNotes?: string | null;
  applicationDeadline?: string | null;
  expiresAt?: string | null;
  equipmentTypeIds: string[];
  qualificationTypeIds: string[];
  stops: StopState[];
};

export const emptyAddress = (): Address => ({ line1: "", line2: "", city: "", state: "TX", zip: "" });
export const emptyStop = (tz: string): StopState => ({
  address: emptyAddress(),
  timezone: tz,
  siteReadiness: "unknown",
  plansStatus: "unknown",
  permitStatus: "unknown",
  engineeringStatus: "unknown",
  equipmentTypeIds: [],
});

export function emptyRoute(defaultCategory?: Category): RouteState {
  return {
    title: "",
    buildingCategoryId: defaultCategory?.id ?? "",
    jobType: defaultCategory?.defaultJobType ?? "delivery",
    visibility: "marketplace",
    invitedProviderOrgIds: [],
    pickup: emptyAddress(),
    pickupTimezone: "America/Chicago",
    compensationMode: "fixed",
    compensationBasis: "route_total",
    equipmentTypeIds: [],
    qualificationTypeIds: [],
    stops: [emptyStop("America/Chicago")],
  };
}
