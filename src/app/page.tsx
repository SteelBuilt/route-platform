// Public landing page with sign-up paths for posting companies and providers.
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui";
import { brand } from "@/config/brand";
import { getSessionContext } from "@/server/session";

const POSTER_POINTS = [
  ["Post routes weeks ahead", "Single deliveries or multi-stop routes, with pickup windows and per-stop details."],
  ["Dispatch the crews you already use", "Invitation-only routes for your own network, or open them to the marketplace."],
  ["Compare and award", "See applicants side by side, award with an acceptance deadline, no double-booking."],
  ["Addresses stay private", "Exact addresses and customer contacts go only to the crew that accepts."],
];

const PROVIDER_POINTS = [
  ["Find work near you", "Filter by building type, job type, ZIP and distance, dates and pay."],
  ["Apply in a minute", "Applying doesn't commit you. You confirm only when you're awarded."],
  ["Your whole crew, one account", "Crew members join free and see only the work assigned to them."],
  ["Keep 100% of the job", "Flat subscription. No commission on job value, ever."],
];

export default async function Home() {
  const ctx = await getSessionContext();
  if (ctx) redirect(ctx.orgId ? "/app" : "/onboarding");
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b-2 border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.productName} className="h-8" />
          ) : (
            <span className="text-xl font-bold text-brand">{brand.productName}</span>
          )}
          <Link href="/sign-in" className="min-h-11 rounded-lg px-3 py-2 font-semibold hover:bg-surface">
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-12 sm:py-20">
          <p className="mb-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
            Free 90-day beta · no card required
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
            Delivery and installation for portable and metal buildings, organized.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Manufacturers and dealers post routes. Qualified delivery and installation crews find them, apply and
            get awarded. Flat monthly pricing with zero commission on job values.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/sign-up?as=poster">I post delivery and install work</ButtonLink>
            <ButtonLink href="/sign-up?as=provider" variant="secondary">
              I deliver or install buildings
            </ButtonLink>
          </div>
        </section>

        <section className="border-y-2 border-line bg-surface">
          <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 md:grid-cols-2">
            {[
              ["For manufacturers, suppliers and dealers", POSTER_POINTS, "/sign-up?as=poster", "Start posting routes"],
              ["For delivery and installation crews", PROVIDER_POINTS, "/sign-up?as=provider", "Start finding work"],
            ].map(([title, points, href, cta]) => (
              <div key={title as string}>
                <h2 className="text-2xl font-bold">{title as string}</h2>
                <ul className="mt-4 space-y-4">
                  {(points as string[][]).map(([h, b]) => (
                    <li key={h}>
                      <p className="font-semibold">{h}</p>
                      <p className="text-muted">{b}</p>
                    </li>
                  ))}
                </ul>
                <ButtonLink href={href as string} className="mt-6">
                  {cta as string}
                </ButtonLink>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="text-2xl font-bold">How it works</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-4">
            {[
              ["Post", "Add the pickup, stops, dates and pay."],
              ["Apply", "Crews that fit apply or send a price."],
              ["Award", "Pick a crew; they have a deadline to accept."],
              ["Accept", "Addresses, contacts and files unlock for the crew."],
            ].map(([h, b], i) => (
              <li key={h} className="rounded-xl border-2 border-line p-4">
                <p className="text-sm font-semibold text-brand">Step {i + 1}</p>
                <p className="text-lg font-bold">{h}</p>
                <p className="text-muted">{b}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-sm text-muted">
            {brand.productName} connects companies and crews. Payment for delivery and installation is arranged
            directly between them. The platform doesn&apos;t insure shipments or guarantee workmanship.
          </p>
        </section>
      </main>

      <footer className="border-t-2 border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 px-4 py-6 text-sm text-muted">
          <span>
            © {new Date().getFullYear()} {brand.legalEntity}
          </span>
          <a href={`mailto:${brand.supportEmail}`} className="underline">
            {brand.supportEmail}
          </a>
        </div>
      </footer>
    </div>
  );
}
