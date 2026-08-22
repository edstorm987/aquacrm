# `src/lib/server/integrations/aquaTagDetection.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `interface AquaTagScanForms (2 members)`
- `interface AquaTagAnalysis (6 members)`
- `interface AquaTagDetection (5 members)`
- `scanFormsInHtml(html: string): AquaTagScanForms`
- `scanFormSchemasInHtml(html: string): AquaFormSchema[]`
- `analyzeAquaTagHtml(html: string, masterSiteKey: string, pageUrl?: string): AquaTagAnalysis`
- `async detectAquaTag(input: { rawUrl: string; masterSiteKey: string }): Promise<AquaTagDetection>`

## Depends on (2)

- [`src/lib/server/safeSiteFetch.ts`](../safeSiteFetch.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (6)

- [`scripts/smoke-dev-editor-aqua-tag.test.ts`](../../../../scripts/smoke-dev-editor-aqua-tag.test.md)
- [`scripts/smoke-dev-project-map.test.ts`](../../../../scripts/smoke-dev-project-map.test.md)
- [`scripts/smoke-import-forms.test.ts`](../../../../scripts/smoke-import-forms.test.md)
- [`src/app/api/portal/aqua-tags/detect/route.ts`](../../../app/api/portal/aqua-tags/detect/route.md)
- [`src/engines/editor/server/mapProject.ts`](../../../engines/editor/server/mapProject.md)
- [`src/server/websiteFormSchemas.ts`](../../../server/websiteFormSchemas.md)

