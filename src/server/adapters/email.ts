// Email adapter. Uses Resend when RESEND_API_KEY is set. Without it, in
// development and tests only, messages go to the dev_outbox table (viewable at
// /dev/outbox). In production a missing key is a startup error (config/env.ts),
// so nothing ever pretends an email was delivered.
import { env } from "@/config/env";
import { getDb } from "../db/client";
import { devOutbox } from "../db/schema";

export type EmailMessage = { to: string; subject: string; text: string; html?: string };

export type EmailResult = { delivered: "resend" | "dev_outbox"; id: string };

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const { RESEND_API_KEY, EMAIL_FROM, NODE_ENV } = env();
  if (RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!res.ok) {
      throw new Error(`Email send failed (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as { id: string };
    return { delivered: "resend", id: body.id };
  }
  if (NODE_ENV === "production") throw new Error("RESEND_API_KEY is not configured");
  const [row] = await getDb().insert(devOutbox).values(msg).returning({ id: devOutbox.id });
  return { delivered: "dev_outbox", id: row.id };
}
