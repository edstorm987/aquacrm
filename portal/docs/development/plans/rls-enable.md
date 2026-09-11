# Plan — Database Row-Level Security  🟠 mostly done; service-role reduction remains

← [todo.md](../TODO.md) · [development.md](../../development.md)

**Status: BUILDING — phases 1, 2, 3 and 5 are done; phase 4 remains. The
2026-09-03 alignment record says the Inbox and `brand_enquiries` migrations
were applied live and verified. Since that checkpoint, four repository
versions have accumulated beyond the last verified live set: `20260903130000`,
`20260908210000`, `20260908220000`, and `20260910010000`. They remain
owner-gated; the current security lanes did not apply or verify them live.**

This plan was written around "RLS is not in the repo". It is. The policies live
in **[`../../../../supabase/migrations/`](../../../../supabase/README.md)** — a
standard Supabase CLI project sitting beside `portal/`, linked to project ref
`dghzbsxbdatskserctgt`, the same ref `NEXT_PUBLIC_SUPABASE_URL` points at.
The repository now contains 31 ordered migrations defining the schema,
policies, grants, bucket ACLs and database functions.

The reason nobody found them is worth recording, because it will happen again:
**`portal/` is the deploy unit, so it reads like the whole repo.** It is not.
Nothing inside `portal/` referenced the migrations directory, so an audit scoped
to `portal/` correctly found no SQL and wrongly concluded none existed. Both
`docs/workspace/database.md` and this plan asserted that for weeks, and a work
lane was briefed on it. That link is now made from three places, one of which is
executable: `scripts/smoke-rls-policy-coverage.test.ts`.

## What is actually true (verified 2026-08-20)

**Written down, and matching the live project.** RLS is enabled on every table
the app touches. Policies are built on two `security definer` helpers with a
pinned `search_path` (`current_profile_role()`, `is_internal_user()`). A
read-only probe with the public anon key, compared against service-role,
confirms it: `brand_enquiries` (35 rows → anon sees 0), `profiles`,
`app_datastores`, `website_consent_events` all filter to nothing;
`app_datastore_history` denies outright with `42501` because its grants are
revoked, not merely policied. `brands`, `shoots` and `shoot_photos` are
anon-readable **by design** — public website content, no PII. The denial
*styles* differ exactly where the SQL says they should, which is good evidence
the migrations are the live source of truth rather than a parallel fiction.

**The posture, stated honestly.** In `src/` there are **26**
`createSupabaseAdminClient()` call sites and **14** files referencing
`SUPABASE_SERVICE_ROLE_KEY`. Against that, **exactly one** table read in the
entire portal uses the anon key: `profiles`, in `api/auth/login`. So RLS today
protects the anon surface and nothing else. **It is defence-in-depth. It is not
tenant isolation, and it must not be sold as such.**

## The gaps that remain

1. **Reconcile and apply the four owner-gated migrations safely.** The former
   dashboard-only `rls_auto_enable()` definition and trigger are now captured
   in `20260903130000_ensure_rls_event_trigger.sql`. At the 2026-09-03
   checkpoint it was the sole pending migration and was a no-op on live. It is
   now the first of four expected local-only versions, followed by the two
   containment migrations and public-bucket hardening. Before any approved
   push, run a read-only `supabase migration list --linked` and
   `supabase db push --linked --dry-run`; abort if the delta is not exactly
   those four versions. Take a fresh backup and obtain explicit owner approval
   before the real push.

2. **Reduce service-role reliance and re-prove the live boundary.** Admin
   clients bypass RLS, so their tenant filters remain application controls.
   Phase 4 is the substantive open engineering phase. A current live policy,
   grant and two-tenant acceptance run remains separate from the dated
   2026-09-03 application evidence.

3. **Decide the unused first-cut tables.** `clients`, `client_portals`,
   `client_portal_members` and `audit_events` exist but are queried by no portal
   code. Classify them as retained schema or retirement candidates.

### Applied migration record

`20260820150000_brand_enquiries_agency_scope.sql` adds the real tenant column,
backfill, trigger, profile scope and agency-aware policy. The 2026-09-03 live
application record verified the column/trigger and a 52/52-row backfill. The
master Inbox migration was applied in the same operation and its tables and
functions were present. Compatibility fallbacks remain in code for older or
partially migrated environments.

   **App-level isolation now closes this at the code layer too (2026-08-20),** so
   the table is not exposed cross-tenant during the pre-migration window (when RLS
   is inert because `profiles.agency_id` is unpopulated). New guard
   `src/lib/supabase/ownedEnquiry.ts` (`loadOwnedEnquiry` / `pickTenantOwnedEnquiry`,
   owning by `agency_id` else `metadata.agencyId`) is loaded by every
   website-enquiries route (`erase`, `classification`, `status`, `reply`, `lead`,
   `communications`, `calls`, `calls/recording[/content]`) and by `form-capture`'s
   admin-client matcher. `provisionSupabaseIdentity` now stamps `profiles.agency_id`
   (retry-without-column pre-migration) from the callers that know the agency, so
   applying the migration flips RLS from inert to enforcing with no further code
   change. Proof: `scripts/smoke-enquiry-tenant-isolation.test.ts`.

Secondary: `clients`, `client_portals`, `client_portal_members` and
`audit_events` exist, are policed, are empty, and are queried by no portal code
at all. Superseded first-cut model, or unfinished? Decide and record it.

## Phases

> **Ticks reconciled 2026-09-08.** Phases 1, 2 and 5 were only ever marked done
> in the Status line and in strikethrough prose, which the board's phase parser
> does not read — so a plan the Status line calls "mostly done" rendered `0/5`.
> They carry ✅ leads, and phase 3 is now also marked complete from the verified
> 2026-09-03 application record. Phase 4 landed only its *first* reduction
> (23 → 13 service-role call sites), and the 2026-09-10 removal of the dormant
> remote public-media provider reduced the current posture to 12. It is still
> genuinely open. Verified
> 2026-08-31 that phase 5's two halves exist —
> [`supabase/rls-verify.sql`](../../../../supabase/rls-verify.sql) and
> `portal/scripts/smoke-rls-policy-coverage.test.ts` — and that phase 4's pin,
> `portal/scripts/smoke-service-role-usage.test.ts`, exists too. **Not
> archivable** while phase 4 and the current live re-verification remain open.

1. ✅ **Audit isolation per table.** Done — see
   [`database.md`](../../workspace/database.md) §2 and the table in
   [`../../../../supabase/README.md`](../../../../supabase/README.md).
2. ✅ **Author RLS as in-repo SQL migrations.** Already done, before this plan
   was written. The work that was actually missing was making it *findable* and
   *checkable* from `portal/`, which is now done.
3. ✅ **Add and apply `brand_enquiries.agency_id`.** Applied and verified in the
   2026-09-03 alignment operation; a current live re-probe remains part of the
   release gate, not unfinished migration authorship.
4. **Reduce service-role reliance where feasible** — **first reduction landed
   2026-08-20.** Measured by grep for `createSupabaseAdminClient(` in `src/`,
   excluding its definition file (`src/lib/supabase/admin.ts`): **before 23
   call sites in 18 files → current 12 call sites in 8 files.** The first
   reduction reached 13; the server-mediated enquiry boundary then added one,
   and removal of the unsafe dormant remote public-media provider removed two
   on 2026-09-10. The current count is
   pinned in `scripts/smoke-service-role-usage.test.ts`, which fails on any
   drift and demands the table below stay in step.

   **What made the conversion safe:** `getSession()` already refuses any portal
   session whose Supabase session is missing or stale whenever Supabase is
   configured, so every route behind `requireRole` carries live Supabase
   cookies. `createScopedSupabaseClient()` (`src/lib/supabase/scoped.ts`) is
   the anon key + those cookies, with a `getUser()` check that turns the
   remaining cases (demo/showcase sessions, cookie-only gates) into a loud 401
   rather than a silent RLS-empty "not found".

   **Converted to the scoped client (10 sites, 10 files)** — the website-inbox
   surface, all behind internal-role gates, all covered by the internal-users
   policy on `brand_enquiries`:
   - `src/app/api/portal/website-enquiries/status/route.ts`
   - `src/app/api/portal/website-enquiries/classification/route.ts`
   - `src/app/api/portal/website-enquiries/lead/route.ts`
   - `src/app/api/portal/website-enquiries/reply/route.ts`
   - `src/app/api/portal/website-enquiries/communications/route.ts`
   - `src/app/api/portal/website-enquiries/erase/route.ts` (delete now
     `.select("id")`-verified so an RLS-filtered delete fails loudly)
   - `src/app/api/portal/website-enquiries/calls/route.ts`
   - `src/app/api/portal/website-enquiries/calls/recording/route.ts`
   - `src/app/api/portal/website-enquiries/calls/recording/content/route.ts`
   - `src/app/api/portal/inbox/media/route.ts`

   Known behaviour change, deliberate: demo/showcase sessions (which skip the
   Supabase check in `getSession()`) can no longer mutate real enquiries
   through these routes — they get a 401 unless real Supabase cookies are also
   present (Ed's own dev-mode keeps his cookies, so his flows still work).

   **What stays on the service role, and why (12 sites, 8 files):**

   > **2026-09-08 (assume-breach Phase 1).** `brand_enquiries` became fully
   > server-mediated: the containment migration
   > (`20260908210000` + corrective `20260908220000`) revokes authenticated
   > SELECT/UPDATE/DELETE, so the internal enquiry routes can no longer use the
   > scoped RLS client. They were converted to `createEnquiryDataClient()` — one
   > centralized service-role factory — with tenant ownership enforced in server
   > code (`loadOwnedEnquiry` / `loadActorWebsiteEnquiry`), never by RLS. Net: +1
   > *centralized* service-role site (the factory below), −11 scoped-client call
   > sites in the routes. This is a deliberate, documented increase in the
   > service-role count in exchange for closing the null-fail-open RLS policy.

   | Site | Why it must keep the service role |
   |---|---|
   | `src/lib/supabase/enquiryDataClient.ts` (1) | The single server-mediated `brand_enquiries` data client. authenticated has no SELECT/UPDATE/DELETE after the containment migration; the 11 internal enquiry routes read/mutate through this factory, and tenant ownership is enforced in server code (`loadOwnedEnquiry`/`loadActorWebsiteEnquiry`) against the caller's session `agencyId`. Centralizing here (vs each route calling the admin client) keeps the ownership contract in one place. |
   | `src/app/api/public/brand-enquiry/route.ts` (1) | Public endpoint, no session. Anon may only INSERT consented rows; this route also SELECTs for dedupe and UPDATEs metadata — an anon SELECT power here would let anyone probe enquiries by email. |
   | `src/app/api/public/form-capture/route.ts` (1) | Public endpoint, no session; inserts `consent:false` hold rows the anon insert policy correctly refuses, and attaches captures to existing rows. |
   | `src/app/api/telemetry/collect/route.ts` (1) | Public endpoint, no session; `website_consent_events` deliberately has no anon policy — consent rows are written server-side after validation/redaction. |
   | `src/app/api/portal/clients/[clientId]/erase/route.ts` (1) | GDPR erasure must scrub rows and storage objects regardless of what RLS would show the caller; `smoke-client-erasure.test.ts` pins this wiring. |
   | `src/lib/server/websiteEnquiries.ts` (3) | Shared read/annotate layer for radar, operational alerts, marketing intelligence and server components — paths with no request/user context. **The remaining phase-4 candidate**: converting it means deciding those engines run as somebody. |
   | `src/lib/server/privateUploadStorage.ts` (3) | Private buckets deny anon/authenticated by design; the app proxies bytes itself. |
   | `src/lib/server/databaseStorageHealth.ts` (1) | Diagnostics must count ALL rows to report truthfully; runs without a user session. |

   The former two `src/lib/server/publicUploadStorage.ts` call sites are no
   longer present. AquaCRM now refuses remote public-media publication until
   an operation-owned, recoverable publish/recall lifecycle exists; there is
   no dormant service-role provider implementation waiting behind a toggle.

   (`src/lib/supabase/admin.ts` is outside the count as the definition file;
   its three internal call sites are `auth.admin.*` operations that exist only
   on the service role. `src/server/clientErasure.ts` takes the admin client
   injected — counted at its injection site, the erase route above.)
5. ✅ **Verify** — both halves now exist:
   - live posture → `../../../../supabase/rls-verify.sql`, read-only, run it in
     the SQL editor after any `db push` or dashboard change;
   - repo posture → `scripts/smoke-rls-policy-coverage.test.ts`, in the smoke
     suite, parses the real migration SQL and fails if the written policy set
     drifts from what the code assumes.

## Done when (revised)

Gaps 1 and 2 closed (nothing live that is not written down, nothing written that
is recorded as applied), a decision recorded on the remaining service-role
boundary, and `rls-verify.sql` returning no
`FAIL` rows against the live project. Phase 4 is a separate, larger piece of
work and should not block closing this plan — but the posture note above must
travel with any claim about database-level isolation.

## Reuse

`../../../../supabase/migrations/` is the migration home — **do not create a
second one inside `portal/`.** `portal/scripts/schema.sql` is unrelated: it is
DDL for the optional `portal_kv` Postgres backend, a different database, and its
"RLS deferred to R8" comment applies only to that table.

## File map — what this plan owns

_Updated 2026-08-20. This is the collision contract: with Claude and Codex
workers in ONE uncommitted tree, two agents in the same file destroys work and
there is no git to recover from. Before assigning this plan, check these paths
against every other plan in flight._

- `../../../../supabase/migrations/*.sql`
- `../../../../supabase/rls-verify.sql`
- `../../../../supabase/README.md`
- `scripts/smoke-rls-policy-coverage.test.ts`
- `scripts/smoke-service-role-usage.test.ts`
- `scripts/schema.sql`
- `src/lib/supabase/admin.ts`
- `src/lib/supabase/route.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/config.ts`
- `scripts/migrate-file-to-supabase.mjs`
- `scripts/migrate-file-to-postgres.mjs`
- `docs/workspace/database.md`
- `docs/development/issues.md`
- `docs/development/plans/rls-enable.md`
