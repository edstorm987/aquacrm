# `scripts/smoke-portal-element-parity.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** ELEMENT ENGINE P3 — the HTML-parity safety net.  P3 brings the client portal's 16 block types onto the shared element registry so there is ONE list of placeable things instead of two. Live client portals render from those blocks right now. This file exists to make one promise enforceable:  THE MERGE DID NOT CHANGE A SINGLE CHARACTER OF WHAT A CLIENT SEES.  `scripts/smoke-portal-element-parity.harness.tsx` renders every portal block type to real HTML — 137 renders spanning every type, both empty and populated clients, every tone/alignment/width/visibility branch, every data-source, request, approval and upload binding, preview mode, custom pages, unsafe hrefs and an unknown type. `scripts/portal-block-parity.baseline.json` is that capture taken from the PRE-MERGE code. This test re-runs the harness against whatever the code is now and requires the output to be byte-identical.  ── Why a child process ───────────────────────────────────────────────────  The suite runs under `NODE_OPTIONS='--conditions react-server'`. Under that condition `react-dom/server` does not resolve and `next/link` throws on `React.createContext` — so a portal page cannot be rendered to HTML in this process at all. The harness therefore runs as a plain Node process with the condition stripped, and this file spawns it and diffs the JSON. That is the difference between comparing real HTML and comparing an approximation of it.  ── If this test fails ────────────────────────────────────────────────────  It is telling you that a client's portal page now renders differently. Do NOT re-capture the baseline to make it green. Either the change was unintended — fix it — or it is deliberate, in which case it must be named: add the intended difference to `INTENDED_DIFFERENCES` below with a reason, re-capture with `npx tsx scripts/smoke-portal-element-parity.harness.tsx --write-baseline`, and say so in the change notes. A silently re-captured baseline is the same as having no baseline.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

