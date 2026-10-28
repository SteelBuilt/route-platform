// Better Auth: email + password accounts and database sessions. Users and
// sessions live in our Postgres; orgs and roles are our own tables.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { brand } from "@/config/brand";
import { devSecret, env, platformAdminEmails } from "@/config/env";
import { sendEmail } from "./adapters/email";
import { getDb } from "./db/client";
import { accounts, authRateLimits, sessions, users, verifications } from "./db/schema";

function createAuth() {
  const e = env();
  return betterAuth({
    appName: brand.productName,
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET ?? devSecret("auth"),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        rateLimit: authRateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: `Reset your ${brand.productName} password`,
          text: `Reset your password: ${url}\n\nIf you didn't ask for this, ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: `Confirm your email for ${brand.productName}`,
          text: `Confirm your email address: ${url}`,
        });
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: e.NODE_ENV !== "test",
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 300, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
      },
    },
    user: {
      additionalFields: {
        platformRole: { type: "string", input: false, defaultValue: "none" },
        status: { type: "string", input: false, defaultValue: "active" },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const isAdmin = platformAdminEmails().includes(user.email.toLowerCase());
            return { data: { ...user, platformRole: isAdmin ? "platform_admin" : "none" } };
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await getDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, session.userId));
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { __routeAuth?: Auth };

export function getAuth(): Auth {
  g.__routeAuth ??= createAuth();
  return g.__routeAuth;
}

export function resetAuthForTests() {
  g.__routeAuth = undefined;
}
