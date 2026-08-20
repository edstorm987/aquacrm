# `src/built-ins/modules/ecommerce/src/lib/admin/orders.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Admin-side order helpers — derived stats + filters used by the `/orders` admin page. Server-side reads from the OrderService.  Lifted from `02 felicias aqua portal work/src/lib/admin/orders.ts`, adapted for the new ServerOrder shape (clientId, not orgId).

## Exports (6)

- `interface OrderFilter (6 members)`
- `interface OrdersDashboardStats (8 members)`
- `filterOrders(orders: ServerOrder[], filter: OrderFilter): ServerOrder[]`
- `dashboardStats(orders: ServerOrder[]): OrdersDashboardStats`
- `formatOrderId(o: ServerOrder): string`
- `formatPrice(amount: number, currency: string): string`

## Depends on (1)

- [`src/built-ins/modules/ecommerce/src/server/orders.ts`](../../server/orders.md)

## Used by (5)

- [`src/built-ins/modules/ecommerce/src/components/admin/CustomersList.tsx`](../../components/admin/CustomersList.md)
- [`src/built-ins/modules/ecommerce/src/components/admin/OrderDetail.tsx`](../../components/admin/OrderDetail.md)
- [`src/built-ins/modules/ecommerce/src/components/admin/OrdersList.tsx`](../../components/admin/OrdersList.md)
- [`src/built-ins/modules/ecommerce/src/pages/CustomerDetailPage.tsx`](../../pages/CustomerDetailPage.md)
- [`src/built-ins/modules/ecommerce/src/pages/OrderReceiptPage.tsx`](../../pages/OrderReceiptPage.md)

