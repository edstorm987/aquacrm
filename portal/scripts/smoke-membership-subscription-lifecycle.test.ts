import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { buildMembershipsContainer } from "../src/built-ins/modules/memberships/src/server/index";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  StoragePort,
  StripeCheckoutSession,
  StripeCustomer,
  StripePort,
  StripePrice,
  StripeSubscription,
  TenantPort,
  UserPort,
} from "../src/built-ins/modules/memberships/src/server/ports";

const AGENCY_ID = "agency_membership_lifecycle";
const CLIENT_ID = "client_membership_lifecycle";
const USER_ID = "user_membership_lifecycle";

class MemoryStorage implements StoragePort {
  readonly data = new Map<string, unknown>();
  failNextSetKey: string | null = null;
  private readonly tails = new Map<string, Promise<void>>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.failNextSetKey === key) {
      this.failNextSetKey = null;
      throw new Error(`forced storage failure: ${key}`);
    }
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

  async del(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(prefix = ""): Promise<string[]> {
    return [...this.data.keys()].filter(key => key.startsWith(prefix));
  }
}

class FakeStripe implements StripePort {
  readonly customers = new Map<string, StripeCustomer>();
  readonly subscriptions = new Map<string, StripeSubscription>();
  readonly checkoutByKey = new Map<string, StripeCheckoutSession>();
  readonly providerResultByKey = new Map<string, StripeSubscription>();
  readonly calls = { checkout: 0, change: 0, cancel: 0 };
  failCancelOnce = false;
  private sequence = 0;

  async createCustomer(input: Parameters<StripePort["createCustomer"]>[0]): Promise<StripeCustomer> {
    const key = input.idempotencyKey ?? `customer-${++this.sequence}`;
    const existing = this.customers.get(key);
    if (existing) return existing;
    const customer = { id: `cus_${++this.sequence}`, email: input.email };
    this.customers.set(key, customer);
    return customer;
  }

  async retrieveCustomer(id: string): Promise<StripeCustomer | null> {
    return [...this.customers.values()].find(customer => customer.id === id) ?? null;
  }

  async createSubscription(): Promise<StripeSubscription> {
    throw new Error("direct subscription creation is not used");
  }

  async cancelSubscription(
    id: string,
    atPeriodEnd: boolean,
    idempotencyKey?: string,
  ): Promise<StripeSubscription> {
    const key = idempotencyKey ?? `cancel-${id}-${atPeriodEnd}`;
    const adopted = this.providerResultByKey.get(key);
    if (adopted) return adopted;
    this.calls.cancel += 1;
    if (this.failCancelOnce) {
      this.failCancelOnce = false;
      throw new Error("forced Stripe cancellation failure");
    }
    const current = this.subscriptions.get(id);
    if (!current) throw new Error(`subscription ${id} not found`);
    const result = {
      ...current,
      status: atPeriodEnd ? current.status : "canceled",
      cancelAtPeriodEnd: atPeriodEnd,
    };
    this.subscriptions.set(id, result);
    this.providerResultByKey.set(key, result);
    return result;
  }

  async retrieveSubscription(id: string): Promise<StripeSubscription | null> {
    return this.subscriptions.get(id) ?? null;
  }

  async pauseSubscription(id: string): Promise<StripeSubscription> {
    const current = this.subscriptions.get(id);
    if (!current) throw new Error("subscription not found");
    const result = { ...current, status: "paused" };
    this.subscriptions.set(id, result);
    return result;
  }

  async resumeSubscription(id: string): Promise<StripeSubscription> {
    const current = this.subscriptions.get(id);
    if (!current) throw new Error("subscription not found");
    const result = { ...current, status: "active", cancelAtPeriodEnd: false };
    this.subscriptions.set(id, result);
    return result;
  }

  async changeSubscriptionPlan(
    input: Parameters<StripePort["changeSubscriptionPlan"]>[0],
  ): Promise<StripeSubscription> {
    const key = input.idempotencyKey ?? `change-${input.id}-${input.newPriceId}`;
    const adopted = this.providerResultByKey.get(key);
    if (adopted) return adopted;
    this.calls.change += 1;
    const current = this.subscriptions.get(input.id);
    if (!current) throw new Error("subscription not found");
    const result = {
      ...current,
      items: [{ priceId: input.newPriceId }],
      cancelAtPeriodEnd: false,
    };
    this.subscriptions.set(input.id, result);
    this.providerResultByKey.set(key, result);
    return result;
  }

  async createCheckoutSession(
    input: Parameters<StripePort["createCheckoutSession"]>[0],
  ): Promise<StripeCheckoutSession> {
    const key = input.idempotencyKey ?? `checkout-${++this.sequence}`;
    const adopted = this.checkoutByKey.get(key);
    if (adopted) return adopted;
    this.calls.checkout += 1;
    const session = { id: `cs_${++this.sequence}`, url: `https://stripe.test/cs_${this.sequence}` };
    this.checkoutByKey.set(key, session);
    const subscription: StripeSubscription = {
      id: `sub_${++this.sequence}`,
      customerId: input.customerId!,
      status: "active",
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 86_400,
      cancelAtPeriodEnd: false,
      items: [{ priceId: input.priceId }],
    };
    this.subscriptions.set(subscription.id, subscription);
    return session;
  }

  async createBillingPortalSession(
    input: Parameters<StripePort["createBillingPortalSession"]>[0],
  ) {
    return { id: "bps_1", url: `${input.returnUrl}?customer=${input.customerId}` };
  }

  async createPrice(): Promise<StripePrice> {
    const id = `price_${++this.sequence}`;
    return { id, productId: `product_${this.sequence}` };
  }

  async verifyWebhookSignature() {
    return null;
  }

  latestSubscription(): StripeSubscription {
    const result = [...this.subscriptions.values()].at(-1);
    if (!result) throw new Error("expected a staged provider subscription");
    return result;
  }
}

function world(storage: MemoryStorage, stripe: FakeStripe) {
  const activities = new Map<string, unknown>();
  const activity: ActivityLogPort = {
    logActivity(input) {
      const id = input.idempotencyKey ?? `activity-${activities.size + 1}`;
      const existing = activities.get(id);
      if (existing) return existing as never;
      const entry = { id, ts: Date.now(), ...input };
      activities.set(id, entry);
      return entry as never;
    },
    listActivity() { return [...activities.values()] as never; },
  };
  const events: EventBusPort = { emit() {} };
  const tenant: TenantPort = {
    getClient() { return null; },
    getClientForAgency() { return null; },
  };
  const user: UserPort = {
    getUser(id) {
      return id === USER_ID
        ? { id, email: "member@example.test", agencyId: AGENCY_ID, clientId: CLIENT_ID }
        : null;
    },
  };
  const pluginInstalls: PluginInstallStorePort = { getInstall() { return null; } };
  return buildMembershipsContainer({
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    storage,
    activity,
    events,
    tenant,
    user,
    pluginInstalls,
    stripe,
  });
}

test("paid/free/paid/paid transitions adopt one durable provider outcome", async () => {
  const storage = new MemoryStorage();
  const stripe = new FakeStripe();
  let services = world(storage, stripe);
  const free = await services.plans.create({
    name: "Free",
    priceMonthly: 0,
    currency: "gbp",
  }, "owner");
  const paidA = await services.plans.create({
    name: "Paid A",
    priceMonthly: 1_000,
    currency: "gbp",
  }, "owner");
  const paidB = await services.plans.create({
    name: "Paid B",
    priceMonthly: 2_000,
    currency: "gbp",
  }, "owner");

  const firstCheckout = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: "initial-paid",
  });
  assert.equal(firstCheckout.ok && firstCheckout.mode, "checkout");
  const firstProviderSub = stripe.latestSubscription();
  await services.subscriptions.upsertFromStripe(firstProviderSub, {
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
  });
  const paidBeforeFailure = await services.subscriptions.getByUser(USER_ID);
  assert.equal(paidBeforeFailure?.stripeSubscriptionId, firstProviderSub.id);

  stripe.failCancelOnce = true;
  await assert.rejects(
    services.subscriptions.subscribe({
      endCustomerUserId: USER_ID,
      planId: free.id,
      billing: "monthly",
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
      operationId: "paid-to-free-first-request",
    }),
    /forced Stripe cancellation failure/,
  );
  assert.equal((await services.subscriptions.getByUser(USER_ID))?.planId, paidA.id);
  assert.equal(stripe.subscriptions.get(firstProviderSub.id)?.status, "active");

  const paidToFree = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: free.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: "paid-to-free-retry-with-new-browser-id",
  });
  assert.equal(paidToFree.ok && paidToFree.mode, "free");
  const freeRow = await services.subscriptions.getByUser(USER_ID);
  assert.equal(freeRow?.planId, free.id);
  assert.equal(freeRow?.stripeSubscriptionId, undefined);
  assert.equal(stripe.subscriptions.get(firstProviderSub.id)?.status, "canceled");
  assert.equal(stripe.calls.cancel, 2, "one failed call plus one accepted provider cancellation");

  const replayPaidToFree = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: free.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: "another-browser-id",
  });
  assert.equal(replayPaidToFree.ok && replayPaidToFree.mode, "free");
  assert.equal(stripe.calls.cancel, 2, "completed transition replay never calls Stripe again");

  const freeCancel = await services.subscriptions.cancel({
    endCustomerUserId: USER_ID,
    atPeriodEnd: true,
    operationId: "free-cancel",
  });
  assert.equal(freeCancel?.status, "canceled");
  assert.equal(freeCancel?.cancelAtPeriodEnd, false, "free cancellation is immediate, never permanently pending");

  await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: free.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: "reactivate-free",
  });
  const freeToPaid = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: "free-to-paid",
  });
  const freeToPaidReplay = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: "free-to-paid-new-browser-id",
  });
  assert.equal(freeToPaid.ok && freeToPaid.mode, "checkout");
  assert.deepEqual(freeToPaidReplay, freeToPaid, "checkout retry adopts the durable hosted session");
  assert.equal(stripe.calls.checkout, 2, "one initial checkout and one free-to-paid checkout");
  const secondProviderSub = stripe.latestSubscription();
  await services.subscriptions.upsertFromStripe(secondProviderSub, {
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
  });

  storage.failNextSetKey = `memberships/subscribers/${USER_ID}`;
  await assert.rejects(
    services.subscriptions.subscribe({
      endCustomerUserId: USER_ID,
      planId: paidB.id,
      billing: "monthly",
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
      operationId: "paid-a-to-b",
    }),
    /forced storage failure/,
  );
  assert.equal(stripe.calls.change, 1);
  assert.equal((await services.subscriptions.getByUser(USER_ID))?.planId, paidA.id);

  services = world(storage, stripe);
  const recovered = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidB.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: "paid-a-to-b-retry-after-reload",
  });
  assert.equal(recovered.ok && recovered.mode, "changed");
  assert.equal(stripe.calls.change, 1, "reload adopts the persisted provider result");
  assert.equal((await services.subscriptions.getByUser(USER_ID))?.planId, paidB.id);

  const beforeConcurrentChange = stripe.calls.change;
  const concurrent = await Promise.all([
    services.subscriptions.subscribe({
      endCustomerUserId: USER_ID,
      planId: paidA.id,
      billing: "monthly",
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
      operationId: "concurrent-a",
    }),
    services.subscriptions.subscribe({
      endCustomerUserId: USER_ID,
      planId: paidA.id,
      billing: "monthly",
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
      operationId: "concurrent-b",
    }),
  ]);
  assert.ok(concurrent.every(result => result.ok && result.mode === "changed"));
  assert.equal(stripe.calls.change, beforeConcurrentChange + 1, "concurrent intent changes provider once");
  assert.equal((await services.subscriptions.getByUser(USER_ID))?.planId, paidA.id);
});

test("mounted membership controls carry command identity and retryable failures", async () => {
  const root = process.cwd();
  const [handlers, customerPanel, adminPanel, service] = await Promise.all([
    readFile(join(root, "src/built-ins/modules/memberships/src/api/handlers.ts"), "utf8"),
    readFile(join(root, "src/built-ins/modules/memberships/src/components/MyMembershipPanel.tsx"), "utf8"),
    readFile(join(root, "src/built-ins/modules/memberships/src/components/SubscribersList.tsx"), "utf8"),
    readFile(join(root, "src/built-ins/modules/memberships/src/server/subscriptions.ts"), "utf8"),
  ]);
  assert.match(handlers, /operationId: body\.operationId/);
  assert.match(handlers, /retryable: true/);
  assert.match(customerPanel, /Switch to \$\{candidate\.name\}/);
  assert.match(customerPanel, /Cancel this free membership immediately/);
  assert.match(adminPanel, /membership-admin-cancel-/);
  assert.match(service, /runExclusive/);
  assert.match(service, /idempotencyKey: this\.providerKey/);
});
