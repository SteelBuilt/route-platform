// Local development only: emails the dev adapter "sent" (no real delivery).
import { desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Alert, EmptyState, PageTitle } from "@/components/ui";
import { env } from "@/config/env";
import { getDb } from "@/server/db/client";
import { devOutbox } from "@/server/db/schema";

export const metadata = { title: "Dev outbox", robots: { index: false } };

function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} className="break-all font-semibold text-brand underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export default async function DevOutbox() {
  const e = env();
  if (e.NODE_ENV === "production" || e.RESEND_API_KEY) notFound();
  const mails = await getDb().select().from(devOutbox).orderBy(desc(devOutbox.createdAt)).limit(50);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <PageTitle>Dev outbox</PageTitle>
      <Alert kind="info">
        Local development mode. No email provider is configured, so messages are stored here instead of being sent.
      </Alert>
      <div className="mt-4 space-y-3">
        {mails.length === 0 && <EmptyState title="No emails yet" />}
        {mails.map((m) => (
          <article key={m.id} className="rounded-xl border-2 border-line bg-white p-4">
            <p className="text-sm text-muted">
              To {m.to} · {m.createdAt.toLocaleString("en-US")}
            </p>
            <h2 className="font-semibold">{m.subject}</h2>
            <pre className="mt-2 whitespace-pre-wrap font-sans">{linkify(m.text)}</pre>
          </article>
        ))}
      </div>
    </main>
  );
}
