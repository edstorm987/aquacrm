import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { buildMembershipsContainer } from "../src/built-ins/modules/memberships/src/server/index";
import type {
  ActivityLogPort as MembershipActivityPort,
  EventBusPort as MembershipEventPort,
  StoragePort as MembershipStoragePort,
  StripePort,
} from "../src/built-ins/modules/memberships/src/server/ports";
import { buildAffiliatesContainer } from "../src/built-ins/modules/affiliates/src/server/index";
import type {
  ActivityLogPort as AffiliateActivityPort,
  EcommerceOrderProjection,
  EventBusPort as AffiliateEventPort,
  StoragePort as AffiliateStoragePort,
} from "../src/built-ins/modules/affiliates/src/server/ports";

class MemoryStorage implements MembershipStoragePort, AffiliateStoragePort {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.data.get(key)) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.data.set(key, structuredClone(value)); }
  async del(key: string): Promise<void> { this.data.delete(key); }
  async list(prefix = ""): Promise<string[]> { return [...this.data.keys()].filter(key => key.startsWith(prefix)); }
}

function snapshot(storage: MemoryStorage): string {
  return JSON.stringify([...storage.data.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

async function rejectsWithoutMutation(
  storage: MemoryStorage,
  operation: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  const before = snapshot(storage);
  await assert.rejects(operation, pattern);
  assert.equal(snapshot(storage), before, `rejection ${pattern} must leave storage byte-identical`);
}

function membershipWorld() {
  const storage = new MemoryStorage();
  let stripePriceCalls = 0;
  const activity: MembershipActivityPort = {
    logActivity(input) { return { id: `activity-${Date.now()}`, ts: Date.now(), ...input }; },
    listActivity() { return []; },
  };
  const events: MembershipEventPort = { emit() {} };
  const unused = async (): Promise<never> => { throw new Error("unused provider method"); };
  const stripe: StripePort = {
    async createCustomer() { return { id: "cus_validation" }; },
    async retrieveCustomer() { return null; },
    createSubscription: unused,
    cancelSubscription: unused,
    async retrieveSubscription() { return null; },
    pauseSubscription: unused,
    resumeSubscription: unused,
    changeSubscriptionPlan: unused,
    async createCheckoutSession() { return { id: "cs_validation", url: "https://stripe.test/checkout" }; },
    createBillingPortalSession: unused,
    async createPrice() {
      stripePriceCalls += 1;
      return { id: `price_validation_${stripePriceCalls}`, productId: "prod_validation" };
    },
    async verifyWebhookSignature() { return null; },
  };
  const services = buildMembershipsContainer({
    agencyId: "agency_validation",
    clientId: "client_validation",
    storage,
    activity,
    events,
    stripe,
    tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
    user: {
      getUser(id) {
        return id === "member_validation"
          ? { id, agencyId: "agency_validation", clientId: "client_validation", email: "member@example.test", name: "Member" }
          : null;
      },
    },
    pluginInstalls: { getInstall() { return null; } },
  });
  return { storage, services, stripePriceCalls: () => stripePriceCalls };
}

test("Membership complete-row validation rejects invalid create and post-patch state before mutation", async () => {
  const world = membershipWorld();
  const invalidPlans: Array<[unknown, RegExp]> = [
    [{ name: " ", priceMonthly: 0, currency: "gbp" }, /name:/],
    [{ name: "NaN", priceMonthly: Number.NaN, currency: "gbp" }, /priceMonthly:/],
    [{ name: "Negative", priceMonthly: -1, currency: "gbp" }, /priceMonthly:/],
    [{ name: "Currency", priceMonthly: 0, currency: "zzz" }, /currency:/],
    [{ name: "Trial", priceMonthly: 0, currency: "gbp", trialDays: -1 }, /trialDays:/],
    [{ name: "Order", priceMonthly: 0, currency: "gbp", order: Number.POSITIVE_INFINITY }, /order:/],
    [{ name: "Features", priceMonthly: 0, currency: "gbp", features: [""] }, /features\[0\]:/],
    [{ name: "Unknown", priceMonthly: 0, currency: "gbp", surprise: true }, /unsupported field/],
  ];
  for (const [input, pattern] of invalidPlans) {
    await rejectsWithoutMutation(world.storage, () => world.services.plans.create(input as never, "owner"), pattern);
  }
  assert.equal(world.stripePriceCalls(), 0, "invalid rows never reach Stripe price creation");

  const discount = await world.services.benefits.create({
    label: "Member discount",
    category: "discount",
    percentOff: 20,
  }, "owner");
  const plan = await world.services.plans.create({
    name: "Valid",
    priceMonthly: 0,
    currency: "gbp",
    benefitIds: [discount.id],
  }, "owner");

  const invalidPlanPatches: Array<[unknown, RegExp]> = [
    [{ name: "" }, /name:/],
    [{ priceAnnual: -1 }, /priceAnnual:/],
    [{ currency: "zzz" }, /currency:/],
    [{ trialDays: 366 }, /trialDays:/],
    [{ status: "invented" }, /status:/],
    [{ benefitIds: ["missing"] }, /benefitIds:/],
    [{ createdAt: 0 }, /unsupported field/],
  ];
  for (const [patch, pattern] of invalidPlanPatches) {
    await rejectsWithoutMutation(world.storage, () => world.services.plans.update(plan.id, patch as never, "owner"), pattern);
  }

  const invalidBenefits: Array<[unknown, RegExp]> = [
    [{ label: "", category: "perk" }, /label:/],
    [{ label: "Invented", category: "invented" }, /category:/],
    [{ label: "Huge", category: "discount", percentOff: 500 }, /percentOff:/],
    [{ label: "Missing ref", category: "content" }, /contentRef:/],
    [{ label: "Wrong relation", category: "other", percentOff: 10 }, /percentOff:/],
  ];
  for (const [input, pattern] of invalidBenefits) {
    await rejectsWithoutMutation(world.storage, () => world.services.benefits.create(input as never, "owner"), pattern);
  }
  await rejectsWithoutMutation(
    world.storage,
    () => world.services.benefits.update(discount.id, { category: "content" } as never, "owner"),
    /percentOff:/,
  );

  const invalidSubscriptions: Array<[unknown, RegExp]> = [
    [{ endCustomerUserId: "", planId: plan.id, billing: "monthly", successUrl: "https://ok.test", cancelUrl: "https://ok.test" }, /endCustomerUserId:/],
    [{ endCustomerUserId: "member_validation", planId: plan.id, billing: "weekly", successUrl: "https://ok.test", cancelUrl: "https://ok.test" }, /billing:/],
    [{ endCustomerUserId: "member_validation", planId: plan.id, billing: "monthly", successUrl: "javascript:bad", cancelUrl: "https://ok.test" }, /successUrl:/],
  ];
  for (const [input, pattern] of invalidSubscriptions) {
    await rejectsWithoutMutation(world.storage, () => world.services.subscriptions.subscribe(input as never), pattern);
  }
});

function affiliateWorld() {
  const storage = new MemoryStorage();
  const orders = new Map<string, EcommerceOrderProjection>();
  const activity: AffiliateActivityPort = {
    logActivity(input) { return { id: `activity-${Date.now()}`, ts: Date.now(), ...input }; },
    listActivity() { return []; },
  };
  const events: AffiliateEventPort = { emit() {} };
  const services = buildAffiliatesContainer({
    agencyId: "agency_aff_validation",
    clientId: "client_aff_validation",
    storage,
    activity,
    events,
    tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
    user: {
      getUser(id) {
        return id === "affiliate_user"
          ? { id, agencyId: "agency_aff_validation", clientId: "client_aff_validation", email: "affiliate@example.test", name: "Affiliate" }
          : null;
      },
    },
    pluginInstalls: { getInstall() { return null; } },
    ecommerceOrders: { getOrder(args) { return orders.get(args.orderId) ?? null; } },
  });
  return { storage, services, orders };
}

test("Affiliate runtime validation rejects invalid identities, rates, currency and payout state unchanged", async () => {
  const world = affiliateWorld();
  const invalidAffiliates: Array<[unknown, RegExp]> = [
    [{ endCustomerUserId: "", displayName: "Affiliate", payoutEmail: "a@example.test" }, /endCustomerUserId:/],
    [{ endCustomerUserId: "affiliate_user", displayName: "", payoutEmail: "a@example.test" }, /displayName:/],
    [{ endCustomerUserId: "affiliate_user", displayName: "Affiliate", payoutEmail: "bad" }, /payoutEmail:/],
    [{ endCustomerUserId: "affiliate_user", displayName: "Affiliate", payoutEmail: "a@example.test", defaultCommissionPercent: 250 }, /defaultCommissionPercent:/],
    [{ endCustomerUserId: "affiliate_user", displayName: "Affiliate", payoutEmail: "a@example.test", surprise: true }, /unsupported field/],
  ];
  for (const [input, pattern] of invalidAffiliates) {
    await rejectsWithoutMutation(world.storage, () => world.services.affiliates.enroll(input as never, "owner"), pattern);
  }

  const affiliate = await world.services.affiliates.enroll({
    endCustomerUserId: "affiliate_user",
    displayName: "Affiliate",
    payoutEmail: "affiliate@example.test",
    defaultCommissionPercent: 10,
  }, "owner");
  await world.services.affiliates.update(affiliate.id, { status: "active" }, "owner");
  for (const [patch, pattern] of [
    [{ status: "invented" }, /status:/],
    [{ defaultCommissionPercent: Number.NaN }, /defaultCommissionPercent:/],
    [{ defaultCommissionPercent: 101 }, /defaultCommissionPercent:/],
    [{ stripeOnboardingStatus: "invented" }, /stripeOnboardingStatus:/],
    [{ payoutEmail: "bad" }, /payoutEmail:/],
    [{ totalReferred: 10 }, /unsupported field/],
  ] as Array<[unknown, RegExp]>) {
    await rejectsWithoutMutation(world.storage, () => world.services.affiliates.update(affiliate.id, patch as never, "owner"), pattern);
  }

  const invalidCodes: Array<[unknown, RegExp]> = [
    [{ affiliateId: affiliate.id, code: "bad code" }, /code:/],
    [{ affiliateId: affiliate.id, code: "TOOHIGH", commissionPercentOverride: 250 }, /commissionPercentOverride:/],
    [{ affiliateId: affiliate.id, code: "REMOTE", destinationPath: "https://evil.test" }, /destinationPath:/],
  ];
  for (const [input, pattern] of invalidCodes) {
    await rejectsWithoutMutation(world.storage, () => world.services.codes.create(input as never, "owner"), pattern);
  }
  const code = await world.services.codes.create({ affiliateId: affiliate.id, code: "VALID10" }, "owner");
  await rejectsWithoutMutation(
    world.storage,
    () => world.services.codes.update(code.id, { status: "invented" } as never, "owner"),
    /status:/,
  );

  world.orders.set("order_invalid_currency", {
    id: "order_invalid_currency",
    agencyId: "agency_aff_validation",
    clientId: "client_aff_validation",
    amountTotal: 1_000,
    subtotal: 1_000,
    currency: "zzz",
    status: "paid",
    referralCodeId: code.id,
    createdAt: Date.now(),
  });
  await rejectsWithoutMutation(
    world.storage,
    () => world.services.attributions.recordOrder({ orderId: "order_invalid_currency" }),
    /order\.currency:/,
  );
  world.orders.set("order_valid", {
    id: "order_valid",
    agencyId: "agency_aff_validation",
    clientId: "client_aff_validation",
    amountTotal: 1_000,
    subtotal: 1_000,
    currency: "usd",
    status: "paid",
    referralCodeId: code.id,
    createdAt: Date.now(),
  });
  await rejectsWithoutMutation(
    world.storage,
    () => world.services.attributions.recordOrder({ orderId: "order_valid", defaultCommissionPercent: 250 }),
    /install\.defaultCommissionPercent:/,
  );
  const attribution = await world.services.attributions.recordOrder({ orderId: "order_valid" });
  await world.services.attributions.approve(attribution!.id, "owner");

  for (const [input, defaultMethod, pattern] of [
    [{ affiliateId: affiliate.id, method: "crypto" }, "manual", /method:/],
    [{ affiliateId: affiliate.id, currency: "zzz" }, "manual", /currency:/],
    [{ affiliateId: affiliate.id, scheduledFor: -1 }, "manual", /scheduledFor:/],
    [{ affiliateId: affiliate.id }, "invented", /method:/],
  ] as Array<[unknown, never, RegExp]>) {
    await rejectsWithoutMutation(
      world.storage,
      () => world.services.payouts.schedule(input as never, "owner", defaultMethod),
      pattern,
    );
  }
  const payout = await world.services.payouts.schedule({
    affiliateId: affiliate.id,
    currency: "usd",
    operationId: "valid-payout",
  }, "owner");
  await rejectsWithoutMutation(
    world.storage,
    () => world.services.payouts.markPaid(payout!.id, { externalRef: "", method: "manual" }, "owner"),
    /externalRef:/,
  );
  await rejectsWithoutMutation(
    world.storage,
    () => world.services.payouts.markPaid(payout!.id, { externalRef: "valid", method: "invented" } as never, "owner"),
    /method:/,
  );
});

test("mounted handlers return service validation errors instead of trusting JSON casts", async () => {
  const [membershipHandlers, affiliateHandlers, membershipPlans, affiliateCodes] = await Promise.all([
    readFile(join(process.cwd(), "src/built-ins/modules/memberships/src/api/handlers.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/api/handlers.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/memberships/src/server/plans.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/server/codes.ts"), "utf8"),
  ]);
  assert.match(membershipHandlers, /unprocessable\(err instanceof Error \? err\.message/);
  assert.match(affiliateHandlers, /unprocessable\(err instanceof Error \? err\.message/);
  assert.match(membershipPlans, /assertCreatePlanInput/);
  assert.match(membershipPlans, /assertPlan\(next\)/);
  assert.match(affiliateCodes, /assertReferralCode\(next\)/);
});
