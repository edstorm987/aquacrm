# `src/built-ins/modules/client-crm/src/server/segments.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Segment service. CRUD + idempotent seedDefaults + rule evaluation + per-segment listMembers walk.  Storage: segments/by-id/<id>           → Segment segments/index                → string[] of segment ids  Rule evaluation is AND-of-conditions on the Contact + an optional MembershipSnapshot (from the cross-plugin port). Every rule must pass for the contact to belong to the segment.

## Exports (2)

- `DEFAULT_SEGMENT_SEEDS: readonly { name: string; description: string; rules: SegmentRule[] }[]`
- `class SegmentService`
    - `constructor(private agencyId: AgencyId, private clientId: ClientId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private contacts: ContactService, private membershipBenefits?: MembershipBen…`
    - `async list(): Promise<Segment[]>`
    - `async get(id: string): Promise<Segment | null>`
    - `async create(input: CreateSegmentInput, actor: UserId): Promise<Segment>`
    - `async update(id: string, patch: UpdateSegmentPatch, actor: UserId): Promise<Segment | null>`
    - `async delete(id: string, actor: UserId): Promise<boolean>`
    - `async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }>`
    - `async evaluate(segment: Segment, contact: Contact): Promise<boolean>`
    - `async listMembers(segmentId: string): Promise<Contact[]>`

## Depends on (6)

- [`src/built-ins/modules/client-crm/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/client-crm/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/client-crm/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/client-crm/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/client-crm/src/server/contacts.ts`](./contacts.md)
- [`src/built-ins/modules/client-crm/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/client-crm/src/server/index.ts`](./index.md)

