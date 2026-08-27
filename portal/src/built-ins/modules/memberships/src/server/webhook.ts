// Stripe webhook delivery for Memberships.
//
// A verified event is an inbox row, not a pre-emptive "seen" flag. The row is
// completed only after subscriber/payment state and synchronous side effects
// return successfully. Failed or interrupted work remains retryable and the
// per-event storage transaction serialises delivery across app processes.

import { now } from "../lib/time";
import type { AgencyId, ClientId } from "../lib/tenancy";
import type {
  MembershipPaymentRecord,
  MembershipWebhookDelivery,
  WebhookEventSeen,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
  StripePort,
  StripeSubscription,
  StripeWebhookEvent,
} from "./ports";
import type { SubscriptionService } from "./subscriptions";

const deliveryKey = (eventId: string): string => `memberships/webhook/seen/${eventId}`;
const paymentKey = (invoiceId: string): string => `memberships/payments/${invoiceId}`;
const localTails = new Map<string, Promise<void>>();

export interface WebhookHandleResult {
  ok: boolean;
  eventId?: string;
  type?: string;
  duplicate?: boolean;
  applied?: boolean;
  retryable?: boolean;
  error?: string;
}

async function localExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = localTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  localTails.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (localTails.get(key) === tail) localTails.delete(key);
  }
}

export class WebhookService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
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
      return { ok: false, retryable: false, error: "signature verification failed" };
    }
    return this.applyEvent(event);
  }

  // Separate entry point for replay tooling that already verified the event.
  async applyEvent(event: StripeWebhookEvent): Promise<WebhookHandleResult> {
    try {
      return await this.withEventLock(event.id, async () => {
        const stored = await this.storage.get<WebhookEventSeen | MembershipWebhookDelivery>(
          deliveryKey(event.id),
        );
        if (stored && "status" in stored && stored.status === "completed") {
          return {
            ok: true,
            eventId: event.id,
            type: event.type,
            duplicate: true,
            applied: false,
          };
        }

        const ts = now();
        let delivery: MembershipWebhookDelivery = {
          id: event.id,
          type: event.type,
          receivedAt: stored?.receivedAt ?? ts,
          status: "processing",
          // A legacy pre-work "seen" marker has no status. Reprocess it once:
          // state adoption and payment ledger/activity are now idempotent, while
          // treating it as complete would preserve the exact poisoned-retry bug.
          attempts: stored && "attempts" in stored ? stored.attempts + 1 : 1,
          updatedAt: ts,
        };
        await this.storage.set(deliveryKey(event.id), delivery);

        try {
          const applied = await this.applyVerifiedEvent(event);
          delivery = {
            ...delivery,
            status: "completed",
            applied,
            completedAt: now(),
            updatedAt: now(),
            lastError: undefined,
          };
          await this.storage.set(deliveryKey(event.id), delivery);
          return {
            ok: true,
            eventId: event.id,
            type: event.type,
            duplicate: false,
            applied,
          };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          delivery = {
            ...delivery,
            status: "failed",
            applied: false,
            lastError: error,
            updatedAt: now(),
          };
          try {
            await this.storage.set(deliveryKey(event.id), delivery);
          } catch (recordError) {
            return {
              ok: false,
              eventId: event.id,
              type: event.type,
              applied: false,
              retryable: true,
              error: `${error}; failed to persist retry state: ${recordError instanceof Error ? recordError.message : String(recordError)}`,
            };
          }
          return {
            ok: false,
            eventId: event.id,
            type: event.type,
            applied: false,
            retryable: true,
            error,
          };
        }
      });
    } catch (err) {
      return {
        ok: false,
        eventId: event.id,
        type: event.type,
        applied: false,
        retryable: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async withEventLock<T>(eventId: string, operation: () => Promise<T>): Promise<T> {
    const key = `membership-webhook:${eventId}`;
    if (this.storage.runExclusive) return this.storage.runExclusive(key, operation);
    return localExclusive(`${this.agencyId}:${this.clientId}:${key}`, operation);
  }

  private async applyVerifiedEvent(event: StripeWebhookEvent): Promise<boolean> {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const metadata = metadataFrom(event.data.object);
        this.assertScope(metadata);
        const userId = requiredMetadata(metadata, "endCustomerUserId");
        const planId = requiredMetadata(metadata, "planId");
        const billing = requiredMetadata(metadata, "billing");
        if (billing !== "monthly" && billing !== "annual") {
          throw new Error("Membership webhook metadata.billing must be monthly or annual.");
        }
        const stripeSub = parseStripeSubscription(event.data.object);
        const subscription = await this.subscriptions.upsertFromStripe(stripeSub, {
          ...metadata,
          endCustomerUserId: userId,
          planId,
          billing,
        });
        if (!subscription) {
          throw new Error("Membership subscription webhook did not resolve a subscriber row.");
        }
        return true;
      }
      case "invoice.payment_failed":
        await this.applyPaymentEvent(event, "failed");
        return true;
      case "invoice.paid":
      case "invoice.payment_succeeded":
        await this.applyPaymentEvent(event, "paid");
        return true;
      default:
        return false;
    }
  }

  private async applyPaymentEvent(
    event: StripeWebhookEvent,
    status: MembershipPaymentRecord["status"],
  ): Promise<void> {
    const invoice = event.data.object;
    const metadata = metadataFrom(invoice);
    this.assertScope(metadata);
    const invoiceId = requiredString(invoice.id, "Membership invoice webhook id");
    const customerId = requiredString(invoice.customer, "Membership invoice customer");
    const rawAmount = status === "paid" ? invoice.amount_paid : invoice.amount_due;
    if (typeof rawAmount !== "number" || !Number.isSafeInteger(rawAmount) || rawAmount < 0) {
      throw new Error(`Membership invoice ${status} amount must be a non-negative safe integer.`);
    }
    const occurredAt = Number.isFinite(event.created) && event.created > 0
      ? event.created * 1_000
      : now();
    const record: MembershipPaymentRecord = {
      agencyId: this.agencyId,
      clientId: this.clientId,
      invoiceId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: optionalString(invoice.subscription),
      status,
      amountCents: rawAmount,
      currency: optionalString(invoice.currency)?.toLowerCase(),
      eventId: event.id,
      occurredAt,
      updatedAt: now(),
    };
    await this.storage.set(paymentKey(invoiceId), record);
    const eventName = status === "paid"
      ? "membership.payment_succeeded"
      : "membership.payment_failed";
    await this.activity.logActivity({
      idempotencyKey: `memberships:webhook:${event.id}:payment-activity`,
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: optionalString(metadata.endCustomerUserId),
      category: "memberships",
      action: eventName,
      message: status === "paid"
        ? `Membership invoice ${invoiceId} was paid.`
        : `Membership invoice ${invoiceId} payment failed.`,
      metadata: { ...record },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      eventName,
      { ...record, webhookEventId: event.id },
    );
  }

  private assertScope(metadata: Record<string, string>): void {
    const agencyId = requiredMetadata(metadata, "agencyId");
    const clientId = requiredMetadata(metadata, "clientId");
    if (agencyId !== this.agencyId || clientId !== this.clientId) {
      throw new Error("Membership webhook metadata does not match the installed agency/client scope.");
    }
  }
}

function metadataFrom(obj: Record<string, unknown>): Record<string, string> {
  const candidates = [
    obj.metadata,
    (obj.subscription_details as Record<string, unknown> | undefined)?.metadata,
    ((obj.parent as Record<string, unknown> | undefined)?.subscription_details as Record<string, unknown> | undefined)?.metadata,
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const entries = Object.entries(candidate as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string");
    if (entries.length > 0) return Object.fromEntries(entries);
  }
  return {};
}

function requiredMetadata(metadata: Record<string, string>, key: string): string {
  const value = metadata[key]?.trim();
  if (!value) throw new Error(`Membership webhook metadata.${key} is required.`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  const stringValue = typeof value === "string" ? value.trim() : "";
  if (!stringValue) throw new Error(`${label} is required.`);
  return stringValue;
}

function optionalString(value: unknown): string | undefined {
  const stringValue = typeof value === "string" ? value.trim() : "";
  return stringValue || undefined;
}

function parseStripeSubscription(obj: Record<string, unknown>): StripeSubscription {
  const id = requiredString(obj.id, "Membership Stripe subscription id");
  const customerId = requiredString(obj.customer, "Membership Stripe customer id");
  const status = requiredString(obj.status, "Membership Stripe subscription status");
  const items = (obj.items as { data?: { price?: { id?: string } }[] } | undefined)?.data ?? [];
  return {
    id,
    customerId,
    status,
    currentPeriodEnd: typeof obj.current_period_end === "number" ? obj.current_period_end : undefined,
    cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
    trialEnd: typeof obj.trial_end === "number" ? obj.trial_end : undefined,
    items: items
      .map(item => item.price?.id)
      .filter((priceId): priceId is string => typeof priceId === "string" && priceId.length > 0)
      .map(priceId => ({ priceId })),
  };
}
