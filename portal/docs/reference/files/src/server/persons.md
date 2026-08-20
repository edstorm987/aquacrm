# `src/server/persons.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (33)

- `derivePersonState(person: Person): PersonState`
- `isJourneyPerson(person: Person): boolean`
- `personDisplayName(person: Person): string`
- `primaryEmail(person: Person): string | undefined`
- `primaryPhone(person: Person): string | undefined`
- `personEmailDomains(person: Person): string[]`
- `getPerson(agencyId: string, personId: string): Person | null`
- `listPersons(agencyId: string): Person[]`
- `interface PersonIdentity (3 members)`
- `findPersonByIdentity(agencyId: string, identity: PersonIdentity): Person | null`
- `findPersonByFacet(agencyId: string, facet: { leadId?: string; contactId?: string; clientId?: string; enquiryId?: string }): Person | null`
- `interface UpsertPersonInput (9 members)`
- `interface UpsertPersonResult (2 members)`
- `upsertPerson(agencyId: string, input: UpsertPersonInput): UpsertPersonResult`
- `addPersonEmail(agencyId: string, personId: string, value: string, options: { label?: string; isPrimary?: boolean } = {}): Person | null`
- `addPersonPhone(agencyId: string, personId: string, value: string, options: { label?: string; isPrimary?: boolean } = {}): Person | null`
- `class IdentityInUseError`
    - `constructor(public readonly conflictingPersonId: string, message: string)`
- `interface EditIdentityInput (3 members)`
- `editPersonEmail(agencyId: string, personId: string, currentValue: string, patch: EditIdentityInput): Person | null`
- `editPersonPhone(agencyId: string, personId: string, currentValue: string, patch: EditIdentityInput): Person | null`
- `removePersonEmail(agencyId: string, personId: string, value: string): Person | null`
- `removePersonPhone(agencyId: string, personId: string, value: string): Person | null`
- `interface AddPersonRecordInput (7 members)`
- `addPersonRecord(agencyId: string, personId: string, input: AddPersonRecordInput): Person | null`
- `deletePersonRecord(agencyId: string, personId: string, entryId: string): Person | null`
- `suggestPersonOrganisation(agencyId: string, personId: string, organisationId: string, options: { confidence?: number; reason?: string } = {}): Person | null`
- `decidePersonOrganisation(agencyId: string, personId: string, organisationId: string, decision: "confirmed" | "rejected", by?: string): Person | null`
- `listPendingOrganisationSuggestions(agencyId: string): Person[]`
- `interface UpdatePersonPatch (7 members)`
- `updatePerson(agencyId: string, personId: string, patch: UpdatePersonPatch): Person | null`
- `attachPersonFacet(agencyId: string, personId: string, facets: PersonFacets): Person | null`
- `interface ClassifyPersonInput (5 members)`
- `classifyPerson(agencyId: string, personId: string, input: ClassifyPersonInput): Person | null`

## Depends on (4)

- [`src/lib/server/identityResolution.ts`](../lib/server/identityResolution.md)
- [`src/server/eventBus.ts`](./eventBus.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (13)

- [`scripts/smoke-persons.test.ts`](../../scripts/smoke-persons.test.md)
- [`src/app/api/portal/persons/[personId]/route.ts`](../app/api/portal/persons/[personId]/route.md)
- [`src/app/api/portal/website-enquiries/classification/route.ts`](../app/api/portal/website-enquiries/classification/route.md)
- [`src/app/portal/agency/contacts/[personId]/page.tsx`](../app/portal/agency/contacts/[personId]/page.md)
- [`src/app/portal/agency/contacts/companies/[organisationId]/page.tsx`](../app/portal/agency/contacts/companies/[organisationId]/page.md)
- [`src/app/portal/agency/contacts/page.tsx`](../app/portal/agency/contacts/page.md)
- [`src/built-ins/runtime/foundation-adapters/personClientSeeding.ts`](../built-ins/runtime/foundation-adapters/personClientSeeding.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../lib/server/inbox/operationalAlerts.md)
- [`src/lib/server/personInteractions.ts`](../lib/server/personInteractions.md)
- [`src/lib/server/resolutionPlans.ts`](../lib/server/resolutionPlans.md)
- [`src/lib/server/seeds/seedClientFromPerson.ts`](../lib/server/seeds/seedClientFromPerson.md)
- [`src/lib/server/websiteEnquiries.ts`](../lib/server/websiteEnquiries.md)
- [`src/server/organisations.ts`](./organisations.md)

