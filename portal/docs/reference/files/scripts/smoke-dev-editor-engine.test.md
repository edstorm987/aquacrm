# `scripts/smoke-dev-editor-engine.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** DEV EDITOR ENGINE — the rename + the "editor is wrong" fix.  Two promises this pins: 1. The Dev Team "Editor" route mounts the FULL engine UI — the Portal Studio (live canvas, depth selector, and the Builder/Content/Pages/Brand/Code/ Repo/Versions inspectors) — through the shared engine loader, and it is founder + Dev Mode gated like every other dev-team surface. It previously mounted `CodeWorkspace`: a read-only repository tree, which is one inspector's worth of the engine. The repository browser still exists — it is the studio's Repo tab — so this is a superset, not a swap. 2. Every user-facing "Aqua Engine" label became "Dev Editor Engine". The one editor has one name, and it is the new one.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

