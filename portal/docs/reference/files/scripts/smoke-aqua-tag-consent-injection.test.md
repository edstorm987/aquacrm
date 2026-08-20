# `scripts/smoke-aqua-tag-consent-injection.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Smoke — Aqua Tag injection consent gate (BEHAVIOURAL). Full suite: PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts  § The auditor asked for this one twice: the injection gate was only ever proved by source-shape assertions (smoke-aqua-tag-injections.test.ts), which cannot show that a tag actually STAYS OUT of the page until consent. This VM-executes the real `AQUA_TAG_SOURCE` (same harness as smoke-consent-capture.test.ts) against a fake DOM and a stubbed config endpoint, and asserts on what reaches `document.head`: 1. analytics injection + NO consent  → nothing injected 2. applyPreferences granting analytics → injected retroactively 3. rejection keeps it out; marketing stays out when only analytics granted 4. fail-CLOSED: a category-less / unknown-category item is never injected  Hermetic: no global process.env / globalThis.fetch mutation (the suite runs files concurrently in one shared process) — every dependency is a local stub handed to the VM context.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/lib/aquaTagSource.ts`](../src/lib/aquaTagSource.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

