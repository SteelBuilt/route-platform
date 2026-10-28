"use client";

// A form bound to a server action that returns { error?, ok? }. Shows the
// message and disables the submit button while pending.
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/server/session";
import { Alert, Button } from "./ui";

export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  variant,
  children,
  className,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  children?: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "space-y-4"}>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
      {children}
      <Submit label={submitLabel} pendingLabel={pendingLabel} variant={variant} />
    </form>
  );
}

function Submit({ label, pendingLabel, variant }: { label: string; pendingLabel?: string; variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant}>
      {pending ? (pendingLabel ?? "Working…") : label}
    </Button>
  );
}
