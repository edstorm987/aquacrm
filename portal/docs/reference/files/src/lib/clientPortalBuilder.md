# `src/lib/clientPortalBuilder.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (12)

- `CLIENT_PORTAL_BLOCK_REGISTRY: Array<{ type: ClientPortalBlockType; label: string; description: string; category: "content" | "live-data" | "layout"; }>`
- `createPortalBlock(type: ClientPortalBlockType, id = portalBuilderId("block")): ClientPortalPageBlock`
- `createPortalCustomPage(label = "New page"): ClientPortalCustomPage`
- `defaultPortalBuilder(sections: readonly ClientPortalSectionId[]): ClientPortalBuilderDocument`
- `normalisePortalBuilder(value: unknown, sections: readonly ClientPortalSectionId[], fallback?: ClientPortalBuilderDocument): ClientPortalBuilderDocument`
- `portalBuilder(document: ClientPortalDesignDocument): ClientPortalBuilderDocument`
- `portalPageBlocks(document: ClientPortalDesignDocument, section: ClientPortalSectionId): ClientPortalPageBlock[]`
- `portalCustomPage(document: ClientPortalDesignDocument, slug?: string): ClientPortalCustomPage | undefined`
- `portalBlockMatchesProducts(block: ClientPortalPageBlock, assignedProductIds: readonly string[]): boolean`
- `portalSlug(value: string): string`
- `uniquePortalSlug(value: string, used: string[]): string`
- `portalBuilderId(prefix: string): string`

## Depends on (1)

- [`src/server/types.ts`](../server/types.md)

## Used by (5)

- [`src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx`](../app/portal/agency/portals/editor/_ClientPortalStudio.md)
- [`src/app/portal/customer/_CustomerPortalChrome.tsx`](../app/portal/customer/_CustomerPortalChrome.md)
- [`src/app/portal/customer/_CustomerPortalViews.tsx`](../app/portal/customer/_CustomerPortalViews.md)
- [`src/app/portal/customer/_PortalPageComposition.tsx`](../app/portal/customer/_PortalPageComposition.md)
- [`src/lib/clientPortalDesign.ts`](./clientPortalDesign.md)

