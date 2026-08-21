# Tests

← Back to [development.md](../development.md) (the law)

How testing works here, and what's covered. **Run the full suite before calling
any behaviour change done** (CLAUDE.md contract — adjacent suites miss contract
tests that pin old behaviour).

## The canonical command
```bash
PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts
```
`PORTAL_BACKEND=memory` keeps stateful tests off the live sandbox. Last known
green: **2,704 tests passing / 0 failing / 1 skipped, typecheck clean** (2026-08-21).

## ⚠ What a green suite proves — and what it does NOT (read this)
**A passing test ≠ a working feature ≠ a usable feature.** Most tests here are
**static-source contract tests**: they `readFileSync` a module and assert on its
*content/shape* (a function exists, a string is present, a wiring is declared).

A green suite proves:
- ✅ the code has the expected **shape** and hasn't structurally regressed;
- ✅ **pure logic with real unit tests** computes correctly (e.g. `company-health` scoring → overall 34, radar lens evaluation, resolution classification).

It does **NOT** prove:
- ❌ the feature actually **runs** at runtime — a static test passes even if the component throws when rendered;
- ❌ the feature is **wired end-to-end** — that API ↔ state ↔ UI actually connect;
- ❌ a real user can **reach and use** it — it may sit behind a dev flag, need missing credentials, or be a half-built wizard.

Runtime proof comes only from **running it**: the `.mjs` HTTP harnesses (need a
live server) or clicking through the app. The honest per-feature reality —
what's actually usable vs. coded-and-static-tested — is in **[status.md](status.md)**.
The generated docs (symbol map, file docs) share this limit: **they were parsed
from source, not run.**

## The convention
- `node:test` run through **tsx** (no Jest/Vitest). `scripts/` is excluded from tsconfig — tests only run under tsx.
- Most are static-source contract tests (above). They pin structure, so a refactor that changes a literal can fail a test that's really still correct — read the assertion before "fixing".
- ~180 `*.test.ts` files, grouped by domain (radar, inbox, attention, products, connections, auth, finance, enquiries, people, command-centre, assistant, website/editor, fulfilment, platform).

## ⚠ Gotchas
- **7 files omit the `smoke-` prefix**, so `npm run smoke:all`'s narrow glob misses them (the `*.test.ts` full-suite glob catches them): `company-health`, `client-aqua-health`, `client-marketing-service`, `client-workspace-navigation`, `hiring-capacity`, `attention-protection`, `inbox-attention-thread`. **Always run the full `scripts/*.test.ts` glob**, not `smoke:all`.
- `audit-*.ts` files (e.g. `audit-alert-families.ts`, `audit-judgement-evidence.ts`) are **read-only diagnostics** — run manually (`npx tsx scripts/audit-*.ts`), print tables, are not pass/fail tests.
- **`verify-marketing-runtime.ts` is an in-process runtime harness**, not a suite test: `PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx scripts/verify-marketing-runtime.ts` (27 checks). It builds a fresh agency + a **real** Radar and command-intelligence snapshot, so it proves the marketing spine *runs*, not just that it is shaped right — it caught a fabricated-zero bug the synthetic-fixture tests structurally could not. It stays out of the suite because it calls `ensureHydrated({ fresh: true })` and the suite runs files **concurrently in one process**, where a state wipe pollutes other files. **This is a good pattern to copy** when a module's real path is only exercised at render time.
- HTTP/e2e `.mjs` harnesses (`smoke.mjs`, `post-deploy-smoke.mjs`, `smoke-perf.mjs`, `smoke-postgres.mjs`) need a live server.

## ⚠ Writing a CONCURRENCY test (read before you trust one)
`await Promise.all([handler(req), handler(req)])` **does not actually race** in one Node process.
`req.json()` is a macrotask and everything after it (in-memory storage `get`/`set`) is microtasks,
which drain fully before the next macrotask — so the first call runs start-to-finish before the
second resumes, the check-then-write window never opens, and **the test passes on the broken code.**
This bit for real: the first version of the finance double-click test passed with the fix reverted.

Wrap the storage so every op awaits a macrotask (`await new Promise(r => setTimeout(r, 0))`) before
delegating — that restores the read→write window a real server has. Reference: `racingWorld()` in
[`smoke-finance-idempotency.test.ts`](../../scripts/smoke-finance-idempotency.test.ts).

**Always mutation-check a safety test:** revert the fix and confirm the test fails, and fails for the
right reason. If it still passes, you haven't reproduced the bug — you've written a test that agrees
with whatever the code does.

**Test files DO run in separate processes** (`node --test` spawns one per file), so `process.env` and
other process globals do **not** leak between them — registering a module-level singleton in a test
file is safe. What genuinely crosses files is the **filesystem** (`.data/portal-state.json`,
`.next-*`) and ports.

## What's covered where (verified inventories)
- **Radar / attention / resolution** — the most heavily tested area; every radar/attention/action-classification/evidence test and exactly what it asserts is inventoried in the [Radar dossier §11](../workspace/radar.md).
- **Aqua Tag** — `smoke-aqua-tag-detection`, `smoke-consent-capture`, `smoke-website-sources`, `smoke-enquiry-dedupe`.
- **This session's new features** — `smoke-portal-connections`, `smoke-customer-setup`, `smoke-client-erasure`, `smoke-enquiry-dedupe`, `smoke-website-sources`.
- **Full per-file list** — every test file with its exported symbols is in the [scripts symbol reference](../reference/scripts.md).

## The rule (from CLAUDE.md)
> Run the FULL smoke suite before calling a behaviour change done. Find the
> nearest smoke test and **extend it with the behavioural contract** you're
> adding. A contract test may be pinning the exact behaviour you just changed.

_The doc-generators (`generate-symbol-reference.mjs`,
`generate-radar-rules-reference.ts`) are not tests — they regenerate
`docs/reference/`. Re-run them after code changes (see [development.md](../development.md))._
