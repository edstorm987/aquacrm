# `src/built-ins/modules/ecommerce/src/server/orders.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Server-side order persistence.  Lifted from `02 felicias aqua portal work/src/portal/server/orders.ts` and rewired for the new tenancy model:  - `orgId` → `clientId`. Each order belongs to one client (Felicia's store, future client stores). - Storage is the per-install plugin slice (`StoragePort`), not a dedicated `serverOrders` field on the foundation portal state.  The Stripe webhook calls `upsertOrderByStripeSession` to land an order when payment clears. The function is idempotent — Stripe retries the same event, so we update the existing row rather than insert a duplicate.

## Exports (6)

- `type OrderStatus`
- `interface ServerOrderItem (9 members)`
- `interface ServerOrder (26 members)`
- `interface UpdateOrderPatch (7 members)`
- `interface UpsertOrderResult (2 members)`
- `class OrderService`
    - `constructor(private storage: StoragePort)`
    - `async getOrder(id: string): Promise<ServerOrder | null>`
    - `async getOrderByStripeSession(sessionId: string): Promise<ServerOrder | null>`
    - `async getOrderByPaymentIntent(paymentIntentId: string): Promise<ServerOrder | null>`
    - `async listOrdersForClient(clientId: ClientId, limit = 100): Promise<ServerOrder[]>`
    - `async upsertOrderByStripeSession(input: { clientId: ClientId; stripeSessionId?: string; paymentIntentId?: string; amountTotal: number; currency: string; customerEmail?: string; customerName?: string; shippingAddress?: ServerOrder["shipping…`
    - `async markOrderRefunded(paymentIntentId: string): Promise<ServerOrder | null>`
    - `async updateOrderStatus(id: string, status: OrderStatus, extras?: Partial<ServerOrder>): Promise<ServerOrder | null>`
    - `async updateOrder(id: string, patch: UpdateOrderPatch): Promise<ServerOrder | null>`

## Depends on (5)

- [`src/built-ins/modules/ecommerce/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/ecommerce/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/ecommerce/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/ecommerce/src/server/discounts.ts`](./discounts.md)
- [`src/built-ins/modules/ecommerce/src/server/ports.ts`](./ports.md)

## Used by (6)

- [`src/built-ins/modules/ecommerce/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/ecommerce/src/components/admin/OrderDetail.tsx`](../components/admin/OrderDetail.md)
- [`src/built-ins/modules/ecommerce/src/components/admin/OrdersList.tsx`](../components/admin/OrdersList.md)
- [`src/built-ins/modules/ecommerce/src/lib/admin/customers.ts`](../lib/admin/customers.md)
- [`src/built-ins/modules/ecommerce/src/lib/admin/orders.ts`](../lib/admin/orders.md)
- [`src/built-ins/modules/ecommerce/src/server/index.ts`](./index.md)

