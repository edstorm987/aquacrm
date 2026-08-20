# `src/app/portal/agency/products/_ProductsWorkspace.tsx`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

_No file-level doc-comment. Purpose inferred from its path (App routes & UI — src/app/) and its exports below._

## Exports (9)

- `type Draft`
- `EMPTY_PRODUCT_DRAFT: Draft`
- `ProductsWorkspace({ initialProducts, sops, companies, defaults = { taxRatePercent: 0, paymentTermsDays: 7 }, embedded = false, embeddedLabel = "Company catalogue" }: { initialProducts: AgencyProduct[]; sops: SopDocument[]; companies: Tradi…`
- `ProductEditor({ draft, products, sops, companies, onClose, onSaved, clientContext, focusSection }: { draft: Draft; products: AgencyProduct[]; sops: SopDocument[]; companies: TradingCompany[]; onClose: () => void; onSaved: (product: AgencyP…`
- `toDraft(product: AgencyProduct): Draft`
- `priceLabel(product: AgencyProduct): string`
- `linkedSopCount(product: AgencyProduct, sops: SopDocument[]): number`
- `portalLabel(requirement?: AgencyProductPortalRequirement): string`
- `catalogueStatus(product: Pick<AgencyProduct, "active"> & { status?: AgencyProductStatus }): AgencyProductStatus`

## Depends on (4)

- [`src/lib/portal/portalProducts.ts`](../../../../lib/portal/portalProducts.md)
- [`src/lib/products/agencyProductCategories.ts`](../../../../lib/products/agencyProductCategories.md)
- [`src/lib/products/productInternalWorkspace.ts`](../../../../lib/products/productInternalWorkspace.md)
- [`src/server/types.ts`](../../../../server/types.md)

## Used by (4)

- [`src/app/portal/agency/company/_CompanyWorkspace.tsx`](../company/_CompanyWorkspace.md)
- [`src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx`](../fulfilment/_FulfilmentWorkspace.md)
- [`src/app/portal/agency/products/[productId]/_ProductDetailWorkspace.tsx`](./[productId]/_ProductDetailWorkspace.md)
- [`src/app/portal/clients/[clientId]/_ClientServiceAssignment.tsx`](../../clients/[clientId]/_ClientServiceAssignment.md)

