import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { buildAffiliatesContainer } from "../src/built-ins/modules/affiliates/src/server/index";
import type { Affiliate, ReferralCode } from "../src/built-ins/modules/affiliates/src/lib/domain";
import type {
  ActivityLogPort,
  EcommerceOrderProjection,
  EventBusPort,
  StoragePort,
  StripeConnectPort,
} from "../src/built-ins/modules/affiliates/src/server/ports";

const AGENCY_ID = "agency_affiliate_currency";
const CLIENT_ID = "client_affiliate_currency";
const AFFILIATE_ID = "affiliate_currency_owner";
const CODE_ID = "code_currency_owner";
const ACTOR_ID = "owner_currency";

class MemoryStorage implements StoragePort {
  readonly data = new Map<string, unknown>();
  private readonly tails = new Map<string, Promise<void>>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, structuredClone(value));
  }

  async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => gate);
    this.tails.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  async del(key: string): Promise<void> { this.data.delete(key); }
  async list(prefix = ""): Promise<string[]> {
    return [...this.data.keys()].filter(key => key.startsWith(prefix));
  }
}

function order(
  id: string,
  currency: string,
  amountTotal: number,
  status: EcommerceOrderProjection["status"] = "paid",
): EcommerceOrderProjection {
  return {
    id,
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    amountTotal,
    subtotal: amountTotal,
    currency,
    status,
    paidAt: status === "paid" ? Date.now() : undefined,
    referralCodeId: CODE_ID,
    createdAt: Date.now(),
  };
}

async function buildWorld() {
  const storage = new MemoryStorage();
  const orders = new Map<string, EcommerceOrderProjection>();
  const activities = new Map<string, unknown>();
  const emitted: Array<{ name: string; payload: unknown }> = [];
  const transfers: Array<{ amountCents: number; currency: string; idempotencyKey: string }> = [];

  const affiliate: Affiliate = {
    id: AFFILIATE_ID,
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    endCustomerUserId: "affiliate_user_currency",
    displayName: "Currency Owner",
    status: "active",
    payoutEmail: "currency@example.test",
    totalReferred: 0,
    lifetimeEarnings: 0,
    lifetimeEarningsByCurrency: {},
    stripeAccountId: "acct_currency",
    stripeOnboardingStatus: "complete",
    joinedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  const code: ReferralCode = {
    id: CODE_ID,
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    affiliateId: AFFILIATE_ID,
    code: "CURRENCY10",
    destinationPath: "/",
    status: "active",
    redemptionCount: 0,
    createdAt: 1,
  };
  await storage.set(`affiliates/by-id/${AFFILIATE_ID}`, affiliate);
  await storage.set("affiliates/index", [AFFILIATE_ID]);
  await storage.set(`codes/by-id/${CODE_ID}`, code);
  await storage.set("codes/index", [CODE_ID]);

  const activity: ActivityLogPort = {
    logActivity(input) {
      const key = input.idempotencyKey ?? `activity-${activities.size + 1}`;
      const row = activities.get(key) ?? { id: key, ts: Date.now(), ...input };
      activities.set(key, row);
      return row as never;
    },
    listActivity() { return [...activities.values()] as never; },
  };
  const events: EventBusPort = {
    emit(_scope, name, payload) { emitted.push({ name, payload }); },
  };
  const stripeConnect: StripeConnectPort = {
    async createAccount() { return { accountId: "acct_currency" }; },
    async createOnboardingLink() { return { url: "https://stripe.test", expiresAt: Date.now() + 1_000 }; },
    async retrieveAccount() {
      return {
        accountId: "acct_currency",
        onboardingStatus: "complete",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      };
    },
    async createTransfer(args) {
      transfers.push({
        amountCents: args.amountCents,
        currency: args.currency,
        idempotencyKey: args.idempotencyKey,
      });
      return { transferId: `tr_currency_${transfers.length}`, created: Date.now() };
    },
    async verifyWebhookSignature() { return true; },
  };
  const services = buildAffiliatesContainer({
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    storage,
    activity,
    events,
    tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
    user: { getUser() { return null; } },
    pluginInstalls: { getInstall() { return null; } },
    ecommerceOrders: { getOrder(args) { return orders.get(args.orderId) ?? null; } },
    stripeConnect,
  });
  return { storage, orders, activities, emitted, transfers, services };
}

test("mixed currencies are isolated and only paid orders earn commission", async () => {
  const world = await buildWorld();
  world.orders.set("order_usd", order("order_usd", "USD", 10_000));
  world.orders.set("order_gbp", order("order_gbp", "GBP", 20_000));
  world.orders.set("order_pending", order("order_pending", "USD", 30_000, "pending"));

  const usd = await world.services.attributions.recordOrder({ orderId: "order_usd" });
  const gbp = await world.services.attributions.recordOrder({ orderId: "order_gbp" });
  assert.equal(await world.services.attributions.recordOrder({ orderId: "order_pending" }), null);
  assert.equal(usd?.currency, "usd");
  assert.equal(gbp?.currency, "gbp");
  await world.services.attributions.approve(usd!.id, ACTOR_ID);
  await world.services.attributions.approve(gbp!.id, ACTOR_ID);

  await assert.rejects(
    world.services.payouts.schedule({ affiliateId: AFFILIATE_ID }, ACTOR_ID),
    /Currency required.*GBP.*USD|Currency required.*USD.*GBP/,
  );
  const usdPayout = await world.services.payouts.schedule({
    affiliateId: AFFILIATE_ID,
    currency: "USD",
    operationId: "schedule-usd-one",
  }, ACTOR_ID);
  assert.equal(usdPayout?.currency, "usd");
  assert.equal(usdPayout?.amountCents, 1_000);
  assert.deepEqual(usdPayout?.attributionIds, [usd?.id]);

  const processing = await world.services.payouts.processPayout(usdPayout!.id, ACTOR_ID);
  assert.equal(processing?.externalRef, "tr_currency_1");
  assert.deepEqual(world.transfers[0], {
    amountCents: 1_000,
    currency: "usd",
    idempotencyKey: `payout:${usdPayout!.id}`,
  });
  await assert.rejects(
    world.services.payouts.processPayout(usdPayout!.id, ACTOR_ID, { currency: "gbp" }),
    /locked to USD/,
  );
  await world.services.payouts.confirmTransferPaid("tr_currency_1");

  const cancelled = { ...world.orders.get("order_gbp")!, status: "cancelled" as const };
  world.orders.set("order_gbp", cancelled);
  const reversedGbp = await world.services.attributions.reconcileOrder("order_gbp", ACTOR_ID);
  assert.equal(reversedGbp?.status, "reversed");
  assert.equal(reversedGbp?.reversedAmountCents, 2_000);
  assert.equal(await world.services.payouts.schedule({
    affiliateId: AFFILIATE_ID,
    currency: "gbp",
    operationId: "schedule-gbp-cancelled",
  }, ACTOR_ID), null);
});

test("post-payout partial and full refunds become replay-safe future offsets", async () => {
  const world = await buildWorld();
  world.orders.set("order_paid_refund", order("order_paid_refund", "usd", 10_000));
  const original = await world.services.attributions.recordOrder({ orderId: "order_paid_refund" });
  await world.services.attributions.approve(original!.id, ACTOR_ID);
  const first = await world.services.payouts.schedule({
    affiliateId: AFFILIATE_ID,
    currency: "usd",
    operationId: "schedule-original",
  }, ACTOR_ID);
  await world.services.payouts.markPaid(first!.id, { externalRef: "manual-original" }, ACTOR_ID);

  world.orders.set("order_paid_refund", {
    ...world.orders.get("order_paid_refund")!,
    refundedAmountCents: 5_000,
  });
  const partial = await world.services.attributions.reconcileOrder("order_paid_refund", ACTOR_ID);
  assert.equal(partial?.reversedAmountCents, 500);
  assert.equal(partial?.offsetAmountCents, 500);
  const activityCount = world.activities.size;
  await world.services.attributions.reconcileOrder("order_paid_refund", ACTOR_ID);
  assert.equal(world.activities.size, activityCount, "same cumulative refund is a no-op");

  world.orders.set("order_new_one", order("order_new_one", "usd", 10_000));
  const nextAttribution = await world.services.attributions.recordOrder({ orderId: "order_new_one" });
  await world.services.attributions.approve(nextAttribution!.id, ACTOR_ID);
  const balances = await world.services.payouts.availableBalances(AFFILIATE_ID);
  assert.deepEqual(balances, [{
    affiliateId: AFFILIATE_ID,
    currency: "usd",
    grossApprovedCents: 1_000,
    pendingAdjustmentCents: 500,
    availableCents: 500,
  }]);
  const second = await world.services.payouts.schedule({
    affiliateId: AFFILIATE_ID,
    currency: "usd",
    operationId: "schedule-after-partial-refund",
  }, ACTOR_ID);
  assert.equal(second?.grossAmountCents, 1_000);
  assert.equal(second?.adjustmentAmountCents, 500);
  assert.equal(second?.amountCents, 500);
  assert.deepEqual(second?.adjustmentAttributionIds, [original?.id]);
  await world.services.payouts.markPaid(second!.id, { externalRef: "manual-offset-one" }, ACTOR_ID);

  world.orders.set("order_paid_refund", {
    ...world.orders.get("order_paid_refund")!,
    status: "refunded",
    refundedAmountCents: 10_000,
  });
  const fullyRefunded = await world.services.attributions.reconcileOrder("order_paid_refund", ACTOR_ID);
  assert.equal(fullyRefunded?.status, "reversed");
  assert.equal(fullyRefunded?.offsetAmountCents, 1_000);
  assert.equal(fullyRefunded?.offsetAppliedCents, 500);

  world.orders.set("order_new_two", order("order_new_two", "usd", 10_000));
  const thirdAttribution = await world.services.attributions.recordOrder({ orderId: "order_new_two" });
  await world.services.attributions.approve(thirdAttribution!.id, ACTOR_ID);
  const third = await world.services.payouts.schedule({
    affiliateId: AFFILIATE_ID,
    currency: "usd",
    operationId: "schedule-after-full-refund",
  }, ACTOR_ID);
  assert.equal(third?.amountCents, 500);
  await world.services.payouts.markPaid(third!.id, { externalRef: "manual-offset-two" }, ACTOR_ID);
  const affiliate = await world.services.affiliates.get(AFFILIATE_ID);
  assert.deepEqual(affiliate?.lifetimeEarningsByCurrency, { usd: 2_000 });
});

test("mounted admin and affiliate views expose currencies and refund offsets", async () => {
  const [payouts, attributions, mine, handlers, subscribers] = await Promise.all([
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/components/PayoutsList.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/components/AttributionsList.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/components/MyAffiliatePanel.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/api/handlers.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/runtime/foundation-adapters/_eventSubscribers.ts"), "utf8"),
  ]);
  assert.match(payouts, /Payout currency/);
  assert.match(payouts, /adjustmentAmountCents/);
  assert.match(attributions, /future offset/);
  assert.match(mine, /Refund offsets/);
  assert.match(handlers, /currency: body\.currency/);
  assert.match(subscribers, /"order\.paid"/);
  assert.match(subscribers, /"order\.refunded"/);
  assert.match(subscribers, /"order\.cancelled"/);
});
