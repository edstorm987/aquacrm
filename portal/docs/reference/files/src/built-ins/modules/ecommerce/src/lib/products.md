# `src/built-ins/modules/ecommerce/src/lib/products.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Product types — lifted from `02 felicias aqua portal work/src/lib/products.ts`.  What changed vs 02: - Removed the hardcoded `PRODUCTS` seed array (Felicia-specific catalog). Per-client product catalogs live in plugin storage; the `ProductService` in `server/productsStore.ts` reads/writes them. - Removed the localStorage `loadOverrides` / `loadCustomProducts` / `loadInventory` helpers. Overrides + inventory are server-side concerns now. - Kept the type definitions verbatim — they describe the catalog shape and downstream UI relies on them.

## Exports (12)

- `interface ProductSize (2 members)`
- `type ProductFormat`
- `interface ProductReview (5 members)`
- `type ProductOptionDisplay`
- `interface ProductOptionValue (6 members)`
- `interface ProductOption (6 members)`
- `interface ProductVariant (8 members)`
- `interface Product (43 members)`
- `interface ProductOverride (12 members)`
- `interface InventoryItemSnapshot (5 members)`
- `computeAvailable(product: Product, inv: Record<string, InventoryItemSnapshot>): Product`
- `applyOverride(p: Product, o: ProductOverride | undefined): Product`

## Used by (11)

- [`src/built-ins/modules/ecommerce/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/ecommerce/src/components/FeaturedProducts.tsx`](../components/FeaturedProducts.md)
- [`src/built-ins/modules/ecommerce/src/components/ProductDetail.tsx`](../components/ProductDetail.md)
- [`src/built-ins/modules/ecommerce/src/components/ProductVariantPicker.tsx`](../components/ProductVariantPicker.md)
- [`src/built-ins/modules/ecommerce/src/components/Shop.tsx`](../components/Shop.md)
- [`src/built-ins/modules/ecommerce/src/components/admin/ProductEditor.tsx`](../components/admin/ProductEditor.md)
- [`src/built-ins/modules/ecommerce/src/components/admin/ProductsList.tsx`](../components/admin/ProductsList.md)
- [`src/built-ins/modules/ecommerce/src/components/admin/VariantsEditor.tsx`](../components/admin/VariantsEditor.md)
- [`src/built-ins/modules/ecommerce/src/lib/admin/inventory.ts`](./admin/inventory.md)
- [`src/built-ins/modules/ecommerce/src/lib/variants.ts`](./variants.md)
- [`src/built-ins/modules/ecommerce/src/server/productsStore.ts`](../server/productsStore.md)

