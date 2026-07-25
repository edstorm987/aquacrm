// Memberships domain types. Persisted under per-install plugin storage.
//
// All three entities scope to (agencyId, clientId): a Plan defined for
// Felicia's store doesn't appear in another client's store. Per-end-
// customer subscriptions add `endCustomerUserId` (foundation Users).
//
// Currency is stored as ISO 4217 strings. Prices are integer cents
// (£12.50 → 1250) — never use floats for money.

import type { AgencyId, ClientId, UserId } from "./tenancy";

// ─── Plan ─────────────────────────────────────────────────────────────────

export type Currency = "usd" | "gbp" | "eur";

export type PlanStatus = "active" | "archived";

export interface Plan {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  name: string;
  description?: string;
  priceMonthly: number;            // cents
  priceAnnual: number;             // cents (0 = monthly-only plan)
  currency: Currency;
  stripePriceIdMonthly?: string;   // Stripe Price.id, set after sync
  stripePriceIdAnnual?: string;
  features: string[];              // bullet copy for paywall
  benefitIds: string[];            // FK into Benefit
  status: PlanStatus;
  order: number;                   // display order (low → high)
  trialDays?: number;              // optional free trial length
  createdAt: number;
  updatedAt: number;
}

export interface CreatePlanInput {
  name: string;
  description?: string;
  priceMonthly: number;
  priceAnnual?: number;
  currency: Currency;
  features?: string[];
  benefitIds?: string[];
  trialDays?: number;
  order?: number;
}

export interface UpdatePlanPatch {
  name?: string;
  description?: string;
  priceMonthly?: number;
  priceAnnual?: number;
  currency?: Currency;
  features?: string[];
  benefitIds?: string[];
  trialDays?: number;
  order?: number;
  status?: PlanStatus;
  stripePriceIdMonthly?: string;
  stripePriceIdAnnual?: string;
}

// ─── Benefit ─────────────────────────────────────────────────────────────

export type BenefitCategory = "discount" | "content" | "perk" | "other";
export type BenefitStatus = "active" | "archived";

export interface Benefit {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  label: string;
  description?: string;
  category: BenefitCategory;
  // For category === "discount": percentOff is applied to ecommerce orders
  // when the customer holds an active subscription that links this benefit.
  percentOff?: number;
  // For category === "content": metadata pointer (gating + content lookup
  // is the storefront's job — this is just a hint).
  contentRef?: string;
  status: BenefitStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CreateBenefitInput {
  label: string;
  description?: string;
  category: BenefitCategory;
  percentOff?: number;
  contentRef?: string;
}

export interface UpdateBenefitPatch {
  label?: string;
  description?: string;
  category?: BenefitCategory;
  percentOff?: number;
  contentRef?: string;
  status?: BenefitStatus;
}

// ─── Subscription ────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "paused"
  | "incomplete";

export type Billing = "monthly" | "annual";

export interface Subscription {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  endCustomerUserId: UserId;
  planId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  billing: Billing;
  status: SubscriptionStatus;
  // ISO 8601 — set whenever Stripe reports current_period_end
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  trialEndsAt?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SubscribeInput {
  endCustomerUserId: UserId;
  planId: string;
  billing: Billing;
  successUrl: string;
  cancelUrl: string;
}

export interface CancelInput {
  endCustomerUserId: UserId;
  atPeriodEnd: boolean;
}

// ─── Webhook event marker ────────────────────────────────────────────────
//
// We dedupe Stripe events on `id`. The foundation's plugin storage holds
// a small index `webhook/seen/<eventId>` we read+write inside the
// WebhookService. Seven days of retention is enough — Stripe retries
// at most for 72 hours (plus we always idempotently upsert by Stripe
// subscription id, so a missed-then-replayed event still ends up in
// the right state).

export interface WebhookEventSeen {
  id: string;
  type: string;
  receivedAt: number;
}
