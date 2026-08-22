# `src/lib/server/plugins/pluginSecretConfig.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (4)

- `interface PluginSecretScope (2 members)`
- `pluginSettingsFields(pluginId: string): SettingsField[]`
- `vaultTargetOf(field: SettingsField): { provider: IntegrationProvider; field: string } | null`
- `installConfigWithSecrets(pluginId: string, scope: PluginSecretScope, config: Record<string, unknown> | undefined | null): Record<string, unknown>`

## Depends on (4)

- [`src/built-ins/runtime/_registry.ts`](../../../built-ins/runtime/_registry.md)
- [`src/built-ins/runtime/_types.ts`](../../../built-ins/runtime/_types.md)
- [`src/lib/integrations/catalog.ts`](../../integrations/catalog.md)
- [`src/lib/server/integrations/integrationConnections.ts`](../integrations/integrationConnections.md)

## Used by (6)

- [`scripts/smoke-plugin-settings-surface.test.ts`](../../../../scripts/smoke-plugin-settings-surface.test.md)
- [`src/app/api/tenants/close-deal/route.ts`](../../../app/api/tenants/close-deal/route.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts`](../../../built-ins/modules/agency-finance/src/api/handlers-stripe.md)
- [`src/built-ins/modules/agency-finance/src/pages/InvoiceDetailPage.tsx`](../../../built-ins/modules/agency-finance/src/pages/InvoiceDetailPage.md)
- [`src/built-ins/modules/ecommerce/src/api/handlers.ts`](../../../built-ins/modules/ecommerce/src/api/handlers.md)
- [`src/lib/server/plugins/pluginSettingsSurface.ts`](./pluginSettingsSurface.md)

