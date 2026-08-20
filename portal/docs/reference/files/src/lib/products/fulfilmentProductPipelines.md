# `src/lib/products/fulfilmentProductPipelines.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `interface ProductPipelineColumn (3 members)`
- `PRODUCT_PIPELINE_COLUMNS: Record<PortalProductKey, ProductPipelineColumn[]>`
- `defaultProductPipelineStage(productKey: PortalProductKey, clientStage: ClientStage): string`
- `agencyProductPipelineColumns(product: Pick<AgencyProduct, "id" | "name" | "portalTemplateKey" | "internalWorkspace" | "sopIds">): ProductPipelineColumn[]`
- `defaultAgencyProductPipelineStage(product: Pick<AgencyProduct, "id" | "name" | "portalTemplateKey" | "internalWorkspace" | "sopIds">, clientStage: ClientStage): string`

## Depends on (3)

- [`src/lib/portal/portalProducts.ts`](../portal/portalProducts.md)
- [`src/lib/products/productInternalWorkspace.ts`](./productInternalWorkspace.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (3)

- [`src/app/api/portal/pipelines/move-client/route.ts`](../../app/api/portal/pipelines/move-client/route.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/agency/pipelines/[slug]/page.tsx`](../../app/portal/agency/pipelines/[slug]/page.md)

