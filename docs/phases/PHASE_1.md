# PHASE 1: Assessment, foundation, core marketplace

Saved from the owner's Phase 1 start message for reference in later sessions.

Follow Section 22 of the brief (working rules) throughout.

## Step 1 — Assessment and plan, then STOP

Write docs/ASSESSMENT.md covering the items in Section 2 of the brief. Keep it concise. Use the confirmed decisions in Sections 19–21; do not re-argue them. Include a short cost check: estimated monthly infrastructure cost at 10, 100, and 500 paying orgs versus revenue at the Section 19 prices.

Write docs/ARCHITECTURE.md:

- Chosen stack, each choice in one or two lines, favoring managed services per Section 20.
- Full data model for ALL four phases (entities, key fields, relationships), including the model-ready items in Section 21, so later phases add features without redesigning tables.
- Route, stop, application, award, and assignment status machines with every valid transition.
- How tenant isolation and the Section 7 privacy release are enforced at the database/API layer, not the UI.
- How subscription entitlements are checked (an entitlement service backed by a subscription-status table; Stripe is wired up in Phase 3).

Write docs/PROGRESS.md with a checklist for all four phases (detailed for Phase 1, outline for 2–4), and list open questions for the owner, including any [FILL IN] items in Section 20 that are still blank.

Create CLAUDE.md, initialize git, and commit.

STOP. Report the stack, the top 5 assessment findings, the estimated monthly cost, and the open questions. Wait for my approval before writing app code.

## Step 2 — Foundation (after approval)

- Project scaffold, database, migrations, environment-variable example, local development setup with one command.
- Authentication. Organizations with the Section 4 org types and roles, including the free crew-member role from Section 19.
- Secure, expiring email invitations to join an org.
- Tenant isolation enforced server-side, with automated tests.
- Audit log for material actions.
- Admin-managed building categories and job types (Section 3).
- Automated test setup and a CI-ready test command.

## Step 3 — Core marketplace vertical slice

Build these as real, working, connected flows (no placeholder screens):

- Route posting (Section 6): draft, publish, duplicate, reusable templates, ordered stops, pickup windows, per-stop details, compensation and its basis, visibility (marketplace / preferred / invitation only), deadlines, internal vs provider-visible notes, version history for material changes.
- Basic provider profile (service regions, systems, services, crew size). Documents and verification come in Phase 3.
- Discovery list view with filters for category, job type, state/ZIP/distance, dates, compensation, and single vs multi-stop. Map view comes in Phase 2.
- Apply / express interest. Applying never locks the route.
- Applicant comparison and award with an acceptance deadline.
- Accept assignment, with transaction-safe logic preventing double awards and double acceptance.
- Privacy release (Section 7): exact addresses, contacts, and assignment files released only after acceptance, only to authorized members, enforced in the API and file access.
- Private file storage with expiring links, upload type and size validation.
- Clearly labeled demo seed data, separate from production.

Write tests for brief acceptance tests 2, 3, 4, 5, 6, and 15 (subscription steps in test 1 are deferred to Phase 3; test the rest of test 1).

Commit after each working slice. Verify on a mobile viewport in a browser.

STOP. Report: what works end to end, test results (pass/fail counts), what was verified in a browser, anything failing or skipped, and open questions. Update PROGRESS.md before stopping.
