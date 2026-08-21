# `src/engines/sop/server/sops.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (13)

- `listSops(agencyId: string): SopDocument[]`
- `listSopCategories(agencyId: string): string[]`
- `createSopCategory(agencyId: string, category: string, actorUserId: string): string`
- `getSop(agencyId: string, id: string): SopDocument | null`
- `createWrittenSop(input: { agencyId: string; title: string; content: string; category?: string; categories?: string[]; tags?: string[]; actorUserId: string }): SopDocument`
- `interface SopBlockProblem (4 members)`
- `validateSopBlockTree(blocks: BlockTreeJSON): SopBlockProblem[]`
- `createInteractiveSop(input: { agencyId: string; title: string; blocks: BlockTreeJSON; category?: string; categories?: string[]; tags?: string[]; resourceType?: SopDocument["resourceType"]; actorUserId: string }): SopDocument`
- `createFileSop(input: Omit<SopDocument, "createdAt" | "updatedAt" | "updatedBy" | "kind" | "tags" | "categories"> & { tags?: string[]; categories?: string[] }): SopDocument`
- `updateSop(agencyId: string, id: string, patch: { title?: string; content?: string; blocks?: BlockTreeJSON; category?: string; categories?: string[]; tags?: string[] }, actorUserId: string): SopDocument | null`
- `deleteSopRecord(agencyId: string, id: string): SopDocument | null`
- `interface DeleteSopCategoryResult (4 members)`
- `deleteSopCategory(agencyId: string, category: string, replacementCategory: string | undefined, actorUserId: string): DeleteSopCategoryResult | null`

## Depends on (4)

- [`src/engines/editor/elements/index.ts`](../../editor/elements/index.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (18)

- [`scripts/smoke-sop-composer.test.ts`](../../../../scripts/smoke-sop-composer.test.md)
- [`scripts/smoke-sop-interactive.test.ts`](../../../../scripts/smoke-sop-interactive.test.md)
- [`scripts/smoke-sop-library-organisation.test.ts`](../../../../scripts/smoke-sop-library-organisation.test.md)
- [`src/app/api/portal/search/route.ts`](../../../app/api/portal/search/route.md)
- [`src/app/api/portal/sops/categories/route.ts`](../../../app/api/portal/sops/categories/route.md)
- [`src/app/api/portal/sops/content/route.ts`](../../../app/api/portal/sops/content/route.md)
- [`src/app/api/portal/sops/route.ts`](../../../app/api/portal/sops/route.md)
- [`src/app/api/portal/sops/upload/route.ts`](../../../app/api/portal/sops/upload/route.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../../../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/company/page.tsx`](../../../app/portal/agency/company/page.md)
- [`src/app/portal/agency/development/_loadDevelopmentData.ts`](../../../app/portal/agency/development/_loadDevelopmentData.md)
- [`src/app/portal/agency/development/page.tsx`](../../../app/portal/agency/development/page.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../../../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/agency/products/[productId]/page.tsx`](../../../app/portal/agency/products/[productId]/page.md)
- [`src/app/portal/agency/sop-library/page.tsx`](../../../app/portal/agency/sop-library/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/team/_data.ts`](../../../app/portal/team/_data.md)
- [`src/lib/server/auth/showcaseMode.ts`](../../../lib/server/auth/showcaseMode.md)

