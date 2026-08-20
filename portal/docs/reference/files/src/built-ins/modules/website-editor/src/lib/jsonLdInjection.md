# `src/built-ins/modules/website-editor/src/lib/jsonLdInjection.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R045 — JSON-LD injection for the page `<head>`.  R037 shipped the pure generators (`buildJsonLd`, `validateJsonLd`, `serializeJsonLd`). R045 sources Organization data from the agency/site, decides what to emit per page, and exposes a React-friendly script-tag emitter the storefront `<head>` mounts.  Coverage stays the same as R037 — Article, Product, FAQPage, BreadcrumbList, Organization. Recipe / Event / LocalBusiness (R+1) and per-locale variants (R+1, depends on R032) remain out of scope.

## Exports (7)

- `interface JsonLdOrgSource (4 members)`
- `deriveOrganization(src: JsonLdOrgSource): OrganizationInput | undefined`
- `interface BuildPageJsonLdOpts (4 members)`
- `buildPageJsonLd(page: EditorPage, opts: BuildPageJsonLdOpts): JsonLdObject[]`
- `buildJsonLdScriptBodies(arr: readonly JsonLdObject[]): string[]`
- `interface JsonLdEmissionDescriptor (2 members)`
- `describeJsonLdEmission(arr: readonly JsonLdObject[]): JsonLdEmissionDescriptor[]`

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/lib/structuredData.ts`](./structuredData.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](./tenancy.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)
- [`src/built-ins/modules/website-editor/src/types/site.ts`](../types/site.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r045-jsonld-injection.test.ts`](../__smoke__/r045-jsonld-injection.test.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/SiteHead.tsx`](../components/storefront/SiteHead.md)

