// Route files: upload validation (type by content, size limits), private
// storage, and expiring download links gated by the privacy release.
import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { audit } from "../audit";
import { releasedAssignmentFor } from "../authz/privacy";
import { getNumberConfig } from "../config";
import { requireCapability, type RequestContext } from "../context";
import { files, routes, stops } from "../db/schema";
import { Invalid, NotFound } from "../errors";
import { withTenant } from "../tenant";
import { storage } from "../adapters/storage";

type Sniffed = { mime: string; ext: string; kind: "image" | "pdf" };

// Identify the file from its first bytes; the browser-supplied type is ignored.
export function sniff(bytes: Uint8Array): Sniffed | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg", kind: "image" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png", kind: "image" };
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    return { mime: "image/webp", ext: "webp", kind: "image" };
  }
  if (String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return { mime: "application/pdf", ext: "pdf", kind: "pdf" };
  return null;
}

export type UploadInput = {
  routeId: string;
  stopId?: string | null;
  // "listing": visible to anyone who can see the route (e.g. a building drawing
  // with no address). "assignment": released only after acceptance.
  visibility: "listing" | "assignment" | "internal";
  name: string;
  bytes: Uint8Array;
};

export async function uploadRouteFile(ctx: RequestContext, input: UploadInput) {
  requireCapability(ctx, "routes.post");
  const kind = sniff(input.bytes);
  if (!kind) throw new Invalid("Only JPEG, PNG, WebP images and PDF documents can be uploaded.");
  const maxMb = await getNumberConfig(kind.kind === "pdf" ? "upload.max_pdf_mb" : "upload.max_image_mb");
  if (input.bytes.byteLength > maxMb * 1024 * 1024) throw new Invalid(`File is too large (limit ${maxMb} MB).`);
  if (input.bytes.byteLength === 0) throw new Invalid("File is empty.");

  return withTenant(ctx, async (tx) => {
    const [r] = await tx.select().from(routes).where(and(eq(routes.id, input.routeId), eq(routes.orgId, ctx.orgId)));
    if (!r) throw new NotFound("Route not found");
    if (input.stopId) {
      const [s] = await tx.select().from(stops).where(and(eq(stops.id, input.stopId), eq(stops.routeId, r.id)));
      if (!s) throw new NotFound("Stop not found");
    }
    const key = `${ctx.orgId}/${randomUUID()}.${kind.ext}`;
    await storage().put(key, input.bytes, kind.mime);
    const safeName = input.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || `file.${kind.ext}`;
    const [row] = await tx
      .insert(files)
      .values({
        orgId: ctx.orgId,
        storageKey: key,
        originalName: safeName,
        contentType: kind.mime,
        sizeBytes: input.bytes.byteLength,
        sha256: createHash("sha256").update(input.bytes).digest("hex"),
        purpose: input.stopId ? "stop_photo" : "route_doc",
        visibilityClass: input.visibility,
        routeId: r.id,
        stopId: input.stopId ?? null,
        uploadedBy: ctx.userId,
      })
      .returning();
    await audit(tx, ctx, { action: "file.upload", targetType: "file", targetId: row.id, metadata: { routeId: r.id } });
    return row;
  });
}

export async function listRouteFilesForPoster(ctx: RequestContext, routeId: string) {
  requireCapability(ctx, "routes.post");
  return withTenant(ctx, (tx) =>
    tx
      .select()
      .from(files)
      .where(and(eq(files.routeId, routeId), eq(files.orgId, ctx.orgId), isNull(files.deletedAt))),
  );
}

// Returns a short-lived URL, or NotFound for anyone not allowed to see it.
// RLS filters the row; the app check repeats the release rule (including role).
export async function getFileLink(ctx: RequestContext, fileId: string) {
  if (!ctx.orgId) throw new NotFound("File not found");
  const ttlMinutes = await getNumberConfig("file_link.ttl_minutes");
  return withTenant(ctx, async (tx) => {
    const [f] = await tx.select().from(files).where(and(eq(files.id, fileId), isNull(files.deletedAt)));
    if (!f) throw new NotFound("File not found");
    const own = f.orgId === ctx.orgId;
    if (!own) {
      if (f.visibilityClass === "internal" || f.visibilityClass === "profile_private") throw new NotFound("File not found");
      if (f.visibilityClass === "assignment") {
        if (!f.routeId || !(await releasedAssignmentFor(tx, ctx, f.routeId))) throw new NotFound("File not found");
      }
    }
    const url = await storage().signedGetUrl(f.storageKey, ttlMinutes * 60, f.originalName);
    await audit(tx, ctx, {
      action: "file.download",
      targetType: "file",
      targetId: f.id,
      orgIds: [f.orgId],
      metadata: { visibility: f.visibilityClass },
    });
    return { url, expiresInMinutes: ttlMinutes };
  });
}
