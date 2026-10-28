# Progress

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done and tested. Items are never marked done while untested or failing (brief §22).

## Current state

- **Phase 1, Step 1 complete:** brief, assessment, architecture, this file, CLAUDE.md, git.
- **Waiting on:** owner approval of the stack and answers to the open questions below, before Step 2.

## Phase 1: Assessment, foundation, core marketplace

### Step 1: Assessment and plan
- [x] docs/PRODUCT_BRIEF.md
- [x] docs/ASSESSMENT.md (with cost check)
- [x] docs/ARCHITECTURE.md (stack, full data model, status machines, isolation, entitlements)
- [x] docs/PROGRESS.md
- [x] CLAUDE.md, git init, first commit
- [ ] Owner approval

### Step 2: Foundation
- [ ] Next.js + TypeScript scaffold, Tailwind, lint/format
- [ ] Drizzle schema for P1 tables (plus P2–P4 columns that avoid later migrations), first migration
- [ ] PGlite local database; `npm run dev` one-command setup; `.env.example`
- [ ] Verify RLS + `SET ROLE` behavior on PGlite (ARCHITECTURE §4.1 note)
- [ ] Better Auth: sign up, sign in, magic link, sessions
- [ ] Organizations (4 kinds, can_post/can_provide), memberships with 5 roles incl. free crew_member/staff
- [ ] Invitations: hashed token, 7-day expiry, single use, revoke, rate-limited
- [ ] Request context + policy module + scoped repositories
- [ ] RLS policies + `app_user` role
- [ ] Tenant isolation tests (every role × every resource type)
- [ ] Audit log (append-only) on material actions
- [ ] Admin: building categories (with umbrella parent), equipment, qualification types
- [ ] `plans`, `subscriptions`, `app_config` seeded from config; entitlement service with dev toggle
- [ ] Vitest + Playwright setup; `npm test` CI command

### Step 3: Core marketplace vertical slice
- [ ] Route create/edit as draft, publish, duplicate, templates
- [ ] Ordered stops with per-stop details; pickup window rules by job type
- [ ] Compensation mode and basis; requirements; visibility (marketplace / preferred / invitation)
- [ ] Deadlines and expiration; internal vs provider-visible vs assignment notes
- [ ] Route version history for material changes
- [ ] Basic provider profile (regions, systems, services, crew size)
- [ ] Discovery list with filters (category, job type, state/ZIP/distance, dates, compensation, single vs multi-stop)
- [ ] Apply / express interest (no lock), withdraw
- [ ] Applicant comparison, award with acceptance deadline, revoke
- [ ] Accept assignment, transaction-safe (no double award, no double accept)
- [ ] Privacy release enforced in API, file access, notifications
- [ ] Private file storage: local adapter + R2 adapter, expiring links, type/size validation
- [ ] Demo seed data (labeled, `is_demo`, separate command)
- [ ] Tests: acceptance 1 (minus subscription), 2, 3, 4, 5, 6, 15
- [ ] Mobile-viewport browser verification

## Phase 2: Execution and communication (outline)
- [ ] Crews, vehicles, crew assignment, conflict warnings (test 13)
- [ ] Itinerary/calendar, pickup + per-stop milestones, separate delivery/install tracking (test 7)
- [ ] Photos, receipts, customer links (appointment confirm, completion ack)
- [ ] Issues, change requests, rescheduling, cancellation with reason (test 10)
- [ ] Material change amendments with acknowledgment (test 9)
- [ ] Completion review by poster
- [ ] Threads/messages, in-app + email notifications, preferences, digests
- [ ] Map view (Mapbox), saved searches, saved routes
- [ ] Free crew-member scoping (test 16)
- [ ] Downloadable route summary

## Phase 3: Trust, billing, admin (outline)
- [ ] Stripe checkout, portal, webhooks, trials, seats, grace, restriction (tests 1, 11, 12)
- [ ] Qualification documents, admin review, precise badges, expiry reminders by cron (test 17)
- [ ] Portfolio, reviews (completed only), reporting/moderation (test 8)
- [ ] Disputes with history
- [ ] Admin console: orgs/users, listings, subscriptions, suspensions, audit, metrics
- [ ] Push notifications (if clean)

## Phase 4: Launch preparation (outline)
- [ ] Account deletion and org data export, logged (test 18)
- [ ] Policy page drafts (marked for legal review)
- [ ] Deployment config, env checklist, backups, rollback, runbook
- [ ] Billing test-to-live checklist, email sender setup, monitoring
- [ ] SEO/social metadata, PWA icons/manifest
- [ ] Full acceptance run incl. test 14 on mobile; production build

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-27 | Stack: Next.js/TS on Vercel, Neon Postgres, Drizzle, Better Auth, R2, Resend, Stripe, Sentry, Vercel Cron + DB job table | Managed, low-ops, one language (brief §20). |
| 2026-10-27 | PGlite for local dev and tests | One-command setup without installing Postgres or Docker. |
| 2026-10-27 | RLS as backstop under app-layer policies | Isolation enforced at the DB, not the UI (brief §7). |
| 2026-10-27 | Cross-org access returns 404 | Doesn't reveal that the resource exists. |
| 2026-10-27 | Whole-route awards; awards/assignments carry stop and service scope | Split and separate-provider awards are model-ready (§21). |
| 2026-10-27 | Work on `main` (owner chose not to create a phase branch for Step 1) | Owner instruction. Ask again at the start of Step 2 about a `phase-1` branch, per brief §22. |

## Open questions for the owner

**From brief §20 (still blank):**
1. Monthly infrastructure budget for launch?
2. Which accounts already exist: Stripe, domain, email provider (Resend or other), GitHub, Vercel, Neon, Cloudflare, Sentry, Mapbox?
3. Working product name? Until then, "RouteYard (working name)" set by `APP_NAME`.

**Business model:**
4. Can a provider with no paid plan accept and execute invitation-only/preferred routes from a poster that invited it? (Recommended: yes. Paid plan required for marketplace discovery and applying.)
5. An org that both posts and provides (a dealer with in-house crews): one subscription, both, or a combined price?
6. Confirm the paid leader seats are owner, dispatcher, crew_leader, and that crew_member and staff are free.
7. Defaults: award acceptance 24 h, failed-payment grace 7 days, invitations 7 days, customer links 14 days. OK?
8. "Approximate origin" before award = city, state, 3-digit ZIP prefix (~10-mile area). OK?
9. Two-way reviews (providers also review posters)?

**Operational:**
10. Proposals when "proposals accepted": price only, or price plus alternate dates/notes? (Default: price + note + availability.)
11. Is a typed-name completion acknowledgment from the end customer enough, or do you want a drawn signature?

## Known failures / limitations

- None yet (no app code).
- Planned limitation: files already downloaded can't be recalled after an assignment is cancelled.
- Planned limitation: no duplicate-listing detection across posters.
