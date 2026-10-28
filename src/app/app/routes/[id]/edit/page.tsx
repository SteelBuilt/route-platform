import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, PageTitle } from "@/components/ui";
import { getRouteForPoster } from "@/server/domain/routes";
import { requireOrgSession } from "@/server/session";
import { saveRouteAction } from "../../actions";
import { editorOptions } from "../../editor-data";
import { RouteEditor, type RouteState } from "../../route-editor";

export const metadata: Metadata = { title: "Edit route" };

export default async function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrgSession(`/app/routes/${id}/edit`);
  if (!ctx.capabilities.has("routes.post")) redirect("/app");
  const [data, opts] = await Promise.all([getRouteForPoster(ctx, id), editorOptions(ctx)]);
  if (data.route.status !== "draft" && data.route.status !== "published") redirect(`/app/routes/${id}`);
  return (
    <>
      <PageTitle sub={data.route.referenceCode}>Edit route</PageTitle>
      {data.route.status === "published" && (
        <div className="mb-4">
          <Alert kind="info">
            This route is published. Changes to price, dates, scope or stops are recorded as material changes in its
            version history.
          </Alert>
        </div>
      )}
      <RouteEditor
        action={saveRouteAction.bind(null, id)}
        initial={data.snapshot as unknown as RouteState}
        submitLabel="Save changes"
        {...opts}
      />
    </>
  );
}
