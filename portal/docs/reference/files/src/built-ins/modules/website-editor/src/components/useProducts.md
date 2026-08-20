# `src/built-ins/modules/website-editor/src/components/useProducts.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (8)

- `interface CatalogProduct (11 members)`
- `async fetchCatalog(): Promise<CatalogProduct[]>`
- `useCatalog(): { products: CatalogProduct[]; loading: boolean }`
- `useProductByHandle(handle: string): { product: CatalogProduct | null; loading: boolean }`
- `useProductsByRange(range: string, limit = 9): { products: CatalogProduct[]; loading: boolean }`
- `formatPrice(amount: number, currency = "GBP"): string`
- `invalidateCatalogCache()`
- `useProducts`

## Used by (7)

- [`src/built-ins/modules/website-editor/src/components/blocks/CartSummaryBlock.tsx`](./blocks/CartSummaryBlock.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/CheckoutSummaryBlock.tsx`](./blocks/CheckoutSummaryBlock.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/ProductCardBlock.tsx`](./blocks/ProductCardBlock.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/ProductGridBlock.tsx`](./blocks/ProductGridBlock.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/ProductSearchBlock.tsx`](./blocks/ProductSearchBlock.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/VariantPickerBlock.tsx`](./blocks/VariantPickerBlock.md)
- [`src/built-ins/modules/website-editor/src/components/index.ts`](./index.md)

