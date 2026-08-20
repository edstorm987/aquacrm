# `src/built-ins/runtime/_runtime.ts`

← [File index](../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (12)

- `makeCtx(install: PluginInstall, actor?: string): PluginCtx`
- `type InstallResult`
- `interface InstallOptions (5 members)`
- `async installPlugin(pluginId: string, options: InstallOptions): Promise<InstallResult>`
- `async uninstallPlugin(scope: PluginInstallScope, pluginId: string): Promise<{ ok: true } | { ok: false; error: string }>`
- `async setPluginEnabled(scope: PluginInstallScope, pluginId: string, enabled: boolean): Promise<{ ok: true } | { ok: false; error: string }>`
- `interface ConfigurePatch (2 members)`
- `async configurePlugin(scope: PluginInstallScope, pluginId: string, patch: ConfigurePatch): Promise<{ ok: true; install: PluginInstall } | { ok: false; error: string }>`
- `isFeatureEnabled(scope: PluginInstallScope, pluginId: string, featureId: string): boolean`
- `isPluginInstalled(scope: PluginInstallScope, pluginId: string): boolean`
- `async installCorePluginsForScope(scope: PluginInstallScope, installedBy?: string): Promise<void>`
- `async applyPreset(preset: AquaPreset, scope: PluginInstallScope, installedBy?: string): Promise<{ ok: true; installed: string[] } | { ok: false; error: string; installed: string[] }>`

## Depends on (7)

- [`src/built-ins/runtime/_registry.ts`](./_registry.md)
- [`src/built-ins/runtime/_types.ts`](./_types.md)
- [`src/built-ins/runtime/foundation-adapters/index.ts`](./foundation-adapters/index.md)
- [`src/server/eventBus.ts`](../../server/eventBus.md)
- [`src/server/pluginInstalls.ts`](../../server/pluginInstalls.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (12)

- [`src/app/portal/agency/[...rest]/page.tsx`](../../app/portal/agency/[...rest]/page.md)
- [`src/app/portal/agency/layout.tsx`](../../app/portal/agency/layout.md)
- [`src/app/portal/agency/marketing/page.tsx`](../../app/portal/agency/marketing/page.md)
- [`src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx`](../../app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.md)
- [`src/app/portal/agency/pipelines/[slug]/page.tsx`](../../app/portal/agency/pipelines/[slug]/page.md)
- [`src/built-ins/modules/leads-pipeline/src/pages/CampaignsPage.tsx`](../modules/leads-pipeline/src/pages/CampaignsPage.md)
- [`src/built-ins/runtime/foundation-adapters/pluginRuntimeAdapter.ts`](./foundation-adapters/pluginRuntimeAdapter.md)
- [`src/lib/server/auth/showcaseMode.ts`](../../lib/server/auth/showcaseMode.md)
- [`src/lib/server/embedAllowResolver.ts`](../../lib/server/embedAllowResolver.md)
- [`src/lib/server/seeds/demoSeed.ts`](../../lib/server/seeds/demoSeed.md)
- [`src/lib/server/seeds/founderSeed.ts`](../../lib/server/seeds/founderSeed.md)
- [`src/server/agencyBootstrap.ts`](../../server/agencyBootstrap.md)

