# `src/built-ins/modules/website-editor/src/lib/saveTarget.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (7)

- `type SaveTarget`
- `getSaveTarget(clientId: string): SaveTarget`
- `setSaveTarget(clientId: string, target: SaveTarget): void`
- `onSaveTargetChange(handler: (e: { clientId: string; target: SaveTarget }) => void): () => void`
- `interface ResolveDefaultInput (4 members)`
- `defaultSaveTargetForClient(input: ResolveDefaultInput): SaveTarget`
- `resolveSaveTarget(input: ResolveDefaultInput): SaveTarget`

## Used by (3)

- [`src/built-ins/modules/website-editor/src/__smoke__/save-target.test.ts`](../__smoke__/save-target.test.md)
- [`src/built-ins/modules/website-editor/src/components/editor/SaveTargetToggle.tsx`](../components/editor/SaveTargetToggle.md)
- [`src/built-ins/modules/website-editor/src/lib/savePipeline.ts`](./savePipeline.md)

