# `src/built-ins/modules/website-editor/src/lib/structuredData.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R037 — schema.org structured data per page.  Pure JSON-LD generators driven by the block tree. Host injects the returned objects as `<script type="application/ld+json">` blobs in <head>. No foundation imports, no DOM, no fetch — every input is passed in.  Coverage (this round): - article block(s)        → Article schema - product block(s)        → Product schema - faq-item block runs     → FAQPage with mainEntity[] - breadcrumb block        → BreadcrumbList - opts.org always present → Organization (one per page)  NOT in scope: Recipe / Event / LocalBusiness (R+1), nor inferring schema from non-typed content blocks (heading/text). The walker only reacts to typed kinds listed above.

## Exports (8)

- `interface OrganizationInput (4 members)`
- `interface BuildJsonLdOpts (2 members)`
- `interface JsonLdPageInput (2 members)`
- `interface JsonLdObject (3 members)`
- `buildJsonLd(page: JsonLdPageInput, opts: BuildJsonLdOpts): JsonLdObject[]`
- `interface JsonLdIssue (3 members)`
- `validateJsonLd(obj: JsonLdObject): JsonLdIssue[]`
- `serializeJsonLd(arr: readonly JsonLdObject[]): string`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r037-structured-data.test.ts`](../__smoke__/r037-structured-data.test.md)
- [`src/built-ins/modules/website-editor/src/lib/jsonLdInjection.ts`](./jsonLdInjection.md)

