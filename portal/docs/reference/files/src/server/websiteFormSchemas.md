# `src/server/websiteFormSchemas.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (5)

- `interface FormSchemaImportResult (4 members)`
- `listSiteFormSchemas(agencyId: string, websiteSourceId: string): AquaFormSchema[]`
- `async importFormSchemasForSite(input: { agencyId: string; websiteSourceId: string }, fetchHtml: typeof fetchPublicSiteHtml = fetchPublicSiteHtml): Promise<FormSchemaImportResult>`
- `matchFormSchema(schemas: AquaFormSchema[], formHint: string | undefined): AquaFormSchema | null`
- `resolveFormSchemaForEnquiry(agencyId: string, host: string | undefined, formHint: string | undefined): AquaFormSchema | null`

## Depends on (5)

- [`src/lib/server/aquaTagDetection.ts`](../lib/server/aquaTagDetection.md)
- [`src/lib/server/safeSiteFetch.ts`](../lib/server/safeSiteFetch.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)
- [`src/server/websiteSources.ts`](./websiteSources.md)

## Used by (2)

- [`src/app/api/portal/website-enquiries/form-template/route.ts`](../app/api/portal/website-enquiries/form-template/route.md)
- [`src/app/api/portal/website-sources/route.ts`](../app/api/portal/website-sources/route.md)

