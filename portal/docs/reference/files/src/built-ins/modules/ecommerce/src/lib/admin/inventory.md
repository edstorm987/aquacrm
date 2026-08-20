# `src/built-ins/modules/ecommerce/src/lib/admin/inventory.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Admin-side inventory helpers.  Lifted from `02 felicias aqua portal work/src/lib/admin/inventory.ts`, adapted to read from server-side per-install storage. The 02 version kept inventory in localStorage; the new flow goes through the `ProductService.list/setInventory` server API exposed via the plugin's `/api/portal/ecommerce/inventory` endpoints.

## Exports (7)

- `interface InventoryItem (3 members)`
- `interface InventoryFilter (2 members)`
- `filterInventory(items: InventoryItem[], filter: InventoryFilter): InventoryItem[]`
- `interface InventoryStats (4 members)`
- `inventoryStats(items: InventoryItem[]): InventoryStats`
- `interface SyncReservationsArgs (3 members)`
- `async syncReservations(args: SyncReservationsArgs): Promise<void>`

## Depends on (1)

- [`src/built-ins/modules/ecommerce/src/lib/products.ts`](../products.md)

## Used by (3)

- [`src/built-ins/modules/ecommerce/src/components/admin/InventoryTable.tsx`](../../components/admin/InventoryTable.md)
- [`src/built-ins/modules/ecommerce/src/context/CartContext.tsx`](../../context/CartContext.md)
- [`src/built-ins/modules/ecommerce/src/pages/InventoryPage.tsx`](../../pages/InventoryPage.md)

