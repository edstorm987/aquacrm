# `scripts/smoke-editor-write-path.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** DEV EDITOR — the write path.  This is the one genuinely destructive thing the editor can do, and this tree carries uncommitted work from several places at once. So the guards are pinned here rather than trusted: losing somebody's unsaved work is not recoverable, and a regression that removes one of these would be silent.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/engines/editor/server/fileTree.ts`](../src/engines/editor/server/fileTree.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

