# `src/built-ins/modules/memberships/src/server/webhook.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Stripe webhook handler.  Stripe POSTs JSON to `/api/portal/memberships/stripe/webhook` with a `Stripe-Signature` header. The handler: 1. Verifies the signature against the per-install webhook secret (delegated to StripePort.verifyWebhookSignature). 2. Dedupes by Stripe event id under storage key `memberships/webhook/seen/<eventId>` — Stripe retries the same event up to ~72 hours, so without dedupe a flapping endpoint ends up double-applying state changes. 3. Routes the event by type and reconciles via SubscriptionService.  Lifted-pattern from the ecommerce webhook: `02`'s implementation stored seen ids in a module-level Set; we use plugin storage so the dedupe window survives process restarts. Idempotency is enforced regardless — applying a second event of the same id is a no-op.

## Exports (2)

- `interface WebhookHandleResult (6 members)`
- `class WebhookService`
    - `constructor(private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private stripe: StripePort, private subscriptions: SubscriptionService)`
    - `async handle(args: { rawBody: string; signatureHeader: string }): Promise<WebhookHandleResult>`
    - `async applyEvent(event: StripeWebhookEvent): Promise<WebhookHandleResult>`

## Depends on (4)

- [`src/built-ins/modules/memberships/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/memberships/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/memberships/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/memberships/src/server/subscriptions.ts`](./subscriptions.md)

## Used by (1)

- [`src/built-ins/modules/memberships/src/server/index.ts`](./index.md)

