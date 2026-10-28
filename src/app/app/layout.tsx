import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import { signOutAction } from "@/app/(auth)/actions";
import { requireOrgSession } from "@/server/session";
import { listMyOrgs } from "@/server/domain/orgs";
import { OrgSwitcher } from "./org-switcher";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgSession("/app");
  const orgs = await listMyOrgs(ctx);
  const canManage = ctx.capabilities.has("org.manage");
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b-2 border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/app" className="text-lg font-bold text-brand">
            {brand.shortName}
          </Link>
          <OrgSwitcher orgs={orgs} activeOrgId={ctx.orgId} />
          <nav className="ml-auto flex flex-wrap items-center gap-1 text-base">
            <Link className="rounded-lg px-3 py-2 font-medium hover:bg-surface" href="/app">
              Dashboard
            </Link>
            {canManage && (
              <Link className="rounded-lg px-3 py-2 font-medium hover:bg-surface" href="/app/team">
                Team
              </Link>
            )}
            {ctx.isPlatformAdmin && (
              <Link className="rounded-lg px-3 py-2 font-medium hover:bg-surface" href="/admin/catalog">
                Admin
              </Link>
            )}
            <form action={signOutAction}>
              <button className="rounded-lg px-3 py-2 font-medium hover:bg-surface">Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
