// Database client. Neon (serverless Postgres) when DATABASE_URL is set,
// otherwise an embedded PGlite database for local development and tests.
import { PGlite } from "@electric-sql/pglite";
import { Pool, neonConfig } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { env } from "@/config/env";
import * as schema from "./schema";

export type Schema = typeof schema;
export type DB = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type Executor = DB | Tx;

type Holder = { db: DB; kind: "neon" | "pglite"; pglite?: PGlite };

const g = globalThis as unknown as { __routeDb?: Holder };

function create(): Holder {
  const url = env().DATABASE_URL;
  if (url && url.startsWith("postgres")) {
    neonConfig.webSocketConstructor ??= globalThis.WebSocket;
    const pool = new Pool({ connectionString: url });
    return { db: drizzleNeon(pool, { schema }) as unknown as DB, kind: "neon" };
  }
  const dir = url?.startsWith("pglite:") ? url.slice("pglite:".length) : env().PGLITE_DIR;
  const pglite = new PGlite(dir === "memory" ? undefined : dir);
  return { db: drizzlePglite(pglite, { schema }) as unknown as DB, kind: "pglite", pglite };
}

export function getDb(): DB {
  g.__routeDb ??= create();
  return g.__routeDb.db;
}

export function dbKind(): "neon" | "pglite" {
  getDb();
  return g.__routeDb!.kind;
}

// Tests only: swap in a fresh database.
export function setDbForTests(holder: Holder | undefined) {
  g.__routeDb = holder;
}

export function makePgliteHolder(pglite: PGlite): Holder {
  return { db: drizzlePglite(pglite, { schema }) as unknown as DB, kind: "pglite", pglite };
}
