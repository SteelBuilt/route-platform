// Typed access to environment variables. Validated once on first use.
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  // Database: a postgres:// URL (Neon) or unset to use local PGlite.
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default(".data/pglite"),

  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  PLATFORM_ADMIN_EMAILS: z.string().default(""),

  // Email. Unset RESEND_API_KEY = local dev outbox (development/test only).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("RouteYard by SBS <no-reply@localhost>"),

  // Signs local file URLs and other short-lived tokens.
  APP_SIGNING_SECRET: z.string().min(32).optional(),

  CRON_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.parse(process.env);
  if (parsed.NODE_ENV === "production") {
    const missing = (
      ["DATABASE_URL", "BETTER_AUTH_SECRET", "APP_SIGNING_SECRET", "RESEND_API_KEY", "CRON_SECRET"] as const
    ).filter((k) => !parsed[k]);
    if (missing.length) {
      throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
    }
  }
  cached = parsed;
  return parsed;
}

// Development-only fallback secret. Production refuses to start without real secrets.
export function devSecret(name: string): string {
  return `dev-only-insecure-${name}-0123456789abcdef0123456789`;
}

export function platformAdminEmails(): string[] {
  return env()
    .PLATFORM_ADMIN_EMAILS.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
