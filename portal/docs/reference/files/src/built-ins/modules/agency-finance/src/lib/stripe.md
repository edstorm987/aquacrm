# `src/built-ins/modules/agency-finance/src/lib/stripe.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Server-only Stripe adapter for the online payment channel.  SAFETY: the app never holds funds. Stripe moves money client → Ed's own Stripe account directly; this only creates the pay-link, verifies the signed webhook, and issues refunds against Ed's account. **Keys are Ed's, entered via the Finance plugin settings (install.config) — never hardcoded, never logged.**  This mirrors the proven wrapper in the ecommerce plugin (kept per-plugin, the way this codebase vendors utilities — see docs hazards), and adds two things: • refunds, and • an INJECTABLE client, so the reconciliation logic is unit-testable and a Stripe-less environment (the `stripe` package is an optional peer dep) fails with a clear message instead of at build time.

## Exports (10)

- `interface StripeKeys (2 members)`
- `interface StripeEvent (3 members)`
- `interface StripeClientLike (3 members)`
- `async getStripeClient(secretKey: string, injected?: StripeClientLike): Promise<StripeClientLike>`
- `interface InvoiceCheckoutInput (8 members)`
- `async createInvoiceCheckout(keys: StripeKeys, input: InvoiceCheckoutInput, client?: StripeClientLike): Promise<{ id: string; url: string }>`
- `async verifyStripeWebhook(keys: StripeKeys, rawBody: string, signature: string, client?: StripeClientLike): Promise<StripeEvent>`
- `async createStripeRefund(keys: StripeKeys, input: { paymentIntentId: string; amountCents?: number; reason?: string }, client?: StripeClientLike): Promise<{ id: string; status?: string }>`
- `readStripeKeysFromInstall(config: Record<string, unknown>): StripeKeys`
- `stripeConfigured(config: Record<string, unknown> | undefined | null): boolean`

## Depends on (1)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](./domain.md)

## Used by (6)

- [`scripts/smoke-finance-stripe.test.ts`](../../../../../../scripts/smoke-finance-stripe.test.md)
- [`scripts/smoke-plugin-settings-surface.test.ts`](../../../../../../scripts/smoke-plugin-settings-surface.test.md)
- [`src/app/api/tenants/close-deal/route.ts`](../../../../../app/api/tenants/close-deal/route.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts`](../api/handlers-stripe.md)
- [`src/built-ins/modules/agency-finance/src/pages/InvoiceDetailPage.tsx`](../pages/InvoiceDetailPage.md)
- [`src/built-ins/modules/agency-finance/src/server/stripeReconcile.ts`](../server/stripeReconcile.md)

