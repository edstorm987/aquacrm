import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

process.env.PORTAL_BACKEND ??= "memory";

import {
  buildMembershipsContainer,
  MembershipCheckoutPendingReconciliationError,
  MembershipLegacyOperationRecoveryError,
  SubscriptionService,
  SubscriptionOperationConflictError,
  type StripeWebhookEvent,
} from "../src/built-ins/modules/memberships/src/server/index";
import { PlanHasDependantsError } from "../src/built-ins/modules/memberships/src/server/dependencies";
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
  providerSubscriberWrites = 0;
  subscriberWritesOutsideProvider = 0;
  private readonly tails = new Map<string, Promise<void>>();
  private providerDepth = 0;
  private trackProviderSubscriberWrites = false;

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.failNextSetKey === key) {
      this.failNextSetKey = null;
      throw new Error(`forced storage failure: ${key}`);
    }
    if (this.trackProviderSubscriberWrites && key.startsWith("memberships/subscribers/")) {
      if (this.providerDepth > 0) this.providerSubscriberWrites += 1;
      else this.subscriberWritesOutsideProvider += 1;
    }
    this.data.set(key, structuredClone(value));
  }

  trackSubscriberAdoption(): void {
    this.providerSubscriberWrites = 0;
    this.subscriberWritesOutsideProvider = 0;
    this.trackProviderSubscriberWrites = true;
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

  async runProviderExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    return this.runExclusive(key, async () => {
      this.providerDepth += 1;
      try {
        return await operation();
      } finally {
        this.providerDepth -= 1;
      }
    });
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
  readonly checkoutInputs: Parameters<StripePort["createCheckoutSession"]>[0][] = [];
  readonly calls = { checkout: 0, change: 0, cancel: 0 };
  checkoutExpiresAt = Math.floor(Date.now() / 1_000) + 3_600;
  failCancelOnce = false;
  terminalPeriodEndCancel = false;
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
      status: atPeriodEnd && !this.terminalPeriodEndCancel ? current.status : "canceled",
      cancelAtPeriodEnd: atPeriodEnd && !this.terminalPeriodEndCancel,
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
    const result = { ...current, collectionPaused: true };
    this.subscriptions.set(id, result);
    return result;
  }

  async resumeSubscription(id: string): Promise<StripeSubscription> {
    const current = this.subscriptions.get(id);
    if (!current) throw new Error("subscription not found");
    const result = { ...current, collectionPaused: false, cancelAtPeriodEnd: false };
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
      metadata: input.metadata,
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
    this.checkoutInputs.push(structuredClone(input));
    const session = {
      id: `cs_${++this.sequence}`,
      url: `https://stripe.test/cs_${this.sequence}`,
      expiresAt: this.checkoutExpiresAt,
    };
    this.checkoutByKey.set(key, session);
    const subscription: StripeSubscription = {
      id: `sub_${++this.sequence}`,
      customerId: input.customerId!,
      status: "active",
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 86_400,
      cancelAtPeriodEnd: false,
      items: [{ priceId: input.priceId }],
      metadata: input.metadata,
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

function world(storage: MemoryStorage, stripe: FakeStripe, observation?: {
  activities: Map<string, unknown>;
  emitted: Array<{ name: string; payload: unknown }>;
}) {
  const activities = observation?.activities ?? new Map<string, unknown>();
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
  const events: EventBusPort = {
    emit(_scope, name, payload) { observation?.emitted.push({ name, payload }); },
  };
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
  const firstCheckoutAlias = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: "initial-paid-alias",
  });
  assert.deepEqual(firstCheckoutAlias, firstCheckout);
  const firstProviderSub = stripe.latestSubscription();
  await services.subscriptions.upsertFromStripe(firstProviderSub, {
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
  });
  const checkoutReplayAfterWebhook = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: "initial-paid",
  });
  assert.deepEqual(
    checkoutReplayAfterWebhook,
    firstCheckout,
    "the checkout's own webhook transition changed the meaning of an identical operation retry",
  );
  const aliasReplayAfterWebhook = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: "initial-paid-alias",
  });
  assert.deepEqual(
    aliasReplayAfterWebhook,
    firstCheckout,
    "a bound alias changed intent after its checkout webhook updated subscription state",
  );
  assert.equal(stripe.calls.checkout, 1);
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

  const paidToFreeSameOperation = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: free.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: paidToFree.ok ? paidToFree.operationId : "unreachable",
  });
  assert.deepEqual(paidToFreeSameOperation, paidToFree);
  assert.equal(stripe.calls.cancel, 2);

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

  const providerAppliedBeforeCheckpointRecovery = stripe.latestSubscription();
  const reconciliationEvent: StripeWebhookEvent = {
    id: "evt_plan_change_after_checkpoint_failure",
    type: "customer.subscription.updated",
    created: Math.floor(Date.now() / 1_000),
    data: {
      object: {
        id: providerAppliedBeforeCheckpointRecovery.id,
        customer: providerAppliedBeforeCheckpointRecovery.customerId,
        status: providerAppliedBeforeCheckpointRecovery.status,
        cancel_at_period_end: providerAppliedBeforeCheckpointRecovery.cancelAtPeriodEnd,
        items: {
          data: providerAppliedBeforeCheckpointRecovery.items.map(item => ({ price: { id: item.priceId } })),
        },
        metadata: providerAppliedBeforeCheckpointRecovery.metadata,
      },
    },
  };
  assert.equal((await services.webhook.applyEvent(reconciliationEvent)).ok, true);
  assert.equal((await services.subscriptions.getByUser(USER_ID))?.planId, paidB.id);
  await assert.rejects(
    services.subscriptions.subscribe({
      endCustomerUserId: USER_ID,
      planId: paidB.id,
      billing: "monthly",
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
      operationId: "a-regenerated-browser-id-cannot-recover-the-command",
    }),
    /unfinished provider outcome/,
  );

  const originalPaidBPriceId = paidB.stripePriceIdMonthly;
  await services.plans.update(
    paidB.id,
    { name: "Paid B revised", priceMonthly: 3_000, trialDays: 21 },
    "owner",
    "revise-paid-b-after-provider-outcome",
  );
  await services.plans.archive(paidB.id, "owner");

  services = world(storage, stripe);
  const recovered = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidB.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: "paid-a-to-b",
  });
  assert.equal(recovered.ok && recovered.mode, "changed");
  assert.equal(stripe.calls.change, 1, "reload adopts the persisted provider result");
  assert.equal((await services.subscriptions.getByUser(USER_ID))?.planId, paidB.id);
  assert.equal(
    stripe.latestSubscription().items[0]?.priceId,
    originalPaidBPriceId,
    "recovery replaced the provider-applied price with mutable plan terms",
  );
  const providerAfterPlanChange = stripe.latestSubscription();
  const stalePlanMetadataEvent: StripeWebhookEvent = {
    id: "evt_stale_checkout_plan_metadata",
    type: "customer.subscription.updated",
    created: Math.floor(Date.now() / 1_000),
    data: {
      object: {
        id: providerAfterPlanChange.id,
        customer: providerAfterPlanChange.customerId,
        status: providerAfterPlanChange.status,
        cancel_at_period_end: providerAfterPlanChange.cancelAtPeriodEnd,
        items: { data: providerAfterPlanChange.items.map(item => ({ price: { id: item.priceId } })) },
        metadata: {
          agencyId: AGENCY_ID,
          clientId: CLIENT_ID,
          endCustomerUserId: USER_ID,
          planId: paidA.id,
          billing: "monthly",
        },
      },
    },
  };
  assert.equal((await services.webhook.applyEvent(stalePlanMetadataEvent)).ok, true);
  assert.equal(
    (await services.subscriptions.getByUser(USER_ID))?.planId,
    paidB.id,
    "a post-change webhook reused the checkout-era plan metadata",
  );
  const recoveredSameOperation = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidB.id,
    billing: "monthly",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    operationId: recovered.ok ? recovered.operationId : "unreachable",
  });
  assert.deepEqual(recoveredSameOperation, recovered);
  assert.equal(stripe.calls.change, 1, "a completed plan change replayed its provider call");

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

test("provider-backed plan changes and cancellations adopt subscriber state inside the shared provider lane", async () => {
  const storage = new MemoryStorage();
  const stripe = new FakeStripe();
  const services = world(storage, stripe);
  const paidA = await services.plans.create({
    name: "Provider lane A",
    priceMonthly: 1_000,
    currency: "gbp",
  }, "owner", "create-provider-lane-a");
  const paidB = await services.plans.create({
    name: "Provider lane B",
    priceMonthly: 2_000,
    currency: "gbp",
  }, "owner", "create-provider-lane-b");
  await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
    successUrl: "https://app.example.test/membership/provider-lane-success",
    cancelUrl: "https://app.example.test/membership/provider-lane-cancel",
    operationId: "checkout-before-provider-lane-checks",
  });
  await services.subscriptions.upsertFromStripe(stripe.latestSubscription(), {
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
  });

  storage.trackSubscriberAdoption();
  const changed = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidB.id,
    billing: "monthly",
    successUrl: "https://app.example.test/membership/provider-lane-success",
    cancelUrl: "https://app.example.test/membership/provider-lane-cancel",
    operationId: "provider-lane-change-plan",
  });
  assert.equal(changed.ok && changed.mode, "changed");
  assert.equal((await services.subscriptions.getByUser(USER_ID))?.planId, paidB.id);
  assert.ok(storage.providerSubscriberWrites > 0, "the plan change did not adopt subscriber state in the provider lane");
  assert.equal(
    storage.subscriberWritesOutsideProvider,
    0,
    "the plan change released the provider lane before subscriber-state adoption",
  );

  storage.trackSubscriberAdoption();
  const canceled = await services.subscriptions.cancel({
    endCustomerUserId: USER_ID,
    atPeriodEnd: false,
    operationId: "provider-lane-cancel",
  });
  assert.equal(canceled?.status, "canceled");
  assert.ok(storage.providerSubscriberWrites > 0, "the cancellation did not adopt subscriber state in the provider lane");
  assert.equal(
    storage.subscriberWritesOutsideProvider,
    0,
    "the cancellation released the provider lane before subscriber-state adoption",
  );
});

test("a fresh cancellation after resume targets the new subscription generation", async () => {
  for (const atPeriodEnd of [true, false]) {
    const storage = new MemoryStorage();
    const stripe = new FakeStripe();
    let services = world(storage, stripe);
    const paid = await services.plans.create({
      name: atPeriodEnd ? "Period-end generation" : "Immediate generation",
      priceMonthly: 1_000,
      currency: "gbp",
    }, "owner", `create-cancel-generation-${atPeriodEnd}`);
    const checkout = await services.subscriptions.subscribe({
      endCustomerUserId: USER_ID,
      planId: paid.id,
      billing: "monthly",
      successUrl: "https://app.example.test/membership/generation-success",
      cancelUrl: "https://app.example.test/membership/generation-cancel",
      operationId: `checkout-cancel-generation-${atPeriodEnd}`,
    });
    assert.equal(checkout.ok && checkout.mode, "checkout");
    await services.subscriptions.upsertFromStripe(stripe.latestSubscription(), {
      endCustomerUserId: USER_ID,
      planId: paid.id,
      billing: "monthly",
    });

    const oldOperationId = `cancel-generation-old-${atPeriodEnd}`;
    const first = await services.subscriptions.cancel({
      endCustomerUserId: USER_ID,
      atPeriodEnd,
      operationId: oldOperationId,
    });
    assert.ok(first);
    assert.equal(stripe.calls.cancel, 1);

    if (atPeriodEnd) {
      const alreadyScheduled = await services.subscriptions.cancel({
        endCustomerUserId: USER_ID,
        atPeriodEnd: true,
        operationId: "cancel-generation-already-scheduled",
      });
      assert.deepEqual(alreadyScheduled, first);
      assert.equal(stripe.calls.cancel, 1, "an already scheduled period-end cancellation called Stripe again");
    }

    services = world(storage, stripe);
    if (atPeriodEnd) {
      const resumed = await services.subscriptions.resume(USER_ID);
      assert.equal(resumed?.status, "active");
      assert.equal(resumed?.cancelAtPeriodEnd, false);
    } else {
      const terminal = await services.subscriptions.resume(USER_ID);
      assert.equal(terminal?.status, "canceled", "an immediate Stripe cancellation is terminal");
      await services.subscriptions.subscribe({
        endCustomerUserId: USER_ID,
        planId: paid.id,
        billing: "monthly",
        successUrl: "https://app.example.test/membership/generation-success-2",
        cancelUrl: "https://app.example.test/membership/generation-cancel-2",
        operationId: "checkout-cancel-generation-immediate-2",
      });
      await services.subscriptions.upsertFromStripe(stripe.latestSubscription(), {
        endCustomerUserId: USER_ID,
        planId: paid.id,
        billing: "monthly",
      });
    }

    const second = await services.subscriptions.cancel({
      endCustomerUserId: USER_ID,
      atPeriodEnd,
      operationId: `cancel-generation-new-${atPeriodEnd}`,
    });
    assert.ok(second);
    assert.equal(stripe.calls.cancel, 2, "the resumed lifecycle aliased its previous cancellation");

    const exactOldReplay = await services.subscriptions.cancel({
      endCustomerUserId: USER_ID,
      atPeriodEnd,
      operationId: oldOperationId,
    });
    assert.deepEqual(exactOldReplay, first, "the exact historical operation did not replay its own result");
    assert.equal(stripe.calls.cancel, 2);
  }
});

test("pause and resume map Stripe collection state rather than raw subscription status", async () => {
  const storage = new MemoryStorage();
  const stripe = new FakeStripe();
  const services = world(storage, stripe);
  const paid = await services.plans.create({
    name: "Collection pause",
    priceMonthly: 1_000,
    currency: "gbp",
  }, "owner", "create-collection-pause-plan");
  await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly",
    successUrl: "https://app.example.test/membership/pause-success",
    cancelUrl: "https://app.example.test/membership/pause-cancel",
    operationId: "checkout-before-pause",
  });
  await services.subscriptions.upsertFromStripe(stripe.latestSubscription(), {
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly",
  });
  assert.equal((await services.subscriptions.pause(USER_ID))?.status, "paused");
  assert.equal(stripe.latestSubscription().status, "active", "the fake must mirror Stripe's raw status semantics");
  assert.equal(stripe.latestSubscription().collectionPaused, true);
  assert.equal((await services.subscriptions.resume(USER_ID))?.status, "active");
  assert.equal(stripe.latestSubscription().collectionPaused, false);
});

test("provider terminal cancellation publishes one complete lifecycle event", async () => {
  const storage = new MemoryStorage();
  const stripe = new FakeStripe();
  const observation = {
    activities: new Map<string, unknown>(),
    emitted: [] as Array<{ name: string; payload: unknown }>,
  };
  const services = world(storage, stripe, observation);
  const paid = await services.plans.create({
    name: "Scheduled terminal cancellation",
    priceMonthly: 1_000,
    currency: "gbp",
  }, "owner", "create-scheduled-terminal-plan");
  await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly",
    successUrl: "https://app.example.test/membership/terminal-success",
    cancelUrl: "https://app.example.test/membership/terminal-cancel",
    operationId: "checkout-before-scheduled-terminal",
  });
  await services.subscriptions.upsertFromStripe(stripe.latestSubscription(), {
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly",
  });
  await services.subscriptions.cancel({
    endCustomerUserId: USER_ID,
    atPeriodEnd: true,
    operationId: "schedule-terminal-cancel",
  });

  const scheduled = stripe.latestSubscription();
  stripe.subscriptions.set(scheduled.id, {
    ...scheduled,
    status: "canceled",
    cancelAtPeriodEnd: false,
  });
  const terminalEvent = (id: string): StripeWebhookEvent => ({
    id,
    type: "customer.subscription.deleted",
    created: Math.floor(Date.now() / 1_000),
    data: {
      object: {
        id: scheduled.id,
        customer: scheduled.customerId,
        status: "canceled",
        cancel_at_period_end: false,
        items: { data: scheduled.items.map(item => ({ price: { id: item.priceId } })) },
        metadata: scheduled.metadata,
      },
    },
  });
  assert.equal((await services.webhook.applyEvent(terminalEvent("evt_terminal_cancel_one"))).ok, true);
  assert.equal((await services.subscriptions.getByUser(USER_ID))?.status, "canceled");

  const cancellations = observation.emitted.filter(entry =>
    entry.name === "membership.subscription_canceled");
  assert.equal(cancellations.length, 1);
  assert.deepEqual(cancellations[0]?.payload, {
    subscriptionId: (await services.subscriptions.getByUser(USER_ID))?.id,
    userId: USER_ID,
    planId: paid.id,
    billing: "monthly",
  });
  assert.equal(
    [...observation.activities.values()].filter(entry =>
      (entry as { action?: string }).action === "membership.subscription_canceled").length,
    1,
  );

  assert.equal((await services.webhook.applyEvent(terminalEvent("evt_terminal_cancel_two"))).ok, true);
  assert.equal(
    observation.emitted.filter(entry => entry.name === "membership.subscription_canceled").length,
    1,
    "a second terminal provider event emitted a duplicate cancellation",
  );
});

test("a terminal provider response to period-end cancellation publishes one canceled transition", async () => {
  const storage = new MemoryStorage();
  const stripe = new FakeStripe();
  stripe.terminalPeriodEndCancel = true;
  const observation = {
    activities: new Map<string, unknown>(),
    emitted: [] as Array<{ name: string; payload: unknown }>,
  };
  const services = world(storage, stripe, observation);
  const paid = await services.plans.create({
    name: "Provider-terminal period end",
    priceMonthly: 1_000,
    currency: "gbp",
  }, "owner", "create-provider-terminal-period-end-plan");
  await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly",
    successUrl: "https://app.example.test/membership/provider-terminal-success",
    cancelUrl: "https://app.example.test/membership/provider-terminal-cancel",
    operationId: "checkout-before-provider-terminal-period-end",
  });
  await services.subscriptions.upsertFromStripe(stripe.latestSubscription(), {
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly",
  });

  const canceled = await services.subscriptions.cancel({
    endCustomerUserId: USER_ID,
    atPeriodEnd: true,
    operationId: "provider-terminal-period-end-cancel",
  });
  assert.equal(canceled?.status, "canceled");
  assert.equal(canceled?.cancelAtPeriodEnd, false);
  const canceledEvents = () => observation.emitted.filter(entry =>
    entry.name === "membership.subscription_canceled");
  const canceledActivities = () => [...observation.activities.values()].filter(entry =>
    (entry as { action?: string }).action === "membership.subscription_canceled");
  assert.equal(canceledEvents().length, 1);
  assert.equal(canceledActivities().length, 1);
  assert.deepEqual(canceledEvents()[0]?.payload, {
    subscriptionId: canceled?.id,
    userId: USER_ID,
    planId: paid.id,
    billing: "monthly",
  });
  assert.deepEqual(
    (canceledActivities()[0] as { metadata?: unknown }).metadata,
    {
      subscriptionId: canceled?.id,
      planId: paid.id,
      billing: "monthly",
      atPeriodEnd: false,
    },
  );

  const providerSubscription = stripe.latestSubscription();
  const laterTerminalEvent = (id: string): StripeWebhookEvent => ({
    id,
    type: "customer.subscription.deleted",
    created: Math.floor(Date.now() / 1_000),
    data: {
      object: {
        id: providerSubscription.id,
        customer: providerSubscription.customerId,
        status: providerSubscription.status,
        cancel_at_period_end: providerSubscription.cancelAtPeriodEnd,
        items: { data: providerSubscription.items.map(item => ({ price: { id: item.priceId } })) },
        metadata: providerSubscription.metadata,
      },
    },
  });
  assert.equal((await services.webhook.applyEvent(laterTerminalEvent("evt_provider_terminal_period_end_1"))).ok, true);
  assert.equal((await services.webhook.applyEvent(laterTerminalEvent("evt_provider_terminal_period_end_2"))).ok, true);
  assert.equal(canceledEvents().length, 1, "later terminal webhooks duplicated the canceled event");
  assert.equal(canceledActivities().length, 1, "later terminal webhooks duplicated the canceled activity");
});

test("a cancellation no-op stays bound to the already canceled generation", async () => {
  const storage = new MemoryStorage();
  const stripe = new FakeStripe();
  const services = world(storage, stripe);
  const paid = await services.plans.create({
    name: "Canceled generation binding",
    priceMonthly: 1_000,
    currency: "gbp",
  }, "owner", "create-canceled-generation-plan");
  const subscribeInput = {
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly" as const,
    successUrl: "https://app.example.test/membership/canceled-generation-success",
    cancelUrl: "https://app.example.test/membership/canceled-generation-cancel",
  };
  await services.subscriptions.subscribe({ ...subscribeInput, operationId: "checkout-generation-s1" });
  await services.subscriptions.upsertFromStripe(stripe.latestSubscription(), {
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly",
  });
  await services.subscriptions.cancel({
    endCustomerUserId: USER_ID,
    atPeriodEnd: false,
    operationId: "cancel-generation-s1",
  });
  const boundNoOp = await services.subscriptions.cancel({
    endCustomerUserId: USER_ID,
    atPeriodEnd: false,
    operationId: "already-canceled-operation",
  });
  assert.equal(boundNoOp?.status, "canceled");
  assert.equal(stripe.calls.cancel, 1);

  await services.subscriptions.subscribe({ ...subscribeInput, operationId: "checkout-generation-s2" });
  const secondProviderSubscription = stripe.latestSubscription();
  await services.subscriptions.upsertFromStripe(secondProviderSubscription, {
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly",
  });
  assert.equal((await services.subscriptions.getByUser(USER_ID))?.stripeSubscriptionId, secondProviderSubscription.id);

  assert.deepEqual(
    await services.subscriptions.cancel({
      endCustomerUserId: USER_ID,
      atPeriodEnd: false,
      operationId: "already-canceled-operation",
    }),
    boundNoOp,
  );
  assert.equal(stripe.calls.cancel, 1, "a stale no-op operation canceled the replacement subscription");
  assert.equal((await services.subscriptions.getByUser(USER_ID))?.status, "active");
});

test("durable cancellation finalizer commits one event and activity across contenders", async () => {
  const storage = new MemoryStorage();
  const stripe = new FakeStripe();
  const setup = world(storage, stripe);
  const paid = await setup.plans.create({
    name: "Concurrent cancellation",
    priceMonthly: 1_000,
    currency: "gbp",
  }, "owner", "create-concurrent-cancel-plan");
  await setup.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly",
    successUrl: "https://app.example.test/membership/concurrent-success",
    cancelUrl: "https://app.example.test/membership/concurrent-cancel",
    operationId: "checkout-before-concurrent-cancel",
  });
  await setup.subscriptions.upsertFromStripe(stripe.latestSubscription(), {
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly",
  });

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
  const emitted: Array<{ name: string; payload: unknown }> = [];
  const events: EventBusPort = { emit(_scope, name, payload) { emitted.push({ name, payload }); } };
  const user: UserPort = {
    getUser(id) {
      return id === USER_ID
        ? { id, email: "member@example.test", agencyId: AGENCY_ID, clientId: CLIENT_ID }
        : null;
    },
  };
  const laneA = new SubscriptionService(
    AGENCY_ID, CLIENT_ID, storage, activity, events, stripe, user, setup.plans,
  );
  const laneB = new SubscriptionService(
    AGENCY_ID, CLIENT_ID, storage, activity, events, stripe, user, setup.plans,
  );
  const snapshot = await setup.subscriptions.getByUser(USER_ID);
  assert.ok(snapshot?.stripeSubscriptionId);
  const providerSubscription = await stripe.cancelSubscription(
    snapshot.stripeSubscriptionId,
    false,
    "seed-concurrent-cancel-provider-outcome",
  );
  const command = {
    id: "concurrent-cancel-operation",
    signature: "seeded-concurrent-cancel",
    requestSignature: JSON.stringify({ kind: "cancel", atPeriodEnd: false }),
    kind: "cancel" as const,
    stage: "provider_applied" as const,
    userId: USER_ID,
    planId: snapshot.planId,
    billing: snapshot.billing,
    providerSubscriptionId: snapshot.stripeSubscriptionId,
    atPeriodEnd: false,
    subscriptionSnapshot: snapshot,
    providerSubscription,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const archiveKey = `memberships/subscription-operation-commands/${encodeURIComponent(USER_ID)}/${encodeURIComponent(command.id)}`;
  storage.data.set(archiveKey, structuredClone(command));
  storage.data.set(`memberships/subscription-command/${USER_ID}`, structuredClone(command));
  type CancellationFinalizer = {
    finalizeCancellation(
      command: typeof command,
      fallbackSnapshot: NonNullable<typeof snapshot>,
      effectiveAtPeriodEnd: boolean,
    ): Promise<NonNullable<typeof snapshot>>;
  };
  const [left, right] = await Promise.all([
    (laneA as unknown as CancellationFinalizer).finalizeCancellation(command, snapshot, false),
    (laneB as unknown as CancellationFinalizer).finalizeCancellation(command, snapshot, false),
  ]);
  assert.deepEqual(left, right);
  assert.equal(stripe.calls.cancel, 1);
  assert.equal(
    [...activities.values()].filter(entry =>
      (entry as { action?: string }).action === "membership.subscription_canceled").length,
    1,
  );
  const cancellations = emitted.filter(entry => entry.name === "membership.subscription_canceled");
  assert.equal(cancellations.length, 1);
  assert.equal((cancellations[0]?.payload as { planId?: string }).planId, paid.id);
  assert.equal((cancellations[0]?.payload as { billing?: string }).billing, "monthly");
});

test("checkout replay fingerprints every term and blocks a second payable session", async () => {
  const variants = ["price", "trial", "success", "cancel"] as const;

  for (const variant of variants) {
    const storage = new MemoryStorage();
    const stripe = new FakeStripe();
    const services = world(storage, stripe);
    const paid = await services.plans.create({
      name: `Paid ${variant}`,
      priceMonthly: 1_000,
      currency: "gbp",
      trialDays: 14,
    }, "owner", `create-${variant}`);
    const original = {
      endCustomerUserId: USER_ID,
      planId: paid.id,
      billing: "monthly" as const,
      successUrl: "https://app.example.test/membership/success-v1",
      cancelUrl: "https://app.example.test/membership/cancel-v1",
    };

    const first = await services.subscriptions.subscribe({
      ...original,
      operationId: `checkout-${variant}-original`,
    });
    assert.equal(first.ok && first.mode, "checkout");
    assert.equal(stripe.calls.checkout, 1);

    const persisted = storage.data.get(`memberships/subscription-command/${USER_ID}`) as {
      signature: string;
    };
    assert.equal(
      persisted.signature,
      JSON.stringify({
        kind: "subscribe",
        mode: "checkout",
        planId: paid.id,
        billing: "monthly",
        providerSubscriptionId: null,
        priceId: paid.stripePriceIdMonthly,
        trialDays: 14,
        successUrl: original.successUrl,
        cancelUrl: original.cancelUrl,
      }),
      "the durable checkout fingerprint changed field content or ordering",
    );

    const identicalWithAnotherBrowserId = await services.subscriptions.subscribe({
      ...original,
      operationId: `checkout-${variant}-identical`,
    });
    assert.deepEqual(identicalWithAnotherBrowserId, first);
    assert.equal(stripe.calls.checkout, 1, "a live identical intent must adopt its existing session");

    const changed = { ...original };
    if (variant === "price") {
      const updated = await services.plans.update(
        paid.id,
        { priceMonthly: 1_500 },
        "owner",
        "update-checkout-price",
      );
      assert.ok(updated?.stripePriceIdMonthly);
    } else if (variant === "trial") {
      await services.plans.update(paid.id, { trialDays: 0 }, "owner");
    } else if (variant === "success") {
      changed.successUrl = "https://app.example.test/membership/success-v2";
    } else {
      changed.cancelUrl = "https://app.example.test/membership/cancel-v2";
    }

    if (variant === "price" || variant === "trial") {
      assert.deepEqual(
        await services.subscriptions.subscribe({
          ...changed,
          operationId: `checkout-${variant}-original`,
        }),
        first,
        `mutable ${variant} settings changed a completed browser operation's result`,
      );
    } else {
      await assert.rejects(
        services.subscriptions.subscribe({
          ...changed,
          operationId: `checkout-${variant}-original`,
        }),
        (error: unknown) => error instanceof SubscriptionOperationConflictError
          && error.operationId === `checkout-${variant}-original`,
        `changed ${variant} intent reused the original browser operation id`,
      );
    }
    assert.equal(stripe.calls.checkout, 1);

    await assert.rejects(
      services.subscriptions.subscribe({
        ...changed,
        operationId: `checkout-${variant}-changed`,
      }),
      (error: unknown) => error instanceof MembershipCheckoutPendingReconciliationError,
      `changed ${variant} intent created a second simultaneously payable checkout`,
    );
    assert.equal(stripe.calls.checkout, 1);

    if (variant !== "cancel") continue;
    const commandKey = `memberships/subscription-command/${USER_ID}`;
    const expired = structuredClone(storage.data.get(commandKey)) as {
      checkout: StripeCheckoutSession;
    };
    expired.checkout.expiresAt = Math.floor(Date.now() / 1_000) - 1;
    storage.data.set(commandKey, expired);

    const sameOperationAfterExpiry = await services.subscriptions.subscribe({
      ...original,
      operationId: `checkout-${variant}-original`,
    });
    assert.deepEqual(
      sameOperationAfterExpiry,
      first,
      "the same operation id must remain replay-safe even after provider expiry",
    );
    assert.equal(stripe.calls.checkout, 1);

    stripe.checkoutExpiresAt += 3_600;
    await assert.rejects(
      services.subscriptions.subscribe({
        ...changed,
        operationId: "checkout-expired-renewal",
      }),
      (error: unknown) => error instanceof MembershipCheckoutPendingReconciliationError,
      "wall-clock expiry was treated as proof that the last-second payment could not reconcile",
    );
    assert.equal(stripe.calls.checkout, 1);

    assert.equal(
      await services.subscriptions.expireCheckout(USER_ID, "cs_wrong", paid.id, "monthly"),
      false,
      "an unrelated expiry event released the payable checkout",
    );
    assert.equal(
      await services.subscriptions.expireCheckout(USER_ID, expired.checkout.id, paid.id, "monthly"),
      true,
    );
    const renewed = await services.subscriptions.subscribe({
      ...original,
      operationId: "checkout-expired-renewal",
    });
    assert.equal(renewed.ok && renewed.mode, "checkout");
    assert.notDeepEqual(renewed, first, "signed expiry replayed the expired hosted URL");
    assert.equal(stripe.calls.checkout, 2);
  }
});

test("unfinished checkout resumes from its immutable provider terms after plan edits", async () => {
  const storage = new MemoryStorage();
  const stripe = new FakeStripe();
  let services = world(storage, stripe);
  const paid = await services.plans.create({
    name: "Snapshot plan",
    priceMonthly: 1_250,
    currency: "gbp",
    trialDays: 14,
  }, "owner", "create-snapshot-plan");
  const originalPriceId = paid.stripePriceIdMonthly;
  const input = {
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly" as const,
    successUrl: "https://app.example.test/membership/snapshot-success",
    cancelUrl: "https://app.example.test/membership/snapshot-cancel",
    operationId: "unfinished-checkout-snapshot",
  };

  storage.failNextSetKey = `memberships/customer-by-user/${USER_ID}`;
  await assert.rejects(services.subscriptions.subscribe(input), /forced storage failure/);
  assert.equal(stripe.calls.checkout, 0, "the forced failure should leave a pending provider step");

  const revised = await services.plans.update(
    paid.id,
    { name: "Snapshot plan revised", priceMonthly: 2_500, trialDays: 0 },
    "owner",
    "revise-snapshot-plan",
  );
  assert.notEqual(revised?.stripePriceIdMonthly, originalPriceId);
  await services.plans.archive(paid.id, "owner");

  services = world(storage, stripe);
  const recovered = await services.subscriptions.subscribe(input);
  assert.equal(recovered.ok && recovered.mode, "checkout");
  assert.equal(stripe.calls.checkout, 1);
  assert.equal(stripe.checkoutInputs[0]?.priceId, originalPriceId);
  assert.equal(stripe.checkoutInputs[0]?.trialDays, 14);
  assert.equal(stripe.checkoutInputs[0]?.successUrl, input.successUrl);
  assert.equal(stripe.checkoutInputs[0]?.cancelUrl, input.cancelUrl);
});

test("literal pre-ledger commands replay safely or require provider reconciliation", async () => {
  const storage = new MemoryStorage();
  const stripe = new FakeStripe();
  let services = world(storage, stripe);
  const paid = await services.plans.create({
    name: "Legacy literal",
    priceMonthly: 1_000,
    currency: "gbp",
  }, "owner", "create-legacy-literal-plan");
  const input = {
    endCustomerUserId: USER_ID,
    planId: paid.id,
    billing: "monthly" as const,
    successUrl: "https://app.example.test/membership/legacy-success",
    cancelUrl: "https://app.example.test/membership/legacy-cancel",
    operationId: "legacy-literal-subscribe",
  };
  const first = await services.subscriptions.subscribe(input);
  assert.equal(first.ok && first.mode, "checkout");
  const activeKey = `memberships/subscription-command/${USER_ID}`;
  const clearLedger = () => {
    for (const key of [...storage.data.keys()]) {
      if (
        key.startsWith("memberships/subscription-operation-commands/")
        || key.startsWith("memberships/subscription-operation-bindings/")
      ) storage.data.delete(key);
    }
  };
  const asLiteralLegacySubscribe = () => {
    const command = structuredClone(storage.data.get(activeKey)) as Record<string, unknown>;
    command.signature = `subscribe:${paid.id}:monthly`;
    for (const field of [
      "requestSignature",
      "subscribeMode",
      "planName",
      "providerSubscriptionId",
      "priceId",
      "trialDays",
      "successUrl",
      "cancelUrl",
      "customerEmail",
      "customerName",
      "subscriptionSnapshot",
      "checkoutReconciledAt",
    ]) delete command[field];
    const result = command.subscribeResult as Record<string, unknown> | undefined;
    if (result) {
      delete result.planId;
      delete result.billing;
    }
    storage.data.set(activeKey, command);
    clearLedger();
    return command;
  };

  let legacy = asLiteralLegacySubscribe();
  services = world(storage, stripe);
  assert.deepEqual(await services.subscriptions.subscribe(input), first);
  assert.equal(stripe.calls.checkout, 1);

  legacy = asLiteralLegacySubscribe();
  legacy.stage = "provider_applied";
  delete legacy.subscribeResult;
  storage.data.set(activeKey, legacy);
  services = world(storage, stripe);
  const recovered = await services.subscriptions.subscribe(input);
  assert.equal(recovered.ok && recovered.mode, "checkout");
  assert.equal(stripe.calls.checkout, 1, "provider-applied legacy checkout called Stripe again");

  legacy = asLiteralLegacySubscribe();
  legacy.stage = "pending";
  for (const field of ["checkout", "customerId", "providerSubscription", "subscribeResult"]) {
    delete legacy[field];
  }
  storage.data.set(activeKey, legacy);
  services = world(storage, stripe);
  await assert.rejects(
    services.subscriptions.subscribe(input),
    (error: unknown) => error instanceof MembershipLegacyOperationRecoveryError
      && error.operationId === input.operationId,
    "a pre-ledger pending command was misreported as browser operation-id drift",
  );
  assert.equal(stripe.calls.checkout, 1);

  const cancelStorage = new MemoryStorage();
  const cancelStripe = new FakeStripe();
  let cancelServices = world(cancelStorage, cancelStripe);
  const cancelPlan = await cancelServices.plans.create({
    name: "Legacy cancel",
    priceMonthly: 1_000,
    currency: "gbp",
  }, "owner", "create-legacy-cancel-plan");
  await cancelServices.subscriptions.subscribe({
    ...input,
    planId: cancelPlan.id,
    operationId: "legacy-cancel-checkout",
  });
  await cancelServices.subscriptions.upsertFromStripe(cancelStripe.latestSubscription(), {
    endCustomerUserId: USER_ID,
    planId: cancelPlan.id,
    billing: "monthly",
  });
  const beforeCancel = await cancelServices.subscriptions.getByUser(USER_ID);
  assert.ok(beforeCancel);
  const canceled = await cancelServices.subscriptions.cancel({
    endCustomerUserId: USER_ID,
    atPeriodEnd: true,
    operationId: "legacy-literal-cancel",
  });
  assert.ok(canceled);
  const cancelActiveKey = `memberships/subscription-command/${USER_ID}`;
  const downgradeCancel = (stage: "provider_applied" | "completed") => {
    const command = structuredClone(cancelStorage.data.get(cancelActiveKey)) as Record<string, unknown>;
    command.signature = "cancel:period-end";
    command.stage = stage;
    for (const field of [
      "requestSignature",
      "planId",
      "billing",
      "providerSubscriptionId",
      "subscriptionSnapshot",
    ]) delete command[field];
    if (stage === "provider_applied") delete command.cancelResult;
    cancelStorage.data.set(cancelActiveKey, command);
    for (const key of [...cancelStorage.data.keys()]) {
      if (
        key.startsWith("memberships/subscription-operation-commands/")
        || key.startsWith("memberships/subscription-operation-bindings/")
      ) cancelStorage.data.delete(key);
    }
  };
  downgradeCancel("completed");
  cancelServices = world(cancelStorage, cancelStripe);
  assert.deepEqual(
    await cancelServices.subscriptions.cancel({
      endCustomerUserId: USER_ID,
      atPeriodEnd: true,
      operationId: "legacy-literal-cancel",
    }),
    canceled,
  );
  downgradeCancel("provider_applied");
  cancelStorage.data.set(`memberships/subscribers/${USER_ID}`, beforeCancel);
  cancelServices = world(cancelStorage, cancelStripe);
  const recoveredCancel = await cancelServices.subscriptions.cancel({
    endCustomerUserId: USER_ID,
    atPeriodEnd: true,
    operationId: "legacy-literal-cancel",
  });
  assert.equal(recoveredCancel?.cancelAtPeriodEnd, true);
  assert.equal(cancelStripe.calls.cancel, 1, "provider-applied legacy cancel called Stripe again");

  downgradeCancel("provider_applied");
  const unsafeLegacyCommand = cancelStorage.data.get(cancelActiveKey) as { createdAt: number };
  cancelStorage.data.set(`memberships/subscribers/${USER_ID}`, {
    ...beforeCancel,
    updatedAt: unsafeLegacyCommand.createdAt + 1,
  });
  cancelServices = world(cancelStorage, cancelStripe);
  await assert.rejects(
    cancelServices.subscriptions.cancel({
      endCustomerUserId: USER_ID,
      atPeriodEnd: true,
      operationId: "legacy-literal-cancel",
    }),
    (error: unknown) => error instanceof MembershipLegacyOperationRecoveryError,
    "an unfinished legacy cancel borrowed a newer subscription generation",
  );
  assert.equal(cancelStripe.calls.cancel, 1);
});

test("historical operation ids remain bound after newer membership commands", async () => {
  const storage = new MemoryStorage();
  const stripe = new FakeStripe();
  let services = world(storage, stripe);
  const paidA = await services.plans.create({
    name: "Historical A",
    priceMonthly: 1_000,
    currency: "gbp",
  }, "owner", "create-historical-a");
  const paidB = await services.plans.create({
    name: "Historical B",
    priceMonthly: 2_000,
    currency: "gbp",
  }, "owner", "create-historical-b");
  const urls = {
    successUrl: "https://app.example.test/membership/success",
    cancelUrl: "https://app.example.test/membership/cancel",
  };

  const first = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
    operationId: "historical-operation-a",
    ...urls,
  });
  const alias = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
    operationId: "historical-operation-a-alias",
    ...urls,
  });
  assert.deepEqual(alias, first, "an identical live checkout adopts the canonical operation");
  await services.subscriptions.upsertFromStripe(stripe.latestSubscription(), {
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
  });
  await services.plans.archive(paidA.id, "owner");
  assert.deepEqual(
    await services.subscriptions.subscribe({
      endCustomerUserId: USER_ID,
      planId: paidA.id,
      billing: "monthly",
      operationId: "historical-operation-a",
      ...urls,
    }),
    first,
    "archiving a plan invalidated the exact completed-operation replay",
  );

  const second = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidB.id,
    billing: "monthly",
    operationId: "historical-operation-b",
    ...urls,
  });
  assert.equal(second.ok && second.mode, "changed");
  assert.equal(stripe.calls.checkout, 1);
  assert.equal(stripe.calls.change, 1);

  // A fresh service instance proves this is storage-backed, not a process map.
  services = world(storage, stripe);
  const replay = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
    operationId: "historical-operation-a",
    ...urls,
  });
  const aliasReplay = await services.subscriptions.subscribe({
    endCustomerUserId: USER_ID,
    planId: paidA.id,
    billing: "monthly",
    operationId: "historical-operation-a-alias",
    ...urls,
  });
  assert.deepEqual(replay, first);
  assert.deepEqual(aliasReplay, first);
  assert.equal(stripe.calls.checkout, 1, "historical retries must not call the provider again");

  for (const reusedOperationId of ["historical-operation-a", "historical-operation-a-alias"]) {
    await assert.rejects(
      services.subscriptions.subscribe({
        endCustomerUserId: USER_ID,
        planId: paidB.id,
        billing: "monthly",
        operationId: reusedOperationId,
        ...urls,
      }),
      (error: unknown) => error instanceof SubscriptionOperationConflictError
        && error.operationId === reusedOperationId,
    );
  }
  assert.equal(stripe.calls.checkout, 1, "rebound historical ids must fail before provider I/O");
  assert.ok(
    [...storage.data.keys()].some(key => key.startsWith("memberships/subscription-operation-commands/")),
  );
  assert.ok(
    [...storage.data.keys()].some(key => key.startsWith("memberships/subscription-operation-bindings/")),
  );

  assert.equal(
    await services.plans.delete(paidA.id, "owner"),
    true,
    "an authoritatively reconciled checkout stayed as a false plan dependency",
  );
  assert.deepEqual(
    await services.subscriptions.subscribe({
      endCustomerUserId: USER_ID,
      planId: paidA.id,
      billing: "monthly",
      operationId: "historical-operation-a",
      ...urls,
    }),
    first,
    "deleting a safe retired plan erased its historical operation result",
  );
});

test("upgrade keeps a literal legacy checkout blocking replacement and deletion", async () => {
  const storage = new MemoryStorage();
  const stripe = new FakeStripe();
  const services = world(storage, stripe);
  const paidA = await services.plans.create({ name: "Legacy A", priceMonthly: 1_000, currency: "gbp" }, "owner", "legacy-plan-a");
  const paidB = await services.plans.create({ name: "Legacy B", priceMonthly: 2_000, currency: "gbp" }, "owner", "legacy-plan-b");
  const input = {
    endCustomerUserId: USER_ID,
    billing: "monthly" as const,
    successUrl: "https://app.example.test/success",
    cancelUrl: "https://app.example.test/cancel",
  };
  await services.subscriptions.subscribe({ ...input, planId: paidA.id, operationId: "legacy-checkout-a" });

  // Recreate the single-active-command shape written before this ledger.
  for (const key of [...storage.data.keys()]) {
    if (
      key.startsWith("memberships/subscription-operation-commands/")
      || key.startsWith("memberships/subscription-operation-bindings/")
    ) storage.data.delete(key);
  }
  const activeKey = `memberships/subscription-command/${USER_ID}`;
  const legacy = structuredClone(storage.data.get(activeKey)) as Record<string, unknown>;
  legacy.signature = `subscribe:${paidA.id}:monthly`;
  for (const field of [
    "subscribeMode",
    "requestSignature",
    "planName",
    "providerSubscriptionId",
    "priceId",
    "trialDays",
    "successUrl",
    "cancelUrl",
    "customerEmail",
    "customerName",
    "checkoutReconciledAt",
  ]) delete legacy[field];
  storage.data.set(activeKey, legacy);

  await assert.rejects(
    services.subscriptions.subscribe({ ...input, planId: paidB.id, operationId: "new-checkout-b" }),
    (error: unknown) => error instanceof MembershipCheckoutPendingReconciliationError,
    "upgrade allowed a second payable checkout beside a legacy session",
  );
  await assert.rejects(
    services.plans.delete(paidA.id, "owner"),
    (error: unknown) => error instanceof PlanHasDependantsError
      && error.dependencies.pendingSubscriptions === 1,
    "the legacy checkout stopped protecting its target plan",
  );

  const archiveKey = `memberships/subscription-operation-commands/${encodeURIComponent(USER_ID)}/${encodeURIComponent("legacy-checkout-a")}`;
  const archived = structuredClone(storage.data.get(archiveKey)) as { checkout: StripeCheckoutSession };
  archived.checkout.expiresAt = Math.floor(Date.now() / 1_000) - 1;
  storage.data.set(archiveKey, archived);
  await assert.rejects(
    services.plans.delete(paidA.id, "owner"),
    (error: unknown) => error instanceof PlanHasDependantsError
      && error.dependencies.pendingSubscriptions === 1,
    "a delayed checkout webhook can arrive after the hosted URL expires",
  );
  await assert.rejects(
    services.subscriptions.subscribe({ ...input, planId: paidB.id, operationId: "new-checkout-after-expiry" }),
    (error: unknown) => error instanceof MembershipCheckoutPendingReconciliationError,
    "wall-clock expiry released a legacy checkout without provider reconciliation",
  );
  assert.equal(stripe.calls.checkout, 1);
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
  assert.match(customerPanel, /pendingMembershipOperationId/);
  assert.match(customerPanel, /clearMembershipOperationAfterDefinitiveFailure/);
  assert.match(adminPanel, /pendingMembershipOperationId/);
  assert.match(adminPanel, /clearPendingMembershipOperation/);
  assert.match(service, /localUserExclusive/);
  assert.match(service, /localUserProviderExclusive/);
  assert.match(service, /withDependencyGraph/);
  assert.match(service, /membership-subscription-provider:/);
  assert.match(service, /runProviderExclusive/);
  assert.doesNotMatch(
    service,
    /withUserProviderCall[\s\S]{0,320}storage\.runExclusive/,
    "remote Stripe calls must not run inside a PortalState transaction",
  );
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
        return rawSub({
          id,
          cancel_at_period_end: (params as { cancel_at_period_end?: boolean }).cancel_at_period_end === true,
          pause_collection: (params as { pause_collection?: unknown }).pause_collection,
        });
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
          return { id: "cs_1", url: "https://stripe.test/c/cs_1", expires_at: 1_800_000_000 };
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
    idempotencyKey: "plan-gold-monthly-once",
  });
  assert.deepEqual(price, { id: "price_new", productId: "prod_1" });
  const priceParams = lastCall("prices.create")!.args[0] as Record<string, unknown>;
  assert.deepEqual(priceParams.product_data, { name: "Gold", description: "Top tier" });
  assert.equal(priceParams.unit_amount, 2499);
  assert.deepEqual(priceParams.recurring, { interval: "month" });
  assert.deepEqual(lastCall("prices.create")!.args[1], { idempotencyKey: "plan-gold-monthly-once" });

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
  assert.deepEqual(session, {
    id: "cs_1",
    url: "https://stripe.test/c/cs_1",
    expiresAt: 1_800_000_000,
  });
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
  const pausedProjection = await port.pauseSubscription("sub_1");
  assert.deepEqual(lastCall("subscriptions.update")!.args[1], { pause_collection: { behavior: "void" } });
  assert.equal(pausedProjection.status, "active");
  assert.equal(pausedProjection.collectionPaused, true);
  await port.resumeSubscription("sub_1");
  assert.deepEqual(lastCall("subscriptions.update")!.args[1], {
    pause_collection: null,
    cancel_at_period_end: false,
  });

  // Plan change re-prices the EXISTING item — a bare `items: [{price}]` would
  // add a second line instead of switching tier.
  const changeMetadata = {
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    endCustomerUserId: USER_ID,
    planId: "plan_gold",
    billing: "monthly",
  };
  await port.changeSubscriptionPlan({
    id: "sub_1",
    newPriceId: "price_gold",
    metadata: changeMetadata,
    idempotencyKey: "change-once",
  });
  const change = lastCall("subscriptions.update")!.args[1] as Record<string, unknown>;
  assert.deepEqual(change.items, [{ id: "si_1", price: "price_gold" }]);
  assert.equal(change.proration_behavior, "create_prorations");
  assert.deepEqual(change.metadata, changeMetadata);

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
