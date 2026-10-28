# Product Assessment

Phase 1, Step 1. Written against `docs/PRODUCT_BRIEF.md`. The decisions in Sections 19–21 are taken as given and are not re-argued here.

## 1. Improvements to the brief

1. **Is a subscription needed to work for the poster who invited you?** (Section 19 doesn't say.) A dealer that brings its own crews will expect them to accept invite-only routes without each crew company paying $15 first. If they do have to pay, onboarding the first dealer gets harder. *Recommendation:* a provider org with no paid plan can accept and execute **invitation-only / preferred** routes from posters that invited it. Marketplace browsing, applying and saved searches need a paid plan. This is listed as an open question and is not built until you confirm it.
2. **Name the free roles.** Section 4 lists five roles. Section 19 adds "crew member" and makes "limited staff" free. The model uses: `owner`, `dispatcher` (administrator/dispatcher), `crew_leader` (crew leader/driver) as paid leader seats, and `crew_member` and `staff` as free. The org admin can grant `crew_member`/`staff` extra permissions, such as seeing compensation.
3. **Say exactly what "approximate origin" means.** The proposal is city + state + 3-digit ZIP prefix, shown as a ~10-mile circle on the map. Before acceptance, the exact pickup address is treated as private, just like stop addresses.
4. **Define the restricted-access policy now, so later phases follow it.** See ARCHITECTURE §5. In short: losing a subscription blocks *new* commitments (publishing, applying, awarding, discovery). It never blocks *existing* ones (executing, messaging, completing, exporting history).
5. **Default timing values**, all stored as config: award acceptance deadline 24 h, failed-payment grace period 7 days, expiring links 15 min for files, invitations 7 days, customer links 14 days.
6. **What happens after acceptance when things go wrong.** The brief covers the happy path. It also needs: provider withdraws after accepting, provider no-show, re-award to the runner-up, and partial completion of a multi-stop route.
7. **Two-way reviews.** Providers should also review posters. Unreliable posters (sites not ready, late changes) are the biggest churn driver on the provider side.

## 2. Missing workflows and likely operational problems

- **Withdrawal and no-show after acceptance.** The route reopens to the previous applicants (one click: "re-award to next applicant") and the reason is recorded. It is visible to the poster only as a reliability signal, never as a penalty.
- **Site not ready on arrival.** This is the most common real-world failure for metal building installs. It needs a fast "site not ready" issue with a photo that moves the stop to *rescheduling* without failing the whole route.
- **Partial completion.** A multi-stop route where stop 3 can't be done: complete the others, then reschedule or cancel stop 3 separately. The model tracks status per stop and per service.
- **Document expires mid-assignment.** Insurance lapses after acceptance: warn both parties and don't silently cancel.
- **Customer reschedule.** The customer link must let the end customer say "the date doesn't work". That raises a change request for the poster, not a direct change.
- **Timezones.** All seven launch states are mostly Central, but El Paso (TX) is Mountain and so are a few western KS counties. Every location stores its own IANA timezone, and windows are stored as UTC ranges plus that zone.
- **Duplicate posting across dealers.** The same building may be posted by the manufacturer and the dealer. This isn't solvable in v1. Add it to known limitations.
- **Support load.** Providers with low tech comfort will need help logging in. Passwordless email links reduce that. Invitation-based onboarding means the dealer's dispatcher does most of the setup.

## 3. Activation, repeat use and retention

Ranked by expected impact:

1. **"Bring your own crews" first.** A dealer can invite its existing crews and dispatch invite-only routes in the first session, even with zero marketplace supply. Only this gives day-one value.
2. **Route templates and "duplicate last route".** Dealers post similar routes weekly.
3. **Crew-facing mobile itinerary.** If drivers use it daily (milestones, photos), dispatchers stop calling, and that is the daily-use loop.
4. **Completion records with photos and receipts.** These are the dealer's proof of delivery when the end customer disputes something. This is the hardest feature to replace with a spreadsheet.
5. **Preferred-provider network plus rebooking.**
6. **Saved searches with digest emails** on the provider side.
7. **Document expiration reminders.** These are useful to providers on their own, and they bring providers back to the app.

## 4. Marketplace cold start

- **The demand side is one dealer in seven states.** Seed supply by having that dealer invite the crews it already uses. Each invited crew gets a profile on the platform as a side effect.
- **Texas first.** Recruit providers in the dealer's densest Texas corridors before opening other states. Discovery stays nationwide, but outreach is regional.
- **Make empty states honest and useful:** "No marketplace routes near you yet; set a saved search and we'll email you." Don't fake activity (Section 14).
- **Make marketplace visibility the default for overflow.** When a dealer's preferred crews don't accept within the deadline, offer "post to marketplace" in one click.
- **Free trials (30 days for providers)** let crews try the marketplace with no risk. See the open question about invited providers.

## 5. Can the prices cover costs?

Assumptions: 20% of orgs are posters at $100. 80% are providers averaging $16.50 (0.3 extra seats). All billing is monthly. Stripe fees are 2.9% + $0.30 per charge plus 0.7% Stripe Billing, which comes to about **$0.84 on $15 (5.6%)** and **$3.90 on $100 (3.9%)**. Vendor prices are list prices as I last knew them and must be re-checked before committing.

| | 10 orgs | 100 orgs | 500 orgs |
|---|---|---|---|
| Monthly revenue | ~$330 | ~$3,300 | ~$16,600 |
| Hosting (Vercel Pro) | $20 | $20–40 | $60–100 |
| Database (Neon) | $5–20 | $20–40 | $70–150 |
| Email (Resend) | $0 | $20 | $20–90 |
| File storage (Cloudflare R2) | $0 | ~$5 | $15–30 |
| Error monitoring (Sentry) | $0 | $26 | $26–80 |
| Maps/geocoding (Mapbox, Phase 2) | $0 | $0–25 | $50–150 |
| Domain | ~$2 | ~$2 | ~$2 |
| **Infrastructure subtotal** | **~$30–45** | **~$95–160** | **~$245–600** |
| Stripe fees | ~$15 | ~$150 | ~$750 |
| **Total cost** | **~$45–60** | **~$245–310** | **~$1,000–1,350** |
| **Cost as % of revenue** | **~15%** | **~8–9%** | **~6–8%** |

Conclusions:

- **The prices cover infrastructure comfortably at every scale.** At 10 orgs the fixed costs dominate, but the amount is small (~$50/month).
- **Stripe is the largest cost line**, and it falls hardest on the $15 plan. Annual plans (10× monthly) cut the fixed $0.30 from 12 charges to 1. Promote annual billing to providers.
- **Human support is the real cost risk**, not infrastructure. A $15/month customer who needs one 20-minute support call a month is unprofitable. That makes self-serve onboarding and invite-driven setup business requirements, not polish.
- SMS is out of scope, which removes the most volatile messaging cost.

## 6. Launch scope vs later

**Launch (Phases 1–4):** everything in the brief except Section 21. The order follows the phase prompts. Phase 1 builds the foundation and the core marketplace slice (post → discover → apply → award → accept → private release).

**Defer even within scope if time is short** (all can follow launch without schema changes): push notifications, digest options beyond daily, map view clustering, downloadable PDF summaries (start with a printable HTML page), two-way reviews (provider → poster).

**Later:** split-route awards, separate delivery/installation providers (both model-ready), truck-safe routing, native apps, SMS, duplicate-listing detection, public API.

## 7. Recommended architecture (summary; details in ARCHITECTURE.md)

**Next.js (TypeScript) on Vercel, Postgres on Neon, Drizzle ORM, Better Auth, Cloudflare R2, Resend, Stripe, Sentry.**

- Every piece is a managed service with a free or low entry tier. There are no servers, containers or queues to run (Section 20).
- One language, TypeScript, across the UI, API and tests. One deploy target.
- Postgres row-level security is the backstop behind the app-layer authorization checks. A missed check in a route handler still can't leak another org's data.
- Local development runs on **PGlite** (Postgres compiled to WebAssembly, run in-process), so `npm install && npm run dev` works with no database install or Docker. Tests use the same engine.

## 8. Assumptions needing owner confirmation

See the open questions in `docs/PROGRESS.md`. The ones that affect the business model:

1. Invited providers working for the poster who invited them: free or paid? (§1.1)
2. An org that both posts and provides (a dealer with in-house crews): one subscription or two?
3. Which roles count as paid leader seats (§1.2).
4. Default deadlines and grace period (§1.5).
5. Precision of "approximate origin" (§1.3).
6. Two-way reviews (§1.7).
