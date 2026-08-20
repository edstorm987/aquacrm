# `src/lib/server/websiteEnquiries.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (14)

- `type WebsiteEnquiryChannel`
- `type WebsiteEnquiryPriority`
- `type WebsiteEnquiryStatus`
- `interface WebsiteEnquiryReply (14 members)`
- `interface WebsiteEnquiryCall (15 members)`
- `interface WebsiteEnquiry (46 members)`
- `interface WebsiteEnquiryFormCapture (7 members)`
- `async recordWebsiteEnquiryResponse(enquiryId: string, respondedAt: number, actorUserId: string): Promise<boolean>`
- `async synchroniseWebsiteEnquiryIdentities(agencyId: string, enquiries: WebsiteEnquiry[]): Promise<WebsiteEnquiry[]>`
- `synchroniseWebsiteEnquiryLedgerEvents(agencyId: string, clientId: string, enquiry: WebsiteEnquiry)`
- `async recordWebsiteEnquiryIdentityResolution(enquiryId: string, resolution: IdentityResolutionResult): Promise<boolean>`
- `triageWebsiteEnquiry(channel: WebsiteEnquiryChannel, message?: string): Pick<WebsiteEnquiry, "priority" | "topic" | "suggestedAction">`
- `getRequestWebsiteEnquiries(limit = 250): Promise<WebsiteEnquiry[]>`
- `async listWebsiteEnquiries(limit = 250): Promise<WebsiteEnquiry[]>`

## Depends on (9)

- [`src/lib/enquiryClassification.ts`](../enquiryClassification.md)
- [`src/lib/inbox/media.ts`](../inbox/media.md)
- [`src/lib/publicSites.ts`](../publicSites.md)
- [`src/lib/server/clientRecordLedger.ts`](./clientRecordLedger.md)
- [`src/lib/server/identityResolution.ts`](./identityResolution.md)
- [`src/lib/supabase/admin.ts`](../supabase/admin.md)
- [`src/lib/tradingBrands.ts`](../tradingBrands.md)
- [`src/server/persons.ts`](../../server/persons.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (23)

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
- [`src/lib/enquiryFormLayout.ts`](../enquiryFormLayout.md)
- [`src/lib/server/businessIssueRadar.ts`](./businessIssueRadar.md)
- [`src/lib/server/operationalAlerts.ts`](./operationalAlerts.md)
- [`src/lib/server/personInteractions.ts`](./personInteractions.md)
- [`src/lib/server/radarObservations.ts`](./radarObservations.md)
- [`src/lib/server/radarSourceInspection.ts`](./radarSourceInspection.md)
- [`src/lib/server/resolutionPlans.ts`](./resolutionPlans.md)
- [`src/server/automations.ts`](../../server/automations.md)

