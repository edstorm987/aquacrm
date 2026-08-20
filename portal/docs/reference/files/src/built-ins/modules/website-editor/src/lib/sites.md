# `src/built-ins/modules/website-editor/src/lib/sites.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (11)

- `listSites(): Site[]`
- `async refreshSites(): Promise<Site[]>`
- `getSite(siteId: string): Site | undefined`
- `async fetchSite(siteId: string): Promise<Site | null>`
- `getActiveSiteId(adminEmail?: string): string`
- `getActiveSite(adminEmail?: string): Site | undefined`
- `setActiveSiteId(siteId: string, adminEmail?: string): void`
- `onSitesChange(handler: () => void): () => void`
- `async createSite(input: Omit<CreateSiteInput, "agencyId" | "clientId">): Promise<Site>`
- `async updateSite(siteId: string, patch: UpdateSitePatch): Promise<Site>`
- `async deleteSite(siteId: string): Promise<boolean>`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/site.ts`](../types/site.md)

## Used by (8)

- [`src/built-ins/modules/website-editor/src/components/canvas/PropertiesPanel.tsx`](../components/canvas/PropertiesPanel.md)
- [`src/built-ins/modules/website-editor/src/lib/promote.ts`](./promote.md)
- [`src/built-ins/modules/website-editor/src/pages/EditorPage.tsx`](../pages/EditorPage.md)
- [`src/built-ins/modules/website-editor/src/pages/GitStatusPage.tsx`](../pages/GitStatusPage.md)
- [`src/built-ins/modules/website-editor/src/pages/PagesPage.tsx`](../pages/PagesPage.md)
- [`src/built-ins/modules/website-editor/src/pages/PortalsPage.tsx`](../pages/PortalsPage.md)
- [`src/built-ins/modules/website-editor/src/pages/ThemeDetailPage.tsx`](../pages/ThemeDetailPage.md)
- [`src/built-ins/modules/website-editor/src/pages/ThemesPage.tsx`](../pages/ThemesPage.md)

