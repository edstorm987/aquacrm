// Memberships plugin smoke. node:test via tsx --test.
//
// Builds an in-memory foundation (StoragePort backed by a Map,
// stub TenantPort/UserPort/ActivityPort/EventBusPort, mock StripePort
// that records calls + returns deterministic ids), constructs the
// memberships container, and walks:
//
//   - seedDefaultPlans idempotent (×2 = same state)
//   - subscribe (free tier) + getBenefitsForUser walks plan
//   - subscribe (paid) returns checkout URL
//   - signed webhook customer.subscription.created upserts subscription
//   - cancel(atPeriodEnd: true) records intent without state change
//   - webhook customer.subscription.deleted cancels subscription
//   - idempotency on Stripe event id

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  Client,
  ClientId,
  EndCustomerProfile,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  StripeCheckoutSession,
  StripeCheckoutSessionInput,
  StripeCustomer,
  StripeCustomerInput,
  StripePort,
  StripePrice,
  StripePriceInput,
  StripeSubscription,
  StripeWebhookEvent,
  TenantPort,
  UserPort,
} from "../server/ports";
import { containerWithDeps } from "../server/foundationAdapter";

const AGENCY_ID: AgencyId = "agency_mem_smoke";
const CLIENT_ID: ClientId = "client_mem_smoke";
const ACTOR: UserId = "user_admin";
const CUSTOMER_USER_ID: UserId = "user_alice";

function buildWorld() {
  const client: Client = {
    id: CLIENT_ID,
    agencyId: AGENCY_ID,
    name: "Smoke Membership Co",
    slug: "smoke-mem",
    brand: { primaryColor: "#000000" },
    stage: "live",
    status: "active",
    createdAt: 0,
    updatedAt: 0,
  };
  const profile: EndCustomerProfile = {
    id: CUSTOMER_USER_ID,
    email: "alice@smoke-mem.test",
    name: "Alice",
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
  };

  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];

  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return data.get(key) as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      data.set(key, value);
    },
    async del(key: string): Promise<void> {
      data.delete(key);
    },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };

  const tenant: TenantPort = {
    getClient: id => (id === CLIENT_ID ? client : null),
    getClientForAgency: (a, id) => (a === AGENCY_ID && id === CLIENT_ID ? client : null),
  };

  const user: UserPort = {
    getUser: id => (id === CUSTOMER_USER_ID ? profile : null),
  };

  let actSeq = 1;
  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(actSeq++).padStart(4, "0")}`,
        ts: Date.now(),
        agencyId: input.agencyId,
        clientId: input.clientId,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        category: input.category,
        action: input.action,
        message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(entry);
      return entry;
    },
    listActivity(filter) {
      let out = activityLog.filter(e => e.agencyId === filter.agencyId);
      if (filter.clientId) out = out.filter(e => e.clientId === filter.clientId);
      const limit = filter.limit ?? out.length;
      return out.slice(-limit).reverse();
    },
  };

  const eventBus: EventBusPort = {
    emit(_scope, name, payload) { events.push({ name, payload }); },
  };

  const pluginInstalls: PluginInstallStorePort = {
    getInstall(_scope: PluginInstallScope, _pluginId: string): PluginInstall | null {
      return null;
    },
  };

  // ─── Mock Stripe ────────────────────────────────────────────────────────

  const stripeCalls: { method: string; args: unknown }[] = [];
  let stripeSeq = 1;
  const subsByCustomer = new Map<string, StripeSubscription>();
  const customers = new Map<string, StripeCustomer>();
  const prices = new Map<string, StripePrice>();
  const webhookSecret = "whsec_test";

  const stripe: StripePort = {
    async createCustomer(input: StripeCustomerInput): Promise<StripeCustomer> {
      stripeCalls.push({ method: "createCustomer", args: input });
      const id = `cus_${stripeSeq++}`;
      const c: StripeCustomer = { id, email: input.email };
      customers.set(id, c);
      return c;
    },
    async retrieveCustomer(id) {
      stripeCalls.push({ method: "retrieveCustomer", args: { id } });
      return customers.get(id) ?? null;
    },
    async createSubscription() {
      throw new Error("not used in smoke (we go via createCheckoutSession)");
    },
    async cancelSubscription(id, atPeriodEnd) {
      stripeCalls.push({ method: "cancelSubscription", args: { id, atPeriodEnd } });
      const existing = [...subsByCustomer.values()].find(s => s.id === id);
      if (!existing) throw new Error("not found");
      const updated: StripeSubscription = {
        ...existing,
        status: atPeriodEnd ? existing.status : "canceled",
        cancelAtPeriodEnd: atPeriodEnd,
      };
      subsByCustomer.set(existing.customerId, updated);
      return updated;
    },
    async retrieveSubscription(id) {
      return [...subsByCustomer.values()].find(s => s.id === id) ?? null;
    },
    async pauseSubscription(id) {
      const existing = [...subsByCustomer.values()].find(s => s.id === id);
      if (!existing) throw new Error("not found");
      const updated: StripeSubscription = { ...existing, status: "paused" };
      subsByCustomer.set(existing.customerId, updated);
      return updated;
    },
    async resumeSubscription(id) {
      const existing = [...subsByCustomer.values()].find(s => s.id === id);
      if (!existing) throw new Error("not found");
      const updated: StripeSubscription = { ...existing, status: "active" };
      subsByCustomer.set(existing.customerId, updated);
      return updated;
    },
    async changeSubscriptionPlan({ id, newPriceId }) {
      const existing = [...subsByCustomer.values()].find(s => s.id === id);
      if (!existing) throw new Error("not found");
      const updated: StripeSubscription = { ...existing, items: [{ priceId: newPriceId }] };
      subsByCustomer.set(existing.customerId, updated);
      return updated;
    },
    async createCheckoutSession(input: StripeCheckoutSessionInput): Promise<StripeCheckoutSession> {
      stripeCalls.push({ method: "createCheckoutSession", args: input });
      const sessionId = `cs_${stripeSeq++}`;
      // Pre-stage a subscription that the test will trigger via a fake
      // webhook payload (mimicking real Stripe behaviour: checkout
      // success → customer.subscription.created arrives).
      if (input.customerId) {
        const subId = `sub_${stripeSeq++}`;
        const stripeSub: StripeSubscription = {
          id: subId,
          customerId: input.customerId,
          status: input.trialDays && input.trialDays > 0 ? "trialing" : "active",
          currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 86400,
          cancelAtPeriodEnd: false,
          trialEnd: input.trialDays ? Math.floor(Date.now() / 1000) + input.trialDays * 86400 : undefined,
          items: [{ priceId: input.priceId }],
        };
        subsByCustomer.set(input.customerId, stripeSub);
      }
      return { id: sessionId, url: `https://stripe.example/c/${sessionId}` };
    },
    async createBillingPortalSession({ customerId, returnUrl }) {
      stripeCalls.push({ method: "createBillingPortalSession", args: { customerId, returnUrl } });
      return { id: `bps_${stripeSeq++}`, url: `https://stripe.example/billing/${customerId}` };
    },
    async createPrice(input: StripePriceInput): Promise<StripePrice> {
      stripeCalls.push({ method: "createPrice", args: input });
      const id = `price_${stripeSeq++}`;
      const productId = typeof input.product === "string" ? input.product : `prod_${stripeSeq++}`;
      const p: StripePrice = { id, productId };
      prices.set(id, p);
      return p;
    },
    async verifyWebhookSignature({ rawBody, signatureHeader }): Promise<StripeWebhookEvent | null> {
      if (signatureHeader !== `sig=${webhookSecret}`) return null;
      try {
        return JSON.parse(rawBody) as StripeWebhookEvent;
      } catch {
        return null;
      }
    },
  };

  return {
    storage, tenant, user, activity, events: eventBus, pluginInstalls, stripe,
    inspect: { activityLog, events, stripeCalls, subsByCustomer, prices, webhookSecret },
  };
}

describe("memberships smoke", () => {
  let world: ReturnType<typeof buildWorld>;
  let services: ReturnType<typeof containerWithDeps>;
  let bronzeId: string;
  let silverId: string;

  before(() => {
    world = buildWorld();
    services = containerWithDeps({
      agencyId: AGENCY_ID,
      clientId: CLIENT_ID,
      storage: world.storage,
      tenant: world.tenant,
      user: world.user,
      activity: world.activity,
      events: world.events,
      pluginInstalls: world.pluginInstalls,
      stripe: world.stripe,
    });
  });

  test("step 0: seed default plans (idempotent)", async () => {
    const first = await services.plans.seedDefaults(ACTOR, "usd");
    assert.equal(first.seeded, 3, "Bronze / Silver / Gold seeded");
    const second = await services.plans.seedDefaults(ACTOR, "usd");
    assert.equal(second.seeded, 0, "second seed is a no-op");
    assert.equal(second.existed, 3);

    const list = await services.plans.list();
    assert.equal(list.length, 3);
    const names = list.map(p => p.name);
    assert.deepEqual(names, ["Bronze", "Silver", "Gold"], "ordered by `order` ascending");
    bronzeId = list[0]!.id;
    silverId = list[1]!.id;

    const bronze = list[0]!;
    assert.equal(bronze.priceMonthly, 0);
    assert.ok(!bronze.stripePriceIdMonthly, "Bronze ($0) has no Stripe price");

    const silver = list[1]!;
    assert.equal(silver.priceMonthly, 999);
    assert.ok(silver.stripePriceIdMonthly?.startsWith("price_"), "Silver price minted in Stripe");
    assert.ok(silver.stripePriceIdAnnual?.startsWith("price_"), "Silver annual price minted");
  });

  test("step 1: subscribe to free tier (Bronze)", async () => {
    const result = await services.subscriptions.subscribe({
      endCustomerUserId: CUSTOMER_USER_ID,
      planId: bronzeId,
      billing: "monthly",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/no",
    });
    assert.ok(result.ok && result.mode === "free", "Bronze subscribe is free-tier (no Stripe)");
    if (!(result.ok && result.mode === "free")) return;
    assert.equal(result.subscription.status, "active");
    assert.equal(result.subscription.planId, bronzeId);
    assert.equal(result.subscription.endCustomerUserId, CUSTOMER_USER_ID);

    // No Stripe customer / checkout calls for free tier.
    const stripeMethods = world.inspect.stripeCalls.map(c => c.method);
    assert.equal(
      stripeMethods.filter(m => m === "createCustomer").length,
      0,
      "free tier doesn't create a Stripe customer",
    );

    // Subscribe-started event emitted.
    const startedEvents = world.inspect.events.filter(e => e.name === "membership.subscription_started");
    assert.equal(startedEvents.length, 1);
  });

  test("step 2: change to paid tier (Silver) returns checkout URL", async () => {
    // Cancel Bronze first so subscribing again is a clean code path.
    // (Real flow: changePlan; smoke walks subscribe → cancel → subscribe.)
    await services.subscriptions.cancel({ endCustomerUserId: CUSTOMER_USER_ID, atPeriodEnd: false });

    const result = await services.subscriptions.subscribe({
      endCustomerUserId: CUSTOMER_USER_ID,
      planId: silverId,
      billing: "monthly",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/no",
    });
    assert.ok(result.ok && result.mode === "checkout");
    if (!(result.ok && result.mode === "checkout")) return;
    assert.match(result.checkoutUrl, /^https:\/\/stripe\.example\/c\//);

    // Stripe customer was created (cached for next subscribe).
    const customerCalls = world.inspect.stripeCalls.filter(c => c.method === "createCustomer");
    assert.equal(customerCalls.length, 1);
  });

  test("step 3: webhook customer.subscription.created upserts subscription", async () => {
    // Pull the most recent Stripe subscription that the mocked
    // createCheckoutSession pre-staged for this customer.
    const stripeSub = [...world.inspect.subsByCustomer.values()].at(-1)!;

    // Replay it as a webhook event. Mock signature uses the test secret.
    const rawBody = JSON.stringify({
      id: "evt_001",
      type: "customer.subscription.created",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: stripeSub.id,
          customer: stripeSub.customerId,
          status: stripeSub.status,
          current_period_end: stripeSub.currentPeriodEnd,
          cancel_at_period_end: stripeSub.cancelAtPeriodEnd,
          trial_end: stripeSub.trialEnd,
          items: { data: stripeSub.items.map(it => ({ price: { id: it.priceId } })) },
          metadata: {
            agencyId: AGENCY_ID,
            clientId: CLIENT_ID,
            endCustomerUserId: CUSTOMER_USER_ID,
            planId: silverId,
            billing: "monthly",
          },
        },
      },
    });
    const result = await services.webhook.handle({
      rawBody,
      signatureHeader: `sig=${world.inspect.webhookSecret}`,
    });
    assert.equal(result.ok, true);
    assert.equal(result.applied, true);
    assert.equal(result.duplicate, false);

    const sub = await services.subscriptions.getByUser(CUSTOMER_USER_ID);
    assert.ok(sub);
    assert.equal(sub?.planId, silverId);
    assert.equal(sub?.stripeSubscriptionId, stripeSub.id);
    // Silver has trialDays: 7, so the mocked checkout creates a
    // "trialing" Stripe subscription — that's the expected status here.
    assert.ok(sub?.status === "trialing" || sub?.status === "active");
  });

  test("step 4: cancel(atPeriodEnd: true) records intent without state change", async () => {
    const sub = await services.subscriptions.cancel({
      endCustomerUserId: CUSTOMER_USER_ID,
      atPeriodEnd: true,
    });
    assert.ok(sub);
    assert.equal(sub?.cancelAtPeriodEnd, true);
    assert.notEqual(sub?.status, "canceled", "status stays active until period end");

    // Only Silver hit Stripe's cancelSubscription — the earlier Bronze
    // cancel went through the free-tier code path (no Stripe).
    const cancelCalls = world.inspect.stripeCalls.filter(c => c.method === "cancelSubscription");
    assert.equal(cancelCalls.length, 1);
    const last = cancelCalls.at(-1)!.args as { atPeriodEnd: boolean };
    assert.equal(last.atPeriodEnd, true);
  });

  test("step 5: getBenefitsForUser walks plan", async () => {
    // Add a benefit to Silver so the walk has something to return.
    const benefit = await services.benefits.create({
      label: "10% off store",
      category: "discount",
      percentOff: 10,
    }, ACTOR);
    await services.plans.update(silverId, { benefitIds: [benefit.id] }, ACTOR);

    const got = await services.benefits.getBenefitsForUser(CUSTOMER_USER_ID);
    assert.equal(got.length, 1);
    assert.equal(got[0]?.label, "10% off store");

    // A user without a subscription gets nothing.
    const empty = await services.benefits.getBenefitsForUser("user_unknown");
    assert.equal(empty.length, 0);
  });

  test("step 6: webhook customer.subscription.deleted cancels subscription", async () => {
    const sub = (await services.subscriptions.getByUser(CUSTOMER_USER_ID))!;
    const rawBody = JSON.stringify({
      id: "evt_002",
      type: "customer.subscription.deleted",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: sub.stripeSubscriptionId,
          customer: sub.stripeCustomerId,
          status: "canceled",
          current_period_end: sub.currentPeriodEnd ? Math.floor(Date.parse(sub.currentPeriodEnd) / 1000) : 0,
          cancel_at_period_end: true,
          items: { data: [{ price: { id: "price_1" } }] },
          metadata: {
            endCustomerUserId: CUSTOMER_USER_ID,
            planId: silverId,
            billing: "monthly",
          },
        },
      },
    });
    const result = await services.webhook.handle({
      rawBody,
      signatureHeader: `sig=${world.inspect.webhookSecret}`,
    });
    assert.equal(result.ok, true);
    const after = await services.subscriptions.getByUser(CUSTOMER_USER_ID);
    assert.equal(after?.status, "canceled");

    // Re-applying the same event id is a no-op (idempotent).
    const replay = await services.webhook.handle({
      rawBody,
      signatureHeader: `sig=${world.inspect.webhookSecret}`,
    });
    assert.equal(replay.duplicate, true);
    assert.equal(replay.applied, false);
  });

  test("step 7: signature verification rejects bad sig", async () => {
    const result = await services.webhook.handle({
      rawBody: '{"id":"evt_999","type":"customer.subscription.created","data":{"object":{}}}',
      signatureHeader: "sig=wrong",
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /signature/i);
  });

  test("step 8: side-effects — activity + events recorded", async () => {
    const log = await world.activity.listActivity({ agencyId: AGENCY_ID, clientId: CLIENT_ID, limit: 100 });
    const actions = log.map(e => e.action);
    assert.ok(actions.some(a => a === "membership.plan_created"), "plan_created logged");
    assert.ok(actions.some(a => a === "membership.subscription_started"), "subscription_started logged");
    assert.ok(actions.some(a => a === "membership.benefit_created"), "benefit_created logged");

    const eventNames = world.inspect.events.map(e => e.name);
    assert.ok(eventNames.includes("membership.subscription_started"));
    assert.ok(eventNames.includes("membership.subscription_changed"));
  });
});
