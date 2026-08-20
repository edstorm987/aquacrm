# `src/lib/server/identityResolution.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (10)

- `interface IdentityResolutionInput (13 members)`
- `interface IdentityReviewDecision (7 members)`
- `normaliseIdentityEmail(value: string | undefined): string`
- `normaliseIdentityPhone(value: string | undefined, defaultCountryCode = "44"): string`
- `resolveContactIdentity(input: IdentityResolutionInput): IdentityResolutionResult`
- `upsertIdentityResolutionReview(input: IdentityResolutionInput, resolution: IdentityResolutionResult): IdentityResolutionReview`
- `listIdentityResolutionReviews(agencyId: string, options: { status?: IdentityReviewStatus | "all"; includeAutoLinked?: boolean } = {}): IdentityResolutionReview[]`
- `getIdentityResolutionReview(agencyId: string, reviewIdValue: string): IdentityResolutionReview | null`
- `clearIdentityResolutionReviews(agencyId: string): number`
- `decideIdentityResolutionReview(input: IdentityReviewDecision): IdentityResolutionReview | null`

## Depends on (4)

- [`src/lib/clients/clientContacts.ts`](../clients/clientContacts.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/tenants.ts`](../../server/tenants.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (9)

- [`src/app/api/portal/identity-resolution/route.ts`](../../app/api/portal/identity-resolution/route.md)
- [`src/app/api/portal/inbox/conversations/route.ts`](../../app/api/portal/inbox/conversations/route.md)
- [`src/app/api/public/brand-enquiry/route.ts`](../../app/api/public/brand-enquiry/route.md)
- [`src/app/portal/agency/inbox/page.tsx`](../../app/portal/agency/inbox/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)
- [`src/lib/server/inbox/inboxService.ts`](./inbox/inboxService.md)
- [`src/lib/server/websiteEnquiries.ts`](./websiteEnquiries.md)
- [`src/server/persons.ts`](../../server/persons.md)

