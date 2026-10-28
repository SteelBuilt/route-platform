# Product Brief: Building-Industry Logistics and Installation Platform

Help me refine, build, test, and prepare to publish a complete subscription-based logistics and installation platform for the building industry.

Do not stop at a proposal, wireframe, frontend demo, or scaffolding. The goal is a functioning application with a real backend, database, authentication, subscriptions, permissions, operational workflows, tests, and deployment documentation.

Ask questions only when an answer materially affects the business model, creates an irreversible commitment, or blocks implementation. Pacing and stopping points are set by the phase prompts and Section 22.

## 1. Product concept

Build a web and mobile-friendly platform connecting building manufacturers, suppliers, and dealers with qualified delivery providers and installation crews.

The marketplace has some similarities to uShip, but our business model is flat monthly subscriptions with zero platform commissions on job values.

Companies can post individual jobs or multi-stop routes weeks in advance. Qualified providers can discover opportunities, express interest, submit proposals where allowed, and receive route awards.

The platform should also be useful for companies managing crews they already work with. It must deliver ongoing operational value even when no new marketplace connection is needed.

Use a configurable working product name until a final name is selected. Do not use any existing dealer's branding; this is intended to serve the broader industry.

Initial market: United States.

## 2. Product assessment

Provide a concise assessment covering:

- Improvements to this brief.
- Missing workflows and likely operational problems.
- Features most likely to improve activation, repeat use, and retention.
- Marketplace cold-start strategy.
- Whether the subscription prices can support expected infrastructure, support, mapping, messaging, and payment-processing costs.
- Recommended launch scope versus later enhancements.
- Your recommended technical architecture and why it fits.
- Assumptions that require eventual business-owner confirmation.

Do not change our core subscription-only, zero-commission model without approval. Make pricing configurable.

## 3. Building categories and job types

Treat category and service type as separate dimensions.

Initial building categories:

1. Portable buildings and sheds.
2. Tube-steel metal buildings.
3. Red-iron / rigid-frame steel buildings.
4. Other building systems, with administrator-managed categories.

"Metal buildings" can be an umbrella navigation category rather than a confusing duplicate of tube steel and red iron.

Supported job types:

- Delivery only.
- Installation / erection only.
- Delivery and installation.

Portable buildings should default to delivery only for launch. Tube-steel and red-iron jobs may be delivery only, installation only, or combined.

For combined jobs, allow one qualified provider to perform both services initially. Structure the data so separate delivery and installation assignments can be added later without redesigning the entire system.

Support single-stop jobs and multi-stop routes.

## 4. Accounts, organizations, and permissions

Support organization accounts with individual user logins.

Organization types:

- Manufacturer, supplier, or dealer posting work.
- Installation company or independent crew.
- Delivery / transport company.
- Combined delivery and installation provider.

A provider may have multiple crews, drivers, vehicles, and service capabilities.

Roles should include:

- Organization owner.
- Administrator / dispatcher.
- Crew leader / driver.
- Staff member with limited permissions.
- Platform administrator.

Use role-based permissions and strict organization-level data isolation. Never use shared account credentials as the team-access model.

Companies should be able to invite their existing crews and maintain a preferred-provider network.

For launch, customers receiving buildings do not need full marketplace accounts. Use secure, expiring customer links for appointment confirmation and completion acknowledgment.

## 5. Subscription model

Pricing is defined in Section 19. Zero platform commission or percentage fee on jobs.

Implement:

- Subscription checkout.
- Customer billing portal.
- Subscription status and entitlement checks.
- Webhook verification and idempotent processing.
- Trial support.
- Cancellation and reactivation.
- Failed-payment grace periods.
- Configurable prices and plans.

The platform processes subscription payments only at launch. Manufacturers and providers arrange payment for delivery or installation directly.

Do not implement escrow, job-payment processing, or payouts unless separately approved.

Loss of a subscription must not unexpectedly hide active job instructions or prevent completion of an already-awarded route. Define a sensible restricted-access policy.

## 6. Posting jobs and routes

Allow draft, published, and reusable route templates.

Each route should support:

- Building category and job type.
- Origin / pickup location.
- Ordered stops using ZIP codes for public discovery.
- Pickup date or pickup window.
- Delivery and installation windows per stop.
- Estimated duration and crew requirements.
- Published compensation and its basis: total route, per stop, or another explicit unit.
- Whether compensation is fixed or proposals are accepted.
- Required equipment, qualifications, and documents.
- Loading responsibility and unloading responsibility.
- Manufacturer-provided files and instructions.
- Internal notes separate from provider-visible notes.
- Visibility: marketplace, preferred providers, or invitation only.
- Application deadline and route expiration.
- Version history for material changes.

Avoid a rigid date model that cannot handle real scheduling. Require a pickup window for delivery jobs; installation-only jobs should not require an irrelevant pickup date.

Per-stop information should include, where applicable:

- Building width, length, and height.
- Building system and manufacturer.
- Doors, windows, framed openings, lean-tos, and other relevant details.
- Packaged load dimensions, weight, and piece count.
- Site access and unloading constraints.
- Ground, gravel, concrete, asphalt, or other installation surface.
- Equipment requirements.
- Site photos and readiness status.
- Plans, permits, and engineering status.
- Customer availability and appointment window.
- Relevant safety or access notes.

Do not assume engineering requirements, wind/snow loads, or site requirements are the same across manufacturers.

Support draft saving and duplication of previous jobs.

## 7. Privacy and information release

Before assignment, show only the approximate origin, stop ZIP codes, scope, schedule, compensation, and qualification requirements needed to evaluate a route.

After an award is accepted, release exact addresses, authorized contact details, and assignment-specific documents only to the appropriate organization members.

Protect sensitive information in backend authorization rules, APIs, file storage, exports, and notifications. Hiding it in the interface alone is insufficient.

Record access and material actions in an audit trail.

## 8. Discovery, applications, and awards

Providers should browse a useful list view and map view with filters for:

- Building category.
- Job type.
- Region, state, ZIP, and distance.
- Pickup and service dates.
- Route compensation.
- Equipment and qualifications.
- Single-stop versus multi-stop work.

Support saved searches and saved opportunities.

Use clear terminology:

- "Express interest" or "Apply" before selection.
- "Award" when the posting company selects a provider.
- "Accept assignment" when the provider confirms.

Submitting an application must not automatically reserve or lock the route.

Manufacturers should compare qualified applicants, review profiles, ask questions, and issue an award with an acceptance deadline.

Prevent simultaneous awards and double booking through transactional backend logic. Warn about overlapping assignments for the same crew or vehicle.

Material changes to price, scope, or dates after acceptance must require acknowledgment or reconfirmation. Do not silently modify an accepted agreement.

Keep whole-route awards as the initial default. Leave a clean path for split-route awards later.

## 9. Provider profiles and qualifications

Profiles should support:

- Organization identity and contact information.
- Service regions.
- Building systems and services supported.
- Crew size and experience.
- Equipment, vehicles, and trailer capabilities.
- Portfolio photos.
- Insurance and other relevant documents with expiration dates.
- Completed platform jobs.
- Reviews tied to verified completed assignments.
- Availability and preferred scheduling.

Make verification badges precise. Distinguish self-reported information, document submission, and administrator review. Never imply that uploading a document proves licensing, insurance coverage, or background-check clearance.

Allow administrators to review, approve, reject, suspend, and request updated documents.

Do not expose private qualification documents publicly.

## 10. Route execution

Build a practical mobile-first workflow for dispatchers, drivers, and crew leaders.

Include:

- Assignment calendar and route itinerary.
- Pickup confirmation.
- Per-stop progress.
- Arrival and completion timestamps.
- Delivery and installation completion tracked separately when applicable.
- Before-and-after photos.
- Delivery receipts and completion acknowledgment.
- Damage, shortage, access, weather, and site-readiness issue reports.
- Change requests and rescheduling.
- Cancellation with reason.
- Completion review by the posting company.
- Downloadable route / job summary.

Define valid status transitions and enforce them on the backend.

Let users manually reorder stops. If mapping credentials are available, provide estimated mileage and travel time. Do not claim truck-safe routing, permit compliance, or oversize-load suitability unless an appropriate service actually supports those claims.

Prefer milestone updates for launch over continuous GPS tracking.

## 11. Communication and retention

Retention should come from useful recurring workflows (preferred providers, rebooking, templates, calendars, saved searches, completion records, dashboards, reporting described elsewhere in this brief), not artificial restrictions on direct business relationships.

Additionally prioritize:

- Job-specific communication.
- Insurance/document expiration reminders.
- Schedule-conflict warnings.
- Searchable assignment history.

Implement in-app notifications and email first. Add push notifications if supported cleanly. SMS is out of scope for launch (Section 21).

Users need notification preferences and digest options to prevent alert fatigue.

Basic communication should remain available for active assignments even when discovery access is restricted.

## 12. Reviews, disputes, and administration

Implement reviews only for completed assignments, with a reporting and moderation process.

Provide an admin console for:

- Organizations and users.
- Qualification review.
- Listings and assignments.
- Subscriptions and entitlements.
- Category management.
- Reports, disputes, and suspensions.
- Audit logs.
- Basic marketplace and retention metrics.

Job disputes should support issue records, photos, messages, and a resolution history. Do not imply the platform guarantees workmanship, insures shipments, or arbitrates legal liability.

Draft appropriate terms, privacy, cancellation, and platform-role pages for business/legal review before launch. Do not present generated policies as legally approved.

## 13. Technical approach

For this new project, choose a mature, maintainable stack that supports:

- Responsive web application.
- Installable PWA.
- Relational database.
- Authentication.
- Organization-level authorization.
- Private file storage.
- Subscription billing.
- Email delivery.
- Background jobs and scheduled reminders.
- Error monitoring.
- Automated testing.
- Straightforward deployment.

A mobile-first PWA is the launch target. Clearly distinguish a PWA from native iOS and Android applications. Do not claim App Store readiness.

Use service adapters and environment variables for external integrations. Never fabricate credentials or quietly substitute fake successful responses.

## 14. Design expectations

- Large touch targets and readable, high-contrast typography for crews using phones in the field.
- Clear routes, dates, compensation, and next actions.
- Separate dashboards appropriate to each role.
- Good loading, empty, offline, and error states.
- Short onboarding: a company can post its first route and a provider can find relevant work quickly.
- Realistic sample data only in a clearly labeled demo environment. Production must not appear populated by fabricated customers, reviews, or completed jobs.

## 15. Security and reliability

Implement and test:

- Server-side authorization and tenant isolation.
- Secure invitation flows.
- Private file access with expiring links.
- Upload validation and size limits.
- Rate limiting on sensitive endpoints.
- Validated webhook signatures.
- Idempotent billing and award actions.
- Timezone-aware scheduling.
- Transaction-safe route awards.
- Secrets management.
- Backups and migration procedures.
- Structured logs and error reporting.

Do not collect unnecessary sensitive personal information.

## 16. Delivery and implementation process

Maintain:

- Product requirements.
- Architecture and data model.
- Implementation checklist.
- Environment-variable example.
- Database migrations.
- Demo seed data.
- Setup and deployment instructions.
- Known limitations and launch blockers.

Build real vertical workflows early, rather than completing every screen before connecting the backend.

If external credentials are unavailable, implement the integration correctly, provide a clearly labeled local development mode, and document the exact remaining setup steps.

Do not leave core workflows as placeholder buttons, static pages, or unexplained TODOs.

## 17. Acceptance tests

Verify at least these end-to-end flows:

1. A posting company signs up, subscribes, creates a route, and publishes it.
2. A provider signs up, completes a profile, and applies.
3. The posting company reviews applicants and awards the route.
4. The provider accepts; authorized assignment details become available.
5. Another applicant cannot accept the same assignment.
6. An unauthorized account cannot retrieve private addresses or documents.
7. A crew completes pickup and each relevant delivery / installation milestone.
8. The posting company reviews completion and leaves an eligible review.
9. A material scope change requires acknowledgment.
10. Cancellation and rescheduling update the calendar and notify affected users.
11. Subscription webhooks update access correctly, including failed-payment handling.
12. Existing assignments remain operational under the defined subscription restriction policy.
13. Multiple crews can be scheduled without assigning overlapping work to the same crew.
14. The main workflows function on mobile screen sizes.

Run appropriate automated tests, production builds, and browser verification. Report what was actually tested and any failures or limitations.

## 18. Publishing preparation (Phase 4)

Prepare the application for a real production launch, including:

- Deployment configuration.
- Production environment-variable checklist.
- Database migration and backup instructions.
- Domain and HTTPS setup steps.
- Billing test-to-live transition checklist.
- Email sender setup.
- Monitoring and error reporting.
- Basic SEO and social metadata.
- PWA icons and manifest.
- Support/contact configuration.
- Policy pages requiring owner review.
- Rollback procedure.
- A concise launch runbook.

Obtain approval before publicly launching, purchasing services, enabling live billing, or making other external financial commitments.

Do not call the app production-ready merely because it compiles. State precisely what is working, what has been verified, and what still blocks launch.

## 19. Business decisions (confirmed by owner)

- Provider pricing: $15/month per provider organization, including 3 leader seats (owner, administrator/dispatcher, crew leader/driver). Each additional leader seat is $5/month. Billed as ONE subscription per org with seat quantity, never one charge per seat.
- Crew members and limited staff are free. Their access is limited to work assigned to them: itinerary, stop details, milestones, photos, issue reports, and messages for their assignments. They cannot browse, apply, or see compensation unless an org admin grants it.
- Posting organizations: $100/month flat, unlimited users.
- Trials: 30 days for providers, 14 days for posters. Annual plans at 10x monthly.
- All prices, seat counts, and trial lengths are configuration, not code.
- Zero commission. No escrow, job payments, or payouts.

## 20. Launch context

- First posting customer: an existing metal building dealer operating in TX, OK, AR, LA, MO, MS, and KS. It uses a normal customer account with no special privileges. Do not reference it by name in code, seed data, or branding.
- Launch seeding region: Texas first, then the other six states. Discovery works nationwide.
- The owner is not a full-time developer. Favor managed services and low operational overhead over flexibility. Avoid self-managed servers, queues, or containers unless there is no managed alternative.
- Monthly infrastructure budget for launch: [FILL IN]
- Accounts already available: [FILL IN — Stripe, domain, email provider, GitHub]
- Working product name: [FILL IN, or use a configurable placeholder]

## 21. Not in launch scope

Do not build these. Keep the data model ready for the ones marked (model-ready).

- Native iOS/Android apps (PWA only).
- SMS notifications.
- Continuous GPS tracking (milestone updates only).
- Split-route awards (model-ready).
- Separate delivery and installation providers on one job (model-ready).
- Truck-safe, oversize, or permit routing.
- Escrow, job payments, payouts, invoicing between users.
- AI features of any kind.
- Public API or third-party integrations beyond those named in this brief.

## 22. Working rules for every session

- At the start of every session, read CLAUDE.md, docs/PRODUCT_BRIEF.md, and docs/PROGRESS.md before doing anything.
- Work only inside this project folder. Never modify files outside it.
- Keep CLAUDE.md current with the stack, commands, conventions, and standing rules from this brief.
- Keep docs/PROGRESS.md current: phase checklist, decisions made and why, open questions for the owner, known failures. Update it before ending any session.
- Use git. One branch per phase. Commit after each working slice with a clear message. Never commit secrets.
- Never mark a checklist item done while its tests fail or while it is untested.
- When a phase prompt says STOP, stop and report. Do not continue to the next step.
- Do not build anything from a later phase early, except data model fields that avoid a later migration.
- Open questions go in PROGRESS.md and in your report. Do not silently assume.

## 23. Additional acceptance tests

15. A direct API request for another organization's job, stop address, file, or message returns 403 or 404, for every role.
16. A free crew-member login can see only its assigned work and cannot browse, apply, or see compensation by default.
17. A document-expiration reminder is produced by the scheduled job, not only by a manual trigger.
18. Account deletion and organization data export work and are logged.
