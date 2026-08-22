# `scripts/smoke-aqua-tag-throttle.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Smoke — Aqua Tag network throttling (BEHAVIOURAL). Full suite: PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts  § The editor's wifi control sends `aqua-explorer:throttle` and the tag wraps window.fetch / XMLHttpRequest with REAL latency, bandwidth pacing and offline failure. These tests VM-execute the actual `AQUA_TAG_SOURCE` (same harness family as smoke-aqua-tag-consent-injection.test.ts) and prove the wrap with a clock, not with source shapes: 1. LAZY — a page that is never throttled keeps its native fetch and XHR 2. latency is genuinely waited out; the ack reports what is in force 3. offline rejects the way a dead network rejects (TypeError / XHR error) 4. downKbps paces the response read in proportion to its size 5. re-apply replaces; clear restores the EXACT originals 6. the version gate and the normalizer keep junk out of the wrap  What is deliberately NOT here: any claim about document/stylesheet/image loads. A parent page cannot throttle those (only DevTools can), the tag never pretends to, and no test should ever paper over that scope.  Hermetic: no global mutation — every dependency is a local stub handed to the VM context. Timing assertions are lower bounds with margin, so a busy machine makes them MORE true, never flaky-false.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/lib/integrations/aquaTagSource.ts`](../src/lib/integrations/aquaTagSource.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

