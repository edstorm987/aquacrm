# `src/built-ins/modules/website-editor/src/server/themes.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Theme CRUD scoped per (agencyId, clientId, siteId). Adapted from `02/src/portal/server/themes.ts` (208 lines).

## Exports (7)

- `async listThemes(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string): Promise<ThemeRecord[]>`
- `async getTheme(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, id: string): Promise<ThemeRecord | null>`
- `async getDefaultTheme(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string): Promise<ThemeRecord | null>`
- `async createTheme(storage: PluginStorage, input: CreateThemeInput): Promise<ThemeRecord>`
- `async updateTheme(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, id: string, patch: UpdateThemePatch): Promise<ThemeRecord | null>`
- `async setDefaultTheme(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, id: string): Promise<boolean>`
- `async deleteTheme(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, id: string): Promise<boolean>`

## Depends on (5)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/storage-keys.ts`](./storage-keys.md)
- [`src/built-ins/modules/website-editor/src/types/theme.ts`](../types/theme.md)

## Used by (3)

- [`src/app/client-website-preview/[clientId]/[siteId]/[pageId]/page.tsx`](../../../../../app/client-website-preview/[clientId]/[siteId]/[pageId]/page.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/themes.ts`](../api/handlers/themes.md)
- [`src/built-ins/modules/website-editor/src/server/index.ts`](./index.md)

