# `src/server/sops.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (10)

- `listSops(agencyId: string): SopDocument[]`
- `listSopCategories(agencyId: string): string[]`
- `createSopCategory(agencyId: string, category: string, actorUserId: string): string`
- `getSop(agencyId: string, id: string): SopDocument | null`
- `createWrittenSop(input: { agencyId: string; title: string; content: string; category?: string; categories?: string[]; tags?: string[]; actorUserId: string }): SopDocument`
- `createFileSop(input: Omit<SopDocument, "createdAt" | "updatedAt" | "updatedBy" | "kind" | "tags" | "categories"> & { tags?: string[]; categories?: string[] }): SopDocument`
- `updateSop(agencyId: string, id: string, patch: { title?: string; content?: string; category?: string; categories?: string[]; tags?: string[] }, actorUserId: string): SopDocument | null`
- `deleteSopRecord(agencyId: string, id: string): SopDocument | null`
- `interface DeleteSopCategoryResult (4 members)`
- `deleteSopCategory(agencyId: string, category: string, replacementCategory: string | undefined, actorUserId: string): DeleteSopCategoryResult | null`

## Depends on (3)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (16)

- [`scripts/smoke-sop-library-organisation.test.ts`](../../scripts/smoke-sop-library-organisation.test.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/api/portal/sops/categories/route.ts`](../app/api/portal/sops/categories/route.md)
- [`src/app/api/portal/sops/content/route.ts`](../app/api/portal/sops/content/route.md)
- [`src/app/api/portal/sops/route.ts`](../app/api/portal/sops/route.md)
- [`src/app/api/portal/sops/upload/route.ts`](../app/api/portal/sops/upload/route.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/company/page.tsx`](../app/portal/agency/company/page.md)
- [`src/app/portal/agency/development/_loadDevelopmentData.ts`](../app/portal/agency/development/_loadDevelopmentData.md)
- [`src/app/portal/agency/development/page.tsx`](../app/portal/agency/development/page.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/agency/products/[productId]/page.tsx`](../app/portal/agency/products/[productId]/page.md)
- [`src/app/portal/agency/sop-library/page.tsx`](../app/portal/agency/sop-library/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/team/_data.ts`](../app/portal/team/_data.md)
- [`src/lib/server/auth/showcaseMode.ts`](../lib/server/auth/showcaseMode.md)

