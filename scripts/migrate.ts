// Applies database migrations and loads required reference data.
// Local: uses PGlite at PGLITE_DIR. Production: DATABASE_URL (Neon).
import { loadEnvConfig } from "@next/env";
import { getDb } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";
import { seedBase } from "../src/server/db/seed-base";

async function main() {
  // Same .env / .env.local files Next.js reads. Config is read lazily, so
  // loading here (after imports) is early enough.
  loadEnvConfig(process.cwd());
  await runMigrations();
  await seedBase(getDb());
  console.log("Database migrated and reference data loaded.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
