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
import { withMembershipDependencyLock } from "./dependencies";

const deliveryKey = (eventId: string): string => `memberships/webhook/seen/${eventId}`;
const paymentKey = (invoiceId: string): string => `memberships/payments/${invoiceId}`;
const localProviderTails = new Map<string, Promise<void>>();

export interface WebhookHandleResult {
  ok: boolean;
  eventId?: string;
  type?: string;
  duplicate?: boolean;
  applied?: boolean;
  retryable?: boolean;
  error?: string;
}

function isSubscriptionEvent(type: string): boolean {
  return type === "customer.subscription.created"
    || type === "customer.subscription.updated"
    || type === "customer.subscription.deleted"
    || type === "customer.subscription.paused"
    || type === "customer.subscription.resumed";
}

async function localProviderExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = localProviderTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  localProviderTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (localProviderTails.get(key) === tail) localProviderTails.delete(key);
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
      const completed = await this.completedDelivery(event);
      if (completed) return completed;
      return await this.withProviderEventLock(event, providerSubscription =>
        this.withEventLock(event.id, async () => {
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
            const applied = await this.applyVerifiedEvent(event, providerSubscription);
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
        }),
      );
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

  private completedDelivery(event: StripeWebhookEvent): Promise<WebhookHandleResult | null> {
    return this.withEventLock(event.id, async () => {
      const stored = await this.storage.get<WebhookEventSeen | MembershipWebhookDelivery>(
        deliveryKey(event.id),
      );
      return stored && "status" in stored && stored.status === "completed"
        ? {
            ok: true,
            eventId: event.id,
            type: event.type,
            duplicate: true,
            applied: false,
          }
        : null;
    });
  }

  private async withEventLock<T>(eventId: string, operation: () => Promise<T>): Promise<T> {
    void eventId;
    // All subscription, checkout and plan-reference mutations share the same
    // durable install lane. Per-event keys allowed two different event ids to
    // race on the same subscriber row in production.
    return withMembershipDependencyLock(this.storage, this.agencyId, this.clientId, operation);
  }

  private async withProviderEventLock<T>(
    event: StripeWebhookEvent,
    operation: (providerSubscription?: StripeSubscription) => Promise<T>,
  ): Promise<T> {
    if (!isSubscriptionEvent(event.type) && event.type !== "checkout.session.expired") {
      return operation(undefined);
    }
    const metadata = metadataFrom(event.data.object);
    let subject = optionalString(metadata.endCustomerUserId);
    if (isSubscriptionEvent(event.type) && !subject) {
      // Legacy event bodies may predate identity metadata. Discover the
      // canonical user, then re-read only after acquiring the same lane used
      // by UI lifecycle commands; the discovery snapshot is never applied.
      const discovered = await this.retrieveAuthoritativeSubscription(event);
      subject = optionalString(discovered.metadata?.endCustomerUserId);
      if (!subject) {
        throw new Error("Membership authoritative subscription metadata.endCustomerUserId is required.");
      }
    }
    subject ??= requiredString(event.data.object.id, "Membership provider event object id");
    const key = `membership-subscription-provider:${this.agencyId}:${this.clientId}:${subject}`;
    const run = async () => {
      if (!isSubscriptionEvent(event.type)) return operation(undefined);
      const current = await this.retrieveAuthoritativeSubscription(event);
      const authoritativeSubject = optionalString(current.metadata?.endCustomerUserId);
      if (authoritativeSubject && authoritativeSubject !== subject) {
        throw new Error("Membership authoritative subscription identity changed during reconciliation; retry delivery.");
      }
      return operation(current);
    };
    return this.storage.runProviderExclusive
      ? this.storage.runProviderExclusive(key, run)
      : localProviderExclusive(key, run);
  }

  private async retrieveAuthoritativeSubscription(
    event: StripeWebhookEvent,
  ): Promise<StripeSubscription> {
    const eventSubscription = parseStripeSubscription(event.data.object);
    const current = await this.stripe.retrieveSubscription(eventSubscription.id);
    if (!current) {
      throw new Error(`Membership Stripe subscription ${eventSubscription.id} could not be retrieved.`);
    }
    return current;
  }

  private async applyVerifiedEvent(
    event: StripeWebhookEvent,
    providerSubscription?: StripeSubscription,
  ): Promise<boolean> {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        if (!providerSubscription) {
          throw new Error("Membership webhook is missing authoritative provider state.");
        }
        const metadata = {
          ...metadataFrom(event.data.object),
          ...(providerSubscription.metadata ?? {}),
        };
        this.assertScope(metadata);
        const userId = requiredMetadata(metadata, "endCustomerUserId");
        const planId = requiredMetadata(metadata, "planId");
        const billing = requiredMetadata(metadata, "billing");
        if (billing !== "monthly" && billing !== "annual") {
          throw new Error("Membership webhook metadata.billing must be monthly or annual.");
        }
        const subscription = await this.subscriptions.upsertFromStripeWithinDependencyGraph(providerSubscription, {
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
      case "checkout.session.expired": {
        const metadata = metadataFrom(event.data.object);
        this.assertScope(metadata);
        const userId = requiredMetadata(metadata, "endCustomerUserId");
        const planId = requiredMetadata(metadata, "planId");
        const billing = requiredMetadata(metadata, "billing");
        if (billing !== "monthly" && billing !== "annual") {
          throw new Error("Membership webhook metadata.billing must be monthly or annual.");
        }
        const checkoutId = requiredString(
          event.data.object.id,
          "Membership checkout webhook id",
        );
        return this.subscriptions.expireCheckoutWithinDependencyGraph(
          userId,
          checkoutId,
          planId,
          billing,
        );
      }
      case "invoice.payment_failed":
        return this.applyPaymentEvent(event, "failed");
      case "invoice.paid":
      case "invoice.payment_succeeded":
        return this.applyPaymentEvent(event, "paid");
      default:
        return false;
    }
  }

  private async applyPaymentEvent(
    event: StripeWebhookEvent,
    status: MembershipPaymentRecord["status"],
  ): Promise<boolean> {
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
    const incoming: MembershipPaymentRecord = {
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
    const existing = await this.storage.get<MembershipPaymentRecord>(paymentKey(invoiceId));
    const shouldAdvance = !existing
      || (existing.status === "failed" && status === "paid");
    const record = shouldAdvance ? incoming : existing;
    if (shouldAdvance) await this.storage.set(paymentKey(invoiceId), record);
    if (record.effectsCompletedAt !== undefined) return false;

    const eventName = record.status === "paid"
      ? "membership.payment_succeeded"
      : "membership.payment_failed";
    await this.activity.logActivity({
      idempotencyKey: `memberships:webhook:${record.eventId}:payment-activity`,
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: optionalString(metadata.endCustomerUserId),
      category: "memberships",
      action: eventName,
      message: record.status === "paid"
        ? `Membership invoice ${invoiceId} was paid.`
        : `Membership invoice ${invoiceId} payment failed.`,
      metadata: { ...record },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      eventName,
      { ...record, webhookEventId: record.eventId },
    );
    await this.storage.set(paymentKey(invoiceId), {
      ...record,
      effectsCompletedAt: now(),
      updatedAt: now(),
    });
    return true;
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
  const metadata: Record<string, string> = {};
  for (const candidate of [...candidates].reverse()) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const entries = Object.entries(candidate as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string");
    Object.assign(metadata, Object.fromEntries(entries));
  }
  return metadata;
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
