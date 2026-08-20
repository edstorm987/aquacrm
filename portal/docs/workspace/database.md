# Chapter — Database (Supabase / Postgres) dossier

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

Verified from source query code, from the SQL migrations one directory up, and
from a read-only probe of the live project on 2026-08-20.

> ## ✅ CORRECTED 2026-08-20 — the DDL and the RLS policies DO exist
> An earlier version of this chapter said no table DDL, RLS policy, role grant
> or bucket ACL existed anywhere in the repo, and that
> `20260811113000_master_inbox_messaging.sql` was "absent from disk". **All of
> that was wrong**, and it sent at least one work lane off on a false premise.
>
> They live in **[`../../../supabase/migrations/`](../../../supabase/README.md)**
> — a normal Supabase CLI project sitting beside `portal/`, linked to project
> ref `dghzbsxbdatskserctgt`, the same ref `NEXT_PUBLIC_SUPABASE_URL` points at.
> Fourteen migrations define every table below, every policy, the role grants,
> the storage-bucket ACLs, and the two RPC functions. `20260811113000_master_
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
> corrected where they differed. What remains genuinely unwritten is listed
> under "Known drift" in the Supabase README — most importantly the
> `rls_auto_enable()` function, which exists live and in no migration.

## 1. Two separate persistence concerns (don't conflate)

### A. The portal-state **blob/KV backend** (one giant `PortalState` JSON)
Selected by `PORTAL_BACKEND` (`server/storage.ts`):

| `PORTAL_BACKEND` | Store | Where |
|---|---|---|
| `file` / unset | `.data/portal-state.json` | local file |
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

### `brand_enquiries` (service-role) — the most-used table (31 `.from` sites, 14 files)
Website enquiry capture. `id`, `brand_slug`, `name`, `email?`, `phone?`,
`contact_method?`, `services?` (text[]), `message?`, `source_url?`, `campaign?`,
`consent?` (bool), `created_at` (timestamptz), `metadata` (jsonb). **No
`agency_id` column** — enquiries are global; agency/client routing lives *inside*
`metadata` (`agencyId`, `routedClientId`, `clientId`, `masterTag`/`captureOnly`).
Erasure = **hard delete** `.delete().eq("id",…)`.
**RLS:** enabled. `anon` may **INSERT only**, and only when `consent = true` and
the row carries a real name plus an email or a ≥7-char phone — the website form's
validation is in the policy's `WITH CHECK`, not just in app code. No anon SELECT:
the live probe returned 0 rows to the anon key against 35 rows for service-role.
Because there is no `agency_id`, **RLS cannot scope this table by tenant at all.**

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
(`magic-link|email-verify|password-reset|csrf`), `expires_at BIGINT NOT NULL`
(epoch ms), index on `expires_at`. Atomic consume via
`INSERT … ON CONFLICT DO NOTHING RETURNING`.

### `inbox_*` tables (service-role) — Master Inbox / Meta messaging
> 🔴 **These five tables DO NOT EXIST in the live project.** Verified
> 2026-08-20: PostgREST returns `404 PGRST205` for all five to *both* the anon
> key and the service-role key, and `claim_inbox_webhook_events` is absent from
> the project's RPC list. The migration that creates them,
> `../../../supabase/migrations/20260811113000_master_inbox_messaging.sql`, is
> on disk but **has never been applied**. Since `useSupabase()` returns true
> whenever `NODE_ENV === 'production'`, the first inbox request in production
> hits tables that are not there. Run `supabase db push` before relying on
> anything below.

Gated by `useSupabase()` (`INBOX_STORAGE_BACKEND==='supabase'` **or**
`NODE_ENV==='production'`; else local JSON `.data/inbox-messaging.json`). Own
service-role client. Columns from the `*Row` mappers:
- **`inbox_channel_connections`** — `id`, `agency_id`, `company_id?`, `provider`, `channel`, `auth_mode`, `external_account_id`, `display_name`, `scopes`, `status`, `webhook_status`, **`encrypted_access_token`** (secret at rest), `token_expires_at?`, `last_sync_at?`, `last_error?`, timestamps.
- **`inbox_contact_identities`** — `id`, `agency_id`, `connection_id`, `external_user_id`, `display_name`, `lead_id?`/`contact_id?`/`client_id?`, timestamps.
- **`inbox_conversations`** — `id`, `agency_id`, `connection_id`, `identity_id`, `external_conversation_id`, `status`, `assigned_to?`, `tags`, `unread_count`, timing fields, `metadata`, timestamps.
- **`inbox_messages`** — `id`, `agency_id`, `connection_id`, `conversation_id`, `external_message_id?`, `direction`, `message_type`, `body_text?`, `attachments` (jsonb), `status`, `metadata`, `sent_at`, timestamps.
- **`inbox_webhook_events`** — `id`, `provider`, `event_key`, `payload` (jsonb), `status`, `attempts`, `available_at`, `processed_at?`. Claimed via RPC **`claim_inbox_webhook_events`** — defined in the (unapplied) inbox migration; `security definer`, execute granted to `service_role` only. Pruned by hard delete past retention.

All inbox reads filter `.eq("agency_id",…)` **in application code**. The written
SQL gives all five tables `enable row level security` plus
`revoke all from public, anon, authenticated` and `grant all to service_role` —
i.e. service-role-only by grant, with **no policies at all**, so any anon or
authenticated request is denied outright rather than filtered.

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
| Private uploads | `aquacrm-uploads` | private files/recordings/pics | **Server-only via service-role.** upload/download/remove; **the app proxies bytes itself** — no signed URLs, no `getPublicUrl`. |
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
| storageSupabase / migrate | service-role (PostgREST) | **Bypasses RLS** |

### Security posture (verified 2026-08-20)
- **Every substantive discrete-table op goes through the service-role key, which bypasses RLS.** Re-counted in `src/` on 2026-08-20: **27** `createSupabaseAdminClient()` call sites across **19** files, and **9** files referencing `SERVICE_ROLE` (`supabase/admin.ts`, `server/storage.ts`, `server/storageSupabase.ts`, `lib/server/{env,inboxStore,privateUploadStorage,publicUploadStorage,productionReadiness,databaseStorageHealth}.ts`). *(The previous line said "26 / 14 files"; the 14 does not match any `SERVICE_ROLE` grep — 14 is the number of files that touch `brand_enquiries`, which is the figure two headings up.)* Against that, **exactly one** table read in the whole portal uses the anon key (`profiles`, in `api/auth/login`). Tenant isolation for the service-role paths is therefore **enforced only in application code** (`.eq("agency_id",…)`, metadata routing, `withTenantScope`). **RLS here is defence-in-depth, not the primary control** — do not describe it as database-enforced tenant isolation.
- **RLS IS in the repo** — in `../../../supabase/migrations/`, not in `portal/`. Enabled on every table the app touches, with policies built on two `security definer` helpers with pinned `search_path` (`current_profile_role()`, `is_internal_user()`). Live-verified: anon reads 0 rows from `brand_enquiries`/`profiles`/`app_datastores`/`website_consent_events`, and is denied outright on `app_datastore_history`. Only `brands`/`shoots`/`shoot_photos` are anon-readable, deliberately — they hold public website content and no PII. `scripts/schema.sql` deferring RLS applies **only** to `portal_kv`, a different database.
- **Two `SECURITY DEFINER` RPCs are defined in the migrations**, both with pinned `search_path` and `execute` revoked from `anon`/`authenticated`: `apply_app_datastore_patch` (live) and `claim_inbox_webhook_events` (not applied). A **third**, `rls_auto_enable`, exists in the live project and **is in no migration** — dashboard-only drift that will not survive a rebuild. Export and commit it.
- **Verify with:** `../../../supabase/rls-verify.sql` (read-only, live posture) and `scripts/smoke-rls-policy-coverage.test.ts` (repo posture vs. code, runs in the smoke suite).
- Verifiable app-layer defenses: rate-limiting + login lockout, consent-gating + PII redaction before telemetry insert, fail-closed env self-check (`env.ts`), encrypted-at-rest Meta tokens (`encrypted_access_token`), hard-delete erasure.

## 5. Env vars (Supabase / DB / storage)
Prod-required and enforced by `env.ts` (throws in prod):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET`,
`NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET`, `PORTAL_SESSION_SECRET` (≥32 chars).
Others: `PORTAL_BACKEND`, `PORTAL_STATE_KEY`, `DATABASE_URL` (+ `PORTAL_PG_*`
pool tuning), `INBOX_STORAGE_BACKEND`, `INBOX_WEBHOOK_RETENTION_DAYS`, Vercel
Blob fallback (`BLOB_*`), Upstash (`PORTAL_KV_*`, the stub backend).

> ⚠ **Notable gap:** the three primary Supabase credentials are prod-required
> and enforced by the boot self-check, **yet are absent from `.env.example`** —
> a dev copying the example gets a build that fails the boot check. Only the two
> bucket-name vars are documented there.

_The enquiry tables here are the live side of the [Aqua Tag](aqua-tag.md)
ingestion; the blob backend holds everything else described across the
[state layer](state-layer.md)._
