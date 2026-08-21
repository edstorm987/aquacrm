# `scripts/smoke-service-role-usage.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Service-role usage — measured, pinned, and only allowed to go DOWN knowingly. WHY THIS EXISTS RLS only gates requests made with the anon key; every `createSupabaseAdminClient()` call site bypasses it entirely. The RLS plan (docs/development/plans/rls-enable.md, phase 4) reduces that surface: on 2026-08-20 the portal had 23 call sites across 18 files; the website-inbox routes were then moved onto the signed-in user's scoped client (`createScopedSupabaseClient`), leaving the sites pinned below — each of which has a documented reason it must keep the service role. MEASUREMENT METHOD (keep it identical or the history is meaningless): count occurrences of the literal `createSupabaseAdminClient(` in `src/`, excluding only `src/lib/supabase/admin.ts` — the file that defines it. That is the same thing as: grep -rn 'createSupabaseAdminClient(' src/ minus the definition file. IF THIS TEST FAILS: - You REMOVED a site (good): update EXPECTED_SITES, and record the new count in the plan's phase-4 table so the reduction is on the record. - You ADDED a site: stop. Decide whether the new code can run under the user's session (`createScopedSupabaseClient`) instead. If it genuinely needs the service role (storage ACLs, auth.admin, public endpoints with no session, cross-tenant erasure), add it BOTH here and to the plan's phase-4 table with its reason. An undocumented service-role site is how "RLS is on" quietly stops meaning anything.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

