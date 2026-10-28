// GET /api/files/:id → 302 to a short-lived signed URL, or 404.
import { apiHandler } from "@/server/api";
import { getFileLink } from "@/server/domain/files";
import { NotFound } from "@/server/errors";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return apiHandler(req, async (ctx) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFound("File not found");
    const { url } = await getFileLink(ctx, id);
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  });
}
