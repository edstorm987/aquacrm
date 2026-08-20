# `src/built-ins/modules/affiliates/src/__smoke__/affiliates.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Affiliates plugin smoke. node:test via tsx --test.  Builds an in-memory foundation + a mock EcommerceOrdersPort that stages orders with `referralCodeId`s, and walks the lifecycle:  - enroll happy path + double-enrol rejection - findByCode returns active code, archived returns null - recordOrder creates pending Attribution; second call same orderId is idempotent - approve flips pending → approved; double-approve no-op - schedule rolls approved → Payout; pending excluded - markPaid flips attributions to paid + bumps lifetime earnings - side-effects: activity log + event bus

_No exported symbols (side-effect / internal module)._

## Depends on (4)

- [`src/built-ins/modules/affiliates/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/affiliates/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/affiliates/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/built-ins/modules/affiliates/src/server/ports.ts`](../server/ports.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

