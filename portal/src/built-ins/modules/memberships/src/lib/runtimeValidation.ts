import type {
  Benefit,
  Billing,
  CancelInput,
  CreateBenefitInput,
  CreatePlanInput,
  Plan,
  SubscribeInput,
  Subscription,
  UpdateBenefitPatch,
  UpdatePlanPatch,
} from "./domain";

const PLAN_CREATE_FIELDS = [
  "name", "description", "priceMonthly", "priceAnnual", "currency", "features",
  "benefitIds", "trialDays", "order",
] as const;
const PLAN_PATCH_FIELDS = [
  ...PLAN_CREATE_FIELDS, "status", "stripePriceIdMonthly", "stripePriceIdAnnual",
] as const;
const BENEFIT_CREATE_FIELDS = ["label", "description", "category", "percentOff", "contentRef"] as const;
const BENEFIT_PATCH_FIELDS = [...BENEFIT_CREATE_FIELDS, "status"] as const;
const SUBSCRIBE_FIELDS = [
  "endCustomerUserId", "planId", "billing", "successUrl", "cancelUrl", "operationId",
] as const;
const CANCEL_FIELDS = ["endCustomerUserId", "atPeriodEnd", "operationId"] as const;

const CURRENCIES = new Set(["usd", "gbp", "eur"]);
const PLAN_STATUSES = new Set(["active", "archived"]);
const BENEFIT_CATEGORIES = new Set(["discount", "content", "perk", "other"]);
const BENEFIT_STATUSES = new Set(["active", "archived"]);
const SUBSCRIPTION_STATUSES = new Set([
  "trialing", "active", "past_due", "canceled", "paused", "incomplete",
]);
const BILLING = new Set(["monthly", "annual"]);
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

function assertTextArray(value: unknown, field: string, maxItems: number): void {
  if (!Array.isArray(value) || value.length > maxItems) fail(field, `must be an array of at most ${maxItems} values`);
  value.forEach((item, index) => assertText(item, `${field}[${index}]`, 240, true));
}

function assertUniqueIds(value: unknown, field: string, maxItems: number): void {
  assertTextArray(value, field, maxItems);
  if (new Set(value as string[]).size !== (value as string[]).length) fail(field, "must not contain duplicates");
}

function assertUrl(value: unknown, field: string): void {
  assertText(value, field, 2_048, true);
  let parsed: URL;
  try { parsed = new URL(value as string); }
  catch { fail(field, "must be a valid URL"); }
  if (!new Set(["http:", "https:", "about:"]).has(parsed.protocol)) {
    fail(field, "must use http, https or about");
  }
}

function assertIsoDate(value: unknown, field: string): void {
  if (value === undefined) return;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(field, "must be a valid ISO date");
}

export function assertCreatePlanInput(input: CreatePlanInput): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("plan", "must be an object");
  assertAllowedKeys(input, PLAN_CREATE_FIELDS, "plan");
  assertText(input.name, "name", 160, true);
  assertText(input.description, "description", 4_000);
  assertInteger(input.priceMonthly, "priceMonthly", 0, MAX_MONEY_CENTS);
  assertOptionalInteger(input.priceAnnual, "priceAnnual", 0, MAX_MONEY_CENTS);
  assertEnum(input.currency, "currency", CURRENCIES);
  if (input.features !== undefined) assertTextArray(input.features, "features", 100);
  if (input.benefitIds !== undefined) assertUniqueIds(input.benefitIds, "benefitIds", 100);
  assertOptionalInteger(input.trialDays, "trialDays", 0, 365);
  assertOptionalInteger(input.order, "order", 0, 1_000_000);
}

export function assertUpdatePlanPatch(patch: UpdatePlanPatch): void {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) fail("patch", "must be an object");
  assertAllowedKeys(patch, PLAN_PATCH_FIELDS, "patch");
}

export function assertPlan(plan: Plan): void {
  assertText(plan.id, "id", 200, true);
  assertText(plan.agencyId, "agencyId", 200, true);
  assertText(plan.clientId, "clientId", 200, true);
  assertText(plan.name, "name", 160, true);
  assertText(plan.description, "description", 4_000);
  assertInteger(plan.priceMonthly, "priceMonthly", 0, MAX_MONEY_CENTS);
  assertInteger(plan.priceAnnual, "priceAnnual", 0, MAX_MONEY_CENTS);
  assertEnum(plan.currency, "currency", CURRENCIES);
  assertTextArray(plan.features, "features", 100);
  assertUniqueIds(plan.benefitIds, "benefitIds", 100);
  assertEnum(plan.status, "status", PLAN_STATUSES);
  assertInteger(plan.order, "order", 0, 1_000_000);
  assertOptionalInteger(plan.trialDays, "trialDays", 0, 365);
  assertText(plan.stripePriceIdMonthly, "stripePriceIdMonthly", 255);
  assertText(plan.stripePriceIdAnnual, "stripePriceIdAnnual", 255);
  assertInteger(plan.createdAt, "createdAt", 0, MAX_EPOCH_MS);
  assertInteger(plan.updatedAt, "updatedAt", 0, MAX_EPOCH_MS);
}

export function assertCreateBenefitInput(input: CreateBenefitInput): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("benefit", "must be an object");
  assertAllowedKeys(input, BENEFIT_CREATE_FIELDS, "benefit");
}

export function assertUpdateBenefitPatch(patch: UpdateBenefitPatch): void {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) fail("patch", "must be an object");
  assertAllowedKeys(patch, BENEFIT_PATCH_FIELDS, "patch");
}

export function assertBenefit(benefit: Benefit): void {
  assertText(benefit.id, "id", 200, true);
  assertText(benefit.agencyId, "agencyId", 200, true);
  assertText(benefit.clientId, "clientId", 200, true);
  assertText(benefit.label, "label", 160, true);
  assertText(benefit.description, "description", 4_000);
  assertEnum(benefit.category, "category", BENEFIT_CATEGORIES);
  assertEnum(benefit.status, "status", BENEFIT_STATUSES);
  if (benefit.category === "discount") {
    assertInteger(benefit.percentOff, "percentOff", 1, 100);
    if (benefit.contentRef !== undefined) fail("contentRef", "is only valid for content benefits");
  } else if (benefit.category === "content") {
    if (benefit.percentOff !== undefined) fail("percentOff", "is only valid for discount benefits");
    assertText(benefit.contentRef, "contentRef", 1_000, true);
  } else {
    if (benefit.percentOff !== undefined) fail("percentOff", "is only valid for discount benefits");
    if (benefit.contentRef !== undefined) fail("contentRef", "is only valid for content benefits");
  }
  assertInteger(benefit.createdAt, "createdAt", 0, MAX_EPOCH_MS);
  assertInteger(benefit.updatedAt, "updatedAt", 0, MAX_EPOCH_MS);
}

export function assertSubscribeInput(input: SubscribeInput): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("subscription", "must be an object");
  assertAllowedKeys(input, SUBSCRIBE_FIELDS, "subscription");
  assertText(input.endCustomerUserId, "endCustomerUserId", 200, true);
  assertText(input.planId, "planId", 200, true);
  assertEnum(input.billing, "billing", BILLING);
  assertUrl(input.successUrl, "successUrl");
  assertUrl(input.cancelUrl, "cancelUrl");
  assertText(input.operationId, "operationId", 160);
}

export function assertCancelInput(input: CancelInput): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("cancellation", "must be an object");
  assertAllowedKeys(input, CANCEL_FIELDS, "cancellation");
  assertText(input.endCustomerUserId, "endCustomerUserId", 200, true);
  if (typeof input.atPeriodEnd !== "boolean") fail("atPeriodEnd", "must be a boolean");
  assertText(input.operationId, "operationId", 160);
}

export function assertBilling(value: unknown): asserts value is Billing {
  assertEnum(value, "billing", BILLING);
}

export function assertSubscription(subscription: Subscription): void {
  assertText(subscription.id, "id", 200, true);
  assertText(subscription.agencyId, "agencyId", 200, true);
  assertText(subscription.clientId, "clientId", 200, true);
  assertText(subscription.endCustomerUserId, "endCustomerUserId", 200, true);
  assertText(subscription.planId, "planId", 200, true);
  assertText(subscription.stripeCustomerId, "stripeCustomerId", 255);
  assertText(subscription.stripeSubscriptionId, "stripeSubscriptionId", 255);
  assertEnum(subscription.billing, "billing", BILLING);
  assertEnum(subscription.status, "status", SUBSCRIPTION_STATUSES);
  assertIsoDate(subscription.currentPeriodEnd, "currentPeriodEnd");
  assertIsoDate(subscription.trialEndsAt, "trialEndsAt");
  if (typeof subscription.cancelAtPeriodEnd !== "boolean") fail("cancelAtPeriodEnd", "must be a boolean");
  assertInteger(subscription.createdAt, "createdAt", 0, MAX_EPOCH_MS);
  assertInteger(subscription.updatedAt, "updatedAt", 0, MAX_EPOCH_MS);
}

export function assertProviderId(value: unknown, field: string): void {
  assertText(value, field, 255, true);
}

export function assertProviderUrl(value: unknown, field: string): void {
  assertUrl(value, field);
}

export function assertProviderSubscription(value: {
  id: unknown;
  customerId: unknown;
  status: unknown;
  currentPeriodEnd?: unknown;
  cancelAtPeriodEnd: unknown;
  trialEnd?: unknown;
  items: unknown;
}): void {
  assertProviderId(value.id, "providerSubscription.id");
  assertProviderId(value.customerId, "providerSubscription.customerId");
  assertEnum(value.status, "providerSubscription.status", new Set([
    "trialing", "active", "past_due", "unpaid", "canceled", "paused", "incomplete", "incomplete_expired",
  ]));
  if (typeof value.cancelAtPeriodEnd !== "boolean") fail("providerSubscription.cancelAtPeriodEnd", "must be a boolean");
  for (const [field, timestamp] of [["currentPeriodEnd", value.currentPeriodEnd], ["trialEnd", value.trialEnd]] as const) {
    if (timestamp !== undefined && (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 253_402_300_799)) {
      fail(`providerSubscription.${field}`, "must be a valid Unix timestamp");
    }
  }
  if (!Array.isArray(value.items) || value.items.some(item => {
    return !item || typeof item !== "object" || typeof (item as { priceId?: unknown }).priceId !== "string" || !(item as { priceId: string }).priceId.trim();
  })) {
    fail("providerSubscription.items", "must contain valid price ids");
  }
}
