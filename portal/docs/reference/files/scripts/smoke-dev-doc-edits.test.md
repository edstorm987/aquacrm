# `scripts/smoke-dev-doc-edits.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Dev Console doc EDITS smoke — the write half of the in-app docs surface.  The read half (`readDevDoc`) is well covered in smoke-dev-docs.test.ts: traversal, absolute paths, non-markdown, directories, missing files and vendor dirs are all pinned there. The write half — the half that can destroy work — inherited none of it: nothing in scripts/ imported `devDocEdits`, so deleting the root-confinement check would have left the suite green while `../../../.ssh/notes.md` became writable.  This file mirrors those read-side cases against `saveDevDoc`, and adds the attribution contract: the ledger is keyed by the RESOLVED path, so one file cannot end up with two histories under two spellings.  Isolation: `PROJECT_ROOT` is `resolve(process.cwd())` captured when `devDocs.ts` loads, and the ledger lives at `<root>/.data/dev-doc-edits.json`. `process.chdir(sandbox)` before the module is required therefore redirects BOTH the writes and the ledger into a temp tree — the real repo and the real `.data/` are never touched. Hence `require`, not `import`: `import` hoists and would beat the chdir.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/server/types.ts`](../src/server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

