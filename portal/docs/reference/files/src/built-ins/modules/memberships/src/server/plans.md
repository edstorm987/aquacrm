# `src/built-ins/modules/memberships/src/server/plans.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Plan service — CRUD + ordering + Stripe-price-id sync.  Storage layout (per-install): memberships/plans/<planId>     — Plan row memberships/plans/index        — string[] of plan ids  Stripe sync rule: when `priceMonthly` / `priceAnnual` / `currency` change OR when a plan is created from scratch, we create new Stripe Price objects (Stripe Prices are immutable) and stash their ids on the plan. Existing subscribers stay on their old prices; new signups use the new ones.

## Exports (1)

- `class PlanService`
    - `constructor(private agencyId: AgencyId, private clientId: ClientId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private stripe: StripePort)`
    - `async list(): Promise<Plan[]>`
    - `async listActive(): Promise<Plan[]>`
    - `async get(id: string): Promise<Plan | null>`
    - `async create(input: CreatePlanInput, actor: UserId): Promise<Plan>`
    - `async update(id: string, patch: UpdatePlanPatch, actor: UserId): Promise<Plan | null>`
    - `async archive(id: string, actor: UserId): Promise<Plan | null>`
    - `async delete(id: string, actor: UserId): Promise<boolean>`
    - `async seedDefaults(actor: UserId, currency: Currency = "usd"): Promise<{ seeded: number; existed: number }>`

## Depends on (5)

- [`src/built-ins/modules/memberships/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/memberships/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/memberships/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/memberships/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/memberships/src/server/ports.ts`](./ports.md)

## Used by (3)

- [`src/built-ins/modules/memberships/src/server/benefits.ts`](./benefits.md)
- [`src/built-ins/modules/memberships/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/memberships/src/server/subscriptions.ts`](./subscriptions.md)

