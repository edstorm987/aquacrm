# `src/built-ins/modules/website-editor/src/components/variantResolver.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (7)

- `visitorId(): string`
- `sessionId(): string`
- `interface ResolvedVariant (2 members)`
- `resolveVariant({ block, groupId, trafficPercent = 100, stickyBy = "visitor" }: ResolveInput): ResolvedVariant`
- `applyVariant(block: Block, variant: BlockVariant | null): Block`
- `recordExposure(groupId: string, variantId: string)`
- `recordConversion(groupId: string, variantId: string)`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/components/BlockRenderer.tsx`](./BlockRenderer.md)
- [`src/built-ins/modules/website-editor/src/components/index.ts`](./index.md)

