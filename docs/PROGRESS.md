# Progress

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done and tested. Items are never marked done while untested or failing (brief §22).

## Current state

- **Phase 1, Step 1 complete and approved** (2026-10-28).
- **Phase 1, Step 2 (foundation) in progress** on branch `phase-1`.

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
- [ ] Next.js + TypeScript scaffold, Tailwind, lint
- [ ] Brand configuration (name, logo, colors, domain, legal entity) from env
- [ ] Drizzle schema for P1 tables (plus later-phase columns that avoid migrations), first migration
- [ ] PGlite local database; `npm run dev` one-command setup; `.env.example`
- [ ] Verify RLS + `SET ROLE` behavior on PGlite (ARCHITECTURE §4.1 note)
- [ ] Better Auth: sign up, sign in, sessions
- [ ] Organizations (4 kinds, can_post/can_provide), memberships with 5 roles incl. free crew_member/staff
- [ ] Invitations: hashed token, 7-day expiry (config), single use, revoke, rate-limited
- [ ] Request context + policy module + scoped repositories
- [ ] RLS policies + `app_user` role
- [ ] Tenant isolation tests (every role × every resource type)
- [ ] Audit log (append-only) on material actions
- [ ] Admin: building categories (with umbrella parent), job types, equipment, qualification types
- [ ] `plans`, `subscriptions`, `app_config` seeded from config; beta subscriptions; entitlement service
- [ ] Vitest + Playwright setup; `npm test` CI command

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
| 2026-10-28 | Repo git author set to "SteelBuilt Systems" <sales@steelbuiltsystems.com> (repo-local only) | Commits were failing with no identity configured; owner can change it with `git config user.name`. |

## Open questions for the owner

1. Which of these accounts exist (or should be created under SBS) before Phase 4: GitHub, Netlify, Neon, Cloudflare (R2), Resend, Sentry, Mapbox? None are needed for local development.
2. Logo and brand colors for RouteYard by SBS: provide files, or use a simple text logo and neutral palette until then?
3. Legal entity name to show in the footer and policy drafts (e.g. "SteelBuilt Systems, LLC"?).
4. Founder discount percent and the deadline to convert (config placeholders until set).
5. Netlify's free tier can pause the site when the monthly credits run out, and its terms allow removing free projects without notice. Are you OK with that risk for the beta, given the ~$19/month upgrade path?

## Known failures / limitations

- None yet (no app code).
- Planned limitation: files already downloaded can't be recalled after an assignment is cancelled.
- Planned limitation: no duplicate-listing detection across posters.
- Free-tier constraints (ARCHITECTURE §7): Resend 100 emails/day; Netlify 300 credits/month (≈15 per production deploy); Neon cold start ~0.5–1 s after 5 min idle.
