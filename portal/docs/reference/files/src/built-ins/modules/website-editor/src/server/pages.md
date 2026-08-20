# `src/built-ins/modules/website-editor/src/server/pages.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Page CRUD + portal-variant helpers. Adapted from `02/src/portal/server/pages.ts` (190 lines) — lifts the listVariants / getActive / setActive helpers and re-scopes from `siteId` only to `(agencyId, clientId, siteId)` triple per 04's tenancy model.

## Exports (11)

- `async listPages(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string): Promise<EditorPage[]>`
- `async getPage(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, id: string): Promise<EditorPage | null>`
- `async getPageBySlug(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, slug: string): Promise<EditorPage | null>`
- `async createPage(storage: PluginStorage, input: CreatePageInput): Promise<EditorPage>`
- `async updatePage(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, id: string, patch: UpdatePagePatch): Promise<EditorPage | null>`
- `async publishPage(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, id: string, opts?: { publicMedia?: PublicMediaPort }): Promise<EditorPage | null>`
- `async revertPage(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, id: string): Promise<EditorPage | null>`
- `async deletePage(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, id: string): Promise<boolean>`
- `async listVariantsForPortal(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, role: PortalRole): Promise<EditorPage[]>`
- `async getActivePortalVariant(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, role: PortalRole): Promise<EditorPage | null>`
- `async setActivePortalVariant(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, role: PortalRole, pageId: string | null): Promise<boolean>`

## Depends on (7)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/website-editor/src/lib/portalRole.ts`](../lib/portalRole.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/publicMediaPromotion.ts`](./publicMediaPromotion.md)
- [`src/built-ins/modules/website-editor/src/server/storage-keys.ts`](./storage-keys.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by (18)

- [`scripts/smoke-public-media-promotion.test.ts`](../../../../../../scripts/smoke-public-media-promotion.test.md)
- [`src/app/client-website-preview/[clientId]/[siteId]/[pageId]/page.tsx`](../../../../../app/client-website-preview/[clientId]/[siteId]/[pageId]/page.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r012-portal-variant-editor.test.ts`](../__smoke__/r012-portal-variant-editor.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r026-page-privacy.test.ts`](../__smoke__/r026-page-privacy.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r029-custom-css.test.ts`](../__smoke__/r029-custom-css.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r033-static-export.test.ts`](../__smoke__/r033-static-export.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r044-sitemap-host-routes.test.ts`](../__smoke__/r044-sitemap-host-routes.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r046-static-export-sitemap-bundle.test.ts`](../__smoke__/r046-static-export-sitemap-bundle.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r047-form-submission-host-route.test.ts`](../__smoke__/r047-form-submission-host-route.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/customCode.ts`](../api/handlers/customCode.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/formSubmissionHost.ts`](../api/handlers/formSubmissionHost.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/pagePrivacy.ts`](../api/handlers/pagePrivacy.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/pages.ts`](../api/handlers/pages.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/seoMeta.ts`](../api/handlers/seoMeta.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/sitemapHostRoutes.ts`](../api/handlers/sitemapHostRoutes.md)
- [`src/built-ins/modules/website-editor/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/website-editor/src/server/portalVariants.ts`](./portalVariants.md)
- [`src/built-ins/modules/website-editor/src/server/staticExport.ts`](./staticExport.md)

