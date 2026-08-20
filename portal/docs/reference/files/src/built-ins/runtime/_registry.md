# `src/built-ins/runtime/_registry.ts`

← [File index](../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Plugin registry — single source of truth for what plugins ship.  Plugins are registered explicitly (not auto-discovered) so: 1. The bundler can tree-shake unused plugins out of production builds for tenants that don't have them installed (each plugin's heavy code lives behind dynamic imports inside its manifest). 2. There's a single file to grep when answering "what plugins do we ship?".  Adding a new plugin: import its manifest below and append to PLUGINS.  Foundation lands with the registry empty. T2 will add the fulfillment plugin; T3 will add website-editor. Round 2 ports e-commerce.

## Exports (6)

- `registerPlugin(plugin: AquaPlugin): void`
- `listPlugins(): AquaPlugin[]`
- `getPlugin(id: string): AquaPlugin | undefined`
- `listCorePlugins(): AquaPlugin[]`
- `listInstallablePlugins(): AquaPlugin[]`
- `requirePlugin(id: string): AquaPlugin`

## Depends on (13)

- [`src/built-ins/runtime/_types.ts`](./_types.md)
- [`src/built-ins/runtime/_validate.ts`](./_validate.md)
- [`src/built-ins/runtime/foundation-adapters/_eventSubscribers.ts`](./foundation-adapters/_eventSubscribers.md)
- [`src/built-ins/runtime/foundation-adapters/affiliatesFoundation.ts`](./foundation-adapters/affiliatesFoundation.md)
- [`src/built-ins/runtime/foundation-adapters/agencyFinanceFoundation.ts`](./foundation-adapters/agencyFinanceFoundation.md)
- [`src/built-ins/runtime/foundation-adapters/agencyHrFoundation.ts`](./foundation-adapters/agencyHrFoundation.md)
- [`src/built-ins/runtime/foundation-adapters/agencyMarketingFoundation.ts`](./foundation-adapters/agencyMarketingFoundation.md)
- [`src/built-ins/runtime/foundation-adapters/clientCrmFoundation.ts`](./foundation-adapters/clientCrmFoundation.md)
- [`src/built-ins/runtime/foundation-adapters/ecommerceFoundation.ts`](./foundation-adapters/ecommerceFoundation.md)
- [`src/built-ins/runtime/foundation-adapters/emailSenderFoundation.ts`](./foundation-adapters/emailSenderFoundation.md)
- [`src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts`](./foundation-adapters/leadsPipelineFoundation.md)
- [`src/built-ins/runtime/foundation-adapters/membershipsFoundation.ts`](./foundation-adapters/membershipsFoundation.md)
- [`src/built-ins/runtime/foundation-adapters/publicFunnelFoundation.ts`](./foundation-adapters/publicFunnelFoundation.md)

## Used by (7)

- [`src/app/portal/agency/[...rest]/page.tsx`](../../app/portal/agency/[...rest]/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)
- [`src/built-ins/runtime/_pathMapping.ts`](./_pathMapping.md)
- [`src/built-ins/runtime/_routeResolver.ts`](./_routeResolver.md)
- [`src/built-ins/runtime/_runtime.ts`](./_runtime.md)
- [`src/built-ins/runtime/foundation-adapters/pluginRegistryAdapter.ts`](./foundation-adapters/pluginRegistryAdapter.md)
- [`src/lib/chrome/sidebarLayout.ts`](../../lib/chrome/sidebarLayout.md)

