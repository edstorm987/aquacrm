# `src/built-ins/modules/email-sender/src/server/identities.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Sender-identity service. CRUD on SenderIdentity rows + verify-domain flow (v1 stubs the verify call — production wires Postmark's /senders/{id}/verifyDomain endpoint or the equivalent for whichever provider is active).

## Exports (1)

- `class IdentityService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(): Promise<SenderIdentity[]>`
    - `async get(id: string): Promise<SenderIdentity | null>`
    - `async getDefault(): Promise<SenderIdentity | null>`
    - `async create(input: CreateIdentityInput, actor: UserId): Promise<SenderIdentity>`
    - `async update(id: string, patch: UpdateIdentityPatch, actor: UserId): Promise<SenderIdentity | null>`
    - `async verifyDomain(id: string, actor: UserId): Promise<SenderIdentity | null>`

## Depends on (5)

- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/email-sender/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/email-sender/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/email-sender/src/server/ports.ts`](./ports.md)

## Used by (2)

- [`src/built-ins/modules/email-sender/src/server/emails.ts`](./emails.md)
- [`src/built-ins/modules/email-sender/src/server/index.ts`](./index.md)

