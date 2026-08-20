# `scripts/smoke-finance-stripe.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Finance Phase 3 — Stripe (online channel): reconciliation + adapter.  The valuable, verifiable core: given a *verified* Stripe event, the reconciliation reflects it into the real finance records (records a Stripe payment, settles the invoice, flows a refund/chargeback back). Driven against the real InvoiceService/PaymentService over an in-memory container — no `stripe` package, no live keys. The adapter is exercised with an injected fake client. Record + surface only; the app never holds funds.

_No exported symbols (side-effect / internal module)._

## Depends on (7)

- [`src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.ts`](../src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-finance/src/lib/idempotency.ts`](../src/built-ins/modules/agency-finance/src/lib/idempotency.md)
- [`src/built-ins/modules/agency-finance/src/lib/stripe.ts`](../src/built-ins/modules/agency-finance/src/lib/stripe.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../src/built-ins/modules/agency-finance/src/lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`](../src/built-ins/modules/agency-finance/src/server/foundationAdapter.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](../src/built-ins/modules/agency-finance/src/server/ports.md)
- [`src/built-ins/modules/agency-finance/src/server/stripeReconcile.ts`](../src/built-ins/modules/agency-finance/src/server/stripeReconcile.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

