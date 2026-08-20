# `src/built-ins/modules/memberships/src/server/benefits.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Benefit service — CRUD + plan-association graph.  Storage: memberships/benefits/<id>      — Benefit row memberships/benefits/index     — string[] of benefit ids

## Exports (1)

- `class BenefitService`
    - `constructor(private agencyId: AgencyId, private clientId: ClientId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private plans: PlanService, private subscriptions: SubscriptionService)`
    - `async list(): Promise<Benefit[]>`
    - `async get(id: string): Promise<Benefit | null>`
    - `async create(input: CreateBenefitInput, actor: UserId): Promise<Benefit>`
    - `async update(id: string, patch: UpdateBenefitPatch, actor: UserId): Promise<Benefit | null>`
    - `async delete(id: string, actor: UserId): Promise<boolean>`
    - `async getBenefitsForUser(userId: UserId): Promise<Benefit[]>`

## Depends on (7)

- [`src/built-ins/modules/memberships/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/memberships/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/memberships/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/memberships/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/memberships/src/server/plans.ts`](./plans.md)
- [`src/built-ins/modules/memberships/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/memberships/src/server/subscriptions.ts`](./subscriptions.md)

## Used by (1)

- [`src/built-ins/modules/memberships/src/server/index.ts`](./index.md)

