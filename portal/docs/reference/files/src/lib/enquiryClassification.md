# `src/lib/enquiries/enquiryClassification.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `WEBSITE_ENQUIRY_CLASSIFICATIONS`
- `type WebsiteEnquiryClassification`
- `WEBSITE_ENQUIRY_CLASSIFICATION_LABELS: Record<WebsiteEnquiryClassification, string>`
- `isWebsiteEnquiryClassification(value: unknown): value is WebsiteEnquiryClassification`
- `isSalesClassification(value: WebsiteEnquiryClassification): boolean`
- `isLeadJourneyEligible(lead: { source: string; tags?: string[]; convertedAt?: number; convertedClientId?: string; customFields?: Record<string, unknown>; }): boolean`
- `classificationContactType(classification: WebsiteEnquiryClassification): "account" | "vendor" | "other" | null`

## Used by (17)

- [`scripts/smoke-enquiry-classification.test.ts`](../../scripts/smoke-enquiry-classification.test.md)
- [`scripts/smoke-reclassification-retains-history.test.ts`](../../scripts/smoke-reclassification-retains-history.test.md)
- [`src/app/api/portal/persons/[personId]/route.ts`](../app/api/portal/persons/[personId]/route.md)
- [`src/app/api/portal/website-enquiries/classification/route.ts`](../app/api/portal/website-enquiries/classification/route.md)
- [`src/app/portal/agency/contacts/[personId]/_ContactCard.tsx`](../app/portal/agency/contacts/[personId]/_ContactCard.md)
- [`src/app/portal/agency/contacts/_ContactsIndex.tsx`](../app/portal/agency/contacts/_ContactsIndex.md)
- [`src/app/portal/agency/contacts/companies/[organisationId]/page.tsx`](../app/portal/agency/contacts/companies/[organisationId]/page.md)
- [`src/app/portal/agency/inbox/_EnquiryDetailCard.tsx`](../app/portal/agency/inbox/_EnquiryDetailCard.md)
- [`src/app/portal/agency/inbox/_MasterInbox.tsx`](../app/portal/agency/inbox/_MasterInbox.md)
- [`src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx`](../app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.md)
- [`src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx`](../app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.md)
- [`src/app/portal/agency/pipelines/[slug]/page.tsx`](../app/portal/agency/pipelines/[slug]/page.md)
- [`src/app/portal/clients/_PeopleHub.tsx`](../app/portal/clients/_PeopleHub.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](./server/businessIssueRadar.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](./server/operationalAlerts.md)
- [`src/lib/server/websiteEnquiries.ts`](./server/websiteEnquiries.md)

