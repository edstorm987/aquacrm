# `src/server/websiteSources.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (11)

- `interface WebsiteSource (8 members)`
- `normalizeHost(input: string): string`
- `listWebsiteSources(agencyId: string): WebsiteSource[]`
- `getWebsiteSource(agencyId: string, id: string): WebsiteSource | null`
- `resolveWebsiteSourceRouting(agencyId: string, host: string | undefined): WebsiteSourceDestination`
- `addWebsiteSource(input: { agencyId: string; host: string; label?: string; destinationClientId?: string; destinationCompanyId?: string; createdBy: string; }): WebsiteSource`
- `updateWebsiteSourceRouting(input: { agencyId: string; id: string; destinationClientId?: string; destinationCompanyId?: string; label?: string; }): WebsiteSource | null`
- `ensureAgencyMasterSiteKey(agencyId: string): string`
- `resolveAgencyByMasterSiteKey(siteKey: string | undefined): string | undefined`
- `masterTagSnippet(origin: string, siteKey: string): string`
- `removeWebsiteSource(agencyId: string, id: string): boolean`

## Depends on (5)

- [`src/lib/server/clientTelemetry.ts`](../lib/server/clientTelemetry.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/tenants.ts`](./tenants.md)
- [`src/server/tradingCompanies.ts`](./tradingCompanies.md)
- [`src/server/types.ts`](./types.md)

## Used by (12)

- [`scripts/verify-marketing-runtime.ts`](../../scripts/verify-marketing-runtime.md)
- [`src/app/api/portal/aqua-tags/detect/route.ts`](../app/api/portal/aqua-tags/detect/route.md)
- [`src/app/api/portal/website-injections/route.ts`](../app/api/portal/website-injections/route.md)
- [`src/app/api/portal/website-sources/route.ts`](../app/api/portal/website-sources/route.md)
- [`src/app/api/public/aqua-tag-config/route.ts`](../app/api/public/aqua-tag-config/route.md)
- [`src/app/api/public/brand-enquiry/route.ts`](../app/api/public/brand-enquiry/route.md)
- [`src/app/api/public/form-capture/route.ts`](../app/api/public/form-capture/route.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/dev-team/api/page.tsx`](../app/portal/dev-team/api/page.md)
- [`src/lib/server/marketingIntelligence.ts`](../lib/server/marketingIntelligence.md)
- [`src/server/websiteFormSchemas.ts`](./websiteFormSchemas.md)
- [`src/server/websiteInjections.ts`](./websiteInjections.md)

