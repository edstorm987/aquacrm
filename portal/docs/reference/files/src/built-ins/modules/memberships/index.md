# `src/built-ins/modules/memberships/index.ts`

← [File index](../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** `@aqua/plugin-memberships` — recurring-subscription tiers + benefits + per-end-customer subscription state. Billed via injected StripePort (foundation reads per-install Stripe keys from the ecommerce install in the same scope, since we declare `requires: ["ecommerce"]`).  Mirrors the fulfillment + ecommerce + agency-hr shape: vendored AquaPlugin types, ports for foundation, container builder, foundation adapter the foundation side-effect-imports at boot.

## Exports (1)

- `default manifest`

## Depends on (4)

- [`src/built-ins/modules/memberships/src/api/routes.ts`](./src/api/routes.md)
- [`src/built-ins/modules/memberships/src/lib/aquaPluginTypes.ts`](./src/lib/aquaPluginTypes.md)
- [`src/built-ins/modules/memberships/src/lib/domain.ts`](./src/lib/domain.md)
- [`src/built-ins/modules/memberships/src/server/foundationAdapter.ts`](./src/server/foundationAdapter.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

