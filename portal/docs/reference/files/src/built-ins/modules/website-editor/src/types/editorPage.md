# `src/built-ins/modules/website-editor/src/types/editorPage.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** EditorPage — primary unit of the website editor. Adapted from `02 felicias aqua portal work/src/portal/server/types.ts` and re-scoped for 04's three-tier tenancy: - 02: keyed by `siteId` - 04: still keyed by `siteId`, but every Site row carries `{ agencyId, clientId }` so queries can be tenant-scoped.  Round-2 widening: extra fields (`publishedBlocks`, `customHead`, `customFoot`, `customCss`, `seo`) lifted from 02 so the visual editor admin page (`pages/EditorPage.tsx`) compiles unchanged.

## Exports (6)

- `type EditorPageStatus`
- `type EditorPagePrivacy`
- `interface EditorPageSeo (10 members)`
- `interface EditorPage (28 members)`
- `interface CreatePageInput (12 members)`
- `interface UpdatePagePatch (19 members)`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/lib/portalRole.ts`](../lib/portalRole.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](./block.md)

## Used by (27)

- [`src/built-ins/modules/website-editor/src/__smoke__/r035-draft-published.test.ts`](../__smoke__/r035-draft-published.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r045-jsonld-injection.test.ts`](../__smoke__/r045-jsonld-injection.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/save-target.test.ts`](../__smoke__/save-target.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/pagePrivacy.ts`](../api/handlers/pagePrivacy.md)
- [`src/built-ins/modules/website-editor/src/components/editor/EditorBlockStage.tsx`](../components/editor/EditorBlockStage.md)
- [`src/built-ins/modules/website-editor/src/components/editor/PageStatusChip.tsx`](../components/editor/PageStatusChip.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/PortalPageRenderer.tsx`](../components/storefront/PortalPageRenderer.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/SiteHead.tsx`](../components/storefront/SiteHead.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/SiteUX.tsx`](../components/storefront/SiteUX.md)
- [`src/built-ins/modules/website-editor/src/lib/customPages.ts`](../lib/customPages.md)
- [`src/built-ins/modules/website-editor/src/lib/draftPublished.ts`](../lib/draftPublished.md)
- [`src/built-ins/modules/website-editor/src/lib/editorDeepLink.ts`](../lib/editorDeepLink.md)
- [`src/built-ins/modules/website-editor/src/lib/editorPages.ts`](../lib/editorPages.md)
- [`src/built-ins/modules/website-editor/src/lib/jsonLdInjection.ts`](../lib/jsonLdInjection.md)
- [`src/built-ins/modules/website-editor/src/lib/pagePrivacy.ts`](../lib/pagePrivacy.md)
- [`src/built-ins/modules/website-editor/src/lib/pageTemplates.ts`](../lib/pageTemplates.md)
- [`src/built-ins/modules/website-editor/src/lib/savePipeline.ts`](../lib/savePipeline.md)
- [`src/built-ins/modules/website-editor/src/lib/sitemap.ts`](../lib/sitemap.md)
- [`src/built-ins/modules/website-editor/src/lib/slugRedirects.ts`](../lib/slugRedirects.md)
- [`src/built-ins/modules/website-editor/src/pages/EditorPage.tsx`](../pages/EditorPage.md)
- [`src/built-ins/modules/website-editor/src/pages/PagesPage.tsx`](../pages/PagesPage.md)
- [`src/built-ins/modules/website-editor/src/pages/PortalsPage.tsx`](../pages/PortalsPage.md)
- [`src/built-ins/modules/website-editor/src/server/extensionPorts.ts`](../server/extensionPorts.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../server/pages.md)
- [`src/built-ins/modules/website-editor/src/server/portalVariants.ts`](../server/portalVariants.md)
- [`src/built-ins/modules/website-editor/src/server/sitemap.ts`](../server/sitemap.md)
- [`src/built-ins/modules/website-editor/src/server/staticExport.ts`](../server/staticExport.md)

