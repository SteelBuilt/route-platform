# Architecture

Covers all four phases so later phases add features without redesigning tables. The phase that first uses each entity is marked **[P1]–[P4]**. "Model-ready" items from brief Section 21 are marked **(MR)**.

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| App framework | **Next.js (App Router) + TypeScript** | One codebase for UI and API (route handlers / server actions). Mature, with first-class Vercel deploys. |
| Hosting | **Vercel** (Pro plan for commercial use and cron) | Zero servers to manage, preview deploys per branch. |
| Database | **Postgres on Neon** | Managed, serverless, scales to zero, database branching for previews. |
| Local / test database | **PGlite** (in-process Postgres) | `npm run dev` with no Postgres or Docker install. Same SQL dialect as production. |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | SQL-first, typed, plain SQL migration files checked into git. |
| Auth | **Better Auth** (email + password and magic link) | Library, not a vendor. Users and sessions live in our Postgres. Our own tables own orgs and roles. |
| Authorization | Our own policy module + **Postgres row-level security (RLS)** | Defense in depth (§4). |
| Files | **Cloudflare R2** (S3 API) with presigned URLs. Local adapter: disk plus HMAC-signed URLs | Private by default, no egress fees. |
| Email | **Resend**. Local adapter: a dev outbox table shown at `/dev/outbox` | Simple API. The local mode is labeled and never claims a send happened. |
| Background jobs | **Vercel Cron** → `/api/cron/*` processing a Postgres **job / outbox table** | No queue service to run. Jobs are idempotent and retried from the table. |
| Billing [P3] | **Stripe** Checkout, Billing Portal, verified webhooks | One subscription per org with a seat quantity. |
| Maps [P2] | **Mapbox** (tiles, geocoding, directions estimate) + Census ZCTA centroid table for ZIP distance | Distance filters work without API calls. Directions are labeled "estimate; not truck-safe routing". |
| Errors / logs | **Sentry** + structured JSON logs (pino) to Vercel log drain | |
| Rate limiting | Postgres fixed-window counters | Avoids another vendor at launch scale. |
| UI | Tailwind CSS, accessible headless components, PWA manifest + service worker (Serwist) | Mobile-first, large touch targets. |
| Tests | **Vitest** (unit + integration against PGlite), **Playwright** (end-to-end, mobile viewport) | `npm test` is the CI command. |

Every external integration sits behind an adapter interface (`src/server/adapters/*`), selected by environment variables. When credentials are missing, the adapter runs in a clearly labeled local mode or fails loudly. It never fakes success.

The product name comes from `APP_NAME` (default "RouteYard (working name)").

## 2. Data model

Conventions: UUID primary keys. `created_at`/`updated_at` on every table. Money is stored as integer cents plus `currency` (USD). Every timestamp is `timestamptz` (UTC). Each location carries an IANA `timezone`, and scheduling windows are `(starts_at, ends_at)` pairs interpreted in that zone for display. Soft delete (`deleted_at`) is used where history matters. Every tenant-owned row has `org_id`.

### Identity and orgs

- **users** [P1]: id, email (unique, citext), name, phone (optional), email_verified_at, platform_role (`none` | `platform_admin`), status (`active` | `suspended` | `deleted`), last_login_at. Better Auth's `accounts`/`sessions`/`verifications` tables live alongside.
- **organizations** [P1]: id, name, slug, kind (`poster` | `installer` | `transporter` | `delivery_installer`), can_post (bool), can_provide (bool), phone, email, website, hq_city, hq_state, hq_zip, timezone, status (`active` | `suspended` | `deleted`), is_demo (bool).
  - `kind` is the self-description. `can_post`/`can_provide` drive features, so a dealer with in-house crews can be both (pricing is an open question).
- **memberships** [P1]: id, org_id → organizations, user_id → users, role (`owner` | `dispatcher` | `crew_leader` | `crew_member` | `staff`), is_leader_seat (derived from role; stored for billing counts), permission_overrides (jsonb: e.g. `{ "view_compensation": true, "browse": true }`), status (`active` | `removed`). Unique(org_id, user_id).
- **invitations** [P1]: id, org_id, email, role, token_hash (SHA-256; the raw token is only in the email), invited_by → users, expires_at, accepted_at, revoked_at, accepted_user_id.
- **crews** [P1 table, P2 UI]: id, org_id, name, leader_membership_id, active.
- **crew_members** [P2]: crew_id, membership_id.
- **vehicles** [P2]: id, org_id, label, type (`truck` | `trailer` | `tilt_bed` | `rollback` | `toter` | `crane` | `other`), capacity_notes, deck_length_ft, max_weight_lbs, active.
- **preferred_providers** [P1]: id, poster_org_id, provider_org_id, note (internal), created_by. Unique(poster_org_id, provider_org_id).

### Catalog (admin-managed)

- **building_categories** [P1]: id, slug, name, parent_id (self, for the "Metal buildings" umbrella), allowed_job_types (array), default_job_type, sort, active.
- **job_types** [P1]: enum `delivery` | `installation` | `delivery_installation`. Enum, not a table: the job types drive logic.
- **equipment_types**, **qualification_types** [P1]: id, slug, name, active. Qualification types include `requires_document` and `document_kind`.

### Provider profile

- **provider_profiles** [P1]: org_id (PK), summary, years_experience, crew_size_min/max, building_category_ids (array), job_types (array), availability_notes, preferred_lead_days, public (bool).
- **service_regions** [P1]: id, org_id, type (`state` | `zip_radius`), state, zip, radius_miles.
- **provider_equipment** [P1]: org_id, equipment_type_id, quantity, notes (self-reported).
- **qualification_documents** [P3]: id, org_id, qualification_type_id, file_id, issuer, policy_number_last4 (only the last 4 digits are stored), effective_on, expires_on, review_status (`submitted` | `approved` | `rejected` | `needs_update` | `expired`), reviewed_by, reviewed_at, reviewer_note.
- **verification_badges**: derived, not stored. Three distinct levels: *self-reported*, *document submitted*, *admin reviewed (date)*. The UI copy never says "insured" or "licensed".
- **portfolio_items** [P3]: id, org_id, file_id, caption, building_category_id.

### Locations and geography

- **zip_centroids** [P1]: zip (PK), lat, lng, city, state, timezone. Loaded from public Census ZCTA data.
- **locations** [P1]: private exact location. id, org_id (owner = poster), line1, line2, city, state, zip, lat, lng, timezone, geocode_source. **Readable only under the privacy release (§4.3).**
- Public projections are stored on the route/stop rows themselves (city, state, zip, zip3, approx_lat/approx_lng rounded to ~0.1°), so discovery queries never touch `locations`.

### Routes (postings)

- **route_templates** [P1]: id, org_id, name, payload (jsonb snapshot of route and stops minus dates/private data), created_by.
- **routes** [P1]: id, org_id (poster), reference_code (human-readable), title, building_category_id, job_type, status (§3.1), visibility (`marketplace` | `preferred` | `invitation`),
  pickup_location_id → locations (nullable for installation only), pickup_city/state/zip/zip3/approx_lat/approx_lng (public), pickup_window_start/end, pickup_timezone,
  estimated_duration_minutes, crew_size_required, loading_responsibility / unloading_responsibility (`poster` | `provider` | `customer` | `other`), responsibility_notes,
  compensation_mode (`fixed` | `proposals`), compensation_basis (`route_total` | `per_stop` | `per_unit`), compensation_unit_label, compensation_cents (nullable when proposals with no guide),
  provider_notes (provider-visible before award), assignment_notes (visible after acceptance only), internal_notes (poster org only),
  application_deadline, expires_at, published_at, version (int), current_version_id, award_mode (`whole_route` | `split` **(MR)**, default `whole_route`),
  stop_count (denormalized), is_demo, deleted_at.
  - DB check: `job_type <> 'installation' → pickup window required` and `job_type = 'installation' → pickup optional`.
- **route_requirements** [P1]: route_id, kind (`equipment` | `qualification` | `document`), ref_id, required (bool), note.
- **route_invitations** [P1]: route_id, provider_org_id, invited_at, viewed_at. Used for `invitation` visibility. `preferred` resolves through preferred_providers at publish time and is snapshotted here as well.
- **stops** [P1]: id, route_id, org_id (poster, for RLS), sequence, location_id → locations (private), city/state/zip/zip3/approx_lat/approx_lng (public), timezone,
  services (array of `delivery` | `installation`), delivery_window_start/end, install_window_start/end, appointment_window_start/end, customer_availability_notes,
  building_width_ft, building_length_ft, building_height_ft, building_system, manufacturer_name, openings (jsonb: doors, windows, framed openings, lean-tos with sizes/counts), other_details,
  load_length_ft/width_ft/height_ft, load_weight_lbs, piece_count,
  site_access_notes, unloading_constraints, surface (`ground` | `gravel` | `concrete` | `asphalt` | `other`), surface_notes,
  site_readiness (`unknown` | `not_ready` | `ready` | `verified`), plans_status / permit_status / engineering_status (`not_required` | `pending` | `provided` | `unknown`),
  safety_notes (provider-visible after award), status (§3.2), deleted_at.
- **stop_contacts** [P1]: private. id, stop_id, org_id, name, phone, email, role (`customer` | `site_contact`), notes. Released only under §4.3.
- **stop_equipment** [P1]: stop_id, equipment_type_id, note.
- **route_versions** [P1]: id, route_id, version, changed_by, change_kind (`material` | `minor`), changed_fields (array), snapshot (jsonb: full route and stops, including private fields, stored only for the poster org), created_at.
  - Material fields: compensation, job type, category, dates/windows, stop add/remove/reorder, stop addresses, building dimensions, requirements.
- **route_amendments** [P2]: id, route_id, assignment_id, from_version, to_version, summary, status (`pending` | `acknowledged` | `rejected` | `superseded`), requested_by, responded_by, responded_at, response_note. Created when a material change hits a route with an accepted assignment. The change applies to the assignment only once acknowledged.

### Discovery, applications, awards

- **saved_searches** [P2]: id, user_id, org_id, name, filters (jsonb), notify (`none` | `instant` | `daily` | `weekly`), last_notified_at.
- **saved_routes** [P2]: user_id, route_id.
- **applications** [P1]: id, route_id, provider_org_id, submitted_by, status (§3.3), message, proposed_compensation_cents (when compensation_mode = proposals), proposed_basis, availability_note, proposed_crew_id (P2), withdrawn_reason. Unique(route_id, provider_org_id) where status not in (`withdrawn`). **Never locks the route.**
- **application_questions** [P2]: id, application_id, author_user_id, author_org_id, body, created_at. Q&A thread between poster and applicant.
- **awards** [P1]: id, route_id, application_id, provider_org_id, scope_stop_ids (array; whole route = all stops) **(MR split)**, scope_services (array) **(MR separate providers)**, compensation_cents, compensation_basis, status (§3.4), issued_by, issued_at, accept_by, responded_by, responded_at, decline_reason, idempotency_key (unique).
  - Partial unique index: **one `pending` or `accepted` award per (route_id, stop, service)**. In P1 (whole route) this reduces to one active award per route, enforced with `UNIQUE (route_id) WHERE status IN ('pending','accepted') AND scope_is_whole`, plus row lock on the route.

### Assignments and execution

- **assignments** [P1]: id, route_id, award_id (unique), poster_org_id, provider_org_id, status (§3.5), scope_services, accepted_by, accepted_at, compensation_cents (agreed), agreed_version, crew_id (P2), vehicle_id (P2), scheduled_start/end (derived from windows, for conflict checks), cancelled_by_org_id, cancel_reason, completed_at, poster_approved_at.
- **assignment_stops** [P1] **(MR split)**: assignment_id, stop_id, services. A row per stop the assignment covers.
- **assignment_members** [P2]: assignment_id, membership_id, role_on_job (`lead` | `crew`). Drives what free crew members can see.
- **stop_services** [P2]: id, stop_id, service (`delivery` | `installation`), assignment_id **(MR separate providers)**, status (`pending` | `in_progress` | `done` | `failed` | `cancelled`), started_at, completed_at, completed_by.
- **milestones** [P2]: id, assignment_id, stop_id (nullable for pickup), kind (`pickup_confirmed` | `departed` | `arrived` | `delivery_complete` | `install_started` | `install_complete` | `customer_ack` | `stop_skipped`), occurred_at, recorded_by, lat/lng (optional, single point at milestone time; no continuous tracking), note.
- **photos** [P2]: a file with purpose (`before` | `after` | `damage` | `site` | `receipt`), attached to stop/assignment/issue.
- **issues** [P2]: id, assignment_id, stop_id, kind (`damage` | `shortage` | `access` | `weather` | `site_not_ready` | `other`), severity, description, status (`open` | `acknowledged` | `resolved`), reported_by, resolved_by, resolution_note.
- **change_requests** [P2]: id, assignment_id, stop_id, kind (`reschedule` | `scope` | `cancel_stop`), requested_by_org_id, proposed (jsonb), status (`pending` | `accepted` | `rejected` | `withdrawn`), responded_by. An accepted change produces a route version and, where material, an amendment.
- **customer_links** [P2]: id, stop_id, purpose (`appointment_confirm` | `completion_ack`), token_hash, expires_at, used_at, response (jsonb: confirmed / reschedule requested + note / acknowledged + name typed), ip_hash.
- **schedule_conflicts**: computed at assignment and crew-assignment time from overlapping `scheduled_start/end` per crew_id/vehicle_id. Warn, don't block (except the same crew double-assigned: block unless overridden by a dispatcher with a reason, logged).

### Communication

- **threads** [P2]: id, route_id, assignment_id (nullable), application_id (nullable), poster_org_id, provider_org_id.
- **messages** [P2]: id, thread_id, author_user_id, author_org_id, body, file_ids, created_at, edited_at.
- **notifications** [P2]: id, user_id, org_id, kind, payload (jsonb, **must not contain private fields unless the recipient passes §4.3**), read_at, emailed_at, digest_batch_id.
- **notification_preferences** [P2]: user_id, kind, channel (`in_app` | `email` | `push`), mode (`instant` | `daily_digest` | `off`).
- **push_subscriptions** [P3 optional]: user_id, endpoint, keys.

### Reviews, disputes

- **reviews** [P3]: id, assignment_id, reviewer_org_id, reviewee_org_id, rating (1–5), body, status (`published` | `hidden` | `under_review`). Unique(assignment_id, reviewer_org_id). Allowed only when the assignment is `completed`.
- **review_reports** [P3]: id, review_id, reporter_user_id, reason, status, moderator_id, resolution.
- **disputes** [P3]: id, assignment_id, opened_by_org_id, summary, status (`open` | `in_discussion` | `resolved` | `closed`), thread_id.
- **dispute_events** [P3]: dispute_id, actor_user_id, kind, note, file_ids, created_at (resolution history).

### Billing and entitlements

- **plans** [P1 seed, P3 Stripe]: id, code (`provider_monthly` | `provider_annual` | `poster_monthly` | `poster_annual`), audience (`provider` | `poster`), base_price_cents, included_leader_seats, extra_seat_price_cents, interval (`month` | `year`), trial_days, stripe_price_id, stripe_seat_price_id, active. **All numbers here, none in code.**
- **subscriptions** [P1 table, P3 Stripe]: id, org_id (unique per audience), plan_id, status (`none` | `trialing` | `active` | `past_due` | `grace` | `restricted` | `canceled`), trial_ends_at, current_period_end, grace_ends_at, cancel_at_period_end, leader_seat_quantity, stripe_customer_id, stripe_subscription_id, updated_from_event_id.
- **billing_events** [P3]: id, stripe_event_id (unique: idempotency), type, payload, processed_at, error.
- **app_config** [P1]: key, value (jsonb). Grace days, deadlines, link TTLs, upload limits, product name override.

### Files

- **files** [P1]: id, org_id (owner), storage_key, original_name, content_type, size_bytes, sha256, purpose (`route_doc` | `stop_photo` | `assignment_doc` | `qualification_doc` | `portfolio` | `message_attachment` | `milestone_photo` | `issue_photo`), visibility_class (`listing` = visible to anyone who can view the route; `assignment` = only after acceptance per §4.3; `internal` = owner org only; `profile_private` = owner org + platform admin; `profile_public`), route_id, stop_id, assignment_id, uploaded_by, scan_status (`not_scanned` | `clean` | `infected`; scanning is a later option), deleted_at.

### Platform

- **audit_logs** [P1]: id, occurred_at, actor_user_id, actor_org_id, acting_as (`user` | `platform_admin` | `system`), action (e.g. `route.publish`, `award.issue`, `assignment.accept`, `private.view_address`, `file.download`, `invitation.accept`), target_type, target_id, org_ids (array of affected orgs, for scoped views), ip_hash, user_agent, metadata (jsonb). Append-only (no UPDATE/DELETE grants to the app role).
- **jobs** [P1]: id, kind, run_at, payload, status (`queued` | `running` | `done` | `failed`), attempts, last_error, dedupe_key (unique). Processed by cron. Uses `FOR UPDATE SKIP LOCKED`.
- **rate_limits** [P1]: key, window_start, count.
- **data_exports** / **deletion_requests** [P4]: id, org_id / user_id, requested_by, status, file_id, completed_at.
- **suspensions** [P3]: id, target_type (org/user), target_id, reason, by, lifted_at.

## 3. Status machines

Transitions are enforced by one server module (`src/server/domain/transitions.ts`) and checked inside the same transaction that writes the change. Anything not listed is rejected with 409.

### 3.1 Route

| From | To | Who / when |
|---|---|---|
| `draft` | `published` | Poster dispatcher/owner. Validation passes and entitlement `route.publish` granted. |
| `draft` | (soft-deleted) | Poster. |
| `published` | `draft` | Poster, only if no non-withdrawn applications. |
| `published` | `awarding` | Poster issues an award. |
| `published` | `expired` | System, at `expires_at`. |
| `published` | `cancelled` | Poster, with reason. |
| `awarding` | `assigned` | Provider accepts the award. |
| `awarding` | `published` | Award declined, expired or revoked (route reopens; applications intact). |
| `awarding` | `cancelled` | Poster, with reason (award revoked). |
| `assigned` | `in_progress` | First milestone (pickup confirmed, or first stop arrival for installation only). |
| `assigned` | `published` | Assignment cancelled by either side with reason, and poster chooses "reopen". |
| `assigned` | `cancelled` | Assignment cancelled and poster chooses "cancel route". |
| `in_progress` | `pending_review` | All assignment stop services are `done`, `failed` or `cancelled`. |
| `in_progress` | `cancelled` | Either side with reason. Partial completion is preserved. |
| `pending_review` | `completed` | Poster approves completion. |
| `pending_review` | `in_progress` | Poster reopens with an issue. |
| `expired` | `published` | Poster reposts with new deadlines (new version). |

Terminal: `completed`, `cancelled`.

### 3.2 Stop

`pending` → `in_progress` (arrived) → `completed` (all its services done) | `partially_completed` (some services failed or cancelled). Also `pending`/`in_progress` → `rescheduling` (site not ready or change request) → `pending`. Any non-terminal → `cancelled` (stop cancelled via change request, with reason). The status per service lives on `stop_services` (P2). The stop status is derived from it and stored for queries.

### 3.3 Application

| From | To | Who |
|---|---|---|
| `submitted` | `shortlisted` | Poster. |
| `submitted`, `shortlisted` | `declined` | Poster. |
| `submitted`, `shortlisted` | `withdrawn` | Applicant. |
| `submitted`, `shortlisted` | `awarded` | System, when an award is issued on it. |
| `awarded` | `submitted`/`shortlisted` (previous) | System, when that award is declined, expired or revoked. |
| `awarded` | `accepted` | System, when its award is accepted. |
| any open | `not_selected` | System, when the route becomes `assigned` to someone else, or `cancelled`/`expired`. |

`not_selected` reverts to `submitted` if the route reopens to `published`.

### 3.4 Award

`pending` → `accepted` (provider owner/dispatcher, before `accept_by`) | `declined` (provider, with optional reason) | `expired` (system at `accept_by`) | `revoked` (poster, before acceptance). All terminal. A new award needs a new row.

### 3.5 Assignment

`scheduled` (created on acceptance) → `in_progress` (first milestone) → `pending_review` (all services resolved) → `completed` (poster approves). `pending_review` → `in_progress` (reopened). `scheduled`/`in_progress` → `cancelled` (either party, reason required; partial records kept). Assignment status and route status move together in one transaction.

### Concurrency for award and accept

- **Issue award:** `BEGIN; SELECT … FROM routes WHERE id=$1 FOR UPDATE;` check status `published` and that the application is open; insert award (unique partial index is the backstop); set route `awarding`; audit; `COMMIT`. The `idempotency_key` means retries return the existing award.
- **Accept:** `BEGIN; SELECT … FROM awards WHERE id=$1 FOR UPDATE;` then lock the route; check award `pending`, `now() < accept_by`, caller is owner/dispatcher of `award.provider_org_id`; set award `accepted`, create assignment (unique on award_id), set route `assigned`, applications → `accepted`/`not_selected`; audit; `COMMIT`. A second accept sees status `accepted` → 409. A different org can't pass the membership check → 404.

## 4. Tenant isolation and privacy release

### 4.1 Layers

1. **Request context.** Every API call resolves `ctx = { userId, orgId (active membership), role, permissions, platformRole }` from the session. The org comes from the active membership, never from a request parameter the client can set freely.
2. **Policy module** (`src/server/authz/*`). Pure functions, e.g. `canViewRoute(ctx, route)`, `canViewPrivateStop(ctx, stop)`, `canDownloadFile(ctx, file)`. Every route handler calls them. Data access goes through repository functions that take `ctx` and add `org_id`/party filters. No raw table access from handlers (lint rule + review).
3. **Postgres RLS.** The app connects as role `app_user` (not the table owner, so RLS applies). Each request transaction runs `SET LOCAL app.user_id`, `app.org_id`, `app.platform_admin`. Policies:
   - Tenant-owned tables: `org_id = current_setting('app.org_id')::uuid`.
   - Shared tables (applications, awards, assignments, threads, messages): visible to `poster_org_id` or `provider_org_id`.
   - `routes`/`stops` public rows: visible to the owner org, or when `status='published'` and visibility allows the caller (marketplace; or a route_invitations row for the caller's org).
   - `locations`, `stop_contacts`, files with `visibility_class='assignment'`: owner org, or an **accepted** assignment exists covering the stop for the caller's org (§4.3).
   - Platform admin bypass is a separate, audited code path, not a blanket `BYPASSRLS` role.
4. **Responses are shaped server-side.** Discovery serializers only select public columns. Private columns are never fetched for those endpoints, so there is nothing to hide.

Cross-org lookups return **404**, not 403. This avoids confirming that another org's resource exists. Acceptance test 15 accepts either.

> **Verification needed in Step 2:** PGlite supports RLS policies and `SET ROLE`. If anything differs from Neon, the integration tests run the RLS suite against a Neon dev branch as well, and this note is updated.

### 4.2 Role scoping inside an org

| Capability | owner | dispatcher | crew_leader | crew_member | staff |
|---|---|---|---|---|---|
| Manage org, billing, invitations | ✓ | ✓ (no billing) | | | |
| Post/edit routes (poster orgs) | ✓ | ✓ | | | override |
| Browse marketplace, apply | ✓ | ✓ | ✓ | override | override |
| Accept awards | ✓ | ✓ | | | |
| See compensation | ✓ | ✓ | ✓ | override | override |
| See assigned work (itinerary, stops, milestones, messages) | all org work | all org work | all org work | **only assignments they're on** | **only assignments they're on** |
| Record milestones, photos, issues | ✓ | ✓ | ✓ | on their assignments | on their assignments |

"Override" means `memberships.permission_overrides`, which only owner/dispatcher can set, and every change is audited. Compensation is removed from serializers, not just hidden in the UI.

### 4.3 Privacy release rule

`canViewPrivateStop(ctx, stop)` is true if and only if:
- `ctx.orgId = stop.org_id` (poster org; any member except `crew_member`/`staff` without assignment), **or**
- there is an `assignments` row with status in (`scheduled`, `in_progress`, `pending_review`, `completed`) and `provider_org_id = ctx.orgId` and an `assignment_stops` row for this stop, **and** the caller's role is owner/dispatcher/crew_leader, or (from P2) the caller is an `assignment_members` row on it, **or**
- platform admin through the audited admin path.

The same predicate gates: exact pickup location, stop locations, stop contacts, `assignment_notes`, `safety_notes`, files with `visibility_class='assignment'`, exports, and the content of notification/email payloads. Every private read writes an `audit_logs` row (`private.view_address`, `file.download`). After an assignment is cancelled, access is revoked going forward. Already downloaded files can't be recalled, so this is documented as a known limitation.

### 4.4 Files

Upload: the server validates the declared type against magic bytes, an allowlist per purpose (images: jpeg/png/webp/heic; docs: pdf), and a per-purpose size cap (config, default 15 MB images / 25 MB PDFs). The key is random (`org/<uuid>/<uuid>`), never the original filename. Download: `GET /api/files/:id` → policy check → audit → 302 to a presigned URL valid for 15 minutes (local adapter: HMAC-signed URL with the same expiry).

## 5. Entitlements

`entitlements.check(orgId, feature)` reads `subscriptions` (+ `plans`, `app_config`) and returns `{ allowed, reason }`. Features:

| Feature | trialing / active | past_due / grace | restricted / canceled / none |
|---|---|---|---|
| `route.publish`, `route.award` (poster) | ✓ | ✓ (with banner) | ✗ |
| `marketplace.browse`, `application.submit`, `saved_search.*` (provider) | ✓ | ✓ (with banner) | ✗ |
| `award.accept` | ✓ | ✓ | ✗ (open question: invitation routes from the inviting poster) |
| `assignment.execute` (milestones, photos, issues, completion) | ✓ | ✓ | **✓ for assignments already accepted** |
| `messages.active_assignment` | ✓ | ✓ | **✓** |
| `history.read`, `org.export` | ✓ | ✓ | **✓** |
| Leader seats above quantity | n/a | n/a | Extra leader memberships can't be added. Existing ones keep access during grace, then need seats bought or a role change. |

`past_due` → `grace` (on first failed payment, `grace_ends_at = now + grace_days`) → `restricted` (cron, when grace ends). Any successful payment → `active`. In Phase 1, `subscriptions` rows are created as `trialing` with config-driven trial lengths and are flipped by an admin/dev tool. In Phase 3, the Stripe webhook handler becomes the only writer (except the admin override, which is audited).

## 6. Background jobs (cron)

`/api/cron/tick` (every 5 min) runs due rows from `jobs` and these sweepers, all idempotent through `dedupe_key`: award expiry, route/application deadline expiry, grace-to-restricted transitions, document expiration reminders (30/14/3 days before, and on expiry), daily/weekly digests, customer-link expiry. The cron endpoint requires `CRON_SECRET`.

## 7. Repository layout (planned)

```
src/
  app/                 Next.js routes (UI + /api)
  server/
    db/                drizzle schema, migrations, client (pglite | neon)
    authz/             policy functions
    domain/            routes, applications, awards, assignments, transitions
    adapters/          email, storage, billing, maps (real + local)
    jobs/              cron handlers
    audit.ts
  components/
tests/
  integration/         vitest against PGlite
  e2e/                 playwright (desktop + mobile viewport)
scripts/               seed-demo, reset-dev
docs/
```
