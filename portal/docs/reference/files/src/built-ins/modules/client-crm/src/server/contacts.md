# `src/built-ins/modules/client-crm/src/server/contacts.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Contact service. CRUD + bulk import + email uniqueness scoped to (agencyId, clientId) + mergeFromUser reconciliation.  Storage: contacts/by-id/<id>           → Contact contacts/by-email/<lowered>   → contactId  (uniqueness lookup) contacts/by-user/<userId>     → contactId  (User-link reverse) contacts/index                → string[] of all contact ids

## Exports (1)

- `class ContactService`
    - `constructor(private agencyId: AgencyId, private clientId: ClientId, private storage: StoragePort, private user: UserPort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(filter?: ContactFilter): Promise<Contact[]>`
    - `async get(id: string): Promise<Contact | null>`
    - `async getByEmail(email: string): Promise<Contact | null>`
    - `async getByUser(userId: UserId): Promise<Contact | null>`
    - `async create(input: CreateContactInput, actor: UserId, sourceDefault: ContactSource = "manual"): Promise<Contact>`
    - `async update(id: string, patch: UpdateContactPatch, actor: UserId): Promise<Contact | null>`
    - `async archive(id: string, actor: UserId): Promise<Contact | null>`
    - `async delete(id: string, actor: UserId): Promise<boolean>`
    - `async mergeFromUser(userId: UserId, actor: UserId): Promise<Contact | null>`
    - `async importBulk(rows: ImportContactRow[], actor: UserId): Promise<ImportResult>`
    - `async _touchLastSeen(id: string, occurredAt: number): Promise<void>`

## Depends on (5)

- [`src/built-ins/modules/client-crm/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/client-crm/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/client-crm/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/client-crm/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/client-crm/src/server/ports.ts`](./ports.md)

## Used by (3)

- [`src/built-ins/modules/client-crm/src/server/activity.ts`](./activity.md)
- [`src/built-ins/modules/client-crm/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/client-crm/src/server/segments.ts`](./segments.md)

