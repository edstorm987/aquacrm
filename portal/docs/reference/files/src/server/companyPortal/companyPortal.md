# `src/server/companyPortal/companyPortal.ts`

← [File index](../../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (7)

- `interface PromotionCollectionLine (9 members)`
- `type PromotionAmbiguityKind`
- `interface PromotionAmbiguity (6 members)`
- `interface PromotionPluginDataLine (9 members)`
- `interface CompanyPromotionPreview (14 members)`
- `previewCompanyPortal(agencyId: string, companyId: string): CompanyPromotionPreview | null`
- `previewCoversEveryCollection(preview: CompanyPromotionPreview): boolean`

## Depends on (3)

- [`src/server/companyPortal/disposition.ts`](./disposition.md)
- [`src/server/storage.ts`](../storage.md)
- [`src/server/types.ts`](../types.md)

## Used by (2)

- [`scripts/smoke-company-portal.test.ts`](../../../scripts/smoke-company-portal.test.md)
- [`src/app/api/portal/agency/companies/[companyId]/portal/route.ts`](../../app/api/portal/agency/companies/[companyId]/portal/route.md)

