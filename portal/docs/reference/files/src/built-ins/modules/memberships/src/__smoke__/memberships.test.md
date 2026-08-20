# `src/built-ins/modules/memberships/src/__smoke__/memberships.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Memberships plugin smoke. node:test via tsx --test.  Builds an in-memory foundation (StoragePort backed by a Map, stub TenantPort/UserPort/ActivityPort/EventBusPort, mock StripePort that records calls + returns deterministic ids), constructs the memberships container, and walks:  - seedDefaultPlans idempotent (×2 = same state) - subscribe (free tier) + getBenefitsForUser walks plan - subscribe (paid) returns checkout URL - signed webhook customer.subscription.created upserts subscription - cancel(atPeriodEnd: true) records intent without state change - webhook customer.subscription.deleted cancels subscription - idempotency on Stripe event id

_No exported symbols (side-effect / internal module)._

## Depends on (4)

- [`src/built-ins/modules/memberships/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/memberships/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/memberships/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/built-ins/modules/memberships/src/server/ports.ts`](../server/ports.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

