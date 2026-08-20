# `src/built-ins/modules/website-editor/src/server/staticExport.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R033 — Static site export.  `exportSiteToZip` renders every published page in a site to a static HTML file and bundles them with brand.css, robots.txt, sitemap.xml, per-locale sitemap-<locale>.xml (R046), and a README into a single store-only ZIP (Uint8Array). Sitemap + robots use the R036 advanced generators (changefreq + priority + per-locale alternates + redirect-source / draft / private / noIndex filters).  Honesty caveat: this is a snapshot. Form submissions, member gates, commerce blocks, and any other dynamic surface depend on the running portal backend and won't function on a third-party static host without their own wiring. The bundled README spells this out.  Pure server module — no React. The renderer walks BlockTree[] and emits semantic HTML for the common content blocks (heading / text / button / image / container / section / spacer / divider). Unknown types fall back to a `<div data-block-type="…">` shell so the surrounding layout still flows.

## Exports (8)

- `interface ExportSiteInput (7 members)`
- `interface ExportSiteResult (3 members)`
- `renderBlockToHtml(block: Block): string`
- `renderPageHtml(page: EditorPage, opts: { brandCssHref: string; customCssHref?: string; siteTitle?: string; }): string`
- `buildBrandCss(brand?: BrandKit): string`
- `buildExportReadme(siteId: string, baseUrl: string, pages: number): string`
- `buildZip(entries: ZipEntry[]): Uint8Array`
- `async exportSiteToZip(input: ExportSiteInput): Promise<ExportSiteResult>`

## Depends on (6)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/sitemap.ts`](../lib/sitemap.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](./pages.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by (4)

- [`scripts/smoke-public-media-promotion.test.ts`](../../../../../../scripts/smoke-public-media-promotion.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r033-static-export.test.ts`](../__smoke__/r033-static-export.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r046-static-export-sitemap-bundle.test.ts`](../__smoke__/r046-static-export-sitemap-bundle.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/staticExport.ts`](../api/handlers/staticExport.md)

