# `src/built-ins/modules/website-editor/src/server/sites.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Site CRUD scoped by (agencyId, clientId). Adapted from `02/src/lib/admin/sites.ts` + the implicit Site concept in 02's pages.ts.

## Exports (6)

- `async listSites(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId): Promise<Site[]>`
- `async getSite(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, id: string): Promise<Site | null>`
- `async createSite(storage: PluginStorage, input: CreateSiteInput): Promise<Site>`
- `async updateSite(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, id: string, patch: UpdateSitePatch): Promise<Site | null>`
- `async deleteSite(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, id: string): Promise<boolean>`
- `async getOrCreateDefaultSite(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, fallbackName: string = clientId): Promise<Site>`

## Depends on (5)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/storage-keys.ts`](./storage-keys.md)
- [`src/built-ins/modules/website-editor/src/types/site.ts`](../types/site.md)

## Used by (12)

- [`src/built-ins/modules/website-editor/src/__smoke__/r012-portal-variant-editor.test.ts`](../__smoke__/r012-portal-variant-editor.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r026-page-privacy.test.ts`](../__smoke__/r026-page-privacy.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r029-custom-css.test.ts`](../__smoke__/r029-custom-css.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r044-sitemap-host-routes.test.ts`](../__smoke__/r044-sitemap-host-routes.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r046-static-export-sitemap-bundle.test.ts`](../__smoke__/r046-static-export-sitemap-bundle.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r047-form-submission-host-route.test.ts`](../__smoke__/r047-form-submission-host-route.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/formSubmissionHost.ts`](../api/handlers/formSubmissionHost.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/seoMeta.ts`](../api/handlers/seoMeta.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/sitemapHostRoutes.ts`](../api/handlers/sitemapHostRoutes.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/sites.ts`](../api/handlers/sites.md)
- [`src/built-ins/modules/website-editor/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/website-editor/src/server/portalVariants.ts`](./portalVariants.md)

