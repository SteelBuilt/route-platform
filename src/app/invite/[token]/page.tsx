import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, ButtonLink, Card, PageTitle } from "@/components/ui";
import { brand } from "@/config/brand";
import { acceptInvitation, previewInvitation } from "@/server/domain/invitations";
import { setActiveOrg } from "@/server/domain/orgs";
import { getSessionContext, requireSession, runAction, type ActionState } from "@/server/session";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

async function acceptAction(token: string, _: ActionState): Promise<ActionState> {
  "use server";
  const ctx = await requireSession(`/invite/${token}`);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  let orgId: string | undefined;
  const res = await runAction(async () => {
    ({ orgId } = await acceptInvitation(ctx.userId, token, { ip }));
    if (ctx.sessionId) await setActiveOrg(ctx.sessionId, ctx.userId, orgId);
  });
  if (res?.error) return res;
  redirect("/app");
}

const MESSAGES = {
  invalid: "This invitation link isn't valid. Check that you copied the whole link.",
  expired: "This invitation has expired. Ask the person who invited you to send a new one.",
  used: "This invitation has already been used.",
  revoked: "This invitation was cancelled. Ask the person who invited you to send a new one.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, ctx] = await Promise.all([previewInvitation(token), getSessionContext()]);
  const here = `/invite/${token}`;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <p className="mb-8 text-xl font-bold text-brand">{brand.productName}</p>
      {preview.state !== "valid" ? (
        <>
          <PageTitle>Invitation unavailable</PageTitle>
          <Alert>{MESSAGES[preview.state]}</Alert>
        </>
      ) : (
        <>
          <PageTitle sub={`as ${preview.role}`}>Join {preview.orgName}</PageTitle>
          <Card>
            <p>
              This invitation was sent to <strong className="break-all">{preview.email}</strong>.
            </p>
            {!ctx ? (
              <div className="mt-4 flex flex-col gap-3">
                <ButtonLink href={`/sign-up?next=${encodeURIComponent(here)}`}>Create an account to accept</ButtonLink>
                <ButtonLink variant="secondary" href={`/sign-in?next=${encodeURIComponent(here)}`}>
                  I already have an account
                </ButtonLink>
              </div>
            ) : ctx.email.toLowerCase() !== preview.email.toLowerCase() ? (
              <div className="mt-4">
                <Alert>
                  You&apos;re signed in as {ctx.email}. Sign in with {preview.email} to accept this invitation.
                </Alert>
              </div>
            ) : (
              <ActionForm action={acceptAction.bind(null, token)} submitLabel="Accept invitation" className="mt-4" />
            )}
          </Card>
        </>
      )}
    </main>
  );
}
