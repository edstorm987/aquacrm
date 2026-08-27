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
    async retrieveSubscription() { return null; },
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

function buildWorld(storage: FaultStorage) {
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
    stripe: fakeStripe(),
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

test("mounted webhook maps retryable processing failure to 503", async () => {
  const source = await readFile(
    join(process.cwd(), "src/built-ins/modules/memberships/src/api/handlers.ts"),
    "utf8",
  );
  assert.match(source, /result\.retryable \? 503 : 400/);
  assert.doesNotMatch(source, /\{ agencyId: "", clientId: "" \}/);
});
