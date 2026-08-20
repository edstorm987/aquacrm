// Server-only Stripe adapter for the online payment channel.
//
// SAFETY: the app never holds funds. Stripe moves money client → Ed's own
// Stripe account directly; this only creates the pay-link, verifies the signed
// webhook, and issues refunds against Ed's account. **Keys are Ed's, entered via
// the Finance plugin settings (install.config) — never hardcoded, never logged.**
//
// This mirrors the proven wrapper in the ecommerce plugin (kept per-plugin, the
// way this codebase vendors utilities — see docs hazards), and adds two things:
//   • refunds, and
//   • an INJECTABLE client, so the reconciliation logic is unit-testable and a
//     Stripe-less environment (the `stripe` package is an optional peer dep)
//     fails with a clear message instead of at build time.

import "server-only";

import type { Currency } from "./domain";

export interface StripeKeys {
  secretKey: string;
  webhookSecret?: string;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

// The tiny slice of the Stripe SDK this plugin actually uses. Tests pass a fake
// that implements just these; production uses the real client.
export interface StripeClientLike {
  checkout: { sessions: { create(params: Record<string, unknown>): Promise<{ id: string; url: string | null }> } };
  webhooks: { constructEvent(rawBody: string, signature: string, secret: string): StripeEvent };
  refunds: { create(params: Record<string, unknown>): Promise<{ id: string; status?: string }> };
}

// Per-key cache so we don't rebuild the client for every call.
const _clientCache = new Map<string, StripeClientLike>();

export async function getStripeClient(secretKey: string, injected?: StripeClientLike): Promise<StripeClientLike> {
  if (injected) return injected;
  if (!secretKey) throw new Error("Stripe secret key required.");
  const cached = _clientCache.get(secretKey);
  if (cached) return cached;
  // Dynamic-string import so tsc doesn't resolve `stripe` at build (it's an
  // optional peer dep, added when an agency configures Stripe).
  const mod = await (
    new Function("s", "return import(s)") as (s: string) => Promise<unknown>
  )("stripe").catch(() => null);
  if (!mod) throw new Error("The `stripe` package is not installed. Run: npm i stripe");
  const Stripe = (mod as { default: new (k: string, o: { apiVersion: string }) => StripeClientLike }).default;
  const client = new Stripe(secretKey, { apiVersion: "2024-12-18.acacia" });
  _clientCache.set(secretKey, client);
  return client;
}

export interface InvoiceCheckoutInput {
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  currency: Currency;
  customerEmail?: string;
  description?: string;
  successUrl: string;
  cancelUrl: string;
}

// Create a Stripe Checkout session (a pay-link) for a single invoice. The
// invoiceId is stamped into BOTH the session and the PaymentIntent metadata —
// that is the load-bearing link the webhook reconciles by.
export async function createInvoiceCheckout(
  keys: StripeKeys,
  input: InvoiceCheckoutInput,
  client?: StripeClientLike,
): Promise<{ id: string; url: string }> {
  const stripe = await getStripeClient(keys.secretKey, client);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: input.currency,
        unit_amount: input.amountCents,
        product_data: {
          name: `Invoice ${input.invoiceNumber}`,
          description: input.description,
        },
      },
    }],
    customer_email: input.customerEmail,
    metadata: { invoiceId: input.invoiceId, invoiceNumber: input.invoiceNumber },
    payment_intent_data: { metadata: { invoiceId: input.invoiceId } },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { id: session.id, url: session.url };
}

// Verify + parse an incoming webhook. Throws on signature mismatch — the only
// gate that a webhook is genuinely from Stripe.
export async function verifyStripeWebhook(
  keys: StripeKeys,
  rawBody: string,
  signature: string,
  client?: StripeClientLike,
): Promise<StripeEvent> {
  if (!keys.webhookSecret) throw new Error("Stripe webhook secret not configured.");
  const stripe = await getStripeClient(keys.secretKey, client);
  return stripe.webhooks.constructEvent(rawBody, signature, keys.webhookSecret);
}

// Issue a refund against Ed's Stripe account. `amountCents` omitted → full refund.
export async function createStripeRefund(
  keys: StripeKeys,
  input: { paymentIntentId: string; amountCents?: number; reason?: string },
  client?: StripeClientLike,
): Promise<{ id: string; status?: string }> {
  const stripe = await getStripeClient(keys.secretKey, client);
  return stripe.refunds.create({
    payment_intent: input.paymentIntentId,
    ...(input.amountCents !== undefined ? { amount: input.amountCents } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  });
}

// Read Ed's keys off the plugin install config. Never logs them.
export function readStripeKeysFromInstall(config: Record<string, unknown>): StripeKeys {
  const secretKey = typeof config.stripeSecretKey === "string" ? config.stripeSecretKey : "";
  if (!secretKey) {
    throw new Error("Stripe is not configured for this agency. Add your secret key in Finance settings.");
  }
  const webhookSecret = typeof config.stripeWebhookSecret === "string" ? config.stripeWebhookSecret : undefined;
  return { secretKey, webhookSecret };
}

// Cheap "is Stripe set up?" check for the UI — true when a secret key is present.
export function stripeConfigured(config: Record<string, unknown> | undefined | null): boolean {
  return !!config && typeof config.stripeSecretKey === "string" && config.stripeSecretKey.length > 0;
}
