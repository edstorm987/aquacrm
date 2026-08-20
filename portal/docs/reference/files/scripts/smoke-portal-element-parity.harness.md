# `scripts/smoke-portal-element-parity.harness.tsx`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** HTML-parity harness for the client portal block vocabulary.  THE SAFETY NET FOR ELEMENT-ENGINE P3. Live client portals render from `ClientPortalPageBlock` today. P3 merges those 16 types onto the shared element registry, and a merge that changes one character of what a signed-in client sees is a failure even if every other test is green. So this renders every portal block type to REAL HTML and the test file compares it, byte for byte, against a baseline captured from the pre-merge code.  ── Why this is a separate process, not a `describe` block ─────────────────  The smoke suite runs under `NODE_OPTIONS='--conditions react-server'`, and under that condition `react-dom/server` does not resolve at all — the react-server build of React has no `renderToStaticMarkup`, and importing `next/link` throws on `React.createContext`. Both are exactly what a portal page is made of. So the harness runs as a plain Node process (no condition), prints one JSON document on stdout, and `scripts/smoke-portal-element-parity.test.ts` spawns it and does the diffing. That is what makes this real HTML rather than a hand-rolled approximation of it.  ── What is captured ──────────────────────────────────────────────────────  1. `blocks`     — `createPortalBlock(type)` for all 17 known types. The stored record shape, so a "harmless" default change is a diff. 2. `normalise`  — `normalisePortalBuilder` over a hostile document. Pins the fail-soft (unknown type → rich-text) as PORTAL-SURFACE behaviour. 3. `render`     — every type × {default, dressed} × {bare client, rich client}, plus whole-page compositions. Real HTML.  Run directly to see the JSON: npx tsx scripts/smoke-portal-element-parity.harness.tsx Re-capture the baseline (only ever with a deliberate, named intent): npx tsx scripts/smoke-portal-element-parity.harness.tsx --write-baseline

## Exports (2)

- `interface ParityCapture (3 members)`
- `capture(): ParityCapture`

## Depends on (4)

- [`src/app/portal/customer/_PortalPageComposition.tsx`](../src/app/portal/customer/_PortalPageComposition.md)
- [`src/app/portal/customer/_portalData.ts`](../src/app/portal/customer/_portalData.md)
- [`src/lib/portal/clientPortalBuilder.ts`](../src/lib/portal/clientPortalBuilder.md)
- [`src/server/types.ts`](../src/server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

