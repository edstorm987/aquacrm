// Reconcile a verified Stripe event against the finance records.
//
// Record + surface only: the money has already moved into Ed's own Stripe
// account. This reflects that — records the payment, settles the invoice, and
// stores provider-identified refund/dispute rows — and never moves money itself.
//
// Kept separate from the webhook HANDLER (which does the signature check + raw
// body) so this logic is unit-testable with fake events + an in-memory
// container, without the `stripe` package or live keys. The container is
// already agency-scoped; the ports (events/activity) live inside the services.

import "server-only";

import type { AgencyFinanceContainer } from "./index";
import type { StripeEvent } from "../lib/stripe";

export interface ReconcileResult {
  handled: boolean;
  type: string;
  action: "paid" | "refunded" | "chargeback" | "deduped" | "ignored";
  invoiceId?: string;
  message?: string;
}

// One-shot guard around `reconcileStripeEvent`, owning the in-process
// "have I already handled this event id?" cache.
//
// It lives here, beside the logic it guards, rather than in the HTTP handler —
// the handler is meant to be a thin edge, and this is money-correctness, not
// transport. It's also the only way to test it: the handler can't run without
// the real `stripe` package for signature verification.
//
// THE ORDER IS THE WHOLE POINT. The id is cached only AFTER reconcile
// SUCCEEDS. Caching it first (the original bug) meant a transient failure —
// a storage blip mid-reconcile — poisoned the cache: Stripe retries to the same
// warm process, the cache says "already done", the handler answers 200, Stripe
// stops retrying, and THE PAYMENT IS NEVER RECORDED. The customer paid and the
// invoice sits unpaid. A dropped payment, not a duplicated one — silent, and
// the durable `findByExternalRef` never got a chance to recover it because the
// cache short-circuited first.
//
// Letting the error propagate is deliberate: the caller must answer 5xx so
// Stripe keeps retrying. Answering 200 on a failure is how a payment goes
// missing.
//
  // The durable payment/refund/dispute identities below are the correctness
  // boundary across processes. This cache remains only as a cheap warm-process
  // short circuit.
//
// `seen` is injectable so tests get their own cache instead of sharing (and
// poisoning) the module-level one.
const processedEventIds = new Set<string>();

export async function reconcileStripeEventOnce(
  container: AgencyFinanceContainer,
  event: StripeEvent,
  options: { actor?: string; seen?: Set<string> } = {},
): Promise<ReconcileResult> {
  const seen = options.seen ?? processedEventIds;
  if (seen.has(event.id)) {
    return { handled: true, type: event.type, action: "deduped", message: "event already processed" };
  }
  const result = await reconcileStripeEvent(container, event, options.actor);
  seen.add(event.id);   // ← only now. A throw above never reaches this line.
  return result;
}

export async function reconcileStripeEvent(
  container: AgencyFinanceContainer,
  event: StripeEvent,
  actor = "stripe-webhook",
): Promise<ReconcileResult> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as {
        id: string;
        payment_intent?: string;
        amount_total?: number;
        currency?: string;
        metadata?: Record<string, string>;
      };
      const invoiceId = session.metadata?.invoiceId;
      if (!invoiceId) {
        return { handled: false, type: event.type, action: "ignored", message: "no invoiceId in session metadata" };
      }
      const externalRef = session.payment_intent ?? session.id;
      // Idempotent on the PaymentIntent id, TWICE over — deliberately:
      //   1. this cheap `findByExternalRef` short-circuit catches the ordinary
      //      sequential redelivery before any read of the invoice, and
      //   2. `idempotencyKey: externalRef` below derives the payment's id from
      //      that same PaymentIntent, so two redeliveries racing *concurrently*
      //      (Stripe retries in parallel, or two app instances take the same
      //      event) both land on ONE storage slot instead of both passing this
      //      pre-check and recording two payments. The scan alone is a
      //      check-then-write race; the derived id is not. See lib/idempotency.ts.
      // The nuance this preserves: a genuine SECOND Stripe payment on the same
      // invoice (a partial / instalment) is a different PaymentIntent → a
      // different key → recorded normally. Only redelivery of the same intent
      // collapses.
      const existing = await container.payments.findByExternalRef(externalRef);
      if (existing) {
        return { handled: true, type: event.type, action: "deduped", invoiceId };
      }
      const invoice = await container.invoices.get(invoiceId);
      if (!invoice) {
        return { handled: false, type: event.type, action: "ignored", message: `invoice ${invoiceId} not found` };
      }
      const { settled, deduped } = await container.payments.record(actor, {
        invoiceId,
        amountCents: session.amount_total ?? invoice.totalCents,
        currency: invoice.currency,
        method: "stripe",
        externalRef,
        idempotencyKey: externalRef,
        notes: `Stripe checkout ${session.id}`,
      });
      // A redelivery that got past the pre-check (the concurrent case) is
      // reported honestly as deduped, not as a second "paid".
      return {
        handled: true,
        type: event.type,
        action: deduped ? "deduped" : "paid",
        invoiceId,
        message: deduped ? "already recorded" : settled ? "invoice settled" : "payment recorded",
      };
    }

    case "charge.refunded": {
      const charge = event.data.object as {
        payment_intent?: string;
        amount_refunded?: number;
        refunds?: { data?: Array<{ id?: string; amount?: number; created?: number; reason?: string | null }> };
      };
      if (!charge.payment_intent) {
        return { handled: false, type: event.type, action: "ignored", message: "no payment_intent on charge" };
      }
      const payment = await container.payments.findByExternalRef(charge.payment_intent);
      if (!payment) {
        return { handled: false, type: event.type, action: "ignored", message: "no matching Stripe payment" };
      }
      let created = false;
      const providerRefunds = charge.refunds?.data ?? [];
      for (const providerRefund of providerRefunds) {
        if (!providerRefund.id || !Number.isSafeInteger(providerRefund.amount) || (providerRefund.amount ?? 0) <= 0) continue;
        const result = await container.payments.recordRefund(actor, {
          paymentId: payment.id,
          amountCents: providerRefund.amount!,
          currency: payment.currency,
          provider: "stripe",
          providerId: providerRefund.id,
          providerEventId: event.id,
          refundedAt: Number.isSafeInteger(providerRefund.created) ? providerRefund.created! * 1_000 : undefined,
          reason: providerRefund.reason ?? undefined,
        });
        if (!result.deduped) created = true;
      }
      const refundTotal = Number.isSafeInteger(charge.amount_refunded)
        ? charge.amount_refunded!
        : providerRefunds.reduce((sum, refund) => sum + (Number.isSafeInteger(refund.amount) ? refund.amount! : 0), 0);
      const cumulative = await container.payments.reconcileCumulativeRefund(actor, {
        externalRef: charge.payment_intent,
        totalRefundedCents: refundTotal,
        providerId: providerRefunds.length ? `${event.id}:remainder` : event.id,
        providerEventId: event.id,
      });
      if (cumulative?.refund && !cumulative.deduped) created = true;
      return {
        handled: true,
        type: event.type,
        action: created ? "refunded" : "deduped",
        invoiceId: payment.invoiceId,
        message: created ? "refund recorded" : "refund already recorded",
      };
    }

    case "charge.dispute.created": {
      const dispute = event.data.object as { id?: string; payment_intent?: string; amount?: number; created?: number };
      const disputed = await container.payments.markDisputed(dispute.payment_intent, actor, {
        providerId: dispute.id ?? event.id,
        providerEventId: event.id,
        amountCents: dispute.amount,
        openedAt: Number.isSafeInteger(dispute.created) ? dispute.created! * 1_000 : undefined,
      });
      if (!disputed) {
        return { handled: false, type: event.type, action: "ignored", message: "no matching Stripe payment" };
      }
      // A redelivery — same provider dispute id, any process, warm cache or not —
      // is reported as deduped rather than as a second chargeback.
      return disputed.deduped
        ? { handled: true, type: event.type, action: "deduped", invoiceId: disputed.payment.invoiceId, message: "dispute already recorded" }
        : { handled: true, type: event.type, action: "chargeback", invoiceId: disputed.payment.invoiceId };
    }

    default:
      return { handled: false, type: event.type, action: "ignored" };
  }
}
