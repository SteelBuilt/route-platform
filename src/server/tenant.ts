// Transaction wrappers. Every tenant-scoped query runs inside withTenant, which
// switches to the app_user role and sets the session variables that the
// row-level security policies read (drizzle/0001_rls.sql).
import { sql } from "drizzle-orm";
import { getDb, type Tx } from "./db/client";
import type { RequestContext } from "./context";

export type TenantTx = Tx & { readonly __tenant: true };
export type SystemTx = Tx & { readonly __system: true };

export async function withTenant<T>(ctx: RequestContext, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${ctx.userId}, true),
                 set_config('app.org_id', ${ctx.orgId ?? ""}, true),
                 set_config('app.platform_admin', 'off', true)`,
    );
    await tx.execute(sql`set local role app_user`);
    return fn(tx as TenantTx);
  });
}

// Platform-admin access is a separate path so each use is deliberate and the
// caller records an audit entry (see authz/admin.ts).
export async function withPlatformAdmin<T>(
  ctx: RequestContext,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!ctx.isPlatformAdmin) throw new Error("withPlatformAdmin called without platform admin context");
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${ctx.userId}, true),
                 set_config('app.org_id', ${ctx.orgId ?? ""}, true),
                 set_config('app.platform_admin', 'on', true)`,
    );
    await tx.execute(sql`set local role app_user`);
    return fn(tx as TenantTx);
  });
}

// Trusted server code paths that must cross tenant boundaries (org creation,
// invitation acceptance, cross-party state transitions, cron). Every caller
// must perform explicit authorization checks before writing.
export async function withSystem<T>(fn: (tx: SystemTx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => fn(tx as SystemTx));
}
