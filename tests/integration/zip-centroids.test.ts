import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { stateForZip } from "@/lib/zip-state";
import { getDb } from "@/server/db/client";
import { loadZipCentroids, readZipCsv } from "@/server/db/load-zips";
import { zipCentroids } from "@/server/db/schema";
import { searchRoutes } from "@/server/domain/discovery";
import { createDraft, publishRoute } from "@/server/domain/routes";
import { local, routeFixture } from "../fixtures";
import { freshDb, makeOrg } from "../helpers";

describe("ZIP prefix to state", () => {
  it.each([
    ["75701", "TX"],
    ["73301", "TX"],
    ["88510", "TX"],
    ["73102", "OK"],
    ["71101", "LA"],
    ["72201", "AR"],
    ["63101", "MO"],
    ["39201", "MS"],
    ["66101", "KS"],
    ["05501", "MA"],
  ])("%s → %s", (zip, st) => expect(stateForZip(zip)).toBe(st));
});

describe("Census ZIP centroids", () => {
  beforeAll(async () => {
    await freshDb();
    await loadZipCentroids(getDb());
  });

  it("loads every ZIP from the data file, once", async () => {
    const all = await getDb().select({ zip: zipCentroids.zip }).from(zipCentroids);
    expect(all.length).toBe(readZipCsv().length);
    expect(all.length).toBeGreaterThan(30000);
    expect(await loadZipCentroids(getDb())).toBe(0);
    const [tyler] = await getDb().select().from(zipCentroids).where(eq(zipCentroids.zip, "75701"));
    expect(tyler).toMatchObject({ state: "TX" });
    expect(tyler.lat).toBeCloseTo(32.32, 1);
  });

  it("distance search works for ZIPs that were never in the test fixtures", async () => {
    const poster = await makeOrg("poster");
    const provider = await makeOrg("delivery_installer");
    const id = await createDraft(
      poster.ctx,
      await routeFixture({
        title: "Amarillo shed",
        stops: [
          {
            address: { line1: "1 Test", city: "Amarillo", state: "TX", zip: "79101" },
            timezone: "America/Chicago",
            deliveryWindowStart: local(10, 13),
            deliveryWindowEnd: local(10, 17),
            installWindowStart: local(11, 8),
            installWindowEnd: local(11, 17),
          },
        ],
      }),
    );
    await publishRoute(poster.ctx, id);
    const near = await searchRoutes(provider.ctx, { zip: "79106", radiusMiles: 25 });
    expect(near.distanceNote).toBeNull();
    expect(near.results.map((r) => r.id)).toContain(id);
    const far = await searchRoutes(provider.ctx, { zip: "77002", radiusMiles: 100 });
    expect(far.results.map((r) => r.id)).not.toContain(id);
  });
});
