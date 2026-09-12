# Chapter — Database (Supabase / Postgres) dossier

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

Verified from source query code, from the SQL migrations one directory up, and
from a read-only probe of the live project on 2026-08-20. Reconciled on
2026-09-08 against the repository's verified 2026-09-03 live-application
record. The 2026-09-08 readiness review did not independently reconnect to
Supabase, so live row counts below remain dated evidence rather than a current
probe. See [the alignment record](../development/plans/supabase-alignment-2026-09-03.md)
and [current readiness](../development/PRODUCTION-READINESS.md).

> ## ✅ CORRECTED 2026-08-20 — the DDL and the RLS policies DO exist
> An earlier version of this chapter said no table DDL, RLS policy, role grant
> or bucket ACL existed anywhere in the repo, and that
> `20260811113000_master_inbox_messaging.sql` was "absent from disk". **All of
> that was wrong**, and it sent at least one work lane off on a false premise.
>
> They live in **[`../../../supabase/migrations/`](../../../supabase/README.md)**
> — a normal Supabase CLI project sitting beside `portal/`, linked to project
> ref `dghzbsxbdatskserctgt`, the same ref `NEXT_PUBLIC_SUPABASE_URL` points at.
> The repository now contains 28 ordered migrations defining the schema,
> policies, grants, bucket ACLs and database functions. `20260811113000_master_
> inbox_messaging.sql` is on disk and 173 lines long.
>
> The mistake is understandable and worth naming, because it will recur: the
> portal package is what deploys, so it reads like the whole repo. It is not.
> **Nothing inside `portal/` referenced the migrations directory**, so an
> audit scoped to `portal/` correctly found nothing and incorrectly concluded
> nothing existed. That link is now made from three places — this callout,
> `../../../supabase/README.md`, and `scripts/smoke-rls-policy-coverage.test.ts`,
> which parses the real SQL and fails if it drifts from what the code assumes.
>
> Columns below were originally inferred from query code; they have now been
> **cross-checked against the migrations and the live PostgREST schema** and
> corrected where they differed. The former dashboard-only
> `rls_auto_enable()` drift is now captured in
> `20260903130000_ensure_rls_event_trigger.sql`; as recorded on 2026-09-03,
> that no-op-on-live migration was the one remaining version to record.

## 1. Two separate persistence concerns (don't conflate)

### A. The portal-state **blob/KV backend** (one giant `PortalState` JSON)
Selected by `PORTAL_BACKEND` (`server/storage.ts`):

| `PORTAL_BACKEND` | Store | Where |
|---|---|---|
| `file` | `.data/portal-state.json` | local file |
| `memory` | in-process | ephemeral |
| `kv` | **stub — throws "not yet wired"** | — |
| `postgres` | `portal_kv` table, row key `__portal_state__` | `storagePostgres.ts` |
| `supabase` | `app_datastores` table, row `app_key='aquacrm-portal-state'` | `storageSupabase.ts` |

Implicit promotion: `DATABASE_URL` set → postgres; else Supabase env set →
supabase; else file. `.env.example` ships `PORTAL_BACKEND=supabase`.
⚠ The two blob backends use **different tables AND row keys**. The Supabase
backend also calls RPC **`apply_app_datastore_patch`** — defined in
`../../../supabase/migrations/20260809090000_atomic_datastore_patches_and_history.sql`
(`security definer`, pinned `search_path`, `execute` revoked from anon/authenticated
and granted only to `service_role`). It is present and callable in the live project.

### B. The **discrete relational tables** (real columns, real queries)
`brand_enquiries`, `website_consent_events`, `profiles`, five `inbox_*` — always
reached through Supabase, independent of `PORTAL_BACKEND`.

⚠ The live project also carries **`brands`, `shoots`, `shoot_photos`** (public
website content, read by the sibling websites rather than by the portal) and
four tables **no portal code queries at all**: `clients`, `client_portals`,
`client_portal_members`, `audit_events`. All four are created and policed by
`20260731120000_initial_aquacrm_security.sql` and are currently **empty**. They
are either a superseded first-cut data model or unfinished work — do not build
against them without deciding which.

### C. Postgres-direct aux: `nonces` (lazy `CREATE TABLE` in `nonceStore.ts`).

## 2. Table-by-table

Columns below are cross-checked against
`../../../supabase/migrations/` and the live PostgREST schema, not inferred.

### `brand_enquiries` (mixed keys) — the most-used table (31 `.from` sites, 14 files)
Website enquiry capture. `id`, `brand_slug`, `name`, `email?`, `phone?`,
`contact_method?`, `services?` (text[]), `message?`, `source_url?`, `campaign?`,
`consent?` (bool), `created_at` (timestamptz), `metadata` (jsonb), and — since
`20260820150000_brand_enquiries_agency_scope.sql` — **`agency_id` (text)**, the
real tenant column. The 2026-09-03 live application record says this migration
was applied, the column and trigger were present, and all 52 existing rows were
backfilled to `milesymedia`; the 2026-09-08 review did not re-probe that state.
The insert paths retain their missing-column compatibility fallback
(`src/lib/supabase/enquiryAgencyColumn.ts`). Routing metadata (`agencyId`,
`routedClientId`, `clientId`, `masterTag`/`captureOnly`) stays in `metadata` —
the migration backfills the column from `metadata->>'agencyId'` (default
`'milesymedia'`, the founder agency) and a trigger keeps it filled.
Erasure = **hard delete** `.delete().eq("id",…)` (now `.select("id")`-verified so
an RLS-filtered delete fails loudly instead of no-oping).
**RLS:** enabled. `anon` may **INSERT only**, and only when `consent = true` and
the row carries a real name plus an email or a ≥7-char phone — the website form's
validation is in the policy's `WITH CHECK`, not just in app code. No anon SELECT:
the live probe returned 0 rows to the anon key against 35 rows for service-role.
Internal users manage rows through an **agency-aware policy** (null-tolerant
ratchet: unscoped profile or unscoped row → today's behaviour; both stamped →
must match `current_profile_agency_id()`). The website-inbox routes
(`api/portal/website-enquiries/*`, `api/portal/inbox/media`) now reach this
table with the **user's scoped client** (`createScopedSupabaseClient`), so RLS
actually applies there; the service-role paths that remain are pinned and
justified in `scripts/smoke-service-role-usage.test.ts`.

### `website_consent_events` (service-role) — consent audit, insert-only
`brand_slug?`, `site_key`, `property_id`, `anonymous_id?`, `necessary` (always
true), `preferences`, `analytics`, `marketing`, `consent_version` (≥1), `source`
(`'aqua-tag'`), `occurred_at`, `metadata` (`{origin}`). **No read path exists in
the repo** — write-only from the app's view. **RLS:** enabled, single
internal-users-manage policy; anon sees 0 rows against 10 for service-role.

### `profiles` (Supabase) — auth profile mirror
`id` (uuid = auth user id), `email`, `full_name`, `role`
(`'owner'|'staff'|'client'`). Written by the **service-role** admin client,
read at login by the **anon/SSR** client. Bridges Supabase Auth → app roles.
**This is the only table in the entire portal read with the anon key**, so it is
the only place RLS is load-bearing for the app's own paths. Two policies: read
your own row (`id = auth.uid()`) or any row if `is_internal_user()`; internal
users manage all. Rows are also written by an `on_auth_user_created` trigger on
`auth.users`.

### `app_datastores` (service-role) — the Supabase KV blob table
`app_key` (unique), `data` (jsonb), `created_at`, `updated_at`. Backs
`PORTAL_BACKEND=supabase`. Every update/delete fires a `security definer` trigger
that snapshots the prior value into **`app_datastore_history`** (last 100 per key)
— the hardest-locked table in the project: `revoke all from anon, authenticated`,
`grant select to service_role`. It denies the anon key with `42501 permission
denied` rather than an empty result, which is a *stronger* denial than RLS alone.

### `portal_kv` (Postgres-direct) — DDL in `scripts/schema.sql`
`scripts/schema.sql`: `key TEXT PRIMARY KEY`, `value JSONB NOT NULL`,
`updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, index
`portal_kv_key_prefix btree(key text_pattern_ops)`. schema.sql **explicitly
defers RLS** ("deferred to R8… per-tenant scoping enforced at the foundation
layer").

### `nonces` (Postgres-direct) — ✅ DDL in-repo (`nonceStore.ts`)
`token TEXT PRIMARY KEY`, `kind TEXT NOT NULL`
(`magic-link|client-portal-invite|email-verify|password-reset|csrf`), `expires_at BIGINT NOT NULL`
(epoch ms), index on `expires_at`. Atomic consume via
`INSERT … ON CONFLICT DO NOTHING RETURNING`.

### `aqua_auth_nonces` (Supabase service-role RPC ledger)

The Supabase/serverless backend cannot use process memory for magic, client
invite, email-verification, password-reset or CSRF single-use state. Migration
`20260912150000_durable_auth_nonces.sql` adds a digest-only ledger plus atomic
consume/release/GC functions. Direct table access is revoked from public,
`anon`, `authenticated` and `service_role`; only the three exact
`SECURITY DEFINER` functions are executable by `service_role`. Raw bearer
nonces never reach the table or logs. The application fails closed when the
production Supabase adapter or migration is absent.

This migration is present in source but **not applied by this local hardening
run**. Its filename deliberately follows the Aqua Tag `20260912140000`
migration so the two changes do not share a migration version.

### `inbox_*` tables (service-role) — Master Inbox / Meta messaging
> **Live-evidence timeline:** these tables returned `404 PGRST205` in the
> 2026-08-20 probe. The verified 2026-09-03 alignment record says the master
> inbox migration was subsequently applied and the new tables/functions were
> present. That later record supersedes the August absence finding, although
> the 2026-09-08 review did not independently re-probe Supabase.

Gated by `useSupabase()` (`INBOX_STORAGE_BACKEND==='supabase'` **or**
`NODE_ENV==='production'`; else local JSON `.data/inbox-messaging.json`). Own
service-role client. Columns from the `*Row` mappers:
- **`inbox_channel_connections`** — `id`, `agency_id`, `company_id?`, `provider`, `channel`, `auth_mode`, `external_account_id`, `display_name`, `scopes`, `status`, `webhook_status`, **`encrypted_access_token`** (secret at rest), `token_expires_at?`, `last_sync_at?`, `last_error?`, timestamps.
- **`inbox_contact_identities`** — `id`, `agency_id`, `connection_id`, `external_user_id`, `display_name`, `lead_id?`/`contact_id?`/`client_id?`, timestamps.
- **`inbox_conversations`** — `id`, `agency_id`, `connection_id`, `identity_id`, `external_conversation_id`, `status`, `assigned_to?`, `tags`, `unread_count`, timing fields, `metadata`, timestamps.
- **`inbox_messages`** — `id`, `agency_id`, `connection_id`, `conversation_id`, `external_message_id?`, `direction`, `message_type`, `body_text?`, `attachments` (jsonb), `status`, `metadata`, `sent_at`, timestamps.
- **`inbox_webhook_events`** — `id`, `provider`, `event_key`, `payload` (jsonb), `status`, `attempts`, `available_at`, `processed_at?`. Claimed via RPC **`claim_inbox_webhook_events`** — defined in the inbox migration recorded as applied on 2026-09-03; `security definer`, execute granted to `service_role` only. Pruned by hard delete past retention.
- **`inbox_client_erasure_tombstones`** — contact-data-free but pseudonymous `(agency_id, client_id, erased_at)` denial facts created atomically by `erase_client_inbox_data`. A database trigger rejects every future insert/update that would attach an inbox identity to an erased client. The erasure locks the identity chain before inserting the tombstone, so a writer that committed first is included in the deletion and a writer that waited is refused after commit. Direct access is revoked even from `service_role`. The opaque client id is still classified as personal data: retain it only while the anti-resurrection control is required, keep it access-restricted, and include it in retention review.

All inbox reads filter `.eq("agency_id",…)` **in application code**. The written
SQL gives the five mutable messaging tables `enable row level security` plus
`revoke all from public, anon, authenticated` and `grant all to service_role` —
i.e. service-role-only by grant, with **no policies at all**, so any anon or
authenticated request is denied outright rather than filtered. The separate
erasure tombstone table and trigger are in the unapplied local hardening
migration `20260912130000_atomic_client_inbox_erasure.sql`; deployment and a
real concurrency check remain release gates.

## 3. Storage buckets
Bucket rows and their `storage.objects` policies are defined in
`../../../supabase/migrations/20260731134500_ecosystem_storage_buckets.sql`
(MIME allow-list widened for `aquacrm-uploads` by the `..._expand_aquacrm_private_upload_mimes`
migration). Three policies: public buckets readable by `anon`+`authenticated`;
all eight buckets manageable by `is_internal_user()`; and, on the private
buckets, each user may manage their own folder
(`storage.foldername(name)[1] = auth.uid()::text`). Supabase forces RLS on
`storage.objects` itself, so no migration enables it.

Two `.storage.from()` call sites: `privateUploadStorage.ts` (private) and
`publicUploadStorage.ts` (public media — wired in **public-bucket Phase 1**).

| Bucket | Default | Contents | Access (verified) |
|---|---|---|---|
| Private uploads | `aquacrm-uploads` | private files/recordings/pics | **Server-only via service-role.** upload/download/remove; **the app proxies bytes itself** — no signed URLs, no `getPublicUrl`. Public careers CVs add a stricter quarantine boundary: matching PDF/ZIP bytes are only signature evidence, never malware clearance; absent/unavailable AV/CDR stays quarantined. Release is adopted with an exact agency/application/provider-key/digest check plus bounded durable audit. Every operator download re-hashes the returned bytes against that digest before any 200; mismatch re-quarantines and never serves. Cleared bytes are attachments with `nosniff` and sandbox CSP. |
| Public media | `aquacrm-public` | "approved website media" | **Wired + consumed (public-bucket Phases 1–2)** via `publicUploadStorage.ts` — `storePublicUpload` uploads (`upsert:true` → stable URLs on re-publish) + returns a durable `getPublicUrl` CDN link; `deleteSupabasePublicUpload` for unpublish. **Consumer:** the website-editor `publishPage` promotes inline `data:` media to this bucket on publish, via the new `publicMedia` foundation port (`foundation-adapters/publicMediaAdapter.ts` → `PluginServices.publicMedia`, content-addressed keys under `website-media/<agency>/<client>/<site>/<sha>.<ext>`). Auto-public-on-publish; drafts stay inline. |

Private-upload precedence: Supabase bucket → Vercel Blob (`access:private`) →
hard error in prod → local `.data/` in dev. **Public-upload precedence**
(`publicUploadStorage.ts`, *no Blob tier* — simpler by design): Supabase
`aquacrm-public` + `getPublicUrl` → hard error in prod → local
`public/uploads-public/` in dev (served statically by Next). `createSignedUrl`
**never called anywhere;** `getPublicUrl` is called **only** by the public helper.

## 4. Auth & security
### Real Supabase Auth (verified)
- **Password sign-in:** `auth.signInWithPassword` (anon SSR route client), then it cross-checks `profiles.role` and issues its **own** HMAC session cookie (`lk_session_v1`) — Supabase's session is validated then largely discarded for app authz.
- **Admin (service-role):** `auth.admin.createUser/deleteUser/updateUserById/listUsers` (`supabase/admin.ts`); provisioning writes a `profiles` row and rolls back the auth user if that insert fails.
- **MFA/TOTP (real Supabase):** `auth.mfa.enroll/challenge/verify/listFactors`. Aqua does not implement 2FA — Supabase Auth already has it; `lib/server/mfa.ts` only decides *when* aal2 is required (fails closed). **The login gate IS wired** (2026-08-20): `api/auth/login/route.ts:320-360` calls `loginMfaStep`, then `supabase.auth.mfa.challenge` + `.verify`, and refuses unless the returned access token is aal2. Note the app then mints its **own** HMAC cookie, so aal2 is proven **once at sign-in** and never re-checked per request — that is the honest statement of the posture.

### NOT Supabase Auth — custom HMAC (flag this)
Magic-link, email-verification, password-reset are **hand-rolled HMAC token
systems** (`HMAC-SHA256` signed with `PORTAL_SESSION_SECRET`, single-use via the
`nonces` table) — **not** Supabase `generateLink`/`resetPasswordForEmail` (which
appear nowhere in the repo).

### Client-creation matrix
| Client | Key | RLS applies? |
|---|---|---|
| `createSupabaseAdminClient` | service-role | **Bypasses RLS** |
| inbox `db()` | service-role | **Bypasses RLS** |
| `createRouteSupabaseClient` | anon + cookies | subject to RLS |
| `createServerSupabaseClient` | anon + cookies | subject to RLS |
| `createScopedSupabaseClient` | anon + cookies, 401 if no live Supabase user | subject to RLS |
| storageSupabase / migrate | service-role (PostgREST) | **Bypasses RLS** |

### Security posture (verified 2026-08-20)
- **Service-role usage is now measured and pinned.** Excluding the definition file (`lib/supabase/admin.ts`), `src/` had **23** `createSupabaseAdminClient()` call sites in **18** files on the morning of 2026-08-20; the phase-4 reduction that afternoon moved the ten website-inbox route sites onto the user's scoped client, leaving **13 sites in 8 files** — pinned, with per-site justifications, in `scripts/smoke-service-role-usage.test.ts` (the count can only change knowingly). Counting admin.ts's own three internal `auth.admin` helpers too, the older "27 sites / 19 files" figure becomes 17/9. The anon-key surface is now `profiles` (login) **plus `brand_enquiries` via the scoped client in the website-inbox routes**. Everything still on the service role enforces tenancy **in application code only** (`.eq("agency_id",…)`, metadata routing, `withTenantScope`). **RLS is defence-in-depth plus the inbox-route paths, not blanket database-enforced tenant isolation** — do not oversell it.
- **RLS IS in the repo** — in `../../../supabase/migrations/`, not in `portal/`. Enabled on every table the app touches, with policies built on two `security definer` helpers with pinned `search_path` (`current_profile_role()`, `is_internal_user()`). Live-verified: anon reads 0 rows from `brand_enquiries`/`profiles`/`app_datastores`/`website_consent_events`, and is denied outright on `app_datastore_history`. Only `brands`/`shoots`/`shoot_photos` are anon-readable, deliberately — they hold public website content and no PII. `scripts/schema.sql` deferring RLS applies **only** to `portal_kv`, a different database.
- **Security-definer database functions are version-controlled with pinned
  `search_path` and restricted execution where required.** The 2026-09-03
  application record verified the current `apply_app_datastore_patch`, Inbox
  claim functions and Aqua Tag delivery functions live. The former
  dashboard-only `rls_auto_enable` function is captured by
  `20260903130000_ensure_rls_event_trigger.sql`; recording that already-live
  definition was the one pending no-op migration at that checkpoint.
- **Verify with:** `../../../supabase/rls-verify.sql` (read-only, live posture) and `scripts/smoke-rls-policy-coverage.test.ts` (repo posture vs. code, runs in the smoke suite).
- Verifiable app-layer defenses: rate-limiting + login lockout, consent-gating + PII redaction before telemetry insert, fail-closed env self-check (`env.ts`), encrypted-at-rest Meta tokens (`encrypted_access_token`), hard-delete erasure.

## 5. Env vars (Supabase / DB / storage)
Prod-required and enforced by `env.ts` (throws in prod):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET`,
`NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET`, `PORTAL_SESSION_SECRET` (≥32 chars), and
the independent base64url `PORTAL_DSAR_INTEGRITY_KEY` (32–64 random bytes).
Others: `PORTAL_BACKEND`, `PORTAL_STATE_KEY`, `DATABASE_URL` (+ `PORTAL_PG_*`
pool tuning), `INBOX_STORAGE_BACKEND`, `INBOX_WEBHOOK_RETENTION_DAYS`, Vercel
Blob fallback (`BLOB_*`), Upstash (`PORTAL_KV_*`, the stub backend).

> The three primary Supabase credentials are prod-required and enforced by the
> boot self-check. `.env.example` now documents all three as blank/commented
> placeholders; a real environment must still supply valid values.

_The enquiry tables here are the live side of the [Aqua Tag](aqua-tag.md)
ingestion; the blob backend holds everything else described across the
[state layer](state-layer.md)._
