// Cart line-item math + types. Lifted from `02`'s `CartContext.tsx`
// (cart math) so the storefront context can stay thin and admin/server
// code can reuse the math.

export interface CartLineItem {
  id: string;
  name: string;
  price: number;                 // pence
  quantity: number;
  variant?: string;
  shopifyVariantId?: string;
  stockSku?: string;
  variantId?: string;
  image?: string;
  customHex?: string;
}

export interface CartTotals {
  subtotal: number;
  totalDiscount: number;
  total: number;
  count: number;
}

export function cartTotals(
  items: CartLineItem[],
  discounts: { amountOff: number }[],
): CartTotals {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalDiscount = discounts.reduce((s, d) => s + d.amountOff, 0);
  const total = Math.max(0, subtotal - totalDiscount);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  return { subtotal, totalDiscount, total, count };
}

export function addOrIncrementCartItem(
  items: CartLineItem[],
  newItem: Omit<CartLineItem, "quantity">,
): CartLineItem[] {
  const existing = items.find(i => i.id === newItem.id);
  if (existing) {
    return items.map(i =>
      i.id === newItem.id ? { ...i, quantity: i.quantity + 1 } : i,
    );
  }
  return [...items, { ...newItem, quantity: 1 }];
}

export function removeCartItem(items: CartLineItem[], id: string): CartLineItem[] {
  return items.filter(i => i.id !== id);
}

export function updateCartQty(
  items: CartLineItem[],
  id: string,
  qty: number,
): CartLineItem[] {
  if (qty <= 0) return items.filter(i => i.id !== id);
  return items.map(i => (i.id === id ? { ...i, quantity: qty } : i));
}

// Map cart items → SKU reservation totals. The storefront side calls
// `inventory.syncReservations(map)` whenever the cart changes.
export function reservationMap(items: CartLineItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) {
    if (!i.stockSku) continue;
    out[i.stockSku] = (out[i.stockSku] ?? 0) + i.quantity;
  }
  return out;
}
