# `src/built-ins/modules/memberships/src/server/subscriptions.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Subscription service — Stripe customer + subscription lifecycle.  Storage: memberships/subscribers/<userId>     — Subscription row memberships/by-plan/<planId>         — string[] of subscriber userIds memberships/customer-by-user/<uid>   — Stripe customer id (cached)  One active subscription per (clientId, endCustomerUserId). If the user calls subscribe with a different plan, the existing subscription is updated in-place (Stripe `changeSubscriptionPlan`).  Idempotency on Stripe ids: every write either creates a new Stripe-side resource or upserts on the stored stripeSubscriptionId. Webhook handlers call `upsertFromStripe` which is the canonical reconciliation entry point.

## Exports (1)

- `class SubscriptionService`
    - `constructor(private agencyId: AgencyId, private clientId: ClientId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private stripe: StripePort, private user: UserPort, private plans: PlanServi…`
    - `async getByUser(userId: UserId): Promise<Subscription | null>`
    - `async list(filter?: { planId?: string; status?: SubscriptionStatus }): Promise<Subscription[]>`
    - `async subscribe(input: SubscribeInput): Promise< | { ok: true; mode: "checkout"; checkoutUrl: string } | { ok: true; mode: "free"; subscription: Subscription } | { ok: false; error: string } >`
    - `async cancel(input: CancelInput): Promise<Subscription | null>`
    - `async pause(userId: UserId): Promise<Subscription | null>`
    - `async resume(userId: UserId): Promise<Subscription | null>`
    - `async changePlan(userId: UserId, newPlanId: string): Promise<Subscription | null>`
    - `async upsertFromStripe(stripeSub: StripeSubscription, metadata: Record<string, string>): Promise<Subscription | null>`
    - `async billingPortalUrl(userId: UserId, returnUrl: string): Promise<string | null>`

## Depends on (6)

- [`src/built-ins/modules/memberships/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/memberships/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/memberships/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/memberships/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/memberships/src/server/plans.ts`](./plans.md)
- [`src/built-ins/modules/memberships/src/server/ports.ts`](./ports.md)

## Used by (3)

- [`src/built-ins/modules/memberships/src/server/benefits.ts`](./benefits.md)
- [`src/built-ins/modules/memberships/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/memberships/src/server/webhook.ts`](./webhook.md)

