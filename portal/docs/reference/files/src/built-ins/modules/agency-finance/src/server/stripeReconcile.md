# `src/built-ins/modules/agency-finance/src/server/stripeReconcile.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Reconcile a verified Stripe event against the finance records.  Record + surface only: the money has already moved into Ed's own Stripe account. This reflects that — records the payment, settles the invoice, flows a refund/chargeback back to its status — and never moves money itself.  Kept separate from the webhook HANDLER (which does the signature check + raw body) so this logic is unit-testable with fake events + an in-memory container, without the `stripe` package or live keys. The container is already agency-scoped; the ports (events/activity) live inside the services.

## Exports (3)

- `interface ReconcileResult (5 members)`
- `async reconcileStripeEventOnce(container: AgencyFinanceContainer, event: StripeEvent, options: { actor?: string; seen?: Set<string> } = {}): Promise<ReconcileResult>`
- `async reconcileStripeEvent(container: AgencyFinanceContainer, event: StripeEvent, actor = "stripe-webhook"): Promise<ReconcileResult>`

## Depends on (2)

- [`src/built-ins/modules/agency-finance/src/lib/stripe.ts`](../lib/stripe.md)
- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)

## Used by (2)

- [`scripts/smoke-finance-stripe.test.ts`](../../../../../../scripts/smoke-finance-stripe.test.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts`](../api/handlers-stripe.md)

