import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import { signOutAction } from "@/app/(auth)/actions";
import { requireOrgSession } from "@/server/session";
import { listMyOrgs } from "@/server/domain/orgs";
import { OrgSwitcher } from "./org-switcher";
import { SectorPrompt } from "./sector-prompt";
import { VerifyEmailBanner } from "./verify-banner";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgSession("/app");
  const orgs = await listMyOrgs(ctx);
  const canManage = ctx.capabilities.has("org.manage");
  const links: [string, string][] = [["/app", "Dashboard"]];
  if (ctx.org.canPost && ctx.capabilities.has("routes.post")) links.push(["/app/routes", "Routes"], ["/app/providers", "Providers"]);
  if (ctx.org.canProvide && ctx.capabilities.has("marketplace.browse")) links.push(["/app/find", "Find work"], ["/app/work", "My work"]);
  if (ctx.org.canProvide && canManage) links.push(["/app/profile", "Profile"]);
  if (canManage) links.push(["/app/team", "Team"], ["/app/settings", "Settings"]);
  const showSectorPrompt = canManage && !ctx.org.primarySector && !ctx.org.sectorPromptDismissed;
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b-2 border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/app" className="text-lg font-bold text-brand">
            {brand.shortName}
          </Link>
          <OrgSwitcher orgs={orgs} activeOrgId={ctx.orgId} />
          <nav className="ml-auto flex flex-wrap items-center gap-1 text-base">
            {links.map(([href, label]) => (
              <Link key={href} className="rounded-lg px-3 py-2 font-medium hover:bg-surface" href={href}>
                {label}
              </Link>
            ))}
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
      {ctx.org.isDemo && (
        <div role="note" className="bg-amber-400 px-4 py-2 text-center font-semibold text-black">
          Demo organization: all companies, routes and people here are sample data.
        </div>
      )}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {!ctx.emailVerified && (ctx.org.canPost || ctx.capabilities.has("applications.submit")) && (
          <div className="mb-6">
            <VerifyEmailBanner email={ctx.email} />
          </div>
        )}
        {showSectorPrompt && (
          <div className="mb-6">
            <SectorPrompt kind={ctx.org.kind} />
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
