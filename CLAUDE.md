# CLAUDE.md

Subscription logistics and installation platform for the building industry (portable buildings, tube-steel and red-iron metal buildings). It is a standalone project and unrelated to any other project on this machine.

## Start of every session

Read, in order: this file, `docs/PRODUCT_BRIEF.md`, `docs/PROGRESS.md`. Then `docs/ARCHITECTURE.md` as needed. Phase prompts are saved in `docs/phases/`.

## Standing rules (from brief §22 and §19–21)

- Work only inside this folder.
- Git: one branch per phase, commit after each working slice, never commit secrets (`.env*` except `.env.example` is ignored).
- Never mark a PROGRESS item done while untested or failing. Update `docs/PROGRESS.md` before ending a session.
- When a phase prompt says STOP, stop and report.
- Don't build later-phase features early. Data-model fields that avoid a later migration are fine.
- Open questions go in PROGRESS.md and in the report. Don't silently assume.
- Zero commission; no escrow, job payments, payouts or invoicing between users.
- Prices, seats, trial lengths, deadlines and limits are configuration (`plans`, `app_config`), never literals in code.
- Out of scope: native apps, SMS, continuous GPS, truck-safe/oversize/permit routing, AI features, public API.
- Product is "RouteYard by SBS" (SteelBuilt Systems). All branding (name, logo, colors, domain, legal entity) comes from `src/config/brand.ts` / env. No brand strings in components.
- Never reference the first launch customer (a dealer) by name in code or seed data.
- $0/month budget: free tiers only. Billing is built but disabled (`billing.enabled=false`), Stripe test mode only until the owner approves live billing. Launch is a 90-day free beta.
- Develop on preview/branch deploys. Netlify Free meters production deploys (15 of 300 monthly credits each).
- Integrations go through adapters. Missing credentials → labeled local mode or a loud failure, never a faked success.
- Demo data only through the demo seed command, flagged `is_demo`. Production must never look populated by fake data.
- Verification copy is precise: "self-reported", "document submitted", "admin reviewed". Never "insured"/"licensed".

## Stack

Next.js (App Router, TypeScript) on Netlify Free · Postgres (Neon Free in prod, PGlite locally/tests) · Drizzle ORM + drizzle-kit · Better Auth · Cloudflare R2 · Resend · Stripe (Phase 3, test mode) · Mapbox (Phase 2) · Sentry · Netlify Scheduled Function → `/api/cron/tick` + Postgres `jobs` table · Tailwind · Vitest + Playwright.

## Security conventions

- Request context comes from the session; the org is never trusted from client input.
- Handlers call policy functions in `src/server/authz/` and use scoped repositories. No raw table access in handlers.
- Postgres RLS is the backstop: the app runs as `app_user` with `SET LOCAL app.user_id/app.org_id` per transaction.
- Cross-org access returns 404.
- Private stop data (addresses, contacts, assignment files/notes) is released only by `canViewPrivateStop` (ARCHITECTURE §4.3). This covers the API, files, exports and notifications.
- Award and accept run in a transaction with row locks plus unique partial indexes and idempotency keys.
- Status changes go only through `src/server/domain/transitions.ts`.
- Material actions and private reads write `audit_logs`.

## Commands

- `npm run dev`: migrate + start on local PGlite (`.data/pglite`); no external services. Dev emails at `/dev/outbox`.
- `npm test`: Vitest unit + integration (fresh in-memory PGlite per file)
- `npm run ci`: typecheck + lint + test
- `npm run test:e2e`: Playwright, mobile + desktop (needs `npx playwright install chromium` once)
- `npm run db:generate`: new migration from schema changes. Custom SQL (RLS) via `npx drizzle-kit generate --custom --name <x>`
- `npm run db:migrate`: apply migrations + load reference data from `config/defaults.json`
- Platform admins: emails listed in `PLATFORM_ADMIN_EMAILS` (e.g. in `.env.local`) at sign-up
- `npm run seed:demo`: labeled demo data (Step 3)

## Code conventions

- Next.js 16: read `node_modules/next/dist/docs/` before using unfamiliar APIs (see AGENTS.md). Cache Components is off.
- Domain logic lives in `src/server/domain/*` and takes a `RequestContext`; pages and server actions stay thin.
- Tenant reads/writes go through `withTenant(ctx, tx => …)`. `withSystem` only for audited trusted paths; `withPlatformAdmin` for admin.
- New tables: add RLS policies + grants in a custom migration, and add isolation tests.
- Throw `AppError` subclasses (`NotFound` for cross-org, `Forbidden`, `Invalid`, `Conflict`); `runAction` maps them to form errors.
- Tests assert DB errors with `expectDbError` (Drizzle wraps the Postgres message in `cause`).
