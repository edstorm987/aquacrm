# `src/built-ins/modules/client-crm/src/lib/domain.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Client-CRM domain. Persisted under per-install plugin storage.  Scope: per-client (Felicia's CRM is hers, not the agency's). All rows carry both `agencyId` and `clientId`. `endCustomerUserId` is the foundation User id when the contact is also a logged-in end-customer; null when the contact was imported / manually entered without a corresponding User row.

## Exports (21)

- `type ContactSource`
- `type ContactStatus`
- `interface Contact (16 members)`
- `interface CreateContactInput (8 members)`
- `interface UpdateContactPatch (8 members)`
- `interface ContactFilter (4 members)`
- `type SegmentRuleField`
- `type SegmentRuleOp`
- `interface SegmentRule (4 members)`
- `type SegmentStatus`
- `interface Segment (10 members)`
- `interface CreateSegmentInput (3 members)`
- `interface UpdateSegmentPatch (4 members)`
- `type ActivityKind`
- `interface ActivityRecord (9 members)`
- `interface ActivityFilter (5 members)`
- `interface IngestOrderCreatedPayload (6 members)`
- `interface IngestSubscriptionEventPayload (4 members)`
- `interface IngestAffiliateAttributionPayload (5 members)`
- `interface ImportContactRow (5 members)`
- `interface ImportResult (5 members)`

## Depends on (1)

- [`src/built-ins/modules/client-crm/src/lib/tenancy.ts`](./tenancy.md)

## Used by (4)

- [`src/built-ins/modules/client-crm/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/client-crm/src/server/activity.ts`](../server/activity.md)
- [`src/built-ins/modules/client-crm/src/server/contacts.ts`](../server/contacts.md)
- [`src/built-ins/modules/client-crm/src/server/segments.ts`](../server/segments.md)

