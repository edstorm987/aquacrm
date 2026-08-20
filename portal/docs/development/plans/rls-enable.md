# Plan — Database Row-Level Security  🟠 mostly done, three real gaps left

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: BUILDING — phases 1, 2 and 5 done; phases 3 and 4 open (3 needs Ed). The headline premise of this plan was wrong and has been corrected.**

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

3. **`brand_enquiries` still has no `agency_id`.** 31 `.from` sites across 14
   files, all routing by `metadata.agencyId`. Until the column exists, RLS
   **cannot** scope the table by tenant, whatever policies are written. This is
   the one item that is a genuine schema decision rather than a chore.

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
4. **Reduce service-role reliance where feasible** — for reads that could run
   under the user's session, move them off service-role so RLS applies. Scoped;
   don't break the app. **Open.** Note the honest ordering: this is the phase
   that would turn RLS into a real control, and it is the one not started.
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
