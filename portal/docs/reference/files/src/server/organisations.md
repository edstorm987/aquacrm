# `src/server/organisations.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (18)

- `isGenericEmailDomain(domain: string): boolean`
- `normaliseDomain(value: string | undefined): string`
- `deriveOrganisationState(organisation: Organisation): PersonState`
- `getOrganisation(agencyId: string, organisationId: string): Organisation | null`
- `listOrganisations(agencyId: string): Organisation[]`
- `findOrganisationByDomain(agencyId: string, domain: string): Organisation | null`
- `findOrganisationByName(agencyId: string, name: string): Organisation | null`
- `listOrganisationPeople(agencyId: string, organisationId: string): Person[]`
- `searchOrganisations(agencyId: string, query: string, limit = 20): Organisation[]`
- `interface UpsertOrganisationInput (9 members)`
- `interface UpsertOrganisationResult (2 members)`
- `upsertOrganisation(agencyId: string, input: UpsertOrganisationInput): UpsertOrganisationResult`
- `interface UpdateOrganisationPatch (5 members)`
- `updateOrganisation(agencyId: string, organisationId: string, patch: UpdateOrganisationPatch): Organisation | null`
- `interface OrganisationCandidate (4 members)`
- `organisationCandidatesForPerson(agencyId: string, person: Person): OrganisationCandidate[]`
- `interface OrganisationSuggestionBatch (4 members)`
- `batchOrganisationSuggestions(agencyId: string): OrganisationSuggestionBatch[]`

## Depends on (4)

- [`src/server/eventBus.ts`](./eventBus.md)
- [`src/server/persons.ts`](./persons.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (7)

- [`scripts/smoke-organisations.test.ts`](../../scripts/smoke-organisations.test.md)
- [`src/app/api/portal/persons/[personId]/route.ts`](../app/api/portal/persons/[personId]/route.md)
- [`src/app/portal/agency/contacts/[personId]/page.tsx`](../app/portal/agency/contacts/[personId]/page.md)
- [`src/app/portal/agency/contacts/companies/[organisationId]/page.tsx`](../app/portal/agency/contacts/companies/[organisationId]/page.md)
- [`src/app/portal/agency/contacts/page.tsx`](../app/portal/agency/contacts/page.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../lib/server/inbox/operationalAlerts.md)
- [`src/lib/server/resolutionPlans.ts`](../lib/server/resolutionPlans.md)

