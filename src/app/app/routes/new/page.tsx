import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/ui";
import { getTemplate } from "@/server/domain/routes";
import { requireOrgSession } from "@/server/session";
import { saveRouteAction } from "../actions";
import { editorOptions } from "../editor-data";
import { RouteEditor, emptyRoute, type RouteState } from "../route-editor";

export const metadata: Metadata = { title: "New route" };

export default async function NewRoutePage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const ctx = await requireOrgSession("/app/routes/new");
  if (!ctx.capabilities.has("routes.post") || !ctx.org.canPost) redirect("/app");
  const { template } = await searchParams;
  const opts = await editorOptions(ctx);
  let initial: RouteState = emptyRoute(opts.categories.find((c) => !c.isUmbrella && c.allowedJobTypes.includes("delivery_installation")));
  let sub = "Save as a draft first. You can publish from the route page.";
  if (template) {
    const t = await getTemplate(ctx, template);
    initial = { ...initial, ...(t.payload as unknown as RouteState) };
    sub = `From template “${t.name}”. Fill in dates, addresses and contacts.`;
  }
  return (
    <>
      <PageTitle sub={sub}>New route</PageTitle>
      <RouteEditor action={saveRouteAction.bind(null, null)} initial={initial} submitLabel="Save draft" {...opts} />
    </>
  );
}
