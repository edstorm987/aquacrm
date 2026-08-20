// Stripe handlers — the online payment channel.
//
// SAFETY: money moves client → Ed's own Stripe account directly. These handlers
// create the pay-link, verify the signed webhook, and issue refunds against
// Ed's account. The app never holds funds. Keys are Ed's, read from the install
// config — never logged. The reconciliation logic lives in
// `server/stripeReconcile.ts` (unit-tested); these are the thin HTTP edges.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import {
  createInvoiceCheckout,
  createStripeRefund,
  readStripeKeysFromInstall,
  stripeConfigured,
  verifyStripeWebhook,
  type StripeEvent,
} from "../lib/stripe";
import { reconcileStripeEventOnce } from "../server/stripeReconcile";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}
function build(ctx: PluginCtx) {
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}
function getOrigin(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}
const errorMessage = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

// POST invoices/checkout — create a Stripe Checkout pay-link for an invoice.
// The webhook reconciles by the invoiceId stamped into the session metadata.
export async function stripeCheckoutHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  if (!stripeConfigured(ctx.install.config)) return json({ ok: false, error: "stripe_not_configured" }, 400);
  const body = await safeJson<{ invoiceId?: string; customerEmail?: string }>(req);
  if (!body?.invoiceId) return badRequest("invoiceId is required");
  const c = build(ctx);
  const invoice = await c.invoices.get(body.invoiceId);
  if (!invoice) return notFound("invoice not found");
  if (invoice.status === "paid") return json({ ok: false, error: "already_paid" }, 400);
  try {
    const keys = readStripeKeysFromInstall(ctx.install.config);
    const cfg = ctx.install.config as Record<string, string>;
    const origin = getOrigin(req);
    const successUrl = cfg.successUrl || `${origin}/portal/agency/agency-finance/invoices/${invoice.id}?paid=1`;
    const cancelUrl = cfg.cancelUrl || `${origin}/portal/agency/agency-finance/invoices/${invoice.id}`;
    const session = await createInvoiceCheckout(keys, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amountCents: invoice.totalCents,
      currency: invoice.currency,
      customerEmail: body.customerEmail,
      description: `Payment for invoice ${invoice.number}`,
      successUrl,
      cancelUrl,
    });
    return json({ ok: true, url: session.url, id: session.id });
  } catch (err) {
    return json({ ok: false, error: errorMessage(err, "checkout_failed") }, 502);
  }
}

// POST stripe/webhook — PUBLIC route (Stripe has no session). The agency comes
// from `?agencyId=` in the URL Ed configures in his Stripe dashboard; the keys
// come from that agency's install config. Signature is the only trust gate.
//
// The two failure modes are answered DIFFERENTLY on purpose, because Stripe
// reads the status code as an instruction:
//   • verification failed → 400. Not from Stripe (or malformed). Refuse, and
//     don't invite a retry — retrying a forgery achieves nothing.
//   • processing failed → 5xx. It WAS from Stripe and we couldn't record it, so
//     Stripe must retry. Answering 200 here is exactly how a real payment goes
//     missing. Pairs with `reconcileStripeEventOnce`, which doesn't cache a
//     failed event id, so the retry genuinely re-processes.
export async function stripeWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return badRequest("missing stripe-signature header");
  let rawBody: string;
  try { rawBody = await req.text(); } catch { return badRequest("could not read body"); }

  let event: StripeEvent;
  try {
    const keys = readStripeKeysFromInstall(ctx.install.config);
    event = (await verifyStripeWebhook(keys, rawBody, signature)) as StripeEvent;
  } catch (err) {
    // A signature mismatch or bad payload — refuse. Never leak key material.
    return json({ ok: false, error: errorMessage(err, "webhook_verification_failed") }, 400);
  }

  try {
    const result = await reconcileStripeEventOnce(build(ctx), event);
    return json({ ok: true, ...result });
  } catch (err) {
    return json({ ok: false, error: errorMessage(err, "webhook_processing_failed") }, 500);
  }
}

// POST payments/refund — issue a Stripe refund against a recorded Stripe
// payment. The `charge.refunded` webhook then flows the status back to the
// invoice (single source of truth), so this just calls Stripe.
export async function stripeRefundHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  if (!stripeConfigured(ctx.install.config)) return json({ ok: false, error: "stripe_not_configured" }, 400);
  const body = await safeJson<{ paymentId?: string; amountCents?: number; reason?: string }>(req);
  if (!body?.paymentId) return badRequest("paymentId is required");
  const c = build(ctx);
  const payment = await c.payments.get(body.paymentId);
  if (!payment) return notFound("payment not found");
  if (payment.method !== "stripe" || !payment.externalRef) {
    return json({ ok: false, error: "not_a_stripe_payment" }, 400);
  }
  try {
    const keys = readStripeKeysFromInstall(ctx.install.config);
    const refund = await createStripeRefund(keys, {
      paymentIntentId: payment.externalRef,
      amountCents: body.amountCents,
      reason: body.reason,
    });
    return json({ ok: true, refundId: refund.id, status: refund.status });
  } catch (err) {
    return json({ ok: false, error: errorMessage(err, "refund_failed") }, 502);
  }
}
