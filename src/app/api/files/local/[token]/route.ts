// Local development file serving for signed, expiring URLs (the R2 adapter
// is used instead whenever R2 is configured).
import { readLocal, storage, verifyLocalToken } from "@/server/adapters/storage";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (storage().kind !== "local") return new Response("Not found", { status: 404 });
  const { token } = await params;
  const v = verifyLocalToken(token);
  if (!v) return new Response("This link has expired or is invalid.", { status: 403 });
  const bytes = await readLocal(v.key);
  const ext = v.key.split(".").pop() ?? "";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${v.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
