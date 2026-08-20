# `src/lib/publicSites.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (8)

- `PUBLIC_AQUA_SITES`
- `type PublicAquaSiteKey`
- `interface ResolvedPublicAquaSite (4 members)`
- `publicAquaSite(siteKey: string)`
- `resolvePublicAquaSite(brand: string, origin?: string | null): ResolvedPublicAquaSite | null`
- `publicAquaSiteName(siteKey: string): string | null`
- `publicAquaPropertyId(siteKey: string, requestedPropertyId: unknown)`
- `isAllowedPublicSiteOrigin(siteKey: string, origin: string | null)`

## Used by (5)

- [`src/app/api/public/brand-enquiry/route.ts`](../app/api/public/brand-enquiry/route.md)
- [`src/app/api/public/form-capture/route.ts`](../app/api/public/form-capture/route.md)
- [`src/app/api/telemetry/collect/route.ts`](../app/api/telemetry/collect/route.md)
- [`src/lib/server/websiteEnquiries.ts`](./server/websiteEnquiries.md)
- [`src/server/agencyWebsite.ts`](../server/agencyWebsite.md)

