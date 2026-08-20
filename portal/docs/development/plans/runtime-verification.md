# Plan — Runtime verification of the critical flows  🔴 blocker

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: BUILDING — Phase 1 cleared (isolated sandboxes exist); 3 of the 5 critical flows in Phase 2 remain unverified.** Actually run the app and confirm the launch-critical flows work end-to-end — turning "coded + static-tested" into "verified", per [status.md](../status.md).
flows work end-to-end — turning "coded + static-tested" into "verified", per
[status.md](../status.md). ("A passing test ≠ working.")

## Where we are
- Nothing has been runtime-verified; most features are coded + static-source-tested only.
- **Blocked on a runnable server** — another session holds port 3032 and the preview system won't start a second server for this dir. `npm run dev:verify` (file backend, added) is ready but needs a free port.

## Phases
1. **Server access.** Free 3032 (stop the idle session) *or* run `npm run dev:verify` on an assigned port. Confirm it boots against the seeded `.data` sandbox (milesymedia + 13 clients).
2. **Verify the critical flows** (as the real roles):
   - Enquiry ingestion: Aqua Tag / `POST /api/public/brand-enquiry` → dedupe → inbox (⚠ writes live Supabase — use clearly-labelled test data).
   - Customer portal actually loads for an `end-customer`.
   - Connect + setup flows (as far as the `00000`/creds gates allow).
   - Aqua Tags **detect** on a real domain (`/api/portal/aqua-tags/detect`).
   - The new Command Centre **infra health panel** renders (radar upgrade Stage 4).
3. **Record real results** in [status.md](../status.md) — move each flow to `runtime-verified` with the date + exactly what was checked.
4. **Close gaps with behavioural tests** — where a flow was broken or fragile, add a test that renders/calls and asserts the *result* (not a source-shape assertion).

## Reuse
`npm run dev:verify` (file backend — keeps state off live Supabase), the `.mjs` HTTP harnesses (`smoke.mjs`, `smoke-ux.mjs`), the browser preview tools.

## Decisions (Ed)
- How to free a server (stop the other session, or dedicate one).
- Whether a single labelled test enquiry to live Supabase is OK (else verify the validation/negative paths only).

## Done when
The critical-flow rows in [status.md](../status.md) are `runtime-verified` with dates and what was checked — and any breakage found is fixed + covered by a behavioural test.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `docs/development/status.md`
- `docs/context/state.md`
- `docs/development/plans/runtime-verification.md`
- `scripts/smoke.mjs`
- `scripts/smoke-ux.mjs`
- `scripts/smoke-perf.mjs`
- `scripts/post-deploy-smoke.mjs`
- `scripts/fork-sandbox.mjs`
- `package.json`
