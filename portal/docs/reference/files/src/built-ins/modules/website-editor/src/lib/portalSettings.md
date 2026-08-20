# `src/built-ins/modules/website-editor/src/lib/portalSettings.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (11)

- `type DatabaseBackend`
- `interface PortalSettings (3 members)`
- `type PortalSettingsPatch`
- `SECRET_PLACEHOLDER`
- `DEFAULT_SETTINGS: PortalSettings`
- `async loadSettings(): Promise<PortalSettings>`
- `getSettings(): PortalSettings`
- `async saveSettings(patch: PortalSettingsPatch): Promise<PortalSettings>`
- `async resetSettings(): Promise<PortalSettings>`
- `onSettingsChange(handler: () => void): () => void`
- `hasSecret(value: string | undefined): boolean`

## Used by (1)

- [`src/built-ins/modules/website-editor/src/pages/SitesPage.tsx`](../pages/SitesPage.md)

