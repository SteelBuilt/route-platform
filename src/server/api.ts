// JSON API helpers for route handlers. The session is read from the request's
// own headers (not next/headers) so handlers are testable with plain Requests.
import { getAuth } from "./auth";
import { contextForSession, type RequestContext } from "./context";
import { AppError } from "./errors";

export async function contextFromRequest(req: Request): Promise<RequestContext | null> {
  const s = await getAuth().api.getSession({ headers: req.headers });
  if (!s) return null;
  try {
    return await contextForSession(s.session.id, s.user.id);
  } catch {
    return null;
  }
}

export async function apiHandler(
  req: Request,
  fn: (ctx: RequestContext) => Promise<Response | unknown>,
): Promise<Response> {
  const ctx = await contextFromRequest(req);
  if (!ctx) return Response.json({ error: "Sign in required" }, { status: 401 });
  try {
    const out = await fn(ctx);
    return out instanceof Response ? out : Response.json(out);
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    console.error(e);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
