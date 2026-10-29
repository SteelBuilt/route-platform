// Converts the Census ZCTA gazetteer (pipe-delimited .txt from
// https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html)
// into data/zcta-centroids.csv: zip,lat,lng,state. Public domain data.
// Usage: npx tsx scripts/build-zip-centroids.ts <path/to/YYYY_Gaz_zcta_national.txt> <year>
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stateForZip } from "../src/lib/zip-state";

const [input, year] = process.argv.slice(2);
if (!input || !year) {
  console.error("Usage: build-zip-centroids.ts <gazetteer.txt> <year>");
  process.exit(1);
}
const lines = readFileSync(input, "utf8").split(/\r?\n/).filter(Boolean);
const header = lines[0].split("|").map((h) => h.trim());
const iZip = header.indexOf("GEOID");
const iLat = header.indexOf("INTPTLAT");
const iLng = header.indexOf("INTPTLONG");
if (iZip < 0 || iLat < 0 || iLng < 0) throw new Error(`Unexpected header: ${header.join("|")}`);

const out = [`# Census ${year} ZCTA gazetteer internal points; state derived from ZIP prefix`, "zip,lat,lng,state"];
let skipped = 0;
for (const line of lines.slice(1)) {
  const c = line.split("|").map((x) => x.trim());
  const zip = c[iZip];
  const lat = Number(c[iLat]);
  const lng = Number(c[iLng]);
  const state = stateForZip(zip);
  if (!/^\d{5}$/.test(zip) || !Number.isFinite(lat) || !Number.isFinite(lng) || !state) {
    skipped++;
    continue;
  }
  out.push(`${zip},${lat.toFixed(5)},${lng.toFixed(5)},${state}`);
}
const dest = path.join(process.cwd(), "data", "zcta-centroids.csv");
writeFileSync(dest, out.join("\n") + "\n");
console.log(`Wrote ${out.length - 2} ZIP centroids to ${dest} (skipped ${skipped}).`);
