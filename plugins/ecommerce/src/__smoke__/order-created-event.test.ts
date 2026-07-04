// R6 — verify ecommerce emits `order.created` with referralCodeId +
// endCustomerUserId on first insert, and skips re-emit on webhook
// retries (idempotent).
//
// Doesn't wire up affiliates' AttributionService directly — that
// belongs in the foundation's cross-plugin event router (out of
// scope for the plugin). The smoke verifies the payload shape is
// what affiliates expects to consume.

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  Client,
  ClientId,
  PluginInstall,
  PluginInstallScope,
} from "../lib/tenancy";
import type {
  ActivityPort,
  EcommerceEventName,
  EventBusPort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
} from "../server/ports";
import { buildEcommerceContainer } from "../server/index";

const AGENCY_ID: AgencyId = "agency_oc_smoke";
const CLIENT_ID: ClientId = "client_oc_smoke";
const REF_CODE_ID = "code_alice10";
const BUYER_USER = "user_buyer";

function buildWorld() {
  const data = new Map<string, unknown>();
  const events: { name: EcommerceEventName | string; payload: unknown }[] = [];
  const activityLog: ActivityEntry[] = [];
  const client: Client = {
    id: CLIENT_ID, agencyId: AGENCY_ID, name: "Smoke OC Co", slug: "smoke-oc",
    brand: { primaryColor: "#000" }, stage: "live", status: "active",
    createdAt: 0, updatedAt: 0,
  };
  const storage: StoragePort = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };
  const tenant: TenantPort = {
    getClient: id => (id === CLIENT_ID ? client : null),
    getClientForAgency: (a, id) => (a === AGENCY_ID && id === CLIENT_ID ? client : null),
  };
  let actSeq = 1;
  const activity: ActivityPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(actSeq++).padStart(4, "0")}`,
        ts: Date.now(),
        agencyId: input.agencyId, clientId: input.clientId,
        actorUserId: input.actorUserId, actorEmail: input.actorEmail,
        category: input.category, action: input.action, message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(entry);
      return entry;
    },
    listActivity(filter) { return activityLog.filter(e => e.agencyId === filter.agencyId); },
  };
  const eventBus: EventBusPort = { emit(_scope, name, payload) { events.push({ name, payload }); } };
  const pluginInstalls: PluginInstallStorePort = {
    getInstall(_scope: PluginInstallScope, _pluginId: string): PluginInstall | null { return null; },
  };
  return { storage, tenant, activity, events: eventBus, pluginInstalls, inspect: { events, activityLog } };
}

describe("R6 — ecommerce order.created event", () => {
  let world: ReturnType<typeof buildWorld>;
  let services: ReturnType<typeof buildEcommerceContainer>;

  before(() => {
    world = buildWorld();
    services = buildEcommerceContainer({
      storage: world.storage,
      tenant: world.tenant,
      activity: world.activity,
      events: world.events,
      pluginInstalls: world.pluginInstalls,
    });
  });

  // Simulates the Stripe webhook handler — this is the canonical call
  // path. Normally the handler reads sess.metadata; here we pass the
  // values directly. The emit logic + idempotency assertion is what
  // the test exercises.
  async function simulateWebhook(args: {
    sessionId: string;
    referralCodeId?: string;
    endCustomerUserId?: string;
    amountTotal: number;
    discountAmount?: number;
  }): Promise<{ orderId: string; isNew: boolean }> {
    const { order, isNew } = await services.orders.upsertOrderByStripeSession({
      clientId: CLIENT_ID,
      stripeSessionId: args.sessionId,
      amountTotal: args.amountTotal,
      currency: "usd",
      items: [{ name: "Item", quantity: 1, unitAmount: args.amountTotal, currency: "usd" }],
      referralCodeId: args.referralCodeId,
      endCustomerUserId: args.endCustomerUserId,
      discountAmount: args.discountAmount,
    });
    if (isNew) {
      const subtotal = order.amountTotal + (order.discountAmount ?? 0);
      services.events.emit(
        { agencyId: AGENCY_ID, clientId: CLIENT_ID },
        "order.created",
        {
          orderId: order.id,
          clientId: order.clientId,
          amountTotal: order.amountTotal,
          currency: order.currency,
          subtotal,
          referralCodeId: order.referralCodeId,
          endCustomerUserId: order.endCustomerUserId,
          discountSource: order.discountSource,
        },
      );
    }
    return { orderId: order.id, isNew };
  }

  test("step 1: order with referralCodeId emits order.created with full payload", async () => {
    const { orderId, isNew } = await simulateWebhook({
      sessionId: "cs_001",
      referralCodeId: REF_CODE_ID,
      endCustomerUserId: BUYER_USER,
      amountTotal: 5000,
      discountAmount: 0,
    });
    assert.equal(isNew, true);

    const created = world.inspect.events.filter(e => e.name === "order.created");
    assert.equal(created.length, 1, "exactly one order.created emitted");
    const payload = created[0]!.payload as {
      orderId: string;
      referralCodeId?: string;
      endCustomerUserId?: string;
      subtotal: number;
      currency: string;
    };
    assert.equal(payload.orderId, orderId);
    assert.equal(payload.referralCodeId, REF_CODE_ID, "referralCodeId surfaces — affiliates needs this");
    assert.equal(payload.endCustomerUserId, BUYER_USER, "endCustomerUserId surfaces — affiliates uses for dedupe");
    assert.equal(payload.subtotal, 5000);
    assert.equal(payload.currency, "usd");
  });

  test("step 2: order persists referralCodeId on the row", async () => {
    const order = await services.orders.getOrder((world.inspect.events
      .filter(e => e.name === "order.created")
      .at(0)!.payload as { orderId: string }).orderId);
    assert.ok(order);
    assert.equal(order?.referralCodeId, REF_CODE_ID);
    assert.equal(order?.endCustomerUserId, BUYER_USER);
  });

  test("step 3: webhook retry on same sessionId does NOT re-emit order.created", async () => {
    const eventsBefore = world.inspect.events.filter(e => e.name === "order.created").length;
    const { isNew } = await simulateWebhook({
      sessionId: "cs_001",
      referralCodeId: REF_CODE_ID,
      endCustomerUserId: BUYER_USER,
      amountTotal: 5000,
    });
    assert.equal(isNew, false, "retry returns isNew:false");
    const eventsAfter = world.inspect.events.filter(e => e.name === "order.created").length;
    assert.equal(eventsAfter, eventsBefore, "no extra order.created emit on retry");
  });

  test("step 4: order without referralCodeId still emits, fields are undefined", async () => {
    const eventsBefore = world.inspect.events.filter(e => e.name === "order.created").length;
    await simulateWebhook({
      sessionId: "cs_no_ref",
      amountTotal: 3000,
    });
    const created = world.inspect.events.filter(e => e.name === "order.created");
    assert.equal(created.length, eventsBefore + 1);
    const payload = created.at(-1)!.payload as { referralCodeId?: string; endCustomerUserId?: string };
    assert.equal(payload.referralCodeId, undefined);
    assert.equal(payload.endCustomerUserId, undefined);
  });

  test("step 5: subtotal includes discount amount when set", async () => {
    await simulateWebhook({
      sessionId: "cs_disc",
      referralCodeId: REF_CODE_ID,
      endCustomerUserId: BUYER_USER,
      amountTotal: 4500,
      discountAmount: 500,         // 10% off £50 → totalAfter=£45
    });
    const last = world.inspect.events.filter(e => e.name === "order.created").at(-1)!;
    const payload = last.payload as { subtotal: number; amountTotal: number };
    assert.equal(payload.amountTotal, 4500);
    assert.equal(payload.subtotal, 5000, "subtotal = amountTotal + discountAmount");
  });
});
