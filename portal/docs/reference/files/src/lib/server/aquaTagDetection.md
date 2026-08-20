# `src/lib/server/integrations/aquaTagDetection.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `interface AquaTagScanForms (2 members)`
- `interface AquaTagAnalysis (4 members)`
- `interface AquaTagDetection (5 members)`
- `scanFormsInHtml(html: string): AquaTagScanForms`
- `scanFormSchemasInHtml(html: string): AquaFormSchema[]`
- `analyzeAquaTagHtml(html: string, masterSiteKey: string): AquaTagAnalysis`
- `async detectAquaTag(input: { rawUrl: string; masterSiteKey: string }): Promise<AquaTagDetection>`

## Depends on (2)

- [`src/lib/server/safeSiteFetch.ts`](./safeSiteFetch.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (3)

- [`scripts/smoke-import-forms.test.ts`](../../../scripts/smoke-import-forms.test.md)
- [`src/app/api/portal/aqua-tags/detect/route.ts`](../../app/api/portal/aqua-tags/detect/route.md)
- [`src/server/websiteFormSchemas.ts`](../../server/websiteFormSchemas.md)

