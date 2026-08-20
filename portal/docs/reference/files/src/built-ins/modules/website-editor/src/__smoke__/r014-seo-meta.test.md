# `src/built-ins/modules/website-editor/src/__smoke__/r014-seo-meta.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R014 SEO meta + favicon + sitemap + OG card.  Asserts: - EditorPageSeo accepts canonical + keywords (typecheck only) - deriveFaviconUrls picks brand logo when set, fallback when not - faviconHeadLinks emits 5 link/meta tags - buildSitemapXml: published-only, no portal-variants, no noIndex, no underscore-prefixed slugs, valid XML escape - buildRobotsTxt: Disallow per noIndex, /_*, /embed/, sitemap pointer - buildOgCardSvg: title wrapping, brand line, light/dark text choice - HTTP handlers shape (200 with right content-type, 400 missing title)

_No exported symbols (side-effect / internal module)._

## Depends on (6)

- [`src/built-ins/modules/website-editor/src/api/handlers/seoMeta.ts`](../api/handlers/seoMeta.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/faviconUrls.ts`](../lib/faviconUrls.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/ogImageGenerator.ts`](../server/ogImageGenerator.md)
- [`src/built-ins/modules/website-editor/src/server/sitemap.ts`](../server/sitemap.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

