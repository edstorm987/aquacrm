# `src/built-ins/modules/ecommerce/index.ts`

← [File index](../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** `@aqua/plugin-ecommerce` — manifest entry.  Default-exports the AquaPlugin manifest. The foundation imports this once at boot, validates + registers it. `scopePolicy: "client"` means the runtime refuses agency-scope installs.  Block contributions list **ids only** — T3's `@aqua/plugin-website-editor` owns the rendering. The chief commander brokers the cross-plugin handoff.

## Exports (1)

- `default ecommercePlugin`

## Depends on (2)

- [`src/built-ins/modules/ecommerce/src/api/routes.ts`](./src/api/routes.md)
- [`src/built-ins/modules/ecommerce/src/lib/aquaPluginTypes.ts`](./src/lib/aquaPluginTypes.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

