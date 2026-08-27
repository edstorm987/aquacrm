import type {
  Affiliate,
  CreateAffiliateInput,
  CreateReferralCodeInput,
  MarkPayoutPaidInput,
  Payout,
  ReferralCode,
  SchedulePayoutInput,
  UpdateAffiliatePatch,
  UpdateReferralCodePatch,
} from "./domain";

const AFFILIATE_CREATE_FIELDS = [
  "endCustomerUserId", "displayName", "payoutEmail", "defaultCommissionPercent",
] as const;
const AFFILIATE_PATCH_FIELDS = [
  "displayName", "payoutEmail", "status", "defaultCommissionPercent", "stripeAccountId",
  "stripeOnboardingStatus",
] as const;
const CODE_CREATE_FIELDS = [
  "affiliateId", "code", "destinationPath", "commissionPercentOverride",
] as const;
const CODE_PATCH_FIELDS = ["destinationPath", "commissionPercentOverride", "status"] as const;
const SCHEDULE_FIELDS = ["affiliateId", "currency", "method", "scheduledFor", "operationId"] as const;
const MARK_PAID_FIELDS = ["externalRef", "method"] as const;

export const AFFILIATE_CURRENCIES = [
  "gbp", "eur", "usd", "cad", "aud", "nzd", "chf", "sek", "nok", "dkk", "jpy", "sgd", "hkd", "aed",
] as const;
const CURRENCIES = new Set<string>(AFFILIATE_CURRENCIES);
const AFFILIATE_STATUSES = new Set(["pending", "active", "suspended", "removed"]);
const ONBOARDING_STATUSES = new Set(["pending", "complete", "restricted"]);
const CODE_STATUSES = new Set(["active", "archived"]);
const PAYOUT_METHODS = new Set(["paypal", "manual", "stripe-connect"]);
const PAYOUT_STATUSES = new Set(["scheduled", "in_progress", "completed", "failed"]);
const MAX_MONEY_CENTS = 1_000_000_000;
const MAX_EPOCH_MS = 253_402_300_799_999;

function fail(field: string, message: string): never {
  throw new Error(`${field}: ${message}`);
}

function assertAllowedKeys(value: object, allowed: readonly string[], field: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter(key => !allowedSet.has(key));
  if (unknown.length > 0) fail(field, `unsupported field(s): ${unknown.join(", ")}`);
}

function assertText(value: unknown, field: string, max: number, required = false): void {
  if (value === undefined) {
    if (required) fail(field, "is required");
    return;
  }
  if (typeof value !== "string") fail(field, "must be a string");
  const length = value.trim().length;
  if (required && length === 0) fail(field, "must not be blank");
  if (length > max) fail(field, `must be at most ${max} characters`);
}

function assertInteger(value: unknown, field: string, min: number, max: number): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(field, `must be a whole number from ${min} to ${max}`);
  }
}

function assertOptionalInteger(value: unknown, field: string, min: number, max: number): void {
  if (value !== undefined) assertInteger(value, field, min, max);
}

function assertEnum(value: unknown, field: string, allowed: Set<string>): void {
  if (typeof value !== "string" || !allowed.has(value)) {
    fail(field, `must be one of ${[...allowed].join(", ")}`);
  }
}

function assertCommission(value: unknown, field: string): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    fail(field, "must be a finite percentage from 0 to 100");
  }
}

function assertEmail(value: unknown, field: string): void {
  assertText(value, field, 320, true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string)) fail(field, "must be a valid email address");
}

export function assertSupportedCurrency(value: unknown, field = "currency"): asserts value is typeof AFFILIATE_CURRENCIES[number] {
  if (typeof value !== "string" || !CURRENCIES.has(value.trim().toLowerCase())) {
    fail(field, `must be one of ${AFFILIATE_CURRENCIES.join(", ")}`);
  }
}

export function normalizeSupportedCurrency(value: unknown, field = "currency"): string {
  assertSupportedCurrency(value, field);
  return (value as string).trim().toLowerCase();
}

export function assertCreateAffiliateInput(input: CreateAffiliateInput): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("affiliate", "must be an object");
  assertAllowedKeys(input, AFFILIATE_CREATE_FIELDS, "affiliate");
  assertText(input.endCustomerUserId, "endCustomerUserId", 200, true);
  assertText(input.displayName, "displayName", 160, true);
  assertEmail(input.payoutEmail, "payoutEmail");
  assertCommission(input.defaultCommissionPercent, "defaultCommissionPercent");
}

export function assertUpdateAffiliatePatch(patch: UpdateAffiliatePatch): void {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) fail("patch", "must be an object");
  assertAllowedKeys(patch, AFFILIATE_PATCH_FIELDS, "patch");
}

export function assertAffiliate(affiliate: Affiliate): void {
  assertText(affiliate.id, "id", 200, true);
  assertText(affiliate.agencyId, "agencyId", 200, true);
  assertText(affiliate.clientId, "clientId", 200, true);
  assertText(affiliate.endCustomerUserId, "endCustomerUserId", 200, true);
  assertText(affiliate.displayName, "displayName", 160, true);
  assertEnum(affiliate.status, "status", AFFILIATE_STATUSES);
  assertCommission(affiliate.defaultCommissionPercent, "defaultCommissionPercent");
  assertEmail(affiliate.payoutEmail, "payoutEmail");
  assertInteger(affiliate.totalReferred, "totalReferred", 0, Number.MAX_SAFE_INTEGER);
  assertInteger(affiliate.lifetimeEarnings, "lifetimeEarnings", 0, MAX_MONEY_CENTS);
  for (const [currency, amount] of Object.entries(affiliate.lifetimeEarningsByCurrency ?? {})) {
    assertSupportedCurrency(currency, `lifetimeEarningsByCurrency.${currency}`);
    assertInteger(amount, `lifetimeEarningsByCurrency.${currency}`, 0, MAX_MONEY_CENTS);
  }
  assertText(affiliate.stripeAccountId, "stripeAccountId", 255);
  if (affiliate.stripeOnboardingStatus !== undefined) {
    assertEnum(affiliate.stripeOnboardingStatus, "stripeOnboardingStatus", ONBOARDING_STATUSES);
  }
  assertInteger(affiliate.joinedAt, "joinedAt", 0, MAX_EPOCH_MS);
  assertOptionalInteger(affiliate.lastActiveAt, "lastActiveAt", 0, MAX_EPOCH_MS);
  assertInteger(affiliate.createdAt, "createdAt", 0, MAX_EPOCH_MS);
  assertInteger(affiliate.updatedAt, "updatedAt", 0, MAX_EPOCH_MS);
}

export function assertCreateReferralCodeInput(input: CreateReferralCodeInput): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("referralCode", "must be an object");
  assertAllowedKeys(input, CODE_CREATE_FIELDS, "referralCode");
  assertText(input.affiliateId, "affiliateId", 200, true);
  assertText(input.code, "code", 64);
  assertText(input.destinationPath, "destinationPath", 2_048);
  assertCommission(input.commissionPercentOverride, "commissionPercentOverride");
}

export function assertUpdateReferralCodePatch(patch: UpdateReferralCodePatch): void {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) fail("patch", "must be an object");
  assertAllowedKeys(patch, CODE_PATCH_FIELDS, "patch");
}

export function assertReferralCode(code: ReferralCode): void {
  assertText(code.id, "id", 200, true);
  assertText(code.agencyId, "agencyId", 200, true);
  assertText(code.clientId, "clientId", 200, true);
  assertText(code.affiliateId, "affiliateId", 200, true);
  assertText(code.code, "code", 64, true);
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(code.code)) fail("code", "must contain only A-Z, 0-9, underscore or hyphen");
  assertText(code.destinationPath, "destinationPath", 2_048, true);
  if (!code.destinationPath.startsWith("/") || code.destinationPath.startsWith("//")) {
    fail("destinationPath", "must be a site-relative path");
  }
  assertCommission(code.commissionPercentOverride, "commissionPercentOverride");
  assertEnum(code.status, "status", CODE_STATUSES);
  assertInteger(code.redemptionCount, "redemptionCount", 0, Number.MAX_SAFE_INTEGER);
  assertInteger(code.createdAt, "createdAt", 0, MAX_EPOCH_MS);
}

export function assertOrderForAttribution(order: {
  id: string; amountTotal: number; subtotal: number; currency: string; status: string; createdAt: number;
}): void {
  assertText(order.id, "order.id", 200, true);
  assertInteger(order.amountTotal, "order.amountTotal", 0, MAX_MONEY_CENTS);
  assertInteger(order.subtotal, "order.subtotal", 0, MAX_MONEY_CENTS);
  if (order.subtotal < order.amountTotal) fail("order.subtotal", "must be at least amountTotal");
  assertSupportedCurrency(order.currency, "order.currency");
  assertEnum(order.status, "order.status", new Set(["pending", "paid", "fulfilled", "shipped", "delivered", "refunded", "cancelled"]));
  assertInteger(order.createdAt, "order.createdAt", 0, MAX_EPOCH_MS);
}

export function assertCommissionRate(value: unknown, field: string): void {
  assertCommission(value, field);
}

export function assertSchedulePayoutInput(input: SchedulePayoutInput, defaultMethod: unknown): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("payout", "must be an object");
  assertAllowedKeys(input, SCHEDULE_FIELDS, "payout");
  assertText(input.affiliateId, "affiliateId", 200, true);
  if (input.currency !== undefined) assertSupportedCurrency(input.currency);
  assertEnum(input.method ?? defaultMethod, "method", PAYOUT_METHODS);
  assertOptionalInteger(input.scheduledFor, "scheduledFor", 0, MAX_EPOCH_MS);
  assertText(input.operationId, "operationId", 160);
}

export function assertMarkPayoutPaidInput(input: MarkPayoutPaidInput): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("payment", "must be an object");
  assertAllowedKeys(input, MARK_PAID_FIELDS, "payment");
  assertText(input.externalRef, "externalRef", 255, true);
  if (input.method !== undefined) assertEnum(input.method, "method", PAYOUT_METHODS);
}

export function assertPayout(payout: Payout): void {
  assertText(payout.id, "id", 200, true);
  assertText(payout.agencyId, "agencyId", 200, true);
  assertText(payout.clientId, "clientId", 200, true);
  assertText(payout.affiliateId, "affiliateId", 200, true);
  assertSupportedCurrency(payout.currency);
  assertInteger(payout.amountCents, "amountCents", 0, MAX_MONEY_CENTS);
  assertInteger(payout.grossAmountCents, "grossAmountCents", 0, MAX_MONEY_CENTS);
  assertInteger(payout.adjustmentAmountCents, "adjustmentAmountCents", 0, MAX_MONEY_CENTS);
  if (payout.amountCents !== payout.grossAmountCents - payout.adjustmentAmountCents) {
    fail("amountCents", "must equal grossAmountCents minus adjustmentAmountCents");
  }
  if (!Array.isArray(payout.attributionIds) || new Set(payout.attributionIds).size !== payout.attributionIds.length) {
    fail("attributionIds", "must be a unique array");
  }
  if (!Array.isArray(payout.adjustmentAttributionIds) || new Set(payout.adjustmentAttributionIds).size !== payout.adjustmentAttributionIds.length) {
    fail("adjustmentAttributionIds", "must be a unique array");
  }
  payout.attributionIds.forEach((id, index) => assertText(id, `attributionIds[${index}]`, 200, true));
  payout.adjustmentAttributionIds.forEach((id, index) => assertText(id, `adjustmentAttributionIds[${index}]`, 200, true));
  if (!payout.attributionAmounts || typeof payout.attributionAmounts !== "object" || Array.isArray(payout.attributionAmounts)) {
    fail("attributionAmounts", "must be an object");
  }
  if (!payout.adjustmentAmounts || typeof payout.adjustmentAmounts !== "object" || Array.isArray(payout.adjustmentAmounts)) {
    fail("adjustmentAmounts", "must be an object");
  }
  if (Object.keys(payout.attributionAmounts).sort().join("\0") !== [...payout.attributionIds].sort().join("\0")) {
    fail("attributionAmounts", "must contain exactly the attributionIds");
  }
  if (Object.keys(payout.adjustmentAmounts).sort().join("\0") !== [...payout.adjustmentAttributionIds].sort().join("\0")) {
    fail("adjustmentAmounts", "must contain exactly the adjustmentAttributionIds");
  }
  for (const [id, amount] of Object.entries(payout.attributionAmounts)) {
    assertInteger(amount, `attributionAmounts.${id}`, 1, MAX_MONEY_CENTS);
  }
  for (const [id, amount] of Object.entries(payout.adjustmentAmounts)) {
    assertInteger(amount, `adjustmentAmounts.${id}`, 1, MAX_MONEY_CENTS);
  }
  const gross = Object.values(payout.attributionAmounts).reduce((sum, amount) => sum + amount, 0);
  const adjustments = Object.values(payout.adjustmentAmounts).reduce((sum, amount) => sum + amount, 0);
  if (payout.grossAmountCents !== gross) fail("grossAmountCents", "must equal attributionAmounts");
  if (payout.adjustmentAmountCents !== adjustments) fail("adjustmentAmountCents", "must equal adjustmentAmounts");
  assertEnum(payout.method, "method", PAYOUT_METHODS);
  assertEnum(payout.status, "status", PAYOUT_STATUSES);
  assertInteger(payout.scheduledFor, "scheduledFor", 0, MAX_EPOCH_MS);
  assertInteger(payout.createdAt, "createdAt", 0, MAX_EPOCH_MS);
  if (payout.scheduledFor < payout.createdAt) fail("scheduledFor", "must not precede createdAt");
  assertOptionalInteger(payout.completedAt, "completedAt", payout.createdAt, MAX_EPOCH_MS);
  assertText(payout.externalRef, "externalRef", 255);
  assertText(payout.failureReason, "failureReason", 2_000);
}

export function assertProviderId(value: unknown, field: string): void {
  assertText(value, field, 255, true);
}
