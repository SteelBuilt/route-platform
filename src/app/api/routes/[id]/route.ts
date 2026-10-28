// GET /api/routes/:id. Poster gets its own route; providers get the public view,
// plus private details only once their org has accepted the assignment.
import { apiHandler } from "@/server/api";
import { getRouteForPoster } from "@/server/domain/routes";
import { getRouteForProvider } from "@/server/domain/marketplace";
import { NotFound } from "@/server/errors";
import { getDb } from "@/server/db/client";
import { routes } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return apiHandler(req, async (ctx) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFound("Route not found");
    const [own] = await getDb().select({ orgId: routes.orgId }).from(routes).where(eq(routes.id, id));
    if (own && own.orgId === ctx.orgId && ctx.capabilities.has("routes.post")) {
      const r = await getRouteForPoster(ctx, id);
      return { view: "poster", route: r.route, stops: r.stops, versions: r.versions };
    }
    if (!ctx.capabilities.has("marketplace.browse")) throw new NotFound("Route not found");
    return { view: "provider", ...(await getRouteForProvider(ctx, id)) };
  });
}
