// Stripe handlers — the online payment channel.
//
// SAFETY: money moves client → Ed's own Stripe account directly. These handlers
// create the pay-link, verify the signed webhook, and issue refunds against
// Ed's account. The app never holds funds. The reconciliation logic lives in
// `server/stripeReconcile.ts` (unit-tested); these are the thin HTTP edges.
//
// Keys are Ed's, and they are NOT on `install.config` — that record reaches the
// browser through page props. They live in the encrypted integrations vault and
// are merged back in here by `installConfigWithSecrets`, so the pure readers
// below (`stripeConfigured` / `readStripeKeysFromInstall`) keep their shape.
// Never logged.

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
import { installConfigWithSecrets } from "@/lib/server/plugins/pluginSecretConfig";
import { invoiceOutstandingCents, isCollectibleInvoiceStatus } from "../lib/paymentAllocation";
import { AuthError, authErrorResponse } from "@/lib/server/auth/auth";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}
// `install.config` plus the vault-held Stripe keys, under their manifest ids.
function stripeConfig(ctx: PluginCtx): Record<string, unknown> {
  return installConfigWithSecrets(ctx.install.pluginId, { agencyId: ctx.agencyId, clientId: ctx.clientId }, ctx.install.config);
}
function build(ctx: PluginCtx) {
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}
function getOrigin(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}
const errorMessage = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

async function clientCommercialGate(clientId: string, required: "use" | "manage"): Promise<Response | null> {
  try {
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.commercial", required);
    return null;
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    // An access check that fails for a reason OTHER than "denied" is an
    // internal fault, not a malformed request. Several handlers below run this
    // gate inside their own try/catch whose tail is `badRequest(e.message)`, so
    // rethrowing here answered 400 with an internal message in the body — the
    // wrong status class, and an internal string echoed back to the caller.
    // Answer at the gate instead, where the distinction is still known.
    console.error("[agency-finance] client.commercial gate failed:", error);
    return json({ ok: false, error: "access_check_failed" }, 500);
  }
}

// POST invoices/checkout — create a Stripe Checkout pay-link for an invoice.
// The webhook reconciles by the invoiceId stamped into the session metadata.
export async function stripeCheckoutHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<{ invoiceId?: string; customerEmail?: string }>(req);
  if (!body?.invoiceId) return badRequest("invoiceId is required");
  const c = build(ctx);
  const invoice = await c.invoices.get(body.invoiceId);
  if (!invoice) return notFound("invoice not found");
  const denied = await clientCommercialGate(invoice.clientId, "use");
  if (denied) return denied;
  if (!stripeConfigured(stripeConfig(ctx))) return json({ ok: false, error: "stripe_not_configured" }, 400);
  if (!isCollectibleInvoiceStatus(invoice.status)) {
    return json({ ok: false, error: "invoice_not_collectible" }, 409);
  }
  try {
    const [payments, refunds] = await Promise.all([
      c.payments.listForInvoice(invoice.id),
      c.payments.listRefundsForInvoice(invoice.id),
    ]);
    const outstandingCents = invoiceOutstandingCents(invoice, payments, refunds);
    if (outstandingCents <= 0) return json({ ok: false, error: "no_outstanding_balance" }, 409);
    const keys = readStripeKeysFromInstall(stripeConfig(ctx));
    const cfg = ctx.install.config as Record<string, string>;
    const origin = getOrigin(req);
    const successUrl = cfg.successUrl || `${origin}/portal/agency/agency-finance/invoices/${invoice.id}?paid=1`;
    const cancelUrl = cfg.cancelUrl || `${origin}/portal/agency/agency-finance/invoices/${invoice.id}`;
    const session = await createInvoiceCheckout(keys, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amountCents: outstandingCents,
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
    const keys = readStripeKeysFromInstall(stripeConfig(ctx));
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

// POST payments/refund — issue and immediately persist a Stripe refund. The
// request idempotency key is forwarded to Stripe, and the returned provider id
// becomes the durable local refund identity. A later webhook adopts the same
// row or reconciles any cumulative remainder.
export async function stripeRefundHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<{ paymentId?: string; amountCents?: number; reason?: string; idempotencyKey?: string }>(req);
  if (!body?.paymentId) return badRequest("paymentId is required");
  const requestId = body.idempotencyKey?.trim() || req.headers.get("idempotency-key")?.trim();
  if (!requestId) return badRequest("idempotencyKey or Idempotency-Key header is required");
  const c = build(ctx);
  const payment = await c.payments.get(body.paymentId);
  if (!payment) return notFound("payment not found");
  const denied = await clientCommercialGate(payment.clientId, "manage");
  if (denied) return denied;
  if (!stripeConfigured(stripeConfig(ctx))) return json({ ok: false, error: "stripe_not_configured" }, 400);
  if (payment.method !== "stripe" || !payment.externalRef) {
    return json({ ok: false, error: "not_a_stripe_payment" }, 400);
  }
  try {
    const refunds = await c.payments.listRefundsForPayment(payment.id);
    const alreadyRefundedCents = refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
    const refundableCents = payment.amountCents - alreadyRefundedCents;
    const amountCents = body.amountCents ?? refundableCents;
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return badRequest("amountCents must be a positive integer");
    if (amountCents > refundableCents) {
      return json({ ok: false, error: "refund_exceeds_refundable_balance", refundableCents }, 409);
    }
    const keys = readStripeKeysFromInstall(stripeConfig(ctx));
    const refund = await createStripeRefund(keys, {
      paymentIntentId: payment.externalRef,
      amountCents,
      reason: body.reason,
      idempotencyKey: `aqua:${ctx.agencyId}:${payment.id}:${requestId}`,
    });
    if (refund.status && refund.status !== "succeeded") {
      return json({ ok: true, refundId: refund.id, status: refund.status, recorded: false }, 202);
    }
    const recorded = await c.payments.recordRefund(ctx.actor, {
      paymentId: payment.id,
      amountCents: refund.amount ?? amountCents,
      currency: payment.currency,
      provider: "stripe",
      providerId: refund.id,
      reason: refund.reason ?? body.reason,
      refundedAt: Number.isSafeInteger(refund.created) ? refund.created! * 1_000 : undefined,
    });
    return json({
      ok: true,
      refundId: refund.id,
      status: refund.status ?? "succeeded",
      recorded: true,
      deduped: recorded.deduped,
      amountCents: recorded.refund.amountCents,
    });
  } catch (err) {
    return json({ ok: false, error: errorMessage(err, "refund_failed") }, 502);
  }
}
