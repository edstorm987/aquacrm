# Plan — Runtime verification of the critical flows  🔴 blocker

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: BUILDING — Phase 1 cleared (isolated sandboxes); Phase 2: the route sweep (60/60 clean) and the CONNECT-CODE CHAIN are browser-verified 2026-08-20 late evening. Remaining unwalked: staff team, freelancer workspace, internal chat, public bucket, Meta inbox (blocked on Ed's Meta app).
flows work end-to-end — turning "coded + static-tested" into "verified", per
[status.md](../status.md). ("A passing test ≠ working.")

## Where we are (corrected 2026-08-20)
- **Not "nothing" any more.** The earlier text here said nothing had been runtime-verified and that this plan was blocked on a free port. Both statements are stale: on 2026-08-20 alone, workers browser-verified the Dev Console topbar on `:3047`, the element-block render on `:3043` and finance double-click idempotency on `:3051` — three sandboxes at once.
- **The port blocker is SOLVED, not waiting on Ed.** `npm run sandbox:fork` ([`package.json:85`](../../../package.json) → `scripts/fork-sandbox.mjs`) gives each worker its own state file, build dir and port, so "another session holds 3032" no longer stops anyone. `npm run dev:verify` ([`package.json:9`](../../../package.json)) still exists for a file-backed run.
- **What remains is the walk, not the runway.** Most features are coded + static-source-tested; the named critical flows below are the ones still to be driven by hand.

## Phases
1. ✅ **Server access.** Cleared — `npm run sandbox:fork` gives every worker an isolated sandbox (own `PORTAL_DATA_FILE`, `NEXT_DIST_DIR` and port), so no one waits on 3032. This is no longer a decision for Ed.
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
- ~~How to free a server (stop the other session, or dedicate one).~~ **Moot — `sandbox:fork` gives each worker its own.**
- Whether a single labelled test enquiry to live Supabase is OK (else verify the validation/negative paths only). **Still open.**

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
