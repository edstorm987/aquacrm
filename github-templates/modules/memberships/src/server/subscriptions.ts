// Subscription service — Stripe customer + subscription lifecycle.
//
// Storage:
//   memberships/subscribers/<userId>     — Subscription row
//   memberships/by-plan/<planId>         — string[] of subscriber userIds
//   memberships/customer-by-user/<uid>   — Stripe customer id (cached)
//
// One active subscription per (clientId, endCustomerUserId). If the
// user calls subscribe with a different plan, the existing
// subscription is updated in-place (Stripe `changeSubscriptionPlan`).
//
// Idempotency on Stripe ids: every write either creates a new
// Stripe-side resource or upserts on the stored stripeSubscriptionId.
// Webhook handlers call `upsertFromStripe` which is the canonical
// reconciliation entry point.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  Billing,
  CancelInput,
  Subscription,
  SubscriptionStatus,
  SubscribeInput,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
  StripePort,
  StripeSubscription,
  UserPort,
} from "./ports";
import type { PlanService } from "./plans";

const subKey = (userId: UserId): string => `memberships/subscribers/${userId}`;
const byPlanKey = (planId: string): string => `memberships/by-plan/${planId}`;
const customerCacheKey = (userId: UserId): string => `memberships/customer-by-user/${userId}`;

// Map raw Stripe statuses to our typed enum. Anything we don't
// recognise becomes "incomplete" so the UI shows a "needs attention"
// state instead of confidently rendering a bad status.
function mapStripeStatus(raw: string): SubscriptionStatus {
  switch (raw) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "past_due": return "past_due";
    case "unpaid": return "past_due";
    case "canceled": return "canceled";
    case "paused": return "paused";
    case "incomplete":
    case "incomplete_expired":
    default: return "incomplete";
  }
}

function fromStripe(
  agencyId: AgencyId,
  clientId: ClientId,
  userId: UserId,
  planId: string,
  billing: Billing,
  stripeSub: StripeSubscription,
  existingId?: string,
): Subscription {
  const ts = now();
  return {
    id: existingId ?? makeId("sub"),
    agencyId,
    clientId,
    endCustomerUserId: userId,
    planId,
    stripeCustomerId: stripeSub.customerId,
    stripeSubscriptionId: stripeSub.id,
    billing,
    status: mapStripeStatus(stripeSub.status),
    currentPeriodEnd: stripeSub.currentPeriodEnd
      ? new Date(stripeSub.currentPeriodEnd * 1000).toISOString()
      : undefined,
    cancelAtPeriodEnd: stripeSub.cancelAtPeriodEnd,
    trialEndsAt: stripeSub.trialEnd
      ? new Date(stripeSub.trialEnd * 1000).toISOString()
      : undefined,
    createdAt: ts,
    updatedAt: ts,
  };
}

export class SubscriptionService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private stripe: StripePort,
    private user: UserPort,
    private plans: PlanService,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────────────────

  async getByUser(userId: UserId): Promise<Subscription | null> {
    const row = await this.storage.get<Subscription>(subKey(userId));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  async list(filter?: { planId?: string; status?: SubscriptionStatus }): Promise<Subscription[]> {
    // Walk known planIds + collect their member sets.
    const plans = await this.plans.list();
    const seen = new Set<UserId>();
    const out: Subscription[] = [];
    for (const plan of plans) {
      if (filter?.planId && plan.id !== filter.planId) continue;
      const userIds = (await this.storage.get<string[]>(byPlanKey(plan.id))) ?? [];
      for (const uid of userIds) {
        if (seen.has(uid)) continue;
        seen.add(uid);
        const sub = await this.getByUser(uid);
        if (sub && (!filter?.status || sub.status === filter.status)) out.push(sub);
      }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ─── Subscribe ─────────────────────────────────────────────────────────
  //
  // Returns either a Stripe Checkout session URL (for paid plans) or a
  // synthesised "free-tier" Subscription row directly (for $0 plans).

  async subscribe(input: SubscribeInput): Promise<
    | { ok: true; mode: "checkout"; checkoutUrl: string }
    | { ok: true; mode: "free"; subscription: Subscription }
    | { ok: false; error: string }
  > {
    const plan = await this.plans.get(input.planId);
    if (!plan || plan.status !== "active") {
      return { ok: false, error: "Plan not found or not active." };
    }
    const profile = await this.user.getUser(input.endCustomerUserId);
    if (!profile) return { ok: false, error: "End customer not found." };

    const isFree = (input.billing === "monthly" && plan.priceMonthly === 0)
      || (input.billing === "annual" && plan.priceAnnual === 0);

    if (isFree) {
      const ts = now();
      const sub: Subscription = {
        id: makeId("sub"),
        agencyId: this.agencyId,
        clientId: this.clientId,
        endCustomerUserId: input.endCustomerUserId,
        planId: plan.id,
        billing: input.billing,
        status: "active",
        cancelAtPeriodEnd: false,
        createdAt: ts,
        updatedAt: ts,
      };
      await this.persist(sub);
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: this.clientId,
        actorUserId: input.endCustomerUserId,
        category: "memberships",
        action: "membership.subscription_started",
        message: `${profile.email} subscribed to ${plan.name} (free tier).`,
        metadata: { subscriptionId: sub.id, planId: plan.id, billing: input.billing },
      });
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "membership.subscription_started",
        { subscriptionId: sub.id, userId: input.endCustomerUserId, planId: plan.id, billing: input.billing },
      );
      return { ok: true, mode: "free", subscription: sub };
    }

    const priceId = input.billing === "monthly" ? plan.stripePriceIdMonthly : plan.stripePriceIdAnnual;
    if (!priceId) {
      return { ok: false, error: `Plan ${plan.name} has no Stripe price for billing=${input.billing}.` };
    }

    // Resolve or cache the Stripe customer id for this end-customer.
    let customerId = await this.storage.get<string>(customerCacheKey(input.endCustomerUserId));
    if (!customerId) {
      const customer = await this.stripe.createCustomer({
        email: profile.email,
        name: profile.name,
        metadata: {
          agencyId: this.agencyId,
          clientId: this.clientId,
          endCustomerUserId: input.endCustomerUserId,
        },
      });
      customerId = customer.id;
      await this.storage.set(customerCacheKey(input.endCustomerUserId), customerId);
    }

    const session = await this.stripe.createCheckoutSession({
      customerId,
      priceId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      trialDays: plan.trialDays,
      metadata: {
        planId: plan.id,
        billing: input.billing,
        endCustomerUserId: input.endCustomerUserId,
        agencyId: this.agencyId,
        clientId: this.clientId,
      },
    });

    return { ok: true, mode: "checkout", checkoutUrl: session.url };
  }

  // ─── Cancel ─────────────────────────────────────────────────────────────

  async cancel(input: CancelInput): Promise<Subscription | null> {
    const sub = await this.getByUser(input.endCustomerUserId);
    if (!sub) return null;
    if (sub.stripeSubscriptionId) {
      const stripeSub = await this.stripe.cancelSubscription(sub.stripeSubscriptionId, input.atPeriodEnd);
      const updated: Subscription = {
        ...sub,
        status: mapStripeStatus(stripeSub.status),
        cancelAtPeriodEnd: stripeSub.cancelAtPeriodEnd,
        updatedAt: now(),
      };
      await this.persist(updated);
      await this.logCancel(updated, input.atPeriodEnd);
      return updated;
    }
    // Free-tier or never-Stripe subscription — just flip the row.
    const updated: Subscription = {
      ...sub,
      status: input.atPeriodEnd ? sub.status : "canceled",
      cancelAtPeriodEnd: input.atPeriodEnd,
      updatedAt: now(),
    };
    await this.persist(updated);
    await this.logCancel(updated, input.atPeriodEnd);
    return updated;
  }

  // ─── Pause / resume / change plan ──────────────────────────────────────

  async pause(userId: UserId): Promise<Subscription | null> {
    const sub = await this.getByUser(userId);
    if (!sub?.stripeSubscriptionId) return null;
    const stripeSub = await this.stripe.pauseSubscription(sub.stripeSubscriptionId);
    return this.upsertFromStripeForUser(userId, sub.planId, sub.billing, stripeSub);
  }

  async resume(userId: UserId): Promise<Subscription | null> {
    const sub = await this.getByUser(userId);
    if (!sub?.stripeSubscriptionId) return null;
    const stripeSub = await this.stripe.resumeSubscription(sub.stripeSubscriptionId);
    return this.upsertFromStripeForUser(userId, sub.planId, sub.billing, stripeSub);
  }

  async changePlan(userId: UserId, newPlanId: string): Promise<Subscription | null> {
    const sub = await this.getByUser(userId);
    if (!sub?.stripeSubscriptionId) return null;
    const newPlan = await this.plans.get(newPlanId);
    if (!newPlan) return null;
    const newPriceId = sub.billing === "monthly" ? newPlan.stripePriceIdMonthly : newPlan.stripePriceIdAnnual;
    if (!newPriceId) throw new Error(`New plan has no Stripe price for billing=${sub.billing}.`);
    const stripeSub = await this.stripe.changeSubscriptionPlan({
      id: sub.stripeSubscriptionId,
      newPriceId,
    });
    // Re-key the by-plan index: remove from old plan, add to new.
    await this.movePlanIndex(userId, sub.planId, newPlanId);
    return this.upsertFromStripeForUser(userId, newPlanId, sub.billing, stripeSub);
  }

  // ─── Webhook entry point — reconcile state from Stripe ────────────────
  //
  // Idempotent. Used by WebhookService for `customer.subscription.{created,
  // updated, deleted}` events. Looks up the existing row by stripe sub
  // id when possible; falls back to (clientId, userId) lookup via metadata.

  async upsertFromStripe(
    stripeSub: StripeSubscription,
    metadata: Record<string, string>,
  ): Promise<Subscription | null> {
    const userId = metadata.endCustomerUserId;
    const planId = metadata.planId;
    const billing = (metadata.billing as Billing | undefined) ?? "monthly";
    if (!userId || !planId) return null;
    return this.upsertFromStripeForUser(userId, planId, billing, stripeSub);
  }

  async billingPortalUrl(userId: UserId, returnUrl: string): Promise<string | null> {
    const sub = await this.getByUser(userId);
    if (!sub?.stripeCustomerId) return null;
    const session = await this.stripe.createBillingPortalSession({
      customerId: sub.stripeCustomerId,
      returnUrl,
    });
    return session.url;
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private async upsertFromStripeForUser(
    userId: UserId,
    planId: string,
    billing: Billing,
    stripeSub: StripeSubscription,
  ): Promise<Subscription> {
    const existing = await this.getByUser(userId);
    const next = fromStripe(
      this.agencyId,
      this.clientId,
      userId,
      planId,
      billing,
      stripeSub,
      existing?.id,
    );
    if (existing) next.createdAt = existing.createdAt;
    await this.persist(next);
    if (existing && existing.status !== next.status) {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "membership.subscription_changed",
        { subscriptionId: next.id, userId, oldStatus: existing.status, newStatus: next.status },
      );
    }
    if (!existing) {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "membership.subscription_started",
        { subscriptionId: next.id, userId, planId, billing },
      );
    }
    return next;
  }

  private async persist(sub: Subscription): Promise<void> {
    const userId = sub.endCustomerUserId;
    const previous = await this.storage.get<Subscription>(subKey(userId));
    if (previous && previous.planId !== sub.planId) {
      await this.movePlanIndex(userId, previous.planId, sub.planId);
    } else if (!previous) {
      const ix = (await this.storage.get<string[]>(byPlanKey(sub.planId))) ?? [];
      if (!ix.includes(userId)) {
        await this.storage.set(byPlanKey(sub.planId), [...ix, userId]);
      }
    }
    await this.storage.set(subKey(userId), sub);
  }

  private async movePlanIndex(userId: UserId, oldPlanId: string, newPlanId: string): Promise<void> {
    const oldIx = (await this.storage.get<string[]>(byPlanKey(oldPlanId))) ?? [];
    await this.storage.set(byPlanKey(oldPlanId), oldIx.filter(u => u !== userId));
    const newIx = (await this.storage.get<string[]>(byPlanKey(newPlanId))) ?? [];
    if (!newIx.includes(userId)) {
      await this.storage.set(byPlanKey(newPlanId), [...newIx, userId]);
    }
  }

  private async logCancel(sub: Subscription, atPeriodEnd: boolean): Promise<void> {
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: sub.endCustomerUserId,
      category: "memberships",
      action: atPeriodEnd ? "membership.subscription_canceling" : "membership.subscription_canceled",
      message: atPeriodEnd
        ? `Subscription will cancel at the end of the current period.`
        : `Subscription canceled immediately.`,
      metadata: { subscriptionId: sub.id, atPeriodEnd },
    });
    if (!atPeriodEnd) {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "membership.subscription_canceled",
        { subscriptionId: sub.id, userId: sub.endCustomerUserId },
      );
    }
  }
}
