// Loads data/zcta-centroids.csv (Census ZCTA internal points) into
// zip_centroids. Census values replace any approximate demo/test points.
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { DB } from "./client";
import { zipCentroids } from "./schema";

export function readZipCsv(file = path.join(process.cwd(), "data", "zcta-centroids.csv")) {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("zip,"))
    .map((l) => {
      const [zip, lat, lng, state] = l.split(",");
      return { zip, lat: Number(lat), lng: Number(lng), state };
    });
}

export async function loadZipCentroids(db: DB, opts: { force?: boolean } = {}) {
  const rows = readZipCsv();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(zipCentroids);
  if (!opts.force && n >= rows.length) return 0;
  for (let i = 0; i < rows.length; i += 1000) {
    await db
      .insert(zipCentroids)
      .values(rows.slice(i, i + 1000))
      .onConflictDoUpdate({
        target: zipCentroids.zip,
        set: { lat: sql`excluded.lat`, lng: sql`excluded.lng`, state: sql`excluded.state` },
      });
  }
  return rows.length;
}
