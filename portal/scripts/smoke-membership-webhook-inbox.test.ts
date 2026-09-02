import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { buildMembershipsContainer } from "../src/built-ins/modules/memberships/src/server/index";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
  StripePort,
  StripeSubscription,
  StripeWebhookEvent,
} from "../src/built-ins/modules/memberships/src/server/ports";

const AGENCY_ID = "agency_membership_webhook";
const CLIENT_ID = "client_membership_webhook";
const USER_ID = "user_membership_webhook";

class FaultStorage implements StoragePort {
  readonly data = new Map<string, unknown>();
  failNextSetKey: string | null = null;
  private readonly tails = new Map<string, Promise<void>>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (key === this.failNextSetKey) {
      this.failNextSetKey = null;
      throw new Error(`forced webhook storage failure: ${key}`);
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

  runProviderExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    return this.runExclusive(`provider:${key}`, operation);
  }

  async del(key: string): Promise<void> { this.data.delete(key); }
  async list(prefix = ""): Promise<string[]> {
    return [...this.data.keys()].filter(key => key.startsWith(prefix));
  }
}

function fakeStripe(): StripePort {
  const unused = async (): Promise<never> => { throw new Error("unused Stripe method"); };
  return {
    createCustomer: unused,
    async retrieveCustomer() { return null; },
    createSubscription: unused,
    cancelSubscription: unused,
    async retrieveSubscription(id) {
      return {
        id,
        customerId: id.startsWith("sub_generation_")
          ? "cus_generation_shared"
          : id.replace(/^sub_/, "cus_"),
        status: "active",
        currentPeriodEnd: 1_779_000_000,
        cancelAtPeriodEnd: false,
        items: [{ priceId: "price_membership" }],
      };
    },
    pauseSubscription: unused,
    resumeSubscription: unused,
    changeSubscriptionPlan: unused,
    createCheckoutSession: unused,
    createBillingPortalSession: unused,
    createPrice: unused,
    async verifyWebhookSignature() { return null; },
  };
}

function subscriptionEvent(id: string, overrides: Record<string, unknown> = {}): StripeWebhookEvent {
  return {
    id,
    type: "customer.subscription.updated",
    created: 1_777_000_000,
    data: {
      object: {
        id: `sub_${id}`,
        customer: `cus_${id}`,
        status: "active",
        current_period_end: 1_779_000_000,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: "price_membership" } }] },
        metadata: {
          agencyId: AGENCY_ID,
          clientId: CLIENT_ID,
          endCustomerUserId: USER_ID,
          planId: "plan_paid",
          billing: "monthly",
        },
        ...overrides,
      },
    },
  };
}

function paymentEvent(id: string): StripeWebhookEvent {
  return {
    id,
    type: "invoice.paid",
    created: 1_777_000_000,
    data: {
      object: {
        id: "in_membership_paid",
        customer: "cus_paid",
        subscription: "sub_paid",
        amount_paid: 2_500,
        currency: "gbp",
        parent: {
          subscription_details: {
            metadata: {
              agencyId: AGENCY_ID,
              clientId: CLIENT_ID,
              endCustomerUserId: USER_ID,
            },
          },
        },
      },
    },
  };
}

function buildWorld(storage: FaultStorage, stripe: StripePort = fakeStripe()) {
  storage.data.set("memberships/plans/index", ["plan_paid"]);
  storage.data.set("memberships/plans/plan_paid", {
    id: "plan_paid",
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    name: "Webhook plan",
    priceMonthly: 2_500,
    priceAnnual: 25_000,
    currency: "gbp",
    features: [],
    benefitIds: [],
    status: "active",
    order: 10,
    createdAt: 1,
    updatedAt: 1,
  });
  const emitted: Array<{ scope: { agencyId: string; clientId?: string }; name: string; payload: unknown }> = [];
  const activityRows = new Map<string, unknown>();
  let failActivityOnce = false;
  const activity: ActivityLogPort = {
    logActivity(input) {
      if (failActivityOnce) {
        failActivityOnce = false;
        throw new Error("forced membership activity failure");
      }
      const key = input.idempotencyKey ?? `activity-${activityRows.size + 1}`;
      const existing = activityRows.get(key);
      if (existing) return existing as never;
      const row = { id: key, ts: Date.now(), ...input };
      activityRows.set(key, row);
      return row as never;
    },
    listActivity() { return [...activityRows.values()] as never; },
  };
  const events: EventBusPort = {
    emit(scope, name, payload) { emitted.push({ scope, name, payload }); },
  };
  const services = buildMembershipsContainer({
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    storage,
    activity,
    events,
    stripe,
    tenant: {
      getClient() { return null; },
      getClientForAgency() { return null; },
    },
    user: { getUser() { return null; } },
    pluginInstalls: { getInstall() { return null; } },
  });
  return {
    services,
    emitted,
    activityRows,
    failNextActivity() { failActivityOnce = true; },
  };
}

test("failed subscriber delivery remains retryable and completes after a fresh container", async () => {
  const storage = new FaultStorage();
  let world = buildWorld(storage);
  storage.failNextSetKey = `memberships/subscribers/${USER_ID}`;
  const event = subscriptionEvent("evt_retry_subscription");

  const failed = await world.services.webhook.applyEvent(event);
  assert.equal(failed.ok, false);
  assert.equal(failed.retryable, true);
  assert.equal(await world.services.subscriptions.getByUser(USER_ID), null);
  assert.deepEqual(
    (await storage.get<{ status: string; attempts: number; lastError: string }>(
      `memberships/webhook/seen/${event.id}`,
    ))?.status,
    "failed",
  );

  world = buildWorld(storage);
  const retry = await world.services.webhook.applyEvent(event);
  assert.equal(retry.ok, true);
  assert.equal(retry.applied, true);
  assert.equal((await world.services.subscriptions.getByUser(USER_ID))?.stripeSubscriptionId, `sub_${event.id}`);
  const delivery = await storage.get<{ status: string; attempts: number }>(
    `memberships/webhook/seen/${event.id}`,
  );
  assert.equal(delivery?.status, "completed");
  assert.equal(delivery?.attempts, 2);

  const duplicate = await world.services.webhook.applyEvent(event);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.applied, false);
});

test("a completed subscription delivery is acknowledged without calling Stripe again", async () => {
  const storage = new FaultStorage();
  const event = subscriptionEvent("evt_completed_without_provider");
  assert.equal((await buildWorld(storage).services.webhook.applyEvent(event)).ok, true);
  let retrieves = 0;
  const unavailableStripe: StripePort = {
    ...fakeStripe(),
    async retrieveSubscription() {
      retrieves += 1;
      throw new Error("Stripe is unavailable");
    },
  };
  const duplicate = await buildWorld(storage, unavailableStripe).services.webhook.applyEvent(event);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(retrieves, 0);
});

test("metadata is scope-complete and concurrent delivery has one owner", async () => {
  const storage = new FaultStorage();
  const world = buildWorld(storage);
  const missing = subscriptionEvent("evt_missing_scope", {
    metadata: { endCustomerUserId: USER_ID, planId: "plan_paid", billing: "monthly" },
  });
  const missingResult = await world.services.webhook.applyEvent(missing);
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.retryable, true);
  assert.match(missingResult.error ?? "", /metadata\.agencyId is required/);

  const wrongScope = subscriptionEvent("evt_wrong_scope", {
    metadata: {
      agencyId: "agency_other",
      clientId: CLIENT_ID,
      endCustomerUserId: USER_ID,
      planId: "plan_paid",
      billing: "monthly",
    },
  });
  const wrongResult = await world.services.webhook.applyEvent(wrongScope);
  assert.equal(wrongResult.ok, false);
  assert.match(wrongResult.error ?? "", /does not match/);

  const concurrentEvent = subscriptionEvent("evt_concurrent");
  const results = await Promise.all([
    world.services.webhook.applyEvent(concurrentEvent),
    world.services.webhook.applyEvent(concurrentEvent),
  ]);
  assert.equal(results.filter(result => result.applied).length, 1);
  assert.equal(results.filter(result => result.duplicate).length, 1);

  const legacyEvent = subscriptionEvent("evt_legacy_preseen");
  await storage.set(`memberships/webhook/seen/${legacyEvent.id}`, {
    id: legacyEvent.id,
    type: legacyEvent.type,
    receivedAt: 1,
  });
  const legacyRetry = await world.services.webhook.applyEvent(legacyEvent);
  assert.equal(legacyRetry.applied, true, "legacy pre-work markers are retried, not trusted as complete");
  assert.equal(
    (await storage.get<{ status: string }>(`memberships/webhook/seen/${legacyEvent.id}`))?.status,
    "completed",
  );
});

test("signed checkout expiry releases only its exact hosted session", async () => {
  const storage = new FaultStorage();
  const world = buildWorld(storage);
  const commandKey = `memberships/subscription-command/${USER_ID}`;
  storage.data.set(commandKey, {
    id: "checkout-awaiting-expiry",
    signature: "legacy-checkout-signature",
    requestSignature: "legacy-checkout-request",
    kind: "subscribe",
    stage: "completed",
    userId: USER_ID,
    planId: "plan_paid",
    billing: "monthly",
    subscribeMode: "checkout",
    checkout: { id: "cs_expired_exact", url: "https://stripe.test/cs_expired_exact" },
    subscribeResult: {
      ok: true,
      mode: "checkout",
      checkoutUrl: "https://stripe.test/cs_expired_exact",
      operationId: "checkout-awaiting-expiry",
      planId: "plan_paid",
      billing: "monthly",
    },
    createdAt: 1,
    updatedAt: 1,
  });
  const event: StripeWebhookEvent = {
    id: "evt_checkout_expired_exact",
    type: "checkout.session.expired",
    created: 1_777_000_100,
    data: {
      object: {
        id: "cs_expired_exact",
        metadata: {
          agencyId: AGENCY_ID,
          clientId: CLIENT_ID,
          endCustomerUserId: USER_ID,
          planId: "plan_paid",
          billing: "monthly",
        },
      },
    },
  };

  const result = await world.services.webhook.applyEvent(event);
  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(
    (await storage.get<{ checkoutReconciledAt?: number }>(commandKey))?.checkoutReconciledAt !== undefined,
    true,
  );
});

test("late subscription webhooks cannot replace a newer provider generation", async () => {
  const storage = new FaultStorage();
  const world = buildWorld(storage);
  const first = subscriptionEvent("generation_s1");
  first.created = 1_777_000_100;
  assert.equal((await world.services.webhook.applyEvent(first)).ok, true);

  const second = subscriptionEvent("generation_s2");
  second.created = 1_777_000_300;
  storage.data.set(`memberships/subscription-command/${USER_ID}`, {
    id: "checkout-generation-s2",
    signature: "checkout-generation-s2-signature",
    requestSignature: "checkout-generation-s2-request",
    kind: "subscribe",
    stage: "completed",
    userId: USER_ID,
    planId: "plan_paid",
    billing: "monthly",
    subscribeMode: "checkout",
    customerId: "cus_generation_shared",
    retiredProviderSubscriptionIds: ["sub_generation_s1"],
    checkout: { id: "cs_generation_s2", url: "https://stripe.test/cs_generation_s2" },
    subscribeResult: {
      ok: true,
      mode: "checkout",
      checkoutUrl: "https://stripe.test/cs_generation_s2",
      operationId: "checkout-generation-s2",
      planId: "plan_paid",
      billing: "monthly",
    },
    createdAt: 2,
    updatedAt: 2,
  });
  assert.equal((await world.services.webhook.applyEvent(second)).ok, true);
  assert.equal(
    (await world.services.subscriptions.getByUser(USER_ID))?.stripeSubscriptionId,
    "sub_generation_s2",
  );
  assert.deepEqual(
    (await world.services.subscriptions.getByUser(USER_ID))?.retiredStripeSubscriptionIds,
    ["sub_generation_s1"],
  );

  const olderSameSubscription = subscriptionEvent("older_same_subscription", {
    id: "sub_generation_s2",
    customer: "cus_generation_s2",
    status: "canceled",
  });
  olderSameSubscription.type = "customer.subscription.deleted";
  olderSameSubscription.created = 1_777_000_200;
  assert.equal((await world.services.webhook.applyEvent(olderSameSubscription)).ok, true);
  assert.equal((await world.services.subscriptions.getByUser(USER_ID))?.status, "active");

  const lateOldGeneration = subscriptionEvent("late_old_generation", {
    id: "sub_generation_s1",
    customer: "cus_generation_s1",
    status: "canceled",
  });
  lateOldGeneration.type = "customer.subscription.deleted";
  lateOldGeneration.created = 1_777_000_400;
  assert.equal((await world.services.webhook.applyEvent(lateOldGeneration)).ok, true);
  const current = await world.services.subscriptions.getByUser(USER_ID);
  assert.equal(current?.stripeSubscriptionId, "sub_generation_s2");
  assert.equal(current?.status, "active");

  storage.data.set(`memberships/subscribers/${USER_ID}`, {
    ...current,
    stripeSubscriptionId: undefined,
    retiredStripeSubscriptionIds: ["sub_generation_s1", "sub_generation_s2"],
    updatedAt: (current?.updatedAt ?? 0) + 1,
  });
  storage.data.set(`memberships/subscription-command/${USER_ID}`, {
    id: "checkout-generation-s3",
    signature: "checkout-generation-s3-signature",
    requestSignature: "checkout-generation-s3-request",
    kind: "subscribe",
    stage: "completed",
    userId: USER_ID,
    planId: "plan_paid",
    billing: "monthly",
    subscribeMode: "checkout",
    customerId: "cus_generation_shared",
    retiredProviderSubscriptionIds: ["sub_generation_s1", "sub_generation_s2"],
    checkout: { id: "cs_generation_s3", url: "https://stripe.test/cs_generation_s3" },
    subscribeResult: {
      ok: true,
      mode: "checkout",
      checkoutUrl: "https://stripe.test/cs_generation_s3",
      operationId: "checkout-generation-s3",
      planId: "plan_paid",
      billing: "monthly",
    },
    createdAt: 3,
    updatedAt: 3,
  });

  const veryLateFirstGeneration = subscriptionEvent("very_late_first_generation", {
    id: "sub_generation_s1",
    customer: "cus_generation_shared",
  });
  assert.equal((await world.services.webhook.applyEvent(veryLateFirstGeneration)).ok, true);
  assert.equal(
    (await world.services.subscriptions.getByUser(USER_ID))?.stripeSubscriptionId,
    undefined,
    "a live checkout must not adopt any previously retired provider generation",
  );

  const third = subscriptionEvent("generation_s3", {
    customer: "cus_generation_shared",
  });
  assert.equal((await world.services.webhook.applyEvent(third)).ok, true);
  const thirdCurrent = await world.services.subscriptions.getByUser(USER_ID);
  assert.equal(thirdCurrent?.stripeSubscriptionId, "sub_generation_s3");
  assert.deepEqual(
    thirdCurrent?.retiredStripeSubscriptionIds,
    ["sub_generation_s1", "sub_generation_s2"],
  );
});

test("legacy subscription events re-read inside the canonical user provider lane", async () => {
  const storage = new FaultStorage();
  let providerStatus = "active";
  let releaseDiscovery!: () => void;
  let discoveryStarted!: () => void;
  const release = new Promise<void>(resolve => { releaseDiscovery = resolve; });
  const started = new Promise<void>(resolve => { discoveryStarted = resolve; });
  let firstRetrieve = true;
  const projection = (status: string): StripeSubscription => ({
    id: "sub_alias_race",
    customerId: "cus_alias_race",
    status,
    cancelAtPeriodEnd: false,
    items: [{ priceId: "price_membership" }],
    metadata: {
      agencyId: AGENCY_ID,
      clientId: CLIENT_ID,
      endCustomerUserId: USER_ID,
      planId: "plan_paid",
      billing: "monthly",
    },
  });
  const stripe: StripePort = {
    ...fakeStripe(),
    async retrieveSubscription() {
      if (firstRetrieve) {
        firstRetrieve = false;
        const stale = projection("active");
        discoveryStarted();
        await release;
        return stale;
      }
      return projection(providerStatus);
    },
    async cancelSubscription() {
      providerStatus = "canceled";
      return projection(providerStatus);
    },
  };
  const world = buildWorld(storage, stripe);
  storage.data.set(`memberships/subscribers/${USER_ID}`, {
    id: "membership_alias_race",
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    endCustomerUserId: USER_ID,
    planId: "plan_paid",
    stripeCustomerId: "cus_alias_race",
    stripeSubscriptionId: "sub_alias_race",
    billing: "monthly",
    status: "active",
    cancelAtPeriodEnd: false,
    createdAt: 1,
    updatedAt: 1,
  });

  const event = subscriptionEvent("alias_race", {
    id: "sub_alias_race",
    customer: "cus_alias_race",
    metadata: {
      agencyId: AGENCY_ID,
      clientId: CLIENT_ID,
      planId: "plan_paid",
      billing: "monthly",
    },
  });
  const webhook = world.services.webhook.applyEvent(event);
  await started;
  const canceled = await world.services.subscriptions.cancel({
    endCustomerUserId: USER_ID,
    atPeriodEnd: false,
    operationId: "cancel-during-legacy-webhook-discovery",
  });
  assert.equal(canceled?.status, "canceled");
  releaseDiscovery();
  assert.equal((await webhook).ok, true);
  assert.equal(
    (await world.services.subscriptions.getByUser(USER_ID))?.status,
    "canceled",
    "the stale discovery snapshot must never overwrite the in-lane provider re-read",
  );
  const cancellations = world.emitted.filter(entry =>
    entry.name === "membership.subscription_canceled");
  assert.equal(cancellations.length, 1);
  assert.equal((cancellations[0]?.payload as { planId?: string }).planId, "plan_paid");
  assert.equal((cancellations[0]?.payload as { billing?: string }).billing, "monthly");
});

test("payment delivery persists scoped ledger state before retry-safe side effects", async () => {
  const storage = new FaultStorage();
  let world = buildWorld(storage);
  world.failNextActivity();
  const event = paymentEvent("evt_payment_retry");

  const failed = await world.services.webhook.applyEvent(event);
  assert.equal(failed.ok, false);
  assert.equal(failed.retryable, true);
  assert.equal(world.emitted.length, 0);
  const staged = await storage.get<{
    agencyId: string;
    clientId: string;
    amountCents: number;
    status: string;
    eventId: string;
  }>("memberships/payments/in_membership_paid");
  assert.deepEqual(staged, {
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    invoiceId: "in_membership_paid",
    stripeCustomerId: "cus_paid",
    stripeSubscriptionId: "sub_paid",
    status: "paid",
    amountCents: 2_500,
    currency: "gbp",
    eventId: event.id,
    occurredAt: event.created * 1_000,
    updatedAt: staged?.updatedAt,
  });

  world = buildWorld(storage);
  const retry = await world.services.webhook.applyEvent(event);
  assert.equal(retry.ok, true);
  assert.equal(world.emitted.length, 1);
  assert.deepEqual(world.emitted[0]?.scope, { agencyId: AGENCY_ID, clientId: CLIENT_ID });
  assert.equal(world.emitted[0]?.name, "membership.payment_succeeded");
  assert.equal((world.emitted[0]?.payload as { webhookEventId?: string }).webhookEventId, event.id);
  assert.equal(world.activityRows.size, 1);

  const duplicate = await world.services.webhook.applyEvent(event);
  assert.equal(duplicate.duplicate, true);
  assert.equal(world.emitted.length, 1);
  assert.equal(world.activityRows.size, 1);
});

test("payment ledger is paid-dominant and emits each invoice transition once", async () => {
  const storage = new FaultStorage();
  const world = buildWorld(storage);
  const failed = paymentEvent("evt_payment_failed_first");
  failed.type = "invoice.payment_failed";
  failed.data.object.amount_due = 2_700;
  failed.data.object.metadata = { purchaseOrder: "PO-1042" };

  const failedResult = await world.services.webhook.applyEvent(failed);
  assert.equal(failedResult.applied, true);
  assert.equal(
    (await storage.get<{ status: string }>("memberships/payments/in_membership_paid"))?.status,
    "failed",
    "unrelated invoice metadata must not shadow scoped subscription metadata",
  );

  const paid = paymentEvent("evt_payment_paid_after_failure");
  assert.equal((await world.services.webhook.applyEvent(paid)).applied, true);
  const paidRecord = await storage.get<{ status: string; amountCents: number }>(
    "memberships/payments/in_membership_paid",
  );
  assert.equal(paidRecord?.status, "paid");
  assert.equal(paidRecord?.amountCents, 2_500);
  assert.deepEqual(world.emitted.map(entry => entry.name), [
    "membership.payment_failed",
    "membership.payment_succeeded",
  ]);

  const alternateSuccess = paymentEvent("evt_payment_succeeded_duplicate");
  alternateSuccess.type = "invoice.payment_succeeded";
  assert.equal((await world.services.webhook.applyEvent(alternateSuccess)).applied, false);

  const lateFailure = paymentEvent("evt_payment_failed_late");
  lateFailure.type = "invoice.payment_failed";
  lateFailure.data.object.amount_due = 2_900;
  assert.equal((await world.services.webhook.applyEvent(lateFailure)).applied, false);
  const converged = await storage.get<{ status: string; amountCents: number }>(
    "memberships/payments/in_membership_paid",
  );
  assert.equal(converged?.status, "paid");
  assert.equal(converged?.amountCents, 2_500);
  assert.equal(world.emitted.length, 2);
  assert.equal(world.activityRows.size, 2);
});

test("mounted webhook maps retryable processing failure to 503", async () => {
  const source = await readFile(
    join(process.cwd(), "src/built-ins/modules/memberships/src/api/handlers.ts"),
    "utf8",
  );
  assert.match(source, /result\.retryable \? 503 : 400/);
  assert.doesNotMatch(source, /\{ agencyId: "", clientId: "" \}/);
});
