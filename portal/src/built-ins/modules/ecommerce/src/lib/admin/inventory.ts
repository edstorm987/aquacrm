// Admin-side inventory helpers.
//
// Lifted from `02 felicias aqua portal work/src/lib/admin/inventory.ts`,
// adapted to read from server-side per-install storage. The 02 version
// kept inventory in localStorage; the new flow goes through the
// `ProductService.list/setInventory` server API exposed via the plugin's
// `/api/portal/ecommerce/inventory` endpoints.

import type { InventoryItemSnapshot } from "../products";

export interface InventoryItem extends InventoryItemSnapshot {
  name?: string;
  productSlug?: string;
  updatedAt?: number;
}

export interface InventoryFilter {
  q?: string;
  showOnlyLow?: boolean;
}

export function filterInventory(items: InventoryItem[], filter: InventoryFilter): InventoryItem[] {
  let out = items;
  if (filter.showOnlyLow) {
    out = out.filter(i => !i.unlimited && i.onHand <= i.lowAt);
  }
  if (filter.q) {
    const q = filter.q.toLowerCase();
    out = out.filter(i =>
      i.sku.toLowerCase().includes(q) ||
      (i.name ?? "").toLowerCase().includes(q) ||
      (i.productSlug ?? "").toLowerCase().includes(q),
    );
  }
  return out;
}

export interface InventoryStats {
  totalSkus: number;
  outOfStock: number;
  lowStock: number;
  totalUnits: number;
}

export function inventoryStats(items: InventoryItem[]): InventoryStats {
  let outOfStock = 0;
  let lowStock = 0;
  let totalUnits = 0;
  for (const i of items) {
    if (i.unlimited) continue;
    const available = i.onHand - i.reserved;
    totalUnits += Math.max(0, available);
    if (available <= 0) outOfStock += 1;
    else if (available <= i.lowAt) lowStock += 1;
  }
  return {
    totalSkus: items.length,
    outOfStock,
    lowStock,
    totalUnits,
  };
}

// Helper used by the cart to mirror cart quantity → inventory.reserved.
// Now drives a server API call rather than mutating localStorage.
export interface SyncReservationsArgs {
  apiBase: string;               // e.g. /api/portal/ecommerce
  reservations: Record<string, number>;  // sku → quantity
  signal?: AbortSignal;
}

export async function syncReservations(args: SyncReservationsArgs): Promise<void> {
  await fetch(`${args.apiBase}/inventory/reserve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reservations: args.reservations }),
    signal: args.signal,
  });
}
