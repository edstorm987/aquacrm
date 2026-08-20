# `src/built-ins/modules/ecommerce/src/server/foundationAdapter.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation adapter — bridges T1's foundation services into the plugin.  The canonical `PluginCtx` is `{ agencyId, clientId?, install, storage }`. It deliberately doesn't carry the full foundation surface (T1's design keeps the plugin contract minimal). For handlers + pages to reach foundation services (tenants, activity log, event bus, plugin installs) the foundation **registers** an adapter once at boot:  registerEcommerceFoundation({ tenant, activity, events, pluginInstalls })  API handlers + pages call `requireFoundation()` to retrieve the registered adapter and combine it with the per-request `storage` from PluginCtx into an `EcommerceContainer`.  This module is tsc-clean standalone — no foundation imports here.

## Exports (6)

- `interface EcommerceFoundation (5 members)`
- `registerEcommerceFoundation(foundation: EcommerceFoundation): void`
- `clearEcommerceFoundation(): void`
- `isFoundationRegistered(): boolean`
- `requireFoundation(): EcommerceFoundation`
- `containerFor(storage: StoragePort): EcommerceContainer`

## Depends on (2)

- [`src/built-ins/modules/ecommerce/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/ecommerce/src/server/ports.ts`](./ports.md)

## Used by (12)

- [`src/built-ins/modules/ecommerce/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/ecommerce/src/pages/CustomerDetailPage.tsx`](../pages/CustomerDetailPage.md)
- [`src/built-ins/modules/ecommerce/src/pages/CustomersPage.tsx`](../pages/CustomersPage.md)
- [`src/built-ins/modules/ecommerce/src/pages/DiscountsPage.tsx`](../pages/DiscountsPage.md)
- [`src/built-ins/modules/ecommerce/src/pages/InventoryPage.tsx`](../pages/InventoryPage.md)
- [`src/built-ins/modules/ecommerce/src/pages/OrderDetailPage.tsx`](../pages/OrderDetailPage.md)
- [`src/built-ins/modules/ecommerce/src/pages/OrderReceiptPage.tsx`](../pages/OrderReceiptPage.md)
- [`src/built-ins/modules/ecommerce/src/pages/OrdersPage.tsx`](../pages/OrdersPage.md)
- [`src/built-ins/modules/ecommerce/src/pages/ProductDetailPage.tsx`](../pages/ProductDetailPage.md)
- [`src/built-ins/modules/ecommerce/src/pages/ProductVariantsPage.tsx`](../pages/ProductVariantsPage.md)
- [`src/built-ins/modules/ecommerce/src/pages/ProductsPage.tsx`](../pages/ProductsPage.md)
- [`src/built-ins/modules/ecommerce/src/server/index.ts`](./index.md)

