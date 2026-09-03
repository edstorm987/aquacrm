# Supabase alignment — drift register, rehearsal evidence and recovery runbook (3 September 2026)

**Status:** discovery and isolated rehearsal complete; live application **BLOCKED pending Ed's
credentials and approval** (see §7). Nothing in the live project was changed by this work: every
live probe was a GET/HEAD or a read of PostgREST's OpenAPI document with the service-role key,
and no RPC was invoked against the live project.

← [production-readiness-roadmap-2026-09-03.md](production-readiness-roadmap-2026-09-03.md) ·
[`../../../supabase/README.md`](../../../../supabase/README.md) · [ED-QUESTIONS Q7, Q8, Q11](../ED-QUESTIONS.md)

---

## 1. Environments — there is exactly one project

| Question | Answer (read-only, 2026-09-03) |
| --- | --- |
| Project ref | `dghzbsxbdatskserctgt` — name "AquaCRM", org `eezscdnazkikzjdboykc`, region eu-west-1 (pooler host `aws-0-eu-west-1.pooler.supabase.com`). |
| Where it is referenced | `portal/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, anon key, service-role key, both bucket names), `Dev Team/vercel-env.local` (same URL and keys), `supabase/.temp/project-ref` (CLI link made 2026-07-31), `supabase/README.md`. |
| Development / staging / production | **The same project is all three.** No second ref exists anywhere in the repository, the CLI link or the env files. It holds real data (52 website enquiries, 13 consent events, 3 Auth users, a 2.8 MB portal state written on 2026-09-02 16:08 UTC). Treat it as production. |
| Credentials present locally | anon key and service-role key (fingerprints `eda0bb01b066` / `205ed2644f7b`, SHA-256 prefixes). **Absent:** database password, `DATABASE_URL`, `SUPABASE_ACCESS_TOKEN` / CLI login, `psql`. Docker Desktop is installed and was started for the isolated rehearsal only. |
| Consequence | Catalog-level facts (policies, triggers, indexes, `schema_migrations`, storage policies) and every mutation path (`supabase db push`, `migration list --linked`, backups/PITR via the Management API) are **unreachable until Ed supplies either a personal access token (`supabase login`) or the database password**. |
| Live-data hazard | With `.env.local` loaded and no `PORTAL_BACKEND`, the portal promotes itself to the Supabase backend. Any local `next dev`/`next start` launched without `PORTAL_BACKEND=file` reads and writes the production `app_datastores` row (the 100-version `app_datastore_history` shows daily writes through 2026-09-02, while the two Codex servers on 3191/3192 have no `PORTAL_BACKEND` in their command line). Recommendation: set `PORTAL_BACKEND=file` in `.env.local` for local work and keep the Supabase backend for deployments only. |

## 2. Drift register — live project versus `supabase/migrations`

Produced by the new read-only tool `node scripts/supabase-schema-status.mjs` (PostgREST OpenAPI +
HEAD counts + bucket list; prints no key, row or address). The live schema matches the migration
set as it stood on **2026-08-09**, plus one function applied out of order on 2026-08-26. **Eleven
migration files are unapplied**, not the four the readiness roadmap recorded — twelve with the grants migration added today.

| Object / migration | Local (repo) | Remote (live) | Env | Risk | Required action | Data transformation | Rollback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20260811113000_master_inbox_messaging` — 5 `inbox_*` tables, 6 indexes, `claim/complete/fail_inbox_webhook_events` | defined | **missing** (404) | live | **High for a deployment**: `NODE_ENV=production` selects the Supabase inbox store, so the first Master Inbox request on a deployed build fails. Locally harmless. | apply | none (new tables) | drop the five tables and three functions |
| `20260820150000_brand_enquiries_agency_scope` — `brand_enquiries.agency_id`, backfill, trigger, index, `profiles.agency_id`, `current_profile_agency_id()`, agency-aware policy | defined | **missing** (column probe 400) | live | Medium: the only **data-transforming** statement in the set. | apply after approval | **yes — `UPDATE brand_enquiries SET agency_id = coalesce(metadata->>'agencyId','milesymedia')` on all 52 rows: 50 take `milesymedia`, 2 already carry `milesymedia`** (read-only count 2026-09-03). No row is deleted or re-keyed. | `alter table brand_enquiries drop column agency_id`, `drop trigger set_brand_enquiries_agency`, `drop function current_profile_agency_id`, `alter table profiles drop column agency_id`, restore policy `Internal users manage brand enquiries` |
| `20260823030000_editor_ai_reply_claims` — table + 3 functions | defined | missing | live | Low: `enquirySubmissionClaims`-style callers tolerate absence? **No** — the Dev Editor AI reply claim has no fallback; deployed Editor AI replies fail. | apply | none | drop table + functions |
| `20260825090000/100000/110000` — webhook leases, atomic Meta ingestion, resumable reply parts | defined | missing | live | Medium (Meta inbox on a deployment) | apply (depends on 0811) | none (alters a new table) | drop functions, drop `lease_*` columns |
| `20260825120000_lead_conversion_operations` — table + 3 functions | defined | missing | live | Medium: close-deal on a deployment falls back to process-local claims | apply | none | drop table + functions |
| `20260825130000_product_workspace_leases` — table + claim/release | defined | missing | live | **High for a deployment**: `storage.runExclusive` on the Supabase backend uses this lease; commercial and marketing writes need it | apply | none | drop table + functions |
| `20260826132000_dev_team_workspace_files` — function | defined | **present** (applied out of order, unrecorded in `schema_migrations` — to be confirmed with SQL access) | live | Low | `migration up` re-applies it harmlessly (`create or replace`) | none | n/a |
| `20260902090000_merge_app_datastore_patch_objects` — `aqua_jsonb_*`, `app_datastore_patch_receipts`, **3-arg** `apply_app_datastore_patch` (drops the 2-arg one) | defined | **2-arg signature live; receipts table and helpers missing** | live | **Critical for a deployment**: the current code calls the 3-arg function only, so every state write on the Supabase backend answers 404 and fails. The 2026-09-02 writes on the live row therefore came from an older build or the dev-team function. | apply | none (receipts table is new; `DROP FUNCTION` removes only the old signature) | re-create the 2-arg function from `20260809090000`, drop the receipts table and helpers |
| `20260902091000_product_workspace_lease_renewal_fencing` — `renew_product_workspace_lease` | defined | missing | live | High with 0825130000 | apply | none | drop function |
| `20260902092000_owned_sidecar_compare_and_swap` — `apply_app_datastore_patch_with_sidecars`, `load_app_datastore_with_sidecars` | defined | missing | live | **Critical for a deployment**: hydration on the Supabase backend calls `load_app_datastore_with_sidecars` first and has no fallback | apply | none | drop the two functions |
| `20260902093000_aqua_tag_submission_delivery` — `aqua_tag_submissions` + 5 functions | defined | missing | live | Low: the public routes fall back to the process-local boundary and say so | apply (needs 0820's `agency_id` column first — it is earlier in order) | none | drop table + functions |
| `20260903120000_explicit_service_role_grants` — explicit grants for the older tables (service_role DML; anon SELECT on the 3 public tables + INSERT on `brand_enquiries`; authenticated DML on the FOR-ALL tables, SELECT+INSERT on append-only `audit_events`, SELECT on the public tables) | defined (added 2026-09-03) | not applied (a strict subset of live's inherited GRANT ALL, so a no-op on live; required on any rebuilt or local project) | live | none | apply with the rest | none | **fresh/local project only: `revoke ... from ...` the listed grants. On LIVE the forward is a no-op, so the correct rollback is to do NOTHING — a REVOKE there would strip inherited privileges the app depends on and reproduce the 42501 outage this migration prevents.** |
| `rls_auto_enable()` | **not in any migration** | present | live | Low, but it will not survive a rebuild | export `prosrc` with SQL access, commit as a migration or drop | none | n/a |
| Storage buckets (8) | defined | present, public flags and size limits match, `aquacrm-uploads` carries the 19 expanded MIME types | live | none | none | none | n/a |
| Storage object policies (3) | defined | **unverifiable without SQL** | live | unknown | verify with `rls-verify.sql` once SQL access exists | none | n/a |
| RLS on the 12 live tables (anon read posture) | defined | anon sees 0 rows on every private table and `401` on `app_datastore_history`; `brands`/`shoots`/`shoot_photos` public by design | live | none | none | none | n/a |
| First-cut tables `clients`, `client_portals`, `client_portal_members`, `audit_events` | defined | present, empty | live | none | Ed's decision (Q11) | none | n/a |
| Auth | signup disabled, email confirmations on, email provider only, 3 users all confirmed | — | live | see §6 | reconcile accounts (Q7) | none | n/a |

## 3. Isolated rehearsal (local Supabase stack, Docker, `supabase start`) — VERIFIED IN ISOLATION

1. **Full ordered application on an empty database:** `supabase start` applied all 26 migrations in filename order with no error; the local schema then carried 22 tables, 33 public functions, RLS on every table, 8 buckets, and `schema_migrations` listed all 26 versions.
2. **Live-level rehearsal with representative data** (`supabase db reset --local --version 20260809090000`, then `20260826132000` applied by `psql` to mirror the live drift, then a synthetic seed of 52 enquiries shaped like the live distribution — 50 without `metadata.agencyId`, 2 with `milesymedia`, 10 with `consent=false` — plus 13 consent events and the three `app_datastores` keys): preflight counted exactly the 50 rows that would take the default; `supabase migration up --local` applied the 13 remaining files in order; afterwards every row carried `agency_id`, the distribution was `milesymedia=52`, totals were unchanged, `consent=false` rows were retained, `apply_app_datastore_patch` had the 3-argument signature, and the trigger stamped a new row with no value (`milesymedia`) and one with a metadata value (`other-agency`).
3. **Idempotency:** the twelve pending SQL files re-ran verbatim with `ON_ERROR_STOP` and all twelve succeeded; the verify pass afterwards was consistent.
4. **RPC contracts:** receipt-deduplicated patch (replay returns the same state), second operation advances, atomic main+sidecar patch and coherent load agree, lease claim → renew (claimed) → renew by another holder (held) → release → renew after release (held, never reacquired).
5. **RLS audit:** `supabase/rls-verify.sql` on the rehearsed database: 51 INFO, 0 FAIL, 0 WARN after adding the four newer repo tables to its known list (they were WARN before).
6. **Aqua Tag ingestion on real PostgreSQL (`20260902093000`):** `smoke-aqua-tag-ingestion-live-postgres.test.ts` against the disposable local database passes **7/7**, including the separate-process claim exclusivity, the fencing token and crash-then-recover — the migration's whole point (#87). Its fixture used to insert enquiries with `brand_slug: null`, which only its own bare scaffold allowed; on the real schema (`NOT NULL`, foreign key to `brands`) five of seven subtests failed until the fixture named a real brand. The application always supplies a slug (`site.propertyId ?? siteKey` and the brand form's slug), so this was a test fixture gap, not a migration defect.
8. **Application acceptance against Supabase (production build, `PORTAL_BACKEND=supabase` on the local stack).** Release gate 163/163, house matrix 1169/0, Notepad/Finance/loader 77/77, Phase Admin 10/10 (2 N/A). Login uses the real `/api/auth/login`; the Supabase identity cross-check refuses an HMAC-only cookie (proven) and end-customers authenticate by their HMAC session (password login is refused for them by design, Q1). Playwright's APIRequestContext mis-transmits the 2.6 KB base64 Supabase SSR auth cookie (a page-authenticated session is rejected on `page.request` API calls while in-page `fetch`/`curl`/page-nav all succeed); the gates now send a verbatim Cookie header on API sub-requests. This is a harness transport fix, not a weakening — no RLS or gate was relaxed. The live production project was never contacted and its `app_datastores` rows were byte-identical before and after.

7. **Grants are inherited, not written — fixed by `20260903120000_explicit_service_role_grants.sql`.** Running the portal against the local stack answered `42501 permission denied for table app_datastores` on the service-role sidecar read: the tables created before 2026-08-23 never granted anything themselves and relied on the cloud project's default privileges, which this local image does not give (`postgres`-owned tables default to TRUNCATE/REFERENCES/TRIGGER only). The live project has the inherited grants, which is why it works today and why a rebuilt project would not. The new migration states the intended posture explicitly (service_role DML on the eleven older tables; anon SELECT on the three public tables and INSERT on `brand_enquiries`; authenticated DML on the policied tables) and is a no-op where the grants already exist. Applied locally through `supabase migration up --local` (27 versions recorded); the repo RLS coverage smoke still passes.

## 4. Backup and recovery — NOT VERIFIED (blocked)

- Supabase's own backups and point-in-time recovery are visible only in the dashboard or the Management API, both of which need Ed's personal access token. **No claim is made about their state.**
- What exists in the data itself: `app_datastore_history` retains the last 100 versions of the main portal state (captures from 2026-08-18 to 2026-09-02), which recovers the datastore blob but not the relational tables, storage objects or Auth.

### Runbook — before any live mutation (Ed, or an operator with the token)

1. Dashboard → Project Settings → Database → **Backups**: confirm a daily backup newer than the last write, and whether PITR is enabled (Pro plan, needs the add-on). If PITR is off, enable it before applying migrations that transform data.
2. Take an on-demand safety export immediately before applying: with the service-role key, `GET /rest/v1/<table>?select=*` for every live table into a private, non-committed directory; `GET /storage/v1/object/list/<bucket>` and download each object; `GET /auth/v1/admin/users` (hashed listing only unless a real restore is needed). Keep it outside the repository; it contains personal data.
3. Restore rehearsal (do once, on a **branch database** or a scratch project you create for the purpose — never the live project): restore the daily backup or PITR point there, run `node scripts/supabase-schema-status.mjs` and `rls-verify.sql` against it, and load the portal with `PORTAL_BACKEND=supabase` pointing at it. Recovery is verified only when a real restore has been driven this way.

## 5. Apply plan (when unblocked) — the canonical mechanism is `supabase db push`

```bash
# from the repository root, with SUPABASE_ACCESS_TOKEN or `supabase login` done, and the DB password at hand
supabase migration list --linked          # confirm exactly the twelve files are pending (and 20260826132000's recording state)
supabase db push --dry-run                # prints the SQL it would run; no change
supabase db push                          # applies the pending files in timestamp order, recording each version
node portal/scripts/supabase-schema-status.mjs   # expect "drift rows: 1" (rls_auto_enable) or 0 once it is committed
psql "$DATABASE_URL" -f supabase/rls-verify.sql  # expect INFO rows only
```

Locking and duration: every statement is DDL on small tables (largest is `brand_enquiries` at 52 rows); the backfill `UPDATE` touches 52 rows under a brief exclusive lock. No default-value rewrite of a large table, no uniqueness violation is possible (all new unique indexes are on new, empty tables; preflight showed no null `brand_slug`). `20260902090000` drops the 2-argument `apply_app_datastore_patch`: an older running build that still calls it will fail from that moment — deploy the current build with the same change window.

## 6. Accounts (Q7) — read-only preflight 2026-09-03

`node scripts/supabase-cutover-preflight.mjs`: 2 portal users, 3 Auth users, 1 present in both, **1 portal user locked out at cutover, 2 Auth users with no portal record**. Creating or deleting accounts is Ed's action in the dashboard by policy.

## 7. What needs Ed

| Item | Why | Unblocks |
| --- | --- | --- |
| `supabase login` (personal access token) **or** the database password | The only ways to run `migration list/db push`, the SQL audit and the Management API | everything in §5, backup verification, `rls_auto_enable` export, storage-policy verification |
| Approval of the `brand_enquiries.agency_id` backfill (52 rows → `milesymedia`) | It is the one data-transforming statement | applying `20260820150000` and therefore everything after it |
| Backup/PITR confirmation (§4 step 1) | Never mutate without a verified restore point | `db push` |
| Decision on `clients`/`client_portals`/`client_portal_members`/`audit_events` (Q11) | Drop or adopt | a clean relational baseline |
| Account reconciliation (Q7) | Sign-in after cutover | the cutover itself |
| `PORTAL_BACKEND=file` in `.env.local` for local work | Stops local servers writing the production state row | data hygiene |
