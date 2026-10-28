// Runtime configuration stored in app_config (seeded from config/defaults.json).
import { eq } from "drizzle-orm";
import defaults from "../../config/defaults.json";
import { getDb, type Executor } from "./db/client";
import { appConfig } from "./db/schema";
import { jsonValue } from "./db/seed-base";

type Defaults = typeof defaults.app_config;
export type ConfigKey = keyof Defaults;

export async function getConfig<K extends ConfigKey>(
  key: K,
  db: Executor = getDb(),
): Promise<Defaults[K] | null> {
  const [row] = await db.select().from(appConfig).where(eq(appConfig.key, key));
  if (row) return row.value as Defaults[K];
  return (defaults.app_config[key] ?? null) as Defaults[K] | null;
}

export async function getNumberConfig(key: ConfigKey, db: Executor = getDb()): Promise<number> {
  const v = await getConfig(key, db);
  if (typeof v !== "number") throw new Error(`Config ${key} must be a number`);
  return v;
}

export async function setConfig(key: ConfigKey, value: unknown, db: Executor = getDb()) {
  const v = jsonValue(value);
  await db
    .insert(appConfig)
    .values({ key, value: v })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: v } });
}
