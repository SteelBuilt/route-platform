import path from "node:path";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { dbKind, getDb } from "./client";

export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

export async function runMigrations() {
  const db = getDb();
  if (dbKind() === "neon") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrateNeon(db as any, { migrationsFolder: MIGRATIONS_DIR });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migratePglite(db as any, { migrationsFolder: MIGRATIONS_DIR });
  }
}
