// Demo data for local development and a clearly labeled demo environment.
// Every org is flagged is_demo and named "(Demo)"; the app shows a banner.
// Refuses to run against production unless DEMO_ENVIRONMENT=true is set for a
// dedicated demo database.
//
// Demo sign-ins (all share one password, demo only):
//   dispatch@demo.routeyard.test   poster (owner)
//   crews@demo.routeyard.test      delivery + installation provider (owner)
//   install@demo.routeyard.test    installation provider (owner)
//   leader@demo.routeyard.test     crew leader at the first provider
//   crew@demo.routeyard.test       crew member (free) at the first provider
//   Password: DEMO_PASSWORD env var, default "demo-password-2026"
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";
import { utcToZonedLocal } from "../src/lib/time";

const TZ = "America/Chicago";

function local(days: number, hour: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${utcToZonedLocal(d, TZ).slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
}

async function main() {
  loadEnvConfig(process.cwd());
  const isProdDb = (process.env.DATABASE_URL ?? "").startsWith("postgres");
  if ((process.env.NODE_ENV === "production" || isProdDb) && process.env.DEMO_ENVIRONMENT !== "true") {
    console.error("Refusing to load demo data into a non-demo database. Set DEMO_ENVIRONMENT=true only for a dedicated demo database.");
    process.exit(1);
  }

  const { getDb } = await import("../src/server/db/client");
  const { runMigrations } = await import("../src/server/db/migrate");
  const { seedBase } = await import("../src/server/db/seed-base");
  const { loadZipCentroids } = await import("../src/server/db/load-zips");
  const schema = await import("../src/server/db/schema");
  const { getAuth } = await import("../src/server/auth");
  const { buildContext } = await import("../src/server/context");
  const { createOrganization } = await import("../src/server/domain/orgs");
  const { saveProviderProfile } = await import("../src/server/domain/profiles");
  const { createDraft, publishRoute, addPreferredProvider } = await import("../src/server/domain/routes");
  const { applyToRoute } = await import("../src/server/domain/marketplace");

  await runMigrations();
  const db = getDb();
  await seedBase(db);

  const existing = await db.select().from(schema.organizations).where(eq(schema.organizations.isDemo, true));
  if (existing.length) {
    console.log("Demo data already loaded. Delete .data/pglite to start over.");
    process.exit(0);
  }

  await loadZipCentroids(db);

  const password = process.env.DEMO_PASSWORD || "demo-password-2026";
  async function user(email: string, name: string) {
    const res = await getAuth().api.signUpEmail({ body: { email, password, name } });
    await db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.id, res.user.id));
    return res.user.id;
  }

  const posterUid = await user("dispatch@demo.routeyard.test", "Dana Dispatch (Demo)");
  const crewsUid = await user("crews@demo.routeyard.test", "Alex Erector (Demo)");
  const installUid = await user("install@demo.routeyard.test", "Blake Builder (Demo)");

  const { org: poster } = await createOrganization(
    posterUid,
    { industrySector: "red_iron", name: "Piney Woods Buildings (Demo)", kind: "poster", hqState: "TX", hqZip: "75701" },
    { isDemo: true },
  );
  const { org: crews } = await createOrganization(
    crewsUid,
    { industrySector: "red_iron", name: "East Texas Haul & Erect (Demo)", kind: "delivery_installer", hqState: "TX", hqZip: "75601" },
    { isDemo: true },
  );
  const { org: install } = await createOrganization(
    installUid,
    { industrySector: "red_iron", name: "Brazos Steel Crew (Demo)", kind: "installer", hqState: "TX", hqZip: "76701" },
    { isDemo: true },
  );

  for (const [email, name, role] of [
    ["leader@demo.routeyard.test", "Casey Leader (Demo)", "crew_leader"],
    ["crew@demo.routeyard.test", "Jordan Crew (Demo)", "crew_member"],
  ] as const) {
    const uid = await user(email, name);
    await db.insert(schema.memberships).values({ orgId: crews.id, userId: uid, role, isLeaderSeat: role === "crew_leader" });
  }

  const posterCtx = await buildContext(posterUid, poster.id);
  const crewsCtx = await buildContext(crewsUid, crews.id);
  const installCtx = await buildContext(installUid, install.id);

  const cats = await db.select().from(schema.buildingCategories);
  const cat = (slug: string) => cats.find((c) => c.slug === slug)!.id;

  await saveProviderProfile(crewsCtx, {
    summary: "Two rollback crews and one red-iron erection crew based in Longview.",
    yearsExperience: 11,
    crewSizeMin: 2,
    crewSizeMax: 6,
    buildingCategoryIds: [cat("portable-buildings"), cat("tube-steel"), cat("red-iron")],
    jobTypes: ["delivery", "installation", "delivery_installation"],
    regions: [{ type: "state", state: "TX" }, { type: "state", state: "LA" }],
  });
  await saveProviderProfile(installCtx, {
    summary: "Tube-steel carports and garages, Central Texas.",
    yearsExperience: 6,
    crewSizeMin: 3,
    crewSizeMax: 4,
    buildingCategoryIds: [cat("tube-steel")],
    jobTypes: ["installation"],
    regions: [{ type: "zip_radius", zip: "76701", radiusMiles: 150 }],
  });
  await addPreferredProvider(posterCtx, crews.id, "Our regular East Texas crew");

  const pickup = { line1: "4100 Demo Industrial Blvd", city: "Tyler", state: "TX", zip: "75701" };
  const routes = [
    {
      title: "Two red-iron shops: Tyler → Longview → Lufkin",
      buildingCategoryId: cat("red-iron"),
      jobType: "delivery_installation" as const,
      compensationCents: 640000,
      stops: [
        { address: { line1: "12 Sample Hollow Ln", city: "Longview", state: "TX", zip: "75601" }, timezone: TZ, deliveryWindowStart: local(9, 12), deliveryWindowEnd: local(9, 16), installWindowStart: local(10, 8), installWindowEnd: local(11, 17), buildingWidthFt: 30, buildingLengthFt: 40, buildingHeightFt: 12, surface: "concrete" as const, siteReadiness: "ready" as const, contactName: "Pat Example (Demo)", contactPhone: "555-0100", accessInstructions: "Demo gate code 0000" },
        { address: { line1: "88 Example County Rd", city: "Lufkin", state: "TX", zip: "75901" }, timezone: TZ, deliveryWindowStart: local(9, 16), deliveryWindowEnd: local(9, 19), installWindowStart: local(12, 8), installWindowEnd: local(13, 17), buildingWidthFt: 24, buildingLengthFt: 30, buildingHeightFt: 10, surface: "concrete" as const, contactName: "Sam Example (Demo)", contactPhone: "555-0101" },
      ],
    },
    {
      title: "10×16 shed delivery to Dallas",
      buildingCategoryId: cat("portable-buildings"),
      jobType: "delivery" as const,
      compensationCents: 42500,
      stops: [
        { address: { line1: "500 Demo Ave", city: "Dallas", state: "TX", zip: "75201" }, timezone: TZ, deliveryWindowStart: local(5, 9), deliveryWindowEnd: local(5, 13), buildingWidthFt: 10, buildingLengthFt: 16, surface: "gravel" as const, contactName: "Lee Example (Demo)", contactPhone: "555-0102" },
      ],
    },
    {
      title: "Tube-steel carport install, Waco",
      buildingCategoryId: cat("tube-steel"),
      jobType: "installation" as const,
      compensationCents: 120000,
      stops: [
        { address: { line1: "77 Sample Ranch Rd", city: "Waco", state: "TX", zip: "76701" }, timezone: TZ, installWindowStart: local(14, 8), installWindowEnd: local(14, 17), buildingWidthFt: 20, buildingLengthFt: 25, buildingHeightFt: 9, surface: "concrete" as const, contactName: "Robin Example (Demo)", contactPhone: "555-0103" },
      ],
    },
    {
      title: "Three sheds: Tyler → Shreveport (proposals)",
      buildingCategoryId: cat("portable-buildings"),
      jobType: "delivery" as const,
      compensationMode: "proposals" as const,
      compensationCents: null,
      stops: [
        { address: { line1: "1 Example St", city: "Shreveport", state: "LA", zip: "71101" }, timezone: TZ, deliveryWindowStart: local(18, 10), deliveryWindowEnd: local(18, 15), buildingWidthFt: 12, buildingLengthFt: 24, contactName: "Kim Example (Demo)", contactPhone: "555-0104" },
      ],
    },
  ];

  const ids: string[] = [];
  for (const r of routes) {
    const isInstall = r.jobType === "installation";
    const id = await createDraft(posterCtx, {
      ...r,
      visibility: "marketplace",
      pickup: isInstall ? null : pickup,
      pickupTimezone: TZ,
      pickupWindowStart: isInstall ? null : local(r.jobType === "delivery" ? 5 : 9, 7),
      pickupWindowEnd: isInstall ? null : local(r.jobType === "delivery" ? 5 : 9, 9),
      crewSizeRequired: isInstall ? 3 : 2,
      providerNotes: "Demo route: sample data only.",
      assignmentNotes: "Demo: call dispatch on arrival.",
    });
    await publishRoute(posterCtx, id);
    ids.push(id);
  }
  await db.update(schema.routes).set({ isDemo: true }).where(inArray(schema.routes.id, ids));

  await applyToRoute(crewsCtx, ids[0], { message: "Demo: both crews free that week.", proposedAvailability: "Mon–Thu" });
  await applyToRoute(installCtx, ids[2], { message: "Demo: can start at 7am." });

  console.log(`Demo data loaded: 3 organizations, 5 users, ${ids.length} routes, 2 applications.`);
  console.log("Sign-ins are listed at the top of scripts/seed-demo.ts.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
