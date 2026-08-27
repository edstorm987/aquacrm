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
  StripeCheckoutSession,
  StripePort,
  StripeSubscription,
  UserPort,
} from "./ports";
import type { PlanService } from "./plans";
import {
  assertBilling,
  assertCancelInput,
  assertProviderId,
  assertProviderSubscription,
  assertProviderUrl,
  assertSubscribeInput,
  assertSubscription,
} from "../lib/runtimeValidation";

const subKey = (userId: UserId): string => `memberships/subscribers/${userId}`;
const byPlanKey = (planId: string): string => `memberships/by-plan/${planId}`;
const customerCacheKey = (userId: UserId): string => `memberships/customer-by-user/${userId}`;
const commandKey = (userId: UserId): string => `memberships/subscription-command/${userId}`;

export type SubscribeSuccess =
  | { ok: true; mode: "checkout"; checkoutUrl: string; operationId: string }
  | { ok: true; mode: "free" | "changed"; subscription: Subscription; operationId: string };

interface SubscriptionCommand {
  id: string;
  signature: string;
  kind: "subscribe" | "cancel";
  stage: "pending" | "provider_applied" | "completed";
  userId: UserId;
  planId?: string;
  billing?: Billing;
  atPeriodEnd?: boolean;
  customerId?: string;
  providerSubscription?: StripeSubscription;
  checkout?: StripeCheckoutSession;
  subscribeResult?: SubscribeSuccess;
  cancelResult?: Subscription;
  createdAt: number;
  updatedAt: number;
}

const localTails = new Map<string, Promise<void>>();

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

function operationId(value?: string): string {
  const cleaned = value?.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160);
  return cleaned || makeId("membership_operation");
}

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
    | SubscribeSuccess
    | { ok: false; error: string }
  > {
    assertSubscribeInput(input);
    return this.withUserCommand(input.endCustomerUserId, async () => {
      const plan = await this.plans.get(input.planId);
      if (!plan || plan.status !== "active") {
        return { ok: false, error: "Plan not found or not active." } as const;
      }
      const profile = await this.user.getUser(input.endCustomerUserId);
      if (!profile) return { ok: false, error: "End customer not found." } as const;

      const isFree = (input.billing === "monthly" && plan.priceMonthly === 0)
        || (input.billing === "annual" && plan.priceAnnual === 0);
      const priceId = input.billing === "monthly" ? plan.stripePriceIdMonthly : plan.stripePriceIdAnnual;
      if (!isFree && !priceId) {
        return { ok: false, error: `Plan ${plan.name} has no Stripe price for billing=${input.billing}.` } as const;
      }

      const signature = `subscribe:${plan.id}:${input.billing}`;
      const existing = await this.getByUser(input.endCustomerUserId);
      let command = await this.beginCommand({
        userId: input.endCustomerUserId,
        kind: "subscribe",
        signature,
        requestedId: input.operationId,
        planId: plan.id,
        billing: input.billing,
      });

      if (command.stage === "completed" && command.subscribeResult) {
        if (
          command.subscribeResult.mode === "checkout" &&
          existing?.stripeSubscriptionId &&
          existing.status !== "canceled" &&
          existing.planId === plan.id &&
          existing.billing === input.billing
        ) {
          return {
            ok: true,
            mode: "changed",
            subscription: existing,
            operationId: command.id,
          };
        }
        return command.subscribeResult;
      }

      const hasLiveProviderSubscription = Boolean(
        existing?.stripeSubscriptionId && existing.status !== "canceled",
      );

      if (hasLiveProviderSubscription && existing) {
        let providerSubscription = command.providerSubscription;
        if (!providerSubscription) {
          providerSubscription = isFree
            ? await this.stripe.cancelSubscription(
                existing.stripeSubscriptionId!,
                false,
                this.providerKey(command, "cancel-for-free"),
              )
            : await this.stripe.changeSubscriptionPlan({
                id: existing.stripeSubscriptionId!,
                newPriceId: priceId!,
                idempotencyKey: this.providerKey(command, "change-plan"),
              });
          command = await this.saveCommand({
            ...command,
            stage: "provider_applied",
            providerSubscription,
          });
        }

        const subscription = isFree
          ? await this.persistFreeSubscription(input.endCustomerUserId, existing, plan.id, input.billing)
          : await this.upsertFromStripeForUser(
              input.endCustomerUserId,
              plan.id,
              input.billing,
              providerSubscription,
            );
        const mode = isFree ? "free" : "changed";
        await this.logSubscribe(
          command,
          subscription,
          profile.email,
          plan.name,
          Boolean(existing && existing.status !== "canceled"),
        );
        const result: SubscribeSuccess = {
          ok: true,
          mode,
          subscription,
          operationId: command.id,
        };
        await this.saveCommand({ ...command, stage: "completed", subscribeResult: result });
        return result;
      }

      if (isFree) {
        const subscription = await this.persistFreeSubscription(
          input.endCustomerUserId,
          existing,
          plan.id,
          input.billing,
        );
        await this.logSubscribe(
          command,
          subscription,
          profile.email,
          plan.name,
          Boolean(existing && existing.status !== "canceled"),
        );
        const result: SubscribeSuccess = {
          ok: true,
          mode: "free",
          subscription,
          operationId: command.id,
        };
        await this.saveCommand({ ...command, stage: "completed", subscribeResult: result });
        return result;
      }

      let customerId = command.customerId
        ?? existing?.stripeCustomerId
        ?? await this.storage.get<string>(customerCacheKey(input.endCustomerUserId));
      if (!customerId) {
        const customer = await this.stripe.createCustomer({
          email: profile.email,
          name: profile.name,
          metadata: {
            agencyId: this.agencyId,
            clientId: this.clientId,
            endCustomerUserId: input.endCustomerUserId,
          },
          idempotencyKey: this.providerKey(command, "create-customer"),
        });
        assertProviderId(customer.id, "stripeCustomerId");
        customerId = customer.id;
        command = await this.saveCommand({ ...command, customerId });
      }
      await this.storage.set(customerCacheKey(input.endCustomerUserId), customerId);

      let checkout = command.checkout;
      if (!checkout) {
        checkout = await this.stripe.createCheckoutSession({
          customerId,
          priceId: priceId!,
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
          idempotencyKey: this.providerKey(command, "create-checkout"),
        });
        assertProviderId(checkout.id, "checkout.id");
        assertProviderUrl(checkout.url, "checkout.url");
      }
      const result: SubscribeSuccess = {
        ok: true,
        mode: "checkout",
        checkoutUrl: checkout.url,
        operationId: command.id,
      };
      await this.saveCommand({ ...command, customerId, checkout, stage: "completed", subscribeResult: result });
      return result;
    });
  }

  // ─── Cancel ─────────────────────────────────────────────────────────────

  async cancel(input: CancelInput): Promise<Subscription | null> {
    assertCancelInput(input);
    return this.withUserCommand(input.endCustomerUserId, async () => {
      const sub = await this.getByUser(input.endCustomerUserId);
      if (!sub) return null;
      if (sub.status === "canceled") return sub;

      // A free row has no provider period or webhook. Treat its mounted
      // end-of-period request as immediate so benefits cannot remain active forever.
      const effectiveAtPeriodEnd = Boolean(sub.stripeSubscriptionId && input.atPeriodEnd);
      const signature = `cancel:${effectiveAtPeriodEnd ? "period-end" : "immediate"}`;
      let command = await this.beginCommand({
        userId: input.endCustomerUserId,
        kind: "cancel",
        signature,
        requestedId: input.operationId,
        atPeriodEnd: effectiveAtPeriodEnd,
      });
      if (command.stage === "completed" && command.cancelResult) return command.cancelResult;

      let updated: Subscription;
      if (sub.stripeSubscriptionId) {
        let providerSubscription = command.providerSubscription;
        if (!providerSubscription) {
          providerSubscription = await this.stripe.cancelSubscription(
            sub.stripeSubscriptionId,
            effectiveAtPeriodEnd,
            this.providerKey(command, "cancel"),
          );
          command = await this.saveCommand({
            ...command,
            stage: "provider_applied",
            providerSubscription,
          });
        }
        assertProviderSubscription(providerSubscription);
        updated = fromStripe(
          this.agencyId,
          this.clientId,
          sub.endCustomerUserId,
          sub.planId,
          sub.billing,
          providerSubscription,
          sub.id,
        );
        updated.createdAt = sub.createdAt;
      } else {
        updated = {
          ...sub,
          status: "canceled",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: undefined,
          updatedAt: now(),
        };
      }
      await this.persist(updated);
      await this.logCancel(updated, effectiveAtPeriodEnd, command.id);
      await this.saveCommand({ ...command, stage: "completed", cancelResult: updated });
      return updated;
    });
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
    const result = await this.subscribe({
      endCustomerUserId: userId,
      planId: newPlanId,
      billing: sub.billing,
      successUrl: "about:blank",
      cancelUrl: "about:blank",
      operationId: `legacy-change-plan:${sub.id}:${sub.updatedAt}:${newPlanId}`,
    });
    return result.ok && result.mode !== "checkout" ? result.subscription : null;
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
    const billing = metadata.billing ?? "monthly";
    if (!userId || !planId) return null;
    assertBilling(billing);
    return this.upsertFromStripeForUser(userId, planId, billing, stripeSub);
  }

  async billingPortalUrl(userId: UserId, returnUrl: string): Promise<string | null> {
    const sub = await this.getByUser(userId);
    if (!sub?.stripeCustomerId) return null;
    const session = await this.stripe.createBillingPortalSession({
      customerId: sub.stripeCustomerId,
      returnUrl,
    });
    assertProviderId(session.id, "billingPortal.id");
    assertProviderUrl(session.url, "billingPortal.url");
    return session.url;
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private async withUserCommand<T>(userId: UserId, operation: () => Promise<T>): Promise<T> {
    const lockKey = `membership-subscription:${userId}`;
    if (this.storage.runExclusive) {
      return this.storage.runExclusive(lockKey, operation);
    }
    return localExclusive(`${this.agencyId}:${this.clientId}:${lockKey}`, operation);
  }

  private async beginCommand(input: {
    userId: UserId;
    kind: SubscriptionCommand["kind"];
    signature: string;
    requestedId?: string;
    planId?: string;
    billing?: Billing;
    atPeriodEnd?: boolean;
  }): Promise<SubscriptionCommand> {
    const current = await this.storage.get<SubscriptionCommand>(commandKey(input.userId));
    if (current?.signature === input.signature && current.kind === input.kind) return current;
    if (current && current.stage !== "completed") {
      throw new Error(
        "A previous membership change has an unfinished provider outcome. Retry that change before starting another.",
      );
    }
    const ts = now();
    return this.saveCommand({
      id: operationId(input.requestedId),
      signature: input.signature,
      kind: input.kind,
      stage: "pending",
      userId: input.userId,
      planId: input.planId,
      billing: input.billing,
      atPeriodEnd: input.atPeriodEnd,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  private async saveCommand(command: SubscriptionCommand): Promise<SubscriptionCommand> {
    const next = { ...command, updatedAt: now() };
    await this.storage.set(commandKey(command.userId), next);
    return next;
  }

  private providerKey(command: SubscriptionCommand, step: string): string {
    return [
      "memberships",
      this.agencyId,
      this.clientId,
      command.userId,
      command.id,
      step,
    ].join(":");
  }

  private async persistFreeSubscription(
    userId: UserId,
    existing: Subscription | null,
    planId: string,
    billing: Billing,
  ): Promise<Subscription> {
    const ts = now();
    const subscription: Subscription = {
      id: existing?.id ?? makeId("sub"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      endCustomerUserId: existing?.endCustomerUserId ?? userId,
      planId,
      stripeCustomerId: existing?.stripeCustomerId,
      stripeSubscriptionId: undefined,
      billing,
      status: "active",
      currentPeriodEnd: undefined,
      cancelAtPeriodEnd: false,
      trialEndsAt: undefined,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    await this.persist(subscription);
    if (!existing || existing.status === "canceled") {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "membership.subscription_started",
        { subscriptionId: subscription.id, userId: subscription.endCustomerUserId, planId, billing },
      );
    } else if (
      existing.planId !== planId ||
      existing.billing !== billing ||
      existing.status !== subscription.status
    ) {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "membership.subscription_changed",
        {
          subscriptionId: subscription.id,
          userId: subscription.endCustomerUserId,
          oldStatus: existing.status,
          newStatus: subscription.status,
          oldPlanId: existing.planId,
          newPlanId: planId,
        },
      );
    }
    return subscription;
  }

  private async logSubscribe(
    command: SubscriptionCommand,
    subscription: Subscription,
    email: string,
    planName: string,
    changed: boolean,
  ): Promise<void> {
    await this.activity.logActivity({
      idempotencyKey: this.providerKey(command, "activity"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: subscription.endCustomerUserId,
      category: "memberships",
      action: changed ? "membership.subscription_changed" : "membership.subscription_started",
      message: changed
        ? `${email} changed membership to ${planName}.`
        : `${email} subscribed to ${planName}${subscription.stripeSubscriptionId ? "" : " (free tier)"}.`,
      metadata: {
        subscriptionId: subscription.id,
        planId: subscription.planId,
        billing: subscription.billing,
        operationId: command.id,
      },
    });
  }

  private async upsertFromStripeForUser(
    userId: UserId,
    planId: string,
    billing: Billing,
    stripeSub: StripeSubscription,
  ): Promise<Subscription> {
    assertProviderSubscription(stripeSub);
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
    if (
      existing && (
        existing.status !== next.status ||
        existing.planId !== next.planId ||
        existing.billing !== next.billing
      )
    ) {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "membership.subscription_changed",
        {
          subscriptionId: next.id,
          userId,
          oldStatus: existing.status,
          newStatus: next.status,
          oldPlanId: existing.planId,
          newPlanId: next.planId,
        },
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
    assertSubscription(sub);
    const plan = await this.plans.get(sub.planId);
    if (!plan) throw new Error(`planId: plan ${sub.planId} does not exist in this install`);
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

  private async logCancel(sub: Subscription, atPeriodEnd: boolean, operationId?: string): Promise<void> {
    await this.activity.logActivity({
      idempotencyKey: operationId ? `memberships:${this.agencyId}:${this.clientId}:${sub.endCustomerUserId}:${operationId}:cancel-activity` : undefined,
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
