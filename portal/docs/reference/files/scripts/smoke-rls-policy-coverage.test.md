# `scripts/smoke-rls-policy-coverage.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** RLS policy coverage — the repo's written SQL vs. what the code actually does. WHY THIS EXISTS The RLS posture for the discrete Supabase tables is defined by SQL migrations that live OUTSIDE the portal package, in `aquaCRM/supabase/migrations/`. The portal is what ships; nothing in it referenced those files, so an auditor reading only `portal/` concluded (wrongly) that no RLS SQL existed anywhere. This test ties the two halves together. It parses the real migration SQL — not a hand-maintained manifest, which would rot — and asserts that the policy set the repo has written down still matches what the application code assumes: 1. Every table the app reaches has RLS enabled in written SQL. 2. Every table reached with the ANON key is covered by a written policy that the anon role can actually match. (Anon is the only path RLS gates — service-role bypasses it entirely.) 3. Only the deliberately-public website tables are readable by anon. A `using (true)` SELECT policy appearing on a private table is the single most dangerous drift, and it fails here. 4. No policy is written against a table whose RLS is never enabled — a policy on an RLS-off table is a silent no-op that reads as protection. 5. Every Supabase call site is classified as anon or service-role, so a new one cannot be added without this test being told which it is. It does NOT talk to the live database. Live posture was verified read-only on 2026-08-20 and is recorded in docs/workspace/database.md; this test guards the repo-side contract, which is the half that silently drifts.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

