# `src/lib/server/websiteEnquiries.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (24)

- `type WebsiteEnquiryChannel`
- `type WebsiteEnquiryPriority`
- `type WebsiteEnquiryStatus`
- `interface WebsiteEnquiryReply (14 members)`
- `interface WebsiteEnquiryCall (15 members)`
- `interface WebsiteEnquiry (48 members)`
- `type BrandEnquiryRow`
- `interface WebsiteEnquiryFormCapture (7 members)`
- `async recordWebsiteEnquiryResponse(enquiryId: string, respondedAt: number, actorUserId: string): Promise<boolean>`
- `async synchroniseWebsiteEnquiryIdentities(agencyId: string, enquiries: WebsiteEnquiry[]): Promise<WebsiteEnquiry[]>`
- `synchroniseWebsiteEnquiryLedgerEvents(agencyId: string, clientId: string, enquiry: WebsiteEnquiry)`
- `async recordWebsiteEnquiryIdentityResolution(enquiryId: string, resolution: IdentityResolutionResult): Promise<boolean>`
- `triageWebsiteEnquiry(channel: WebsiteEnquiryChannel, message?: string): Pick<WebsiteEnquiry, "priority" | "topic" | "suggestedAction">`
- `getRequestWebsiteEnquiries(agencyId: string, limit = 250): Promise<WebsiteEnquiry[]>`
- `interface EnquiryReadClient (1 members)`
- `async listWebsiteEnquiries(agencyId: string, limit = 250, deps: { supabase?: EnquiryReadClient } = {}): Promise<WebsiteEnquiry[]>`
- `mapBrandEnquiryRow(row: BrandEnquiryRow): WebsiteEnquiry`
- `attachRoutedCompanyNames(enquiries: WebsiteEnquiry[], companies: Array<{ id: string; name: string }>): WebsiteEnquiry[]`
- `ROUTED_COMPANY_FILTER_ALL`
- `ROUTED_COMPANY_FILTER_NONE`
- `ROUTED_COMPANY_FALLBACK_NAME`
- `matchesRoutedCompanyFilter(enquiry: Pick<WebsiteEnquiry, "routedCompanyId">, filter: string): boolean`
- `filterEnquiriesByRoutedCompany(enquiries: WebsiteEnquiry[], filter: string): WebsiteEnquiry[]`
- `routedCompanyFilterOptions(enquiries: Array<Pick<WebsiteEnquiry, "routedCompanyId" | "routedCompanyName">>): Array<{ id: string; name: string }>`

## Depends on (12)

- [`src/lib/brands/tradingBrands.ts`](../brands/tradingBrands.md)
- [`src/lib/enquiries/enquiryClassification.ts`](../enquiries/enquiryClassification.md)
- [`src/lib/inbox/media.ts`](../inbox/media.md)
- [`src/lib/public/publicSites.ts`](../public/publicSites.md)
- [`src/lib/server/clients/clientRecordLedger.ts`](./clients/clientRecordLedger.md)
- [`src/lib/server/identityResolution.ts`](./identityResolution.md)
- [`src/lib/supabase/admin.ts`](../supabase/admin.md)
- [`src/lib/supabase/enquiryAgencyColumn.ts`](../supabase/enquiryAgencyColumn.md)
- [`src/lib/supabase/ownedEnquiry.ts`](../supabase/ownedEnquiry.md)
- [`src/server/persons.ts`](../../server/persons.md)
- [`src/server/tradingCompanies.ts`](../../server/tradingCompanies.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (24)

- [`src/app/api/portal/identity-resolution/route.ts`](../../app/api/portal/identity-resolution/route.md)
- [`src/app/api/portal/search/route.ts`](../../app/api/portal/search/route.md)
- [`src/app/api/portal/website-enquiries/calls/route.ts`](../../app/api/portal/website-enquiries/calls/route.md)
- [`src/app/api/portal/website-enquiries/status/route.ts`](../../app/api/portal/website-enquiries/status/route.md)
- [`src/app/api/tenants/client-requests/route.ts`](../../app/api/tenants/client-requests/route.md)
- [`src/app/portal/agency/inbox/_EnquiryCommunications.tsx`](../../app/portal/agency/inbox/_EnquiryCommunications.md)
- [`src/app/portal/agency/inbox/_EnquiryDetailCard.tsx`](../../app/portal/agency/inbox/_EnquiryDetailCard.md)
- [`src/app/portal/agency/inbox/_MasterInbox.tsx`](../../app/portal/agency/inbox/_MasterInbox.md)
- [`src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx`](../../app/portal/agency/inbox/_UnifiedInboxWorkspace.md)
- [`src/app/portal/agency/inbox/page.tsx`](../../app/portal/agency/inbox/page.md)
- [`src/app/portal/agency/marketing/page.tsx`](../../app/portal/agency/marketing/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)
- [`src/app/portal/customer/_portalData.ts`](../../app/portal/customer/_portalData.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../../built-ins/modules/leads-pipeline/src/api/handlers.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](../../engines/data/server/radar/businessIssueRadar.md)
- [`src/engines/data/server/radar/radarObservations.ts`](../../engines/data/server/radar/radarObservations.md)
- [`src/engines/data/server/radar/radarSourceInspection.ts`](../../engines/data/server/radar/radarSourceInspection.md)
- [`src/lib/enquiries/enquiryFormLayout.ts`](../enquiries/enquiryFormLayout.md)
- [`src/lib/server/compliancePostureSource.ts`](./compliancePostureSource.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](./inbox/operationalAlerts.md)
- [`src/lib/server/personInteractions.ts`](./personInteractions.md)
- [`src/lib/server/resolutionPlans.ts`](./resolutionPlans.md)
- [`src/server/automations.ts`](../../server/automations.md)

