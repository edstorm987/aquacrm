# `src/built-ins/modules/ecommerce/src/lib/admin/shipping.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Admin-side shipping zones + rates. Lifted from `02 felicias aqua portal work/src/lib/admin/shipping.ts`. Pure types + selectors; persistence sits in `server/shippingStore.ts`.

## Exports (4)

- `interface ShippingZone (4 members)`
- `interface ShippingRate (11 members)`
- `pickRateForZone(rates: ShippingRate[], zoneId: string): ShippingRate[]`
- `calculateShipping(args: { rates: ShippingRate[]; zoneId: string; cartSubtotal: number; // pence weightGrams: number; }): { rateId: string; amount: number } | null`

## Used by (3)

- [`src/built-ins/modules/ecommerce/src/api/handlers.ts`](../../api/handlers.md)
- [`src/built-ins/modules/ecommerce/src/components/admin/ShippingEditor.tsx`](../../components/admin/ShippingEditor.md)
- [`src/built-ins/modules/ecommerce/src/pages/ShippingPage.tsx`](../../pages/ShippingPage.md)

