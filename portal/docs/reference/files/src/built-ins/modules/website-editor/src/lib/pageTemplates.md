# `src/built-ins/modules/website-editor/src/lib/pageTemplates.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R042 — Page-type templates (landing / blog post / product / about / contact / FAQ).  Pure data + factory: each template seeds a starting block tree plus SEO defaults (title / description / og*). Coexists with `components/pageTemplates.ts` — that one is the editor "Create page" modal's rich registry (13 entries; ecommerce shop/cart/checkout/...); this lib-level registry is the 6-page-type set the round prompt asked for, shaped for programmatic creation paths (storage layer imports, batch seeding, smoke).  Block trees are intentionally minimal — operators expect to edit after picking a template, not to ship a finished page. Real visual polish comes from R027 block-catalog presets + R011 brand-kit CSS vars layering on top.

## Exports (7)

- `type PageTemplateId`
- `interface PageTemplate (6 members)`
- `pageTemplates: readonly PageTemplate[]`
- `getPageTemplate(id: PageTemplateId): PageTemplate | undefined`
- `interface ApplyResult (4 members)`
- `applyTemplate(id: PageTemplateId, override: { slug?: string; title?: string } = {}): ApplyResult`
- `uniqueSlug(desired: string, existing: readonly string[]): string`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/lib/ids.ts`](./ids.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/__smoke__/r042-page-templates.test.ts`](../__smoke__/r042-page-templates.test.md)

