# Progress

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done and tested. Items are never marked done while untested or failing (brief §22).

## Current state

- **Phase 1, Step 1 complete and approved** (2026-10-28).
- **Phase 1, Step 2 (foundation) done** on branch `phase-1`, except the Playwright browser run (see below).
- **Tests (2026-10-28):** `npm test`: 122 passed, 0 failed (6 files). Typecheck, lint and `next build` clean.
- **Browser-verified (mobile 375×812, local dev):** sign up → create org → invite crew member → dev outbox link → invitee sign-up → accept → crew member sees limited dashboard, is redirected away from Team, gets 404 on admin; platform admin sees catalog and adds a category.
- **Next:** Step 3 (core marketplace slice + landing page).

## Phase 1: Assessment, foundation, core marketplace

### Step 1: Assessment and plan
- [x] docs/PRODUCT_BRIEF.md
- [x] docs/ASSESSMENT.md (with cost check)
- [x] docs/ARCHITECTURE.md (stack, full data model, status machines, isolation, entitlements)
- [x] docs/PROGRESS.md
- [x] CLAUDE.md, git init, first commit
- [x] Owner approval (2026-10-28), with answers to all open questions
- [x] Brief §1, §19, §20 updated with owner answers; architecture updated for $0 budget, Netlify, beta, founder pricing

### Step 2: Foundation
- [x] Next.js 16 + TypeScript scaffold, Tailwind 4, ESLint
- [x] Brand configuration (name, logo, colors, domain, legal entity) from env (`src/config/brand.ts`)
- [x] Drizzle schema for all P1 tables (+ later-phase columns), migrations `0000_init` and `0001_rls`
- [x] PGlite local database; `npm run dev` one-command setup (auto-migrates); `.env.example`
- [x] RLS + `SET LOCAL ROLE app_user` verified on PGlite (cross-org writes rejected, reads filtered)
- [x] Better Auth: email/password sign up, sign in, sign out, DB sessions, verification + reset emails, rate limits
- [x] Organizations (4 kinds, can_post/can_provide), memberships with 5 roles incl. free crew_member/staff, permission overrides
- [x] Invitations: hashed token, 7-day expiry (config), single use, email-bound, revoke, rate-limited
- [x] Request context + role capabilities + tenant/system/admin transaction wrappers
- [x] RLS policies for every P1 table + `app_user` role; auth/jobs/billing tables unreachable by app role
- [x] Tenant isolation tests: 5 roles × 9 tables read, writes, updates, system tables, admin path
- [x] Audit log (append-only for app role) on org create, membership changes, invitations, catalog changes
- [x] Admin: building categories (umbrella parent), equipment and qualification types; job types are a fixed enum
- [x] `plans`, `app_config`, catalog seeded from `config/defaults.json`; beta subscriptions per audience; entitlement service
- [x] Vitest; `npm test` (CI: `npm run ci` = typecheck + lint + test)
- [~] Playwright: config + onboarding/invitation spec written (mobile + desktop), **not yet run**: needs the Chromium download (`npx playwright install chromium`, ~150 MB), awaiting owner OK

### Step 3: Core marketplace vertical slice
- [ ] **Public landing page** (marketing, signup paths for posters and providers), added by owner 2026-10-28
- [ ] Route create/edit as draft, publish, duplicate, templates
- [ ] Ordered stops with per-stop details; pickup window rules by job type
- [ ] Compensation mode and basis; proposals = price + note + availability; requirements; visibility (marketplace / preferred / invitation)
- [ ] Deadlines and expiration; internal vs provider-visible vs assignment notes
- [ ] Route version history for material changes
- [ ] Basic provider profile (regions, systems, services, crew size)
- [ ] Discovery list with filters (category, job type, state/ZIP/distance, dates, compensation, single vs multi-stop); pickup shows city/state only, stops 5-digit ZIP
- [ ] Apply / express interest (no lock), withdraw; unpaid providers can apply/accept on invited routes
- [ ] Applicant comparison, award with acceptance deadline (24 h config), revoke
- [ ] Accept assignment, transaction-safe (no double award, no double accept)
- [ ] Privacy release enforced in API, file access, notifications
- [ ] Private file storage: local adapter + R2 adapter, expiring links, type/size validation
- [ ] Demo seed data (labeled, `is_demo`, separate command)
- [ ] Tests: acceptance 1 (minus subscription), 2, 3, 4, 5, 6, 15
- [ ] Mobile-viewport browser verification

## Phase 2: Execution and communication (outline)
- [ ] Crews, vehicles, crew assignment, conflict warnings (test 13)
- [ ] Itinerary/calendar, pickup + per-stop milestones, separate delivery/install tracking (test 7)
- [ ] Photos, receipts, customer links (appointment confirm, completion ack = typed name + timestamp)
- [ ] Issues, change requests, rescheduling, cancellation with reason (test 10)
- [ ] Material change amendments with acknowledgment (test 9)
- [ ] Completion review by poster
- [ ] Threads/messages, in-app + email notifications, preferences, digests (digest-by-default to stay under Resend's 100/day)
- [ ] Map view (Mapbox), saved searches, saved routes
- [ ] Free crew-member scoping (test 16)
- [ ] Downloadable route summary

## Phase 3: Trust, billing, admin (outline)
- [ ] Stripe (test mode) checkout, portal, webhooks, trials, seats, grace, restriction (tests 1, 11, 12), all behind `billing.enabled = false`
- [ ] Founder pricing: configurable locked-in discount for converting beta orgs
- [ ] Qualification documents, admin review, precise badges, expiry reminders by cron (test 17)
- [ ] Portfolio, two-way reviews (completed only), reporting/moderation (test 8)
- [ ] Disputes with history
- [ ] Admin console: orgs/users, listings, subscriptions, beta status, suspensions, audit, metrics
- [ ] Push notifications (if clean)

## Phase 4: Launch preparation (outline)
- [ ] Account deletion and org data export, logged (test 18)
- [ ] Policy page drafts (marked for legal review; legal entity from brand config)
- [ ] Netlify deployment config, env checklist, backups, rollback, runbook
- [ ] routeyard.steelbuiltsystems.com DNS + HTTPS steps
- [ ] Billing test-to-live checklist (needs owner approval), email sender setup, monitoring
- [ ] SEO/social metadata, PWA icons/manifest
- [ ] Full acceptance run incl. test 14 on mobile; production build

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-27 | Stack: Next.js/TS, Neon Postgres, Drizzle, Better Auth, R2, Resend, Stripe, Sentry, cron + DB job table | Managed, low-ops, one language (brief §20). |
| 2026-10-27 | PGlite for local dev and tests | One-command setup without installing Postgres or Docker. |
| 2026-10-27 | RLS as backstop under app-layer policies | Isolation enforced at the DB, not the UI (brief §7). |
| 2026-10-27 | Cross-org access returns 404 | Doesn't reveal that the resource exists. |
| 2026-10-27 | Whole-route awards; awards/assignments carry stop and service scope | Split and separate-provider awards are model-ready (§21). |
| 2026-10-28 | Owner approved Step 1; `phase-1` branch created | Brief §22. |
| 2026-10-28 | **$0/month budget, free tiers only** | Owner. |
| 2026-10-28 | **Hosting: Netlify Free** instead of Vercel | Vercel Hobby terms say "restricted to non-commercial personal use only". Netlify's Self-Serve Agreement has no commercial-use restriction and supports full Next.js + scheduled functions on free. Cloudflare Workers Free was rejected: 10 ms CPU/request and 3 MiB worker size are too tight for Next.js + auth. Render Free was rejected: spin-down, and free Postgres expires after 30 days. |
| 2026-10-28 | Cron tick every 15 min via Netlify Scheduled Function | 30 s limit per run; batches bounded. |
| 2026-10-28 | 90-day free beta, no card; billing built but off (`billing.enabled=false`); Stripe test mode only | Owner. |
| 2026-10-28 | Founder pricing: configurable discount, locked in, for beta orgs that convert | Owner. |
| 2026-10-28 | Product is SBS's "RouteYard by SBS" at routeyard.steelbuiltsystems.com; all branding in config | Owner; replaces the "no dealer branding" rule. |
| 2026-10-28 | SBS's existing Stripe account, separate RouteYard products/prices | Owner. |
| 2026-10-28 | Unpaid providers can apply/accept/complete invited/preferred routes; paid provider plan only for marketplace browse + uninvited applications | Owner (Q4). |
| 2026-10-28 | Poster plan includes in-house crews; dealers applying to others' routes add a provider plan (per-audience subscriptions) | Owner (Q5). |
| 2026-10-28 | Paid seats: owner, dispatcher, crew leader. Free: crew member, staff | Owner (Q6). |
| 2026-10-28 | Defaults: 24 h accept, 7-day grace, 7-day invites, 14-day customer links | Owner (Q7). |
| 2026-10-28 | Before award: pickup city + state only; stops 5-digit ZIP | Owner (Q8). |
| 2026-10-28 | Two-way reviews, completed assignments only | Owner (Q9). |
| 2026-10-28 | Proposals = price + note + proposed availability | Owner (Q10). |
| 2026-10-28 | Customer completion ack = typed name + timestamp | Owner (Q11). |
| 2026-10-28 | Public landing page added to Phase 1 Step 3 | Owner. |
| 2026-10-28 | Next.js 16 with Cache Components **off**, all pages dynamic | Nearly every page is per-user/per-org; avoids caching private data. |
| 2026-10-28 | Private route/stop text in separate tables (`route_internal`, `route_private`, `stop_private`) | RLS works per row, so data with a different audience needs its own row. |
| 2026-10-28 | Cross-party transitions (org creation, invitation accept, later award accept/cron) run on a trusted `withSystem` path with explicit checks + audit | RLS can't express "accepting provider may update poster's route" cleanly; app checks are primary, RLS is the backstop for everything else. |
| 2026-10-28 | Email/password auth for Phase 1; magic-link sign-in deferred | Fewer moving parts; invitations already prove email ownership. Magic link can be added via Better Auth plugin without schema change. |
| 2026-10-28 | Repo git author set to "SteelBuilt Systems" <sales@steelbuiltsystems.com> (repo-local only) | Commits were failing with no identity configured; owner can change it with `git config user.name`. |

## Open questions for the owner

1. Which of these accounts exist (or should be created under SBS) before Phase 4: GitHub, Netlify, Neon, Cloudflare (R2), Resend, Sentry, Mapbox? None are needed for local development.
2. Logo and brand colors for RouteYard by SBS: provide files, or use a simple text logo and neutral palette until then?
3. Legal entity name to show in the footer and policy drafts (e.g. "SteelBuilt Systems, LLC"?).
4. Founder discount percent and the deadline to convert (config placeholders until set).
5. Netlify's free tier can pause the site when the monthly credits run out, and its terms allow removing free projects without notice. Are you OK with that risk for the beta, given the ~$19/month upgrade path?

## Known failures / limitations

- Playwright e2e not yet run (browser binary not downloaded).
- `npm audit`: 4 moderate advisories in drizzle-kit's bundled esbuild (dev-only tool, affects its dev server, not the app). Fix requires a breaking drizzle-kit downgrade; revisit when drizzle-kit updates.
- Admin "Add category" form keeps its values after saving (cosmetic).
- Email verification is sent but not yet required to use the app.
- Planned limitation: files already downloaded can't be recalled after an assignment is cancelled.
- Planned limitation: no duplicate-listing detection across posters.
- Free-tier constraints (ARCHITECTURE §7): Resend 100 emails/day; Netlify 300 credits/month (≈15 per production deploy); Neon cold start ~0.5–1 s after 5 min idle.
