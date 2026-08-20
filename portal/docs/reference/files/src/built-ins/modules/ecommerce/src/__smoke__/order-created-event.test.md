# `src/built-ins/modules/ecommerce/src/__smoke__/order-created-event.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R6 — verify ecommerce emits `order.created` with referralCodeId + endCustomerUserId on first insert, and skips re-emit on webhook retries (idempotent).  Doesn't wire up affiliates' AttributionService directly — that belongs in the foundation's cross-plugin event router (out of scope for the plugin). The smoke verifies the payload shape is what affiliates expects to consume.

_No exported symbols (side-effect / internal module)._

## Depends on (3)

- [`src/built-ins/modules/ecommerce/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/ecommerce/src/server/index.ts`](../server/index.md)
- [`src/built-ins/modules/ecommerce/src/server/ports.ts`](../server/ports.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

