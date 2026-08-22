# `src/engines/editor/elements/variantResolver.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (7)

- `visitorId(): string`
- `sessionId(): string`
- `interface ResolvedVariant (2 members)`
- `resolveVariant({ block, groupId, trafficPercent = 100, stickyBy = "visitor" }: ResolveInput): ResolvedVariant`
- `applyVariant(block: Block, variant: BlockVariant | null): Block`
- `recordExposure(groupId: string, variantId: string)`
- `recordConversion(groupId: string, variantId: string)`

## Depends on (1)

- [`src/engines/editor/elements/block.ts`](./block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/components/variantResolver.ts`](../../../built-ins/modules/website-editor/src/components/variantResolver.md)
- [`src/engines/editor/elements/BlockRenderer.tsx`](./BlockRenderer.md)

