// Per-install billing helpers.
//
// Lifted from `02 felicias aqua portal work/src/portal/server/billing.ts`
// and rewired:
//   - `orgId` → `clientId` (ecommerce installs are per-client)
//   - PLANS registry stays as data — agencies can define their own plan
//     tiers for their client portals
//   - Subscription state lives on the per-install storage slice rather
//     than `org.subscription`
//
// **Vestigial** — see chapter §"Vestigial state". The 02 implementation
// gates Aqua's own SaaS features by org plan; in 04 every agency picks
// the features they offer their clients via the per-install settings on
// each plugin. This module is preserved for shape compatibility while
// the chief commander decides whether to retain it or move to a future
// `@aqua/plugin-saas-billing`.

import { now } from "../lib/time";
import type { ClientId } from "../lib/tenancy";
import type { StoragePort } from "./ports";

export type PlanId = "free" | "starter" | "pro" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;          // pence/cents
  features: string[];
}

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

export interface Subscription {
  planId: PlanId;
  status: SubscriptionStatus;
  startedAt: number;
  renewsAt?: number;
  canceledAt?: number;
  stripeSubId?: string;
  stripeCustomerId?: string;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    features: ["dashboard"],
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 0,
    features: ["dashboard", "products", "orders"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 4900,
    features: ["dashboard", "products", "orders", "variants", "discounts", "subscriptions"],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: 19900,
    features: [
      "dashboard", "products", "orders", "variants", "discounts", "subscriptions",
      "multiCurrency", "downloadDelivery", "licenseKeys", "auditLog",
    ],
  },
};

const SUBSCRIPTION_KEY_PREFIX = "subscription:";

export class BillingService {
  constructor(private storage: StoragePort) {}

  private subKey(clientId: ClientId): string {
    return `${SUBSCRIPTION_KEY_PREFIX}${clientId}`;
  }

  listPlans(): Plan[] {
    return Object.values(PLANS);
  }

  getPlan(id: PlanId): Plan | undefined {
    return PLANS[id];
  }

  async getSubscription(clientId: ClientId): Promise<Subscription | null> {
    const stored = await this.storage.get<Subscription>(this.subKey(clientId));
    return stored ?? null;
  }

  async setSubscription(
    clientId: ClientId,
    planId: PlanId,
    status: SubscriptionStatus = "active",
  ): Promise<Subscription> {
    const existing = await this.getSubscription(clientId);
    const sub: Subscription = {
      planId,
      status,
      startedAt: existing?.startedAt ?? now(),
      renewsAt: existing?.renewsAt,
      stripeSubId: existing?.stripeSubId,
      stripeCustomerId: existing?.stripeCustomerId,
    };
    await this.storage.set(this.subKey(clientId), sub);
    return sub;
  }

  async cancelSubscription(clientId: ClientId): Promise<Subscription | null> {
    const existing = await this.getSubscription(clientId);
    if (!existing) return null;
    const sub: Subscription = { ...existing, status: "canceled", canceledAt: now() };
    await this.storage.set(this.subKey(clientId), sub);
    return sub;
  }

  // Feature-flag check. Falls back to "starter" when no subscription —
  // every install gets the free tier by default.
  async hasFeature(clientId: ClientId, flag: string): Promise<boolean> {
    const sub = await this.getSubscription(clientId);
    const planId: PlanId = sub?.status === "active" || sub?.status === "trialing" ? sub.planId : "starter";
    const plan = PLANS[planId];
    return plan.features.includes(flag);
  }

  async listFeatures(clientId: ClientId): Promise<string[]> {
    const sub = await this.getSubscription(clientId);
    const planId: PlanId = sub?.status === "active" || sub?.status === "trialing" ? sub.planId : "starter";
    return [...PLANS[planId].features];
  }
}
