# `scripts/smoke-aqua-editor-ai-stale-key-panel.harness.tsx`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** AQUA EDITOR AI — the stale key-panel harness.  Renders `AquaEditorAIKey` to REAL HTML in two states and prints them as one JSON document on stdout:  • `stale` — the panel is scoped to project B while the `status` in hand still carries project A's answer. That is exactly the one-round-trip window after an in-editor project switch, and the defect this pins was project B wearing A's masked key tail, vault label, model and brief while the panel simultaneously said "Reading this project's setup…". • `fresh` — the SAME status rendered for its own project, proving that every fact the test bans genuinely renders when it should. An assertion that could never fail proves nothing.  A separate process because the smoke suite runs under `NODE_OPTIONS='--conditions react-server'`, where `react-dom/server` does not resolve at all — the same reason `smoke-portal-element-parity.harness.tsx` exists. Run directly to see the JSON: npx tsx scripts/smoke-aqua-editor-ai-stale-key-panel.harness.tsx

_No exported symbols (side-effect / internal module)._

## Depends on (2)

- [`src/components/editing/AquaEditorAIKey.tsx`](../src/components/editing/AquaEditorAIKey.md)
- [`src/server/types.ts`](../src/server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

