# `src/built-ins/modules/client-crm/src/server/activity.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Activity service. Append-only event log per Contact. Cross-plugin events (ecommerce order.created, memberships subscription.*, affiliates affiliate.attribution_recorded) flow in via the `/events/ingest` API route — foundation routes them when its cross-plugin event router lands; until then the route is callable directly for testing.  Storage: activity/by-id/<id>            → ActivityRecord activity/by-contact/<cid>      → string[] of activity ids activity/index                 → string[] of all activity ids

## Exports (1)

- `class ActivityService`
    - `constructor(private agencyId: AgencyId, private clientId: ClientId, private storage: StoragePort, private foundationActivity: ActivityLogPort, private events: EventBusPort, private contacts: ContactService, private ecommerceOrders?: Ecomme…`
    - `async list(filter?: ActivityFilter): Promise<ActivityRecord[]>`
    - `async listForContact(contactId: string, limit?: number): Promise<ActivityRecord[]>`
    - `async record(args: { contactId: string; kind: ActivityKind; summary: string; details?: Record<string, unknown>; occurredAt?: number; actor?: UserId; }): Promise<ActivityRecord>`
    - `async addNote(contactId: string, note: string, actor: UserId): Promise<ActivityRecord>`
    - `async ingestOrderCreated(payload: IngestOrderCreatedPayload, actor?: UserId): Promise<ActivityRecord | null>`
    - `async ingestSubscription(payload: IngestSubscriptionEventPayload, actor?: UserId): Promise<ActivityRecord | null>`
    - `async ingestAffiliateAttribution(payload: IngestAffiliateAttributionPayload, actor?: UserId): Promise<ActivityRecord | null>`
    - `async backfillFromEcommerce(contactId: string, actor?: UserId): Promise<number>`

## Depends on (6)

- [`src/built-ins/modules/client-crm/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/client-crm/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/client-crm/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/client-crm/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/client-crm/src/server/contacts.ts`](./contacts.md)
- [`src/built-ins/modules/client-crm/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/client-crm/src/server/index.ts`](./index.md)

