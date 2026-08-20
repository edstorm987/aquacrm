# `src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Local copy of the Aqua plugin contract.  **TODO** — this file is a vendored copy of the canonical contract that T1's foundation will publish at `portal/src/plugins/_types.ts`. It exists here so the plugin tsc-clean-checks standalone in autonomous-mesh round 1. Once T1 ships, replace this file with:  export * from '../../../../portal/src/plugins/_types';  Adapted from `02 felicias aqua portal work/src/plugins/_types.ts` and extended with the `storefront` field (block contributions) that T2's vendored copy omitted. Keep field shapes parallel to T2's `plugins/fulfillment/src/lib/aquaPluginTypes.ts` to ease the eventual merge.

## Exports (26)

- `type PluginCategory`
- `type PluginStatus`
- `interface PluginCtx (6 members)`
- `interface PluginStorage (4 members)`
- `interface PublicMediaStoreInput (5 members)`
- `interface StoredPublicMedia (2 members)`
- `interface PublicMediaPort (1 members)`
- `interface PluginServices (9 members)`
- `interface SetupStep (6 members)`
- `interface SetupField (7 members)`
- `interface NavGroup (3 members)`
- `type PluginRoleVisibility`
- `interface NavItem (11 members)`
- `interface PluginPage (4 members)`
- `interface PluginPageProps (8 members)`
- `interface PluginApiRoute (4 members)`
- `interface SettingsSchema (2 members)`
- `interface SettingsGroup (4 members)`
- `interface SettingsField (7 members)`
- `interface PluginFeature (6 members)`
- `interface HealthStatus (3 members)`
- `interface BlockDescriptor (9 members)`
- `type BlockCategory`
- `interface HeadInjection (3 members)`
- `interface StorefrontContributions (2 members)`
- `interface AquaPlugin (25 members)`

## Depends on (2)

- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](./tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/ports.ts`](../server/ports.md)

## Used by (64)

- [`scripts/smoke-public-media-promotion.test.ts`](../../../../../../scripts/smoke-public-media-promotion.test.md)
- [`src/built-ins/modules/website-editor/index.ts`](../../index.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/blocks.test.ts`](../__smoke__/blocks.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r007-cookie-force-password.test.ts`](../__smoke__/r007-cookie-force-password.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r008-blog.test.ts`](../__smoke__/r008-blog.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r011-brand-kit-css-vars.test.ts`](../__smoke__/r011-brand-kit-css-vars.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r012-portal-variant-editor.test.ts`](../__smoke__/r012-portal-variant-editor.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r013-iframe-embed-surface.test.ts`](../__smoke__/r013-iframe-embed-surface.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r014-seo-meta.test.ts`](../__smoke__/r014-seo-meta.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r016-marketplace-polish.test.ts`](../__smoke__/r016-marketplace-polish.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r022-version-history.test.ts`](../__smoke__/r022-version-history.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r024-asset-manager.test.ts`](../__smoke__/r024-asset-manager.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r025-redirects.test.ts`](../__smoke__/r025-redirects.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r026-page-privacy.test.ts`](../__smoke__/r026-page-privacy.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r028-block-group-reuse.test.ts`](../__smoke__/r028-block-group-reuse.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r029-custom-css.test.ts`](../__smoke__/r029-custom-css.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r033-static-export.test.ts`](../__smoke__/r033-static-export.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r044-sitemap-host-routes.test.ts`](../__smoke__/r044-sitemap-host-routes.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r046-static-export-sitemap-bundle.test.ts`](../__smoke__/r046-static-export-sitemap-bundle.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r047-form-submission-host-route.test.ts`](../__smoke__/r047-form-submission-host-route.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/template-marketplace.test.ts`](../__smoke__/template-marketplace.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/video-and-preview.test.ts`](../__smoke__/video-and-preview.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/assets.ts`](../api/handlers/assets.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/blog.ts`](../api/handlers/blog.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/brandKit.ts`](../api/handlers/brandKit.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/components.ts`](../api/handlers/components.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/content.ts`](../api/handlers/content.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/customCode.ts`](../api/handlers/customCode.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/discoveries.ts`](../api/handlers/discoveries.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/embedAllow.ts`](../api/handlers/embedAllow.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/embeds.ts`](../api/handlers/embeds.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/forcePassword.ts`](../api/handlers/forcePassword.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/formSubmissionHost.ts`](../api/handlers/formSubmissionHost.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/pagePrivacy.ts`](../api/handlers/pagePrivacy.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/pageVersions.ts`](../api/handlers/pageVersions.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/pages.ts`](../api/handlers/pages.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/promote.ts`](../api/handlers/promote.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/redirects.ts`](../api/handlers/redirects.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/seoMeta.ts`](../api/handlers/seoMeta.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/sitemapHostRoutes.ts`](../api/handlers/sitemapHostRoutes.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/sites.ts`](../api/handlers/sites.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/staticExport.ts`](../api/handlers/staticExport.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/templates.ts`](../api/handlers/templates.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/themes.ts`](../api/handlers/themes.md)
- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../api/helpers.md)
- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../api/routes.md)
- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](../components/blockRegistry.md)
- [`src/built-ins/modules/website-editor/src/components/editor/BlockCatalog.tsx`](../components/editor/BlockCatalog.md)
- [`src/built-ins/modules/website-editor/src/server/blog.ts`](../server/blog.md)
- [`src/built-ins/modules/website-editor/src/server/components.ts`](../server/components.md)
- [`src/built-ins/modules/website-editor/src/server/content.ts`](../server/content.md)
- [`src/built-ins/modules/website-editor/src/server/discovery.ts`](../server/discovery.md)
- [`src/built-ins/modules/website-editor/src/server/embedAllow.ts`](../server/embedAllow.md)
- [`src/built-ins/modules/website-editor/src/server/embedTheme.ts`](../server/embedTheme.md)
- [`src/built-ins/modules/website-editor/src/server/embeds.ts`](../server/embeds.md)
- [`src/built-ins/modules/website-editor/src/server/forcePasswordChange.ts`](../server/forcePasswordChange.md)
- [`src/built-ins/modules/website-editor/src/server/pageVersions.ts`](../server/pageVersions.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../server/pages.md)
- [`src/built-ins/modules/website-editor/src/server/portalVariants.ts`](../server/portalVariants.md)
- [`src/built-ins/modules/website-editor/src/server/redirects.ts`](../server/redirects.md)
- [`src/built-ins/modules/website-editor/src/server/sites.ts`](../server/sites.md)
- [`src/built-ins/modules/website-editor/src/server/staticExport.ts`](../server/staticExport.md)
- [`src/built-ins/modules/website-editor/src/server/templateMarketplace.ts`](../server/templateMarketplace.md)
- [`src/built-ins/modules/website-editor/src/server/themes.ts`](../server/themes.md)

