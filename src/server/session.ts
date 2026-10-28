// Session helpers for Server Components and Server Actions.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { contextForSession, type OrgContext, type RequestContext } from "./context";
import { AppError } from "./errors";

export async function getSessionContext(): Promise<RequestContext | null> {
  const s = await getAuth().api.getSession({ headers: await headers() });
  if (!s) return null;
  try {
    return await contextForSession(s.session.id, s.user.id);
  } catch {
    return null;
  }
}

export async function requireSession(next?: string): Promise<RequestContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  return ctx;
}

export async function requireOrgSession(next?: string): Promise<OrgContext> {
  const ctx = await requireSession(next);
  if (!ctx.orgId) redirect("/onboarding");
  return ctx as OrgContext;
}

// Only same-site relative paths are allowed as post-login destinations.
export function safeNext(next: unknown, fallback = "/app"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}

export type ActionState = { error?: string; ok?: string } | undefined;

// Runs a server action body and turns domain errors into form state.
export async function runAction(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    return ok ? { ok } : {};
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    // Next.js redirect()/notFound() throw control-flow errors; let them through.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
}
