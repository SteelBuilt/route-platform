import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field, Input, PageTitle } from "@/components/ui";
import { signUpAction } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <PageTitle sub="Free during the beta. No card required.">Create your account</PageTitle>
      <ActionForm action={signUpAction} submitLabel="Create account" pendingLabel="Creating account…">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Your name">
          <Input name="name" autoComplete="name" required />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" hint="At least 10 characters.">
          <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
        </Field>
      </ActionForm>
      <p className="mt-6 text-muted">
        Already have an account?{" "}
        <Link className="font-semibold text-brand underline" href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
          Sign in
        </Link>
      </p>
    </>
  );
}
