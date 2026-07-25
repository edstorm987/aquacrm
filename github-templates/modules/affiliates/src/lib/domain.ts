// Affiliates domain. Persisted under per-install plugin storage.
//
// Scope: per-client. Felicia's affiliate pool isn't shared with other
// agency clients. `endCustomerUserId` is the foundation Users.id of
// the end-customer who signed up to refer; it's the affiliate's
// portal identity.

import type { AgencyId, ClientId, UserId } from "./tenancy";

// ─── Affiliate ───────────────────────────────────────────────────────────

export type AffiliateStatus = "pending" | "active" | "suspended" | "removed";

export interface Affiliate {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  endCustomerUserId: UserId;
  displayName: string;
  status: AffiliateStatus;
  // Override the agency-default commission rate. 10 = 10%. Fallback to
  // the install's `defaultCommissionPercent` setting when undefined.
  defaultCommissionPercent?: number;
  payoutEmail: string;                // PayPal-style fallback; Stripe Connect when onboarded
  totalReferred: number;              // running counter — incremented on Attribution.recordOrder
  lifetimeEarnings: number;           // cents — sum of paid-out attributions
  // Stripe Connect Express (R12). Absent until the affiliate clicks
  // "Set up payouts via Stripe" and completes the hosted flow.
  stripeAccountId?: string;
  // Mirrors Stripe's `details_submitted` + `charges_enabled` + `payouts_enabled`
  // collapsed into a single value. `pending` until the affiliate finishes the
  // hosted flow; `complete` once `charges_enabled && payouts_enabled`; `restricted`
  // when Stripe needs more info (KYC / identity verification etc).
  stripeOnboardingStatus?: StripeOnboardingStatus;
  joinedAt: number;
  lastActiveAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type StripeOnboardingStatus = "pending" | "complete" | "restricted";

export interface CreateAffiliateInput {
  endCustomerUserId: UserId;
  displayName: string;
  payoutEmail: string;
  defaultCommissionPercent?: number;
}

export interface UpdateAffiliatePatch {
  displayName?: string;
  payoutEmail?: string;
  status?: AffiliateStatus;
  defaultCommissionPercent?: number;
  stripeAccountId?: string;
  stripeOnboardingStatus?: StripeOnboardingStatus;
}

// ─── ReferralCode ────────────────────────────────────────────────────────

export type ReferralCodeStatus = "active" | "archived";

export interface ReferralCode {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  affiliateId: string;
  code: string;                       // human-readable, upper-case
  destinationPath: string;            // where the link lands; defaults to "/"
  // Override the affiliate's default for this code (e.g. a higher rate
  // for an influencer launch). Fallback chain:
  //   commissionPercentOverride ?? affiliate.defaultCommissionPercent ?? install.defaultCommissionPercent
  commissionPercentOverride?: number;
  status: ReferralCodeStatus;
  redemptionCount: number;
  createdAt: number;
}

export interface CreateReferralCodeInput {
  affiliateId: string;
  code?: string;                      // optional — service generates if absent
  destinationPath?: string;
  commissionPercentOverride?: number;
}

export interface UpdateReferralCodePatch {
  destinationPath?: string;
  commissionPercentOverride?: number;
  status?: ReferralCodeStatus;
}

// ─── Attribution ─────────────────────────────────────────────────────────

export type AttributionStatus = "pending" | "approved" | "paid" | "reversed";

export interface Attribution {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  orderId: string;
  affiliateId: string;
  referralCodeId: string;
  // Commission earned on this order, in cents. Computed as
  //   round(orderSubtotal * effectiveCommissionPercent / 100).
  amountCents: number;
  // Effective rate at the moment of the order, persisted so later
  // commission-rate changes don't retroactively alter past attributions.
  commissionPercentSnapshot: number;
  status: AttributionStatus;
  createdAt: number;
  approvedAt?: number;
  paidAt?: number;
  reversedAt?: number;
  payoutId?: string;                  // set when rolled into a Payout
}

// ─── Payout ──────────────────────────────────────────────────────────────

export type PayoutStatus = "scheduled" | "in_progress" | "completed" | "failed";
export type PayoutMethod = "paypal" | "manual" | "stripe-connect";

export interface Payout {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  affiliateId: string;
  amountCents: number;
  attributionIds: string[];           // which orders this payout settles
  method: PayoutMethod;
  externalRef?: string;               // PayPal txn id, Stripe transfer id, etc.
  status: PayoutStatus;
  scheduledFor: number;
  completedAt?: number;
  failureReason?: string;
  createdAt: number;
}

export interface SchedulePayoutInput {
  affiliateId: string;
  method?: PayoutMethod;              // defaults to install setting
  scheduledFor?: number;              // epoch ms; defaults to now
}

export interface MarkPayoutPaidInput {
  externalRef: string;
  method?: PayoutMethod;
}

// ─── Listing filters ─────────────────────────────────────────────────────

export interface AffiliateFilter {
  status?: AffiliateStatus;
  query?: string;                     // free-text against displayName / payoutEmail
}

export interface ReferralCodeFilter {
  affiliateId?: string;
  status?: ReferralCodeStatus;
  query?: string;
}

export interface AttributionFilter {
  affiliateId?: string;
  orderId?: string;
  status?: AttributionStatus;
}

export interface PayoutFilter {
  affiliateId?: string;
  status?: PayoutStatus;
}
