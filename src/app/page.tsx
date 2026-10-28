// Temporary home page. The full public landing page is Phase 1 Step 3.
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui";
import { brand } from "@/config/brand";
import { getSessionContext } from "@/server/session";

export default async function Home() {
  const ctx = await getSessionContext();
  if (ctx) redirect(ctx.orgId ? "/app" : "/onboarding");
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-3xl font-bold text-brand">{brand.productName}</h1>
      <p className="mt-3 text-lg">
        Post delivery and installation routes for portable and metal buildings, and dispatch the crews you already
        work with.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/sign-up">Create a free account</ButtonLink>
        <ButtonLink href="/sign-in" variant="secondary">
          Sign in
        </ButtonLink>
      </div>
    </main>
  );
}
