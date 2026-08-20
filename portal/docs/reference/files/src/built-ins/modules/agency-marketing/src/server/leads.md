# `src/built-ins/modules/agency-marketing/src/server/leads.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Lead service. CRUD + status funnel transitions + assignment + contact log.  Funnel: new → contacted → qualified → converted | unqualified | lost. Each transition is one-way except `qualified ↔ contacted` (re-engage) and `unqualified → contacted` (give it another shot).

## Exports (1)

- `class LeadService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(filter?: LeadFilter): Promise<Lead[]>`
    - `async get(id: string): Promise<Lead | null>`
    - `async getByEmail(email: string): Promise<Lead | null>`
    - `async listForCampaign(campaignId: string): Promise<Lead[]>`
    - `async listForStaff(staffId: string): Promise<Lead[]>`
    - `async create(input: CreateLeadInput, actor: UserId, sourceDefault: LeadSource = "manual"): Promise<Lead>`
    - `async eraseForAddresses(addresses: readonly string[]): Promise<number>`
    - `async update(id: string, patch: UpdateLeadPatch, actor: UserId): Promise<Lead | null>`
    - `async assignTo(id: string, staffId: string, actor: UserId): Promise<Lead | null>`
    - `async recordContact(id: string, note: string, actor: UserId): Promise<Lead | null>`

## Depends on (5)

- [`src/built-ins/modules/agency-marketing/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-marketing/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-marketing/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-marketing/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-marketing/src/server/ports.ts`](./ports.md)

## Used by (2)

- [`src/built-ins/modules/agency-marketing/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-marketing/src/server/reports.ts`](./reports.md)

