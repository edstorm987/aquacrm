// Stripe webhook handler.
//
// Stripe POSTs JSON to `/api/portal/memberships/stripe/webhook` with a
// `Stripe-Signature` header. The handler:
//   1. Verifies the signature against the per-install webhook secret
//      (delegated to StripePort.verifyWebhookSignature).
//   2. Dedupes by Stripe event id under storage key
//      `memberships/webhook/seen/<eventId>` — Stripe retries the same
//      event up to ~72 hours, so without dedupe a flapping endpoint
//      ends up double-applying state changes.
//   3. Routes the event by type and reconciles via SubscriptionService.
//
// Lifted-pattern from the ecommerce webhook: `02`'s implementation
// stored seen ids in a module-level Set; we use plugin storage so the
// dedupe window survives process restarts. Idempotency is enforced
// regardless — applying a second event of the same id is a no-op.

import { now } from "../lib/time";
import type { WebhookEventSeen } from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
  StripePort,
  StripeSubscription,
  StripeWebhookEvent,
} from "./ports";
import type { SubscriptionService } from "./subscriptions";

const seenKey = (eventId: string): string => `memberships/webhook/seen/${eventId}`;

export interface WebhookHandleResult {
  ok: boolean;
  eventId?: string;
  type?: string;
  duplicate?: boolean;
  applied?: boolean;
  error?: string;
}

export class WebhookService {
  constructor(
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private stripe: StripePort,
    private subscriptions: SubscriptionService,
  ) {}

  async handle(args: { rawBody: string; signatureHeader: string }): Promise<WebhookHandleResult> {
    const event = await this.stripe.verifyWebhookSignature({
      rawBody: args.rawBody,
      signatureHeader: args.signatureHeader,
    });
    if (!event) {
      return { ok: false, error: "signature verification failed" };
    }
    return this.applyEvent(event);
  }

  // Separate entry point for tests + foundation-side consumers that
  // already have a verified event in hand (e.g. replay tooling).
  async applyEvent(event: StripeWebhookEvent): Promise<WebhookHandleResult> {
    const seen = await this.storage.get<WebhookEventSeen>(seenKey(event.id));
    if (seen) {
      return { ok: true, eventId: event.id, type: event.type, duplicate: true, applied: false };
    }
    await this.storage.set(seenKey(event.id), {
      id: event.id,
      type: event.type,
      receivedAt: now(),
    } satisfies WebhookEventSeen);

    let applied = false;
    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
        case "customer.subscription.paused":
        case "customer.subscription.resumed": {
          const stripeSub = parseStripeSubscription(event.data.object);
          const meta = (event.data.object as Record<string, unknown>).metadata as Record<string, string> | undefined;
          await this.subscriptions.upsertFromStripe(stripeSub, meta ?? {});
          applied = true;
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as Record<string, unknown>;
          const customerId = invoice.customer as string | undefined;
          this.events.emit(
            { agencyId: "", clientId: "" },
            "membership.payment_failed",
            { stripeCustomerId: customerId, invoiceId: invoice.id, amountDue: invoice.amount_due },
          );
          applied = true;
          break;
        }
        case "invoice.paid":
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Record<string, unknown>;
          this.events.emit(
            { agencyId: "", clientId: "" },
            "membership.payment_succeeded",
            { stripeCustomerId: invoice.customer, invoiceId: invoice.id, amountPaid: invoice.amount_paid },
          );
          applied = true;
          break;
        }
        default:
          // Unknown event type — record it as seen so we don't keep re-receiving
          // (Stripe doesn't retry events the endpoint 200s on), but don't
          // reconcile.
          applied = false;
      }
    } catch (err) {
      return { ok: false, eventId: event.id, type: event.type, applied: false, error: err instanceof Error ? err.message : String(err) };
    }

    return { ok: true, eventId: event.id, type: event.type, duplicate: false, applied };
  }
}

// Parse a raw `data.object` from a `customer.subscription.*` event into
// our typed StripeSubscription. Stripe's payload uses snake_case field
// names; this isolates that mapping.
function parseStripeSubscription(obj: Record<string, unknown>): StripeSubscription {
  const items = (obj.items as { data?: { price?: { id?: string } }[] } | undefined)?.data ?? [];
  return {
    id: String(obj.id),
    customerId: String(obj.customer),
    status: String(obj.status),
    currentPeriodEnd: typeof obj.current_period_end === "number" ? obj.current_period_end : undefined,
    cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
    trialEnd: typeof obj.trial_end === "number" ? obj.trial_end : undefined,
    items: items
      .map(it => it.price?.id)
      .filter((id): id is string => typeof id === "string")
      .map(priceId => ({ priceId })),
  };
}
