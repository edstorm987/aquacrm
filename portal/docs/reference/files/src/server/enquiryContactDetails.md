# `src/server/enquiryContactDetails.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (3)

- `interface EnquiryContactDetails (8 members)`
- `getEnquiryContactDetails(agencyId: string, enquiryId: string): EnquiryContactDetails | null`
- `saveEnquiryContactDetails(input: { agencyId: string; enquiryId: string; company?: string; jobTitle?: string; notes?: string; customFields?: Record<string, string>; updatedBy: string; }): EnquiryContactDetails`

## Depends on (1)

- [`src/server/storage.ts`](./storage.md)

## Used by (2)

- [`src/app/api/portal/website-enquiries/contact-details/route.ts`](../app/api/portal/website-enquiries/contact-details/route.md)
- [`src/app/portal/agency/inbox/_EnquiryDetailCard.tsx`](../app/portal/agency/inbox/_EnquiryDetailCard.md)

