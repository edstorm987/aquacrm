# `src/built-ins/modules/ecommerce/src/lib/admin/customers.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Admin-side customer aggregation.  Lifted from `02 felicias aqua portal work/src/lib/admin/customers.ts`. Synthesises a customer record by aggregating orders for each unique `customerEmail`. No separate Customer table — orders are the source.

## Exports (3)

- `interface CustomerSummary (8 members)`
- `summariseCustomers(orders: ServerOrder[]): CustomerSummary[]`
- `customerOrders(orders: ServerOrder[], email: string): ServerOrder[]`

## Depends on (1)

- [`src/built-ins/modules/ecommerce/src/server/orders.ts`](../../server/orders.md)

## Used by (3)

- [`src/built-ins/modules/ecommerce/src/components/admin/CustomersList.tsx`](../../components/admin/CustomersList.md)
- [`src/built-ins/modules/ecommerce/src/pages/CustomerDetailPage.tsx`](../../pages/CustomerDetailPage.md)
- [`src/built-ins/modules/ecommerce/src/pages/CustomersPage.tsx`](../../pages/CustomersPage.md)

