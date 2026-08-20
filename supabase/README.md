# Supabase — schema, RLS policies and how to verify them

This directory is the **only** place the AquaCRM database schema and its
row-level-security policies are written down. It is a standard Supabase CLI
project (`config.toml`, `migrations/`), linked to project ref
`dghzbsxbdatskserctgt` — the same project `NEXT_PUBLIC_SUPABASE_URL` points at
in `portal/.env.local`.

> **If you are reading `portal/` and concluded there is no RLS in the repo:
> there is. It is here, one level up.** The portal package is what deploys, so
> it is easy to mistake for the whole repo. It is not. Every `CREATE POLICY` in
> the system lives in `migrations/`.

## Layout

| Path | What it is |
|---|---|
| `migrations/` | The schema and RLS policy set, applied in filename (timestamp) order. |
| `rls-verify.sql` | Read-only audit of the **live** posture. Run it in the SQL editor; it changes nothing. |
| `config.toml` | Supabase CLI config for this project. |
| `.temp/` | CLI scratch state. Not meaningful; do not edit. |

The portal's own `scripts/schema.sql` is unrelated — it is DDL for the optional
`portal_kv` Postgres backend (`PORTAL_BACKEND=postgres`), which is a **different
database** and is not part of this project.

## What the policy set actually says

Two helper functions, both `stable security definer` with a pinned
`search_path`, defined in `20260731120000_initial_aquacrm_security.sql`:

- `public.current_profile_role()` — the caller's `profiles.role`, via `auth.uid()`.
- `public.is_internal_user()` — true when that role is `owner` or `staff`.

Nearly every policy is one of two shapes: *internal users manage everything*
(`using (is_internal_user())`), or *you can see your own row*
(`using (id = auth.uid())`). Three tables break that pattern deliberately.

| Table | Anon can read? | Anon can write? | Notes |
|---|---|---|---|
| `brands`, `shoots`, `shoot_photos` | **yes** — `using (true)` | no | Public website content. No PII. This is intentional. |
| `brand_enquiries` | no | **INSERT only**, and only with `consent = true`, a real name, and an email or a ≥7-char phone | The website contact form. The `WITH CHECK` predicate is the validation. |
| `profiles` | no | no | Authenticated: own row, or any row if internal. The login route reads this with the anon key. |
| `clients`, `client_portals`, `client_portal_members`, `audit_events` | no | no | Internal-manages + portal-member read. **No application code queries these** — see drift below. |
| `app_datastores`, `website_consent_events` | no | no | Internal-manages policy; in practice reached only by service-role. |
| `app_datastore_history` | no | no | Hardest-locked table: `revoke all from anon, authenticated`, `grant select to service_role`. Denies with `42501`, not an empty result. |
| `inbox_*` (5 tables) | no | no | `revoke all from public, anon, authenticated`; service-role only. **Not applied to the live project** — see drift below. |
| `storage.objects` | public buckets only | no | Private buckets are internal-users or own-folder (`storage.foldername(name)[1] = auth.uid()`). |

## Live posture — verified read-only 2026-08-20

Probed with the public anon key and compared against service-role, over
PostgREST. No writes were performed.

| Table | anon | service-role | Reading |
|---|---|---|---|
| `brand_enquiries` | `200`, 0 rows | 35 rows | RLS filtering, grant present |
| `profiles` | `200`, 0 rows | 2 rows | RLS filtering |
| `app_datastores` | `200`, 0 rows | 1 row | RLS filtering |
| `website_consent_events` | `200`, 0 rows | 10 rows | RLS filtering |
| `app_datastore_history` | `401` `42501` | 100 rows | Grant revoked — a stronger denial |
| `brands` / `shoots` / `shoot_photos` | 5 / 3 / 7 rows | same | Public by design ✅ |
| `clients`, `client_portals`, `client_portal_members`, `audit_events` | 0 rows | **0 rows** | Empty tables — proves nothing either way |
| `inbox_*` (5) | `404` | `404` | **Not present in the live database** |

Every result above matches what `migrations/` says it should be. The two
denial *styles* differ exactly where the SQL says they should, which is decent
evidence that the migrations — not dashboard clicks — are the live source of
truth.

## Known drift — fix before this is treated as reproducible

1. **`rls_auto_enable()` exists live but is in no migration.** It appears in the
   PostgREST function list for this project and nothing in this directory
   creates it. It was made in the dashboard and will not survive a rebuild.
   Export its definition (`select prosrc from pg_proc where proname =
   'rls_auto_enable'`) and commit it here.
2. **`20260811113000_master_inbox_messaging.sql` has never been applied.** All
   five `inbox_*` tables and the `claim_inbox_webhook_events` function are
   absent from the live project. The portal selects the Supabase inbox backend
   whenever `NODE_ENV === 'production'`, so this is a live production failure
   waiting on the first inbox request, not just a migration-hygiene issue.
3. **`clients` / `client_portals` / `client_portal_members` / `audit_events` are
   orphans.** They exist, they are policed, and no portal code queries them.
   Either the portal grew past them or they are unfinished. Decide and record it.
4. **RLS is defence-in-depth here, not the primary control.** Counted in
   `portal/src` on 2026-08-20: **26** `createSupabaseAdminClient()` call sites
   and **14** files referencing `SUPABASE_SERVICE_ROLE_KEY` — all of which
   bypass RLS. Exactly **one** table read in the entire app uses the anon key
   (`profiles`, in the login route). And `brand_enquiries` has no `agency_id`
   column, so it cannot be scoped by tenant in the database at all — routing
   lives inside `metadata.agencyId`, across **31** query sites in 14 files. Do
   not describe this posture as tenant isolation enforced by the database.

## Verifying

**Live posture** — paste `rls-verify.sql` into the Supabase SQL editor. It is
SELECT-only. A clean run returns nothing but `INFO` rows; any `FAIL` row names
the table and says what is wrong.

**Repo posture** — from `portal/`:

```
NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/smoke-rls-policy-coverage.test.ts
```

That test parses these migration files and checks them against the portal's
actual Supabase call sites: RLS enabled for every table the app touches, a
usable policy for every table reached with the anon key, and no table outside
`brands`/`shoots`/`shoot_photos` readable by an unauthenticated browser. It runs
in the portal's normal smoke suite, so the check happens whether or not anyone
remembers this directory exists.

## Applying changes

```
supabase db push            # apply pending migrations to the linked project
supabase db lint --linked   # server-side lint, read-only
```

Never edit an already-applied migration in place — add a new timestamped file.
And never make a policy change in the dashboard without writing the equivalent
migration here; that is precisely how items 1 and 2 above happened.
