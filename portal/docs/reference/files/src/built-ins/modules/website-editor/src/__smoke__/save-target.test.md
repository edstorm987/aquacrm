# `src/built-ins/modules/website-editor/src/__smoke__/save-target.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Save-target + save-pipeline smoke tests. Round-6.  Asserts: - defaultSaveTargetForClient picks "client-repo" only when phase is live AND the repo exists AND the export port is available. - savePipeline.savePage routes to the existing storage API in "shared-portal" mode. - savePipeline.savePage routes to PortalExportPort in "client-repo" mode. - savePipeline.savePage falls back to materialize() when the port returns `fallbackToFullReexport: true`. - When PortalExportPort isn't injected, "client-repo" saves gracefully fall through to a soft error (UI toggle hides itself in this case anyway). - previewChanges returns the file list when the port is wired, and `available: false` when not.

_No exported symbols (side-effect / internal module)._

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/lib/savePipeline.ts`](../lib/savePipeline.md)
- [`src/built-ins/modules/website-editor/src/lib/saveTarget.ts`](../lib/saveTarget.md)
- [`src/built-ins/modules/website-editor/src/server/extensionPorts.ts`](../server/extensionPorts.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

