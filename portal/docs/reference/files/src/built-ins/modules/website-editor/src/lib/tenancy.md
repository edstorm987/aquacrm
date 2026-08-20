# `src/built-ins/modules/website-editor/src/lib/tenancy.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Tenancy aliases. Mirrors T2's `plugins/fulfillment/src/lib/tenancy.ts` which itself mirrors `04-the-final-portal/portal/src/server/types.ts` (T1's foundation). When the foundation lands and T2 swaps to canonical imports, T3 swaps too in lockstep.

## Exports (17)

- `type AgencyId`
- `type ClientId`
- `type EndCustomerId`
- `type UserId`
- `type PluginId`
- `type ClientStage`
- `type Role`
- `interface BrandKit (17 members)`
- `type EntityStatus`
- `interface Agency (8 members)`
- `interface Client (11 members)`
- `interface PluginInstallScope (2 members)`
- `interface PluginInstall (12 members)`
- `interface PhaseDefinition (9 members)`
- `interface PhaseChecklistItem (4 members)`
- `type ActivityCategory`
- `interface ActivityEntry (10 members)`

## Used by (38)

- [`src/built-ins/modules/website-editor/src/__smoke__/r008-blog.test.ts`](../__smoke__/r008-blog.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r011-brand-kit-css-vars.test.ts`](../__smoke__/r011-brand-kit-css-vars.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r012-portal-variant-editor.test.ts`](../__smoke__/r012-portal-variant-editor.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r014-seo-meta.test.ts`](../__smoke__/r014-seo-meta.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r022-version-history.test.ts`](../__smoke__/r022-version-history.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r025-redirects.test.ts`](../__smoke__/r025-redirects.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r026-page-privacy.test.ts`](../__smoke__/r026-page-privacy.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r028-block-group-reuse.test.ts`](../__smoke__/r028-block-group-reuse.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r029-custom-css.test.ts`](../__smoke__/r029-custom-css.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r033-static-export.test.ts`](../__smoke__/r033-static-export.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/brandKit.ts`](../api/handlers/brandKit.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/staticExport.ts`](../api/handlers/staticExport.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/SiteHead.tsx`](../components/storefront/SiteHead.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](./aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/brandKitCss.ts`](./brandKitCss.md)
- [`src/built-ins/modules/website-editor/src/lib/faviconUrls.ts`](./faviconUrls.md)
- [`src/built-ins/modules/website-editor/src/lib/jsonLdInjection.ts`](./jsonLdInjection.md)
- [`src/built-ins/modules/website-editor/src/lib/media.ts`](./media.md)
- [`src/built-ins/modules/website-editor/src/server/blog.ts`](../server/blog.md)
- [`src/built-ins/modules/website-editor/src/server/components.ts`](../server/components.md)
- [`src/built-ins/modules/website-editor/src/server/content.ts`](../server/content.md)
- [`src/built-ins/modules/website-editor/src/server/discovery.ts`](../server/discovery.md)
- [`src/built-ins/modules/website-editor/src/server/embedTheme.ts`](../server/embedTheme.md)
- [`src/built-ins/modules/website-editor/src/server/embeds.ts`](../server/embeds.md)
- [`src/built-ins/modules/website-editor/src/server/extensionPorts.ts`](../server/extensionPorts.md)
- [`src/built-ins/modules/website-editor/src/server/pageVersions.ts`](../server/pageVersions.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../server/pages.md)
- [`src/built-ins/modules/website-editor/src/server/portalVariants.ts`](../server/portalVariants.md)
- [`src/built-ins/modules/website-editor/src/server/ports.ts`](../server/ports.md)
- [`src/built-ins/modules/website-editor/src/server/redirects.ts`](../server/redirects.md)
- [`src/built-ins/modules/website-editor/src/server/sites.ts`](../server/sites.md)
- [`src/built-ins/modules/website-editor/src/server/staticExport.ts`](../server/staticExport.md)
- [`src/built-ins/modules/website-editor/src/server/storage-keys.ts`](../server/storage-keys.md)
- [`src/built-ins/modules/website-editor/src/server/themes.ts`](../server/themes.md)
- [`src/built-ins/modules/website-editor/src/types/content.ts`](../types/content.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)
- [`src/built-ins/modules/website-editor/src/types/site.ts`](../types/site.md)
- [`src/built-ins/modules/website-editor/src/types/theme.ts`](../types/theme.md)

