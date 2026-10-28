// Append-only audit trail for material actions and private-data access.
import { createHash } from "node:crypto";
import type { Tx } from "./db/client";
import { auditLogs } from "./db/schema";
import type { RequestContext } from "./context";

export type AuditEntry = {
  action: string;
  targetType?: string;
  targetId?: string;
  orgIds?: (string | null | undefined)[];
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`ip:${ip}`).digest("hex").slice(0, 32);
}

export async function audit(tx: Tx, actor: RequestContext | "system", entry: AuditEntry) {
  const orgIds = [
    ...new Set(
      [...(entry.orgIds ?? []), actor === "system" ? null : actor.orgId].filter(
        (x): x is string => !!x,
      ),
    ),
  ];
  await tx.insert(auditLogs).values({
    actorUserId: actor === "system" ? null : actor.userId,
    actorOrgId: actor === "system" ? null : actor.orgId,
    actingAs: actor === "system" ? "system" : "user",
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    orgIds,
    ipHash: hashIp(entry.ip),
    userAgent: entry.userAgent?.slice(0, 300) ?? null,
    metadata: entry.metadata ?? {},
  });
}
