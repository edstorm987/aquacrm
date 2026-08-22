# `src/lib/server/plugins/pluginSettingsSurface.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (9)

- `type PluginSettingsValue`
- `interface PluginSettingsFieldView (10 members)`
- `interface PluginSettingsGroupView (4 members)`
- `interface PluginSettingsView (4 members)`
- `class PluginSettingsError`
- `describePluginSettings(pluginId: string, scope: PluginSecretScope): PluginSettingsView | null`
- `interface WritePluginSettingsInput (5 members)`
- `interface WritePluginSettingsResult (2 members)`
- `writePluginSettings(input: WritePluginSettingsInput): WritePluginSettingsResult`

## Depends on (6)

- [`src/built-ins/runtime/_registry.ts`](../../../built-ins/runtime/_registry.md)
- [`src/built-ins/runtime/_types.ts`](../../../built-ins/runtime/_types.md)
- [`src/lib/integrations/catalog.ts`](../../integrations/catalog.md)
- [`src/lib/server/integrations/integrationConnections.ts`](../integrations/integrationConnections.md)
- [`src/lib/server/plugins/pluginSecretConfig.ts`](./pluginSecretConfig.md)
- [`src/server/pluginInstalls.ts`](../../../server/pluginInstalls.md)

## Used by (3)

- [`scripts/smoke-plugin-settings-surface.test.ts`](../../../../scripts/smoke-plugin-settings-surface.test.md)
- [`src/app/api/portal/plugins/settings/route.ts`](../../../app/api/portal/plugins/settings/route.md)
- [`src/built-ins/modules/agency-finance/src/pages/SettingsPage.tsx`](../../../built-ins/modules/agency-finance/src/pages/SettingsPage.md)

