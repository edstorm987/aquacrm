# `src/built-ins/modules/ecommerce/src/lib/cart.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Cart line-item math + types. Lifted from `02`'s `CartContext.tsx` (cart math) so the storefront context can stay thin and admin/server code can reuse the math.

## Exports (7)

- `interface CartLineItem (10 members)`
- `interface CartTotals (4 members)`
- `cartTotals(items: CartLineItem[], discounts: { amountOff: number }[]): CartTotals`
- `addOrIncrementCartItem(items: CartLineItem[], newItem: Omit<CartLineItem, "quantity">): CartLineItem[]`
- `removeCartItem(items: CartLineItem[], id: string): CartLineItem[]`
- `updateCartQty(items: CartLineItem[], id: string, qty: number): CartLineItem[]`
- `reservationMap(items: CartLineItem[]): Record<string, number>`

## Used by (1)

- [`src/built-ins/modules/ecommerce/src/context/CartContext.tsx`](../context/CartContext.md)

