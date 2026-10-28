"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth } from "@/server/auth";
import { safeNext, type ActionState } from "@/server/session";

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(10, "Use at least 10 characters").max(128),
});

function authErrorMessage(e: unknown, fallback: string) {
  const msg = (e as { body?: { message?: string }; message?: string })?.body?.message ?? (e as Error)?.message;
  if (msg && /already exists/i.test(msg)) return "An account with that email already exists. Sign in instead.";
  if (msg && /invalid email or password/i.test(msg)) return "Email or password is incorrect.";
  if (msg && /too many/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  return fallback;
}

export async function signUpAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await getAuth().api.signUpEmail({ body: parsed.data, headers: await headers() });
  } catch (e) {
    return { error: authErrorMessage(e, "Couldn't create your account. Please try again.") };
  }
  redirect(safeNext(form.get("next"), "/onboarding"));
}

export async function signInAction(_: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  try {
    await getAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (e) {
    return { error: authErrorMessage(e, "Couldn't sign you in. Please try again.") };
  }
  redirect(safeNext(form.get("next")));
}

export async function signOutAction() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/");
}
