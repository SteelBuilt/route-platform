// Route fixtures for marketplace tests. Dates are relative to "now" so they
// stay in the future.
import { eq } from "drizzle-orm";
import { utcToZonedLocal } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { buildingCategories, zipCentroids } from "@/server/db/schema";
import type { RouteInputRaw } from "@/server/domain/route-input";

const TZ = "America/Chicago";

export function local(daysFromNow: number, hour: number) {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return `${utcToZonedLocal(d, TZ).slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
}

// Approximate city-center coordinates for test ZIPs (test data only).
export async function loadTestCentroids() {
  await getDb()
    .insert(zipCentroids)
    .values([
      { zip: "75701", lat: 32.32, lng: -95.29, city: "Tyler", state: "TX", timezone: TZ },
      { zip: "75601", lat: 32.5, lng: -94.74, city: "Longview", state: "TX", timezone: TZ },
      { zip: "75901", lat: 31.34, lng: -94.73, city: "Lufkin", state: "TX", timezone: TZ },
      { zip: "73102", lat: 35.47, lng: -97.52, city: "Oklahoma City", state: "OK", timezone: TZ },
      { zip: "78701", lat: 30.27, lng: -97.74, city: "Austin", state: "TX", timezone: TZ },
    ])
    .onConflictDoNothing();
}

export async function categoryId(slug: string) {
  const [c] = await getDb().select().from(buildingCategories).where(eq(buildingCategories.slug, slug));
  return c.id;
}

export async function routeFixture(overrides: Partial<RouteInputRaw> = {}): Promise<RouteInputRaw> {
  return {
    title: "Two red-iron kits, East Texas",
    buildingCategoryId: await categoryId("red-iron"),
    jobType: "delivery_installation",
    visibility: "marketplace",
    pickup: { line1: "100 Factory Rd", city: "Tyler", state: "TX", zip: "75701" },
    pickupTimezone: TZ,
    pickupWindowStart: local(10, 7),
    pickupWindowEnd: local(10, 11),
    crewSizeRequired: 4,
    compensationMode: "fixed",
    compensationBasis: "route_total",
    compensationCents: 480000,
    providerNotes: "Forklift on site at pickup.",
    assignmentNotes: "Call dispatch at pickup gate 3.",
    internalNotes: "Customer is a repeat buyer; margin is thin.",
    stops: [
      {
        address: { line1: "12 Pine Hollow Ln", city: "Longview", state: "TX", zip: "75601" },
        timezone: TZ,
        deliveryWindowStart: local(10, 13),
        deliveryWindowEnd: local(10, 17),
        installWindowStart: local(11, 8),
        installWindowEnd: local(12, 17),
        buildingWidthFt: 30,
        buildingLengthFt: 40,
        buildingHeightFt: 12,
        buildingSystem: "Red iron",
        surface: "concrete",
        siteReadiness: "ready",
        safetyNotes: "Dog on property.",
        accessInstructions: "Gate code 4417",
        contactName: "Pat Buyer",
        contactPhone: "903-555-0100",
      },
      {
        address: { line1: "88 County Rd 210", city: "Lufkin", state: "TX", zip: "75901" },
        timezone: TZ,
        deliveryWindowStart: local(10, 16),
        deliveryWindowEnd: local(10, 19),
        installWindowStart: local(13, 8),
        installWindowEnd: local(14, 17),
        buildingWidthFt: 24,
        buildingLengthFt: 30,
        surface: "gravel",
        contactName: "Sam Owner",
        contactPhone: "936-555-0101",
      },
    ],
    ...overrides,
  };
}
