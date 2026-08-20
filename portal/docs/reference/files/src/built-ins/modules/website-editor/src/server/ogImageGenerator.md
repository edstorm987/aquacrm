# `src/built-ins/modules/website-editor/src/server/ogImageGenerator.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R014 — Server-side OG-card generator.  Emits a 1200×630 SVG card with `{title}` over a brand-coloured background, optional `{brandName}` lockup line. Foundation can serve the SVG verbatim from `/og?title=…` — no extra deps (vs. `@vercel/og` which pulls in Satori + a font bundle).  SVG is the storage format; consumers that need raster PNG can pipe the SVG through `sharp` or similar at the foundation layer (R+1).

## Exports (3)

- `interface OgCardOptions (7 members)`
- `buildOgCardSvg(opts: OgCardOptions): string`
- `buildOgCardDataUrl(opts: OgCardOptions): string`

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r014-seo-meta.test.ts`](../__smoke__/r014-seo-meta.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/seoMeta.ts`](../api/handlers/seoMeta.md)

