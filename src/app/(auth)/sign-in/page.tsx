import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field, Input, PageTitle } from "@/components/ui";
import { signInAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <PageTitle>Sign in</PageTitle>
      <ActionForm action={signInAction} submitLabel="Sign in" pendingLabel="Signing in…">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
      </ActionForm>
      <p className="mt-6 text-muted">
        New here?{" "}
        <Link className="font-semibold text-brand underline" href={`/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
          Create an account
        </Link>
      </p>
    </>
  );
}
