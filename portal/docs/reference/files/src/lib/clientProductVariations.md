# `src/lib/clientProductVariations.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `clientProductVariations(metadata: VariationMetadata): Record<string, ClientProductVariation>`
- `clientVariationProductIds(metadata: VariationMetadata): string[]`
- `applyClientProductVariations(metadata: VariationMetadata, catalogue: readonly AgencyProduct[]): AgencyProduct[]`
- `buildClientProductVariation(base: AgencyProduct, input: Record<string, unknown>, updatedBy: string): ClientProductVariation`
- `variationHasOverrides(variation: ClientProductVariation): boolean`

## Depends on (2)

- [`src/lib/productInternalWorkspace.ts`](./productInternalWorkspace.md)
- [`src/server/types.ts`](../server/types.md)

## Used by (6)

- [`scripts/smoke-client-service-workspace.test.ts`](../../scripts/smoke-client-service-workspace.test.md)
- [`src/app/api/tenants/client-product-variation/route.ts`](../app/api/tenants/client-product-variation/route.md)
- [`src/app/api/tenants/client-products/route.ts`](../app/api/tenants/client-products/route.md)
- [`src/app/portal/agency/products/[productId]/page.tsx`](../app/portal/agency/products/[productId]/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/lib/productAssignments.ts`](./productAssignments.md)

