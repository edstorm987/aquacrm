# Plan — Database Row-Level Security  🟠 mostly done, three real gaps left

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: BUILDING — phases 1, 2 and 5 done; phase 3 written and waiting on Ed's `db push`; phase 4 first reduction landed 2026-08-20 (23→13 call sites, pinned). The headline premise of this plan was wrong and has been corrected.**

This plan was written around "RLS is not in the repo". It is. The policies live
in **[`../../../../supabase/migrations/`](../../../../supabase/README.md)** — a
standard Supabase CLI project sitting beside `portal/`, linked to project ref
`dghzbsxbdatskserctgt`, the same ref `NEXT_PUBLIC_SUPABASE_URL` points at.
Fourteen migrations define every table, every policy, the role grants, the
storage-bucket ACLs and the RPC functions.

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

## The three gaps that remain

1. **`rls_auto_enable()` is dashboard-only drift.** It is in the live project's
   RPC list and in no migration. It will not survive a rebuild, and nobody has
   reviewed what it does. Export it (`select prosrc from pg_proc where proname =
   'rls_auto_enable'`) and commit it to `../../../../supabase/migrations/`.
   *Needs Ed — dashboard/SQL-editor access.*

2. **The inbox migration has never been applied.** All five `inbox_*` tables and
   `claim_inbox_webhook_events` return `404` to *both* keys.
   `20260811113000_master_inbox_messaging.sql` sits on disk unapplied. Because
   `useSupabase()` returns true whenever `NODE_ENV === 'production'`, this is a
   live production failure waiting on the first inbox request — not a hygiene
   issue. *Needs Ed — `supabase db push`.*

3. **`brand_enquiries` `agency_id` — SQL written 2026-08-20, not yet applied.**
   `20260820150000_brand_enquiries_agency_scope.sql` adds the column (text —
   agency ids are the app's slugs), backfills from `metadata->>'agencyId'` with
   `'milesymedia'` (the founder agency) as the default of last resort, keeps it
   filled with a trigger, adds `profiles.agency_id` +
   `current_profile_agency_id()`, and replaces the flat internal-users policy
   with a null-tolerant agency-matched one (a ratchet: unscoped profiles keep
   today's behaviour; stamping a profile scopes that user down). Both insert
   paths now stamp `agency_id` AND `metadata.agencyId`, with a `PGRST204`
   retry-without-column so capture survives the window before the migration is
   applied. **Ed applies it: `supabase db push` from `aquaCRM/supabase/`, then
   run `rls-verify.sql` in the SQL editor.** Nothing here has touched the live
   database.

Secondary: `clients`, `client_portals`, `client_portal_members` and
`audit_events` exist, are policed, are empty, and are queried by no portal code
at all. Superseded first-cut model, or unfinished? Decide and record it.

## Phases

1. ~~**Audit isolation per table.**~~ Done — see
   [`database.md`](../../workspace/database.md) §2 and the table in
   [`../../../../supabase/README.md`](../../../../supabase/README.md).
2. ~~**Author RLS as in-repo SQL migrations.**~~ Already done, before this plan
   was written. The work that was actually missing was making it *findable* and
   *checkable* from `portal/`, which is now done.
3. **`brand_enquiries` decision** — add `agency_id` (backfill from
   `metadata->>'agencyId'`) so it can be RLS-scoped, or accept it stays global +
   app-filtered. **Open. Needs Ed.**
4. **Reduce service-role reliance where feasible** — **first reduction landed
   2026-08-20.** Measured by grep for `createSupabaseAdminClient(` in `src/`,
   excluding its definition file (`src/lib/supabase/admin.ts`): **before 23
   call sites in 18 files → after 13 call sites in 8 files.** The count is
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

   **What stays on the service role, and why (13 sites, 8 files):**

   | Site | Why it must keep the service role |
   |---|---|
   | `src/app/api/public/brand-enquiry/route.ts` (1) | Public endpoint, no session. Anon may only INSERT consented rows; this route also SELECTs for dedupe and UPDATEs metadata — an anon SELECT power here would let anyone probe enquiries by email. |
   | `src/app/api/public/form-capture/route.ts` (1) | Public endpoint, no session; inserts `consent:false` hold rows the anon insert policy correctly refuses, and attaches captures to existing rows. |
   | `src/app/api/telemetry/collect/route.ts` (1) | Public endpoint, no session; `website_consent_events` deliberately has no anon policy — consent rows are written server-side after validation/redaction. |
   | `src/app/api/portal/clients/[clientId]/erase/route.ts` (1) | GDPR erasure must scrub rows and storage objects regardless of what RLS would show the caller; `smoke-client-erasure.test.ts` pins this wiring. |
   | `src/lib/server/websiteEnquiries.ts` (3) | Shared read/annotate layer for radar, operational alerts, marketing intelligence and server components — paths with no request/user context. **The remaining phase-4 candidate**: converting it means deciding those engines run as somebody. |
   | `src/lib/server/privateUploadStorage.ts` (3) | Private buckets deny anon/authenticated by design; the app proxies bytes itself. |
   | `src/lib/server/publicUploadStorage.ts` (2) | Public-assets bucket is service-role-writable only. |
   | `src/lib/server/databaseStorageHealth.ts` (1) | Diagnostics must count ALL rows to report truthfully; runs without a user session. |

   (`src/lib/supabase/admin.ts` is outside the count as the definition file;
   its three internal call sites are `auth.admin.*` operations that exist only
   on the service role. `src/server/clientErasure.ts` takes the admin client
   injected — counted at its injection site, the erase route above.)
5. **Verify** — both halves now exist:
   - live posture → `../../../../supabase/rls-verify.sql`, read-only, run it in
     the SQL editor after any `db push` or dashboard change;
   - repo posture → `scripts/smoke-rls-policy-coverage.test.ts`, in the smoke
     suite, parses the real migration SQL and fails if the written policy set
     drifts from what the code assumes.

## Done when (revised)

Gaps 1 and 2 closed (nothing live that is not written down, nothing written that
is not applied), a decision recorded on gap 3, and `rls-verify.sql` returning no
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
