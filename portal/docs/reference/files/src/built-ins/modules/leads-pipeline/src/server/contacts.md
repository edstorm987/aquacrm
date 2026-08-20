# `src/built-ins/modules/leads-pipeline/src/server/contacts.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** ContactService — sibling rolodex (lead/customer/vendor) keyed by canonical email. Lead→Contact promotion runs idempotently when a PipelineCard moves to a "Won" column.  Storage layout: - `contact:<id>`              — Contact row - `contacts/index`            — id list - `contacts/email/<canon>`    — id pointer (idempotent merge key)  ── No PII in activity messages (right-to-be-forgotten) ──────────────────── Every message below names the contact by **id**, never by email/name/phone. This install is agency-scoped, so its activity entries carry no `clientId`; `clientErasure` sweeps `state.activity` by `clientId` only, so an email in a message would survive a client erasure forever. The metadata carries `contactId`, which is what a reader (or the UI) resolves a label from.

## Exports (1)

- `class ContactService`
    - `constructor(private agencyId: AgencyId, private storage: PluginStorage, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(filter?: ContactFilter): Promise<Contact[]>`
    - `async get(id: string): Promise<Contact | null>`
    - `async getByEmail(email: string): Promise<Contact | null>`
    - `async upsert(input: CreateContactInput, actor: UserId): Promise<{ contact: Contact; created: boolean }>`
    - `async promoteLead(lead: Lead, actor: UserId): Promise<Contact>`
    - `async update(id: string, patch: UpdateContactPatch, actor: UserId): Promise<Contact | null>`
    - `async stampLastContactedAt(contactId: string, ts: number): Promise<Contact | null>`
    - `async delete(id: string, actor: UserId): Promise<boolean>`

## Depends on (6)

- [`src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/leads-pipeline/src/server/ports.ts`](./ports.md)

## Used by (2)

- [`src/built-ins/modules/leads-pipeline/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/leads-pipeline/src/server/subscribers.ts`](./subscribers.md)

