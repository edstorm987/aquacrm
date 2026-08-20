# `src/built-ins/modules/website-editor/src/server/templateMarketplace.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R006 — Template marketplace registry.  Lists all "builtin" starter templates (login starters, Aqua Incubator, brand-page presets + composite pack, generic PAGE_TEMPLATES) plus per-agency operator-saved templates. Surfaces metadata used by the gallery: id, label, description, tags, an optional cover image URL, and a `kind` that distinguishes builtin templates from operator-saved ones (so the UI can show a delete affordance only on the latter).  Operator-saved templates live under `t/<agencyId>/_agency/website-editor/templates/<id>` so the same gallery surfaces across all clients of an agency without leaking to other agencies.

## Exports (17)

- `type TemplateCategory`
- `TEMPLATE_CATEGORIES: readonly TemplateCategory[]`
- `interface TemplateEntry (11 members)`
- `categoryForTags(tags: string[]): TemplateCategory`
- `listBuiltinTemplates(): TemplateEntry[]`
- `builtinTemplateIds(): string[]`
- `async listSavedTemplates(storage: PluginStorage, agencyId: string): Promise<TemplateEntry[]>`
- `async listAllTemplates(storage: PluginStorage, agencyId: string): Promise<TemplateEntry[]>`
- `async listInstallCounts(storage: PluginStorage, agencyId: string): Promise<Record<string, number>>`
- `async bumpInstallCount(storage: PluginStorage, agencyId: string, templateId: string): Promise<number>`
- `async listFeaturedIds(storage: PluginStorage, agencyId: string): Promise<string[]>`
- `async setFeaturedIds(storage: PluginStorage, agencyId: string, ids: string[]): Promise<string[]>`
- `interface TemplateFilter (4 members)`
- `filterTemplates(templates: TemplateEntry[], filter: TemplateFilter = {}): TemplateEntry[]`
- `interface SaveTemplateInput (6 members)`
- `async saveTemplate(storage: PluginStorage, agencyId: string, input: SaveTemplateInput): Promise<TemplateEntry>`
- `async deleteSavedTemplate(storage: PluginStorage, agencyId: string, id: string): Promise<boolean>`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/components/pageTemplates.ts`](../components/pageTemplates.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (4)

- [`src/built-ins/modules/website-editor/src/__smoke__/r010-incubator-template-preset.test.ts`](../__smoke__/r010-incubator-template-preset.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r016-marketplace-polish.test.ts`](../__smoke__/r016-marketplace-polish.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/template-marketplace.test.ts`](../__smoke__/template-marketplace.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/templates.ts`](../api/handlers/templates.md)

