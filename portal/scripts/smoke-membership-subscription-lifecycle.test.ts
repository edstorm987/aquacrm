import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

process.env.PORTAL_BACKEND ??= "memory";

import { buildMembershipsContainer } from "../src/built-ins/modules/memberships/src/server/index";
import { isStripeAvailable } from "../src/built-ins/modules/memberships/src/server/foundationAdapter";
import {
  membershipsStripeFor,
  membershipsStripeKeysFor,
} from "../src/built-ins/runtime/foundation-adapters/membershipsFoundation";
import {
  makeMembershipsStripePort,
  readMembershipsStripeKeys,
  type StripeClientLike,
} from "../src/built-ins/runtime/foundation-adapters/_membershipsStripeAdapter";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { getInstall, upsertInstall } from "../src/server/pluginInstalls";
import { writePluginSettings } from "../src/lib/server/plugins/pluginSettingsSurface";
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

// ─── The real Stripe adapter, and honest availability ─────────────────────
//
// issues #33 / todo:501. `membershipsFoundation.stripeFor()` used to return a
// throwing NOOP stub UNCONDITIONALLY, so `isStripeAvailable()` was true for
// every install on earth — a false positive that let the paid-plan guard pass
// and then failed inside `createPrice`. There was no SDK-backed adapter at all.
//
// Two contracts below. First: availability is derived from whether the
// ecommerce install in this exact scope actually carries a Stripe secret key.
// Second: the adapter maps the twelve `StripePort` methods onto the SDK
// correctly, proven against an INJECTED fake client — no keys, no network.

test("stripe availability is false until the ecommerce install really has a key", async () => {
  await ensureHydrated();
  const agency = createAgency({ name: "Memberships Stripe Co", slug: `mem-stripe-${Date.now()}` });
  const client = createClient(agency.id, { name: "Paying Client", slug: `paying-${Date.now()}` });
  const scope = { agencyId: agency.id, clientId: client.id };

  // Nothing installed at all.
  assert.equal(membershipsStripeKeysFor(scope), null);
  assert.equal(membershipsStripeFor(scope), null);
  assert.equal(
    isStripeAvailable(scope),
    false,
    "no ecommerce install means no Stripe — this must not read as available",
  );

  // ecommerce installed but never configured. This is the case the NOOP stub
  // used to answer `true` for.
  upsertInstall({
    pluginId: "ecommerce",
    scope,
    enabled: true,
    config: {},
    features: {},
  });
  assert.equal(
    isStripeAvailable(scope),
    false,
    "an ecommerce install with no secret key is not a configured Stripe",
  );

  // Keys saved through the real settings write path (they land in the
  // encrypted vault, never on the browser-visible install.config).
  writePluginSettings({
    pluginId: "ecommerce",
    scope,
    values: {
      stripeSecretKey: "sk_test_memberships_0001",
      stripeWebhookSecret: "whsec_memberships_0002",
    },
    actorUserId: "user_mem_stripe_test",
  });

  const keys = membershipsStripeKeysFor(scope);
  assert.equal(keys?.secretKey, "sk_test_memberships_0001");
  assert.equal(keys?.webhookSecret, "whsec_memberships_0002");
  assert.equal(
    getInstall(scope, "ecommerce")?.config.stripeSecretKey,
    undefined,
    "the secret came from the vault, not from install.config",
  );
  assert.equal(isStripeAvailable(scope), true, "a configured install reports available");
  assert.ok(membershipsStripeFor(scope), "and yields a real StripePort");

  // Scope is exact: another client of the same agency is still unconfigured.
  const other = createClient(agency.id, { name: "Other Client", slug: `other-${Date.now()}` });
  assert.equal(
    isStripeAvailable({ agencyId: agency.id, clientId: other.id }),
    false,
    "one client's Stripe keys must not make another client's memberships look billable",
  );
});

test("the Stripe adapter maps every StripePort method onto the SDK", async () => {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = (method: string, ...args: unknown[]) => { calls.push({ method, args }); };
  const lastCall = (method: string) => [...calls].reverse().find(c => c.method === method);

  // A subscription WITHOUT a top-level `current_period_end` — recent Stripe API
  // versions carry it on the item, and the adapter must read either.
  const rawSub = (over: Record<string, unknown> = {}) => ({
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    trial_end: null,
    items: { data: [{ id: "si_1", price: { id: "price_month" }, current_period_end: 1_750_000_000 }] },
    ...over,
  });

  const fake: StripeClientLike = {
    customers: {
      async create(params, options) {
        record("customers.create", params, options);
        return { id: "cus_1", email: String((params as { email?: string }).email ?? "") };
      },
      async retrieve(id) { record("customers.retrieve", id); return { id, email: "member@example.test" }; },
    },
    subscriptions: {
      async create(params, options) { record("subscriptions.create", params, options); return rawSub(); },
      async retrieve(id) { record("subscriptions.retrieve", id); return rawSub({ id }); },
      async update(id, params, options) {
        record("subscriptions.update", id, params, options);
        return rawSub({ id, cancel_at_period_end: (params as { cancel_at_period_end?: boolean }).cancel_at_period_end === true });
      },
      async cancel(id, params, options) {
        record("subscriptions.cancel", id, params, options);
        return rawSub({ id, status: "canceled" });
      },
    },
    checkout: {
      sessions: {
        async create(params, options) {
          record("checkout.sessions.create", params, options);
          return { id: "cs_1", url: "https://stripe.test/c/cs_1" };
        },
      },
    },
    billingPortal: {
      sessions: {
        async create(params) {
          record("billingPortal.sessions.create", params);
          return { id: "bps_1", url: "https://stripe.test/portal" };
        },
      },
    },
    prices: {
      async create(params, options) {
        record("prices.create", params, options);
        return { id: "price_new", product: "prod_1" };
      },
    },
    webhooks: {
      constructEvent(rawBody, signature, secret) {
        record("webhooks.constructEvent", rawBody, signature, secret);
        if (signature !== "t=1,v1=good" || secret !== "whsec_test") throw new Error("No signatures found matching the expected signature");
        return { id: "evt_1", type: "customer.subscription.created", data: { object: JSON.parse(rawBody) }, created: 1_750_000_001 };
      },
    },
  };

  const port = makeMembershipsStripePort({ secretKey: "sk_test_x", webhookSecret: "whsec_test" }, fake);

  // Prices — the call `PlanService.create` makes for every paid plan.
  const price = await port.createPrice({
    product: { name: "Gold", description: "Top tier" },
    unitAmount: 2499,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { planId: "plan_gold" },
  });
  assert.deepEqual(price, { id: "price_new", productId: "prod_1" });
  const priceParams = lastCall("prices.create")!.args[0] as Record<string, unknown>;
  assert.deepEqual(priceParams.product_data, { name: "Gold", description: "Top tier" });
  assert.equal(priceParams.unit_amount, 2499);
  assert.deepEqual(priceParams.recurring, { interval: "month" });

  // Checkout — memberships always bills recurring, never one-shot.
  const session = await port.createCheckoutSession({
    customerId: "cus_1",
    customerEmail: "member@example.test",
    priceId: "price_month",
    successUrl: "https://example.test/ok",
    cancelUrl: "https://example.test/no",
    trialDays: 7,
    idempotencyKey: "sub-once",
  });
  assert.deepEqual(session, { id: "cs_1", url: "https://stripe.test/c/cs_1" });
  const checkout = lastCall("checkout.sessions.create")!;
  const checkoutParams = checkout.args[0] as Record<string, unknown>;
  assert.equal(checkoutParams.mode, "subscription");
  assert.deepEqual(checkoutParams.line_items, [{ price: "price_month", quantity: 1 }]);
  assert.equal(checkoutParams.customer, "cus_1");
  assert.equal(
    checkoutParams.customer_email,
    undefined,
    "Stripe rejects customer + customer_email together",
  );
  assert.deepEqual(checkout.args[1], { idempotencyKey: "sub-once" });

  // Period end read off the ITEM when the subscription itself lacks it.
  const retrieved = await port.retrieveSubscription("sub_1");
  assert.equal(retrieved?.currentPeriodEnd, 1_750_000_000);
  assert.deepEqual(retrieved?.items, [{ priceId: "price_month" }]);
  assert.equal(retrieved?.customerId, "cus_1");

  // Cancel at period end updates; cancel now really cancels.
  const later = await port.cancelSubscription("sub_1", true, "cancel-once");
  assert.equal(later.cancelAtPeriodEnd, true);
  assert.deepEqual(lastCall("subscriptions.update")!.args[1], { cancel_at_period_end: true });
  assert.deepEqual(lastCall("subscriptions.update")!.args[2], { idempotencyKey: "cancel-once" });
  const now = await port.cancelSubscription("sub_1", false);
  assert.equal(now.status, "canceled");
  assert.ok(lastCall("subscriptions.cancel"), "immediate cancel goes through subscriptions.cancel");

  // Pause / resume — the self-service controls the plugin already exposes.
  await port.pauseSubscription("sub_1");
  assert.deepEqual(lastCall("subscriptions.update")!.args[1], { pause_collection: { behavior: "void" } });
  await port.resumeSubscription("sub_1");
  assert.deepEqual(lastCall("subscriptions.update")!.args[1], { pause_collection: null });

  // Plan change re-prices the EXISTING item — a bare `items: [{price}]` would
  // add a second line instead of switching tier.
  await port.changeSubscriptionPlan({ id: "sub_1", newPriceId: "price_gold", idempotencyKey: "change-once" });
  const change = lastCall("subscriptions.update")!.args[1] as Record<string, unknown>;
  assert.deepEqual(change.items, [{ id: "si_1", price: "price_gold" }]);
  assert.equal(change.proration_behavior, "create_prorations");

  // Billing portal.
  const portal = await port.createBillingPortalSession({ customerId: "cus_1", returnUrl: "https://example.test/back" });
  assert.equal(portal.url, "https://stripe.test/portal");

  // Webhook verification is the only gate that a payload is really Stripe's.
  const body = JSON.stringify({ id: "sub_1" });
  const verified = await port.verifyWebhookSignature({ rawBody: body, signatureHeader: "t=1,v1=good" });
  assert.equal(verified?.id, "evt_1");
  assert.equal(verified?.type, "customer.subscription.created");
  assert.deepEqual(verified?.data.object, { id: "sub_1" });
  assert.equal(
    await port.verifyWebhookSignature({ rawBody: body, signatureHeader: "t=1,v1=forged" }),
    null,
    "a bad signature does not verify — it must never fall through as accepted",
  );

  // No webhook secret configured → nothing can be verified, and we do not even
  // ask the SDK. Never "trust it anyway".
  const before = calls.filter(c => c.method === "webhooks.constructEvent").length;
  const unsecured = makeMembershipsStripePort({ secretKey: "sk_test_x" }, fake);
  assert.equal(await unsecured.verifyWebhookSignature({ rawBody: body, signatureHeader: "t=1,v1=good" }), null);
  assert.equal(calls.filter(c => c.method === "webhooks.constructEvent").length, before);

  // Keys reader: blank / missing is null, which is what makes availability honest.
  assert.equal(readMembershipsStripeKeys({}), null);
  assert.equal(readMembershipsStripeKeys({ stripeSecretKey: "   " }), null);
  assert.deepEqual(readMembershipsStripeKeys({ stripeSecretKey: "sk_live_1" }), {
    secretKey: "sk_live_1",
    webhookSecret: undefined,
  });
});
