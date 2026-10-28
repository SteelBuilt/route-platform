// Fixed-window rate limiter backed by Postgres (no extra vendor at launch scale).
import { sql } from "drizzle-orm";
import { RateLimited } from "./errors";
import { getDb } from "./db/client";
import { rateLimits } from "./db/schema";

export async function hit(key: string, limit: number, windowSeconds: number, now = new Date()) {
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const [row] = await getDb()
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  if (row.count > limit) throw new RateLimited();
}
