# `src/built-ins/modules/website-editor/src/components/storefront/SiteHead.tsx`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Per-page <head> tag rendering. Faithful structural port from `02/src/components/SiteHead.tsx` (461 lines), trimmed to the meta-tag surface. The analytics / script-tag injection portion has been EXTRACTED — those belong to a future SEO/analytics plugin's `headInjections[]` manifest contribution. See chapter doc.  R045 — adds JSON-LD `<script type="application/ld+json">` emission driven by `lib/jsonLdInjection.ts` (`buildPageJsonLd` + `buildJsonLdScriptBodies`). Skips emission cleanly when the helper returns no objects (zero matchable schemas + no Organization).

## Exports (2)

- `interface SiteHeadProps (7 members)`
- `SiteHead({ site, page, defaultLocale, defaultDescription, agencyName, baseUrl, brandKit }: SiteHeadProps)`

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/lib/jsonLdInjection.ts`](../../lib/jsonLdInjection.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../../types/editorPage.md)
- [`src/built-ins/modules/website-editor/src/types/site.ts`](../../types/site.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/components/index.ts`](../index.md)

