# `src/built-ins/modules/ecommerce/src/lib/ids.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Lightweight id generator. Mirrors the fulfillment plugin's helper — no nanoid dep, falls back to Math.random when crypto isn't available (deterministic test stub override).

## Exports (2)

- `makeId(prefix: string, length = 12): string`
- `slugify(s: string): string`

## Used by (3)

- [`src/built-ins/modules/ecommerce/src/components/admin/ProductEditor.tsx`](../components/admin/ProductEditor.md)
- [`src/built-ins/modules/ecommerce/src/components/admin/VariantsEditor.tsx`](../components/admin/VariantsEditor.md)
- [`src/built-ins/modules/ecommerce/src/server/orders.ts`](../server/orders.md)

