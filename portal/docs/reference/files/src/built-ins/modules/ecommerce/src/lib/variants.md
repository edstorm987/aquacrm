# `src/built-ins/modules/ecommerce/src/lib/variants.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Variant resolution helpers — pure functions, no I/O. Lifted verbatim from `02 felicias aqua portal work/src/lib/variants.ts`.

## Exports (10)

- `interface SelectedVariantState (2 members)`
- `interface ResolvedVariant (8 members)`
- `isCustomValueId(valueId: string): boolean`
- `customHexFromValueId(valueId: string): string | undefined`
- `makeCustomValueId(hex: string): string`
- `defaultSelection(options: ProductOption[]): Record<string, string>`
- `findMatchingVariant(variants: ProductVariant[] | undefined, selection: Record<string, string>): ProductVariant | null`
- `resolveVariant(product: Product, state: SelectedVariantState): ResolvedVariant`
- `totalAvailable(product: Product): number | undefined`
- `findOptionValue(option: ProductOption, valueId: string): ProductOptionValue | undefined`

## Depends on (1)

- [`src/built-ins/modules/ecommerce/src/lib/products.ts`](./products.md)

## Used by (2)

- [`src/built-ins/modules/ecommerce/src/components/ProductDetail.tsx`](../components/ProductDetail.md)
- [`src/built-ins/modules/ecommerce/src/components/ProductVariantPicker.tsx`](../components/ProductVariantPicker.md)

