import { ActionForm } from "@/components/action-form";
import { resendVerificationAction } from "./actions";

// Shown until the user confirms their email. Posting and applying to routes
// are blocked server-side until then (requireVerifiedEmail).
export function VerifyEmailBanner({ email }: { email: string }) {
  return (
    <div role="status" className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4">
      <p className="font-semibold">Confirm your email to post or apply to routes</p>
      <p className="mt-1">
        We sent a confirmation link to <strong className="break-all">{email}</strong>. You can set up your team while
        you wait.
      </p>
      <ActionForm
        action={resendVerificationAction}
        submitLabel="Resend confirmation email"
        pendingLabel="Sending…"
        variant="secondary"
        className="mt-3 space-y-3"
      />
    </div>
  );
}
