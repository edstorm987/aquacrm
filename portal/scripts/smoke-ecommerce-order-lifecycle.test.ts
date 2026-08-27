import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import type { PluginCtx } from "../src/built-ins/modules/ecommerce/src/lib/aquaPluginTypes";
import {
  applyVerifiedEcommerceWebhookEvent,
  getOrderBySessionHandler,
  stripeCheckoutHandler,
  type EcommerceWebhookEvent,
} from "../src/built-ins/modules/ecommerce/src/api/handlers";
import {
  buildEcommerceContainer,
  clearEcommerceFoundation,
  OrderTransitionError,
  registerEcommerceFoundation,
} from "../src/built-ins/modules/ecommerce/src/server/index";
import type { CheckoutOperation } from "../src/built-ins/modules/ecommerce/src/server/checkout";
import type {
  ActivityPort,
  EventBusPort,
  StoragePort,
} from "../src/built-ins/modules/ecommerce/src/server/ports";

const AGENCY_ID = "agency_ecommerce_lifecycle";
const CLIENT_ID = "client_ecommerce_lifecycle";

class FaultStorage implements StoragePort {
  readonly data = new Map<string, unknown>();
  failNextSetPrefix: string | null = null;
  private readonly tails = new Map<string, Promise<void>>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.failNextSetPrefix && key.startsWith(this.failNextSetPrefix)) {
      this.failNextSetPrefix = null;
      throw new Error(`forced ecommerce lifecycle failure: ${key}`);
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
    try { return await operation(); }
    finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  async del(key: string): Promise<void> { this.data.delete(key); }
  async list(prefix = ""): Promise<string[]> {
    return [...this.data.keys()].filter(key => key.startsWith(prefix));
  }
}

function checkoutEvent(
  eventId: string,
  sessionId: string,
  overrides: Record<string, unknown> = {},
): EcommerceWebhookEvent {
  return {
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        payment_status: "paid",
        payment_intent: `pi_${sessionId}`,
        amount_total: 1_000,
        currency: "gbp",
        customer_email: "buyer@example.test",
        metadata: {
          clientId: CLIENT_ID,
          checkoutOperationId: `checkout-${sessionId}`,
          expectedAmountTotal: "1000",
          expectedCurrency: "gbp",
          expectedItemCount: "1",
        },
        line_items: {
          data: [{ description: "Test item", quantity: 1, amount_total: 1_000, currency: "gbp" }],
        },
        ...overrides,
      },
    },
  };
}

async function primeCheckout(world: ReturnType<typeof buildWorld>, sessionId: string): Promise<void> {
  const operationId = `checkout-${sessionId}`;
  const request = {
    version: 1 as const,
    operationId,
    items: [{ productId: "product_test", quantity: 1 }],
  };
  const operation: CheckoutOperation = {
    id: operationId,
    fingerprint: JSON.stringify(request),
    status: "provider_created",
    request,
    lines: [{
      productId: "product_test",
      productSlug: "test-item",
      name: "Test item",
      quantity: 1,
      unitAmount: 1_000,
      currency: "gbp",
      taxBehavior: "inclusive",
      digital: true,
      weightGrams: 0,
    }],
    inventory: [],
    currency: "gbp",
    subtotal: 1_000,
    discountAmount: 0,
    shipping: { amount: 0 },
    taxAmount: 0,
    taxAddedAmount: 0,
    amountTotal: 1_000,
    providerSessionId: sessionId,
    providerUrl: `https://checkout.stripe.test/${sessionId}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000,
  };
  await world.storage.set(`checkout/operation/${encodeURIComponent(operationId)}`, operation);
  await world.storage.set(`checkout/by-session/${encodeURIComponent(sessionId)}`, operationId);
}

function refundEvent(eventId: string, paymentIntent: string, amount: number): EcommerceWebhookEvent {
  return {
    id: eventId,
    type: "charge.refunded",
    data: { object: { payment_intent: paymentIntent, amount_refunded: amount } },
  };
}

function expiredEvent(eventId: string, sessionId: string): EcommerceWebhookEvent {
  return {
    id: eventId,
    type: "checkout.session.expired",
    data: {
      object: {
        id: sessionId,
        metadata: { checkoutOperationId: `checkout-${sessionId}` },
      },
    },
  };
}

function buildWorld(storage = new FaultStorage()) {
  const activities = new Map<string, unknown>();
  const emitted: Array<{ name: string; payload: unknown }> = [];
  let failActivityAction: string | null = null;
  const activity: ActivityPort = {
    logActivity(input) {
      if (input.action === failActivityAction) {
        failActivityAction = null;
        throw new Error(`forced activity failure: ${input.action}`);
      }
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
  registerEcommerceFoundation({
    activity,
    events,
    tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
    pluginInstalls: { getInstall() { return null; } },
  });
  const ctx = {
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    install: {
      id: "install_ecommerce_lifecycle",
      pluginId: "ecommerce",
      agencyId: AGENCY_ID,
      clientId: CLIENT_ID,
      enabled: true,
      config: {},
    },
    storage,
  } as PluginCtx;
  return {
    storage,
    activities,
    emitted,
    ctx,
    setActivityFailure(action: string) { failActivityAction = action; },
    services: () => buildEcommerceContainer({
      storage,
      activity,
      events,
      tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
      pluginInstalls: { getInstall() { return null; } },
    }),
  };
}

test.afterEach(() => clearEcommerceFoundation());

test("paid checkout delivery is durable, validated and deduped after a fresh request container", async () => {
  const world = buildWorld();
  const event = checkoutEvent("evt_paid_one", "cs_paid_one");
  await primeCheckout(world, "cs_paid_one");
  const first = await applyVerifiedEcommerceWebhookEvent(event, world.ctx);
  const replay = await applyVerifiedEcommerceWebhookEvent(event, { ...world.ctx });
  assert.equal(first.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(first.orderId, replay.orderId);
  const order = await world.services().orders.getOrder(first.orderId!);
  assert.equal(order?.status, "paid");
  assert.equal(order?.amountTotal, 1_000);
  assert.equal(order?.items.length, 1);
  assert.equal((await world.services().orders.listTransitions(order!.id)).length, 1);
  assert.equal([...world.activities.keys()].filter(key => key.includes("order-created")).length, 1);
  assert.equal([...world.activities.keys()].filter(key => key.includes("order-paid")).length, 1);

  const unpaid = await applyVerifiedEcommerceWebhookEvent(
    checkoutEvent("evt_unpaid", "cs_unpaid", { payment_status: "unpaid" }),
    world.ctx,
  );
  assert.equal(unpaid.ok, false);
  assert.equal(unpaid.retryable, true);
  assert.match(unpaid.error ?? "", /not paid/);
  const unknownOperation = await applyVerifiedEcommerceWebhookEvent(
    checkoutEvent("evt_unknown_operation", "cs_unknown_operation"),
    world.ctx,
  );
  assert.equal(unknownOperation.ok, false);
  assert.match(unknownOperation.error ?? "", /unknown operation/);
});

test("checkout resumes state-first work after an activity failure without another order", async () => {
  const world = buildWorld();
  world.setActivityFailure("order.created");
  const event = checkoutEvent("evt_activity_retry", "cs_activity_retry");
  await primeCheckout(world, "cs_activity_retry");
  const failed = await applyVerifiedEcommerceWebhookEvent(event, world.ctx);
  assert.equal(failed.ok, false);
  const rowsAfterFailure = await world.services().orders.listOrdersForClient(CLIENT_ID);
  assert.equal(rowsAfterFailure.length, 1, "the provider state is retained for retry adoption");

  const recovered = await applyVerifiedEcommerceWebhookEvent(event, { ...world.ctx });
  assert.equal(recovered.ok, true);
  const rowsAfterRecovery = await world.services().orders.listOrdersForClient(CLIENT_ID);
  assert.equal(rowsAfterRecovery.length, 1);
  assert.equal(recovered.orderId, rowsAfterFailure[0]?.id);
  assert.equal([...world.activities.keys()].filter(key => key.includes("order-created")).length, 1);
  assert.equal([...world.activities.keys()].filter(key => key.includes("order-paid")).length, 1);
});

test("refunds are cumulative, replay-safe and retry when they arrive before payment", async () => {
  const world = buildWorld();
  await primeCheckout(world, "cs_refund_paid");
  const paid = await applyVerifiedEcommerceWebhookEvent(
    checkoutEvent("evt_refund_paid", "cs_refund_paid"),
    world.ctx,
  );
  const paymentIntent = "pi_cs_refund_paid";
  await applyVerifiedEcommerceWebhookEvent(refundEvent("evt_refund_400", paymentIntent, 400), world.ctx);
  await applyVerifiedEcommerceWebhookEvent(refundEvent("evt_refund_300_late", paymentIntent, 300), world.ctx);
  let order = await world.services().orders.getOrder(paid.orderId!);
  assert.equal(order?.status, "paid");
  assert.equal(order?.refundedAmountCents, 400, "an older cumulative event cannot regress the refund");
  await applyVerifiedEcommerceWebhookEvent(refundEvent("evt_refund_full", paymentIntent, 1_000), world.ctx);
  order = await world.services().orders.getOrder(paid.orderId!);
  assert.equal(order?.status, "refunded");
  assert.equal(order?.refundedAmountCents, 1_000);

  const early = refundEvent("evt_refund_early", "pi_cs_late_paid", 500);
  const missing = await applyVerifiedEcommerceWebhookEvent(early, world.ctx);
  assert.equal(missing.ok, false);
  assert.match(missing.error ?? "", /arrived before its paid order/);
  await primeCheckout(world, "cs_late_paid");
  await applyVerifiedEcommerceWebhookEvent(
    checkoutEvent("evt_late_paid", "cs_late_paid"),
    world.ctx,
  );
  const recovered = await applyVerifiedEcommerceWebhookEvent(early, world.ctx);
  assert.equal(recovered.ok, true);
  const lateOrder = await world.services().orders.getOrder(recovered.orderId!);
  assert.equal(lateOrder?.refundedAmountCents, 500);
});

test("operator edits preserve omitted fields, constrain status and repair interrupted transition audit", async () => {
  const world = buildWorld();
  const services = world.services();
  const { order } = await services.orders.upsertOrderByStripeSession({
    clientId: CLIENT_ID,
    stripeSessionId: "cs_operator",
    paymentIntentId: "pi_operator",
    amountTotal: 2_000,
    currency: "gbp",
    customerEmail: "original@example.test",
    customerName: "Original Buyer",
    trackingCarrier: undefined,
    items: [{ name: "Item", quantity: 1, unitAmount: 2_000, currency: "gbp" }],
  } as never);
  const notes = await services.orders.updateOrder(order.id, { internalNotes: "Keep me" });
  assert.equal(notes?.customerEmail, "original@example.test");
  assert.equal(notes?.customerName, "Original Buyer");

  world.storage.failNextSetPrefix = `order-transition:${order.id}:`;
  await assert.rejects(
    services.orders.updateOrder(order.id, { status: "shipped" }, { operationId: "ship-once" }),
    /forced ecommerce lifecycle/,
  );
  const recovered = await world.services().orders.updateOrder(
    order.id,
    { status: "shipped" },
    { operationId: "ship-once" },
  );
  assert.equal(recovered?.status, "shipped");
  assert.equal((await world.services().orders.listTransitions(order.id)).length, 1);
  await assert.rejects(
    world.services().orders.updateOrder(order.id, { status: "paid" }, { operationId: "reopen" }),
    OrderTransitionError,
  );
  await assert.rejects(
    world.services().orders.updateOrder(order.id, { status: "refunded" }, { operationId: "fake-refund" }),
    /owning provider flow/,
  );
});

test("mounted order editing exposes fulfilment commands, not arbitrary financial states", async () => {
  const [component, service, handler] = await Promise.all([
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/components/admin/OrderDetail.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/server/orders.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/api/handlers.ts"), "utf8"),
  ]);
  assert.match(component, /NEXT_STATUSES/);
  assert.match(component, /operationId/);
  assert.match(component, /Payment, cancellation and refund facts/);
  assert.doesNotMatch(component, /const STATUSES: OrderStatus\[]/);
  assert.match(service, /OPERATOR_TRANSITIONS/);
  assert.match(service, /order-transition:/);
  assert.match(handler, /ecommerce\/webhook\/delivery/);
  assert.doesNotMatch(handler, /processedEventIds/);
});

test("order confirmation exposes pending then the authoritative order by provider session", async () => {
  const world = buildWorld();
  await primeCheckout(world, "cs_confirmation");
  const request = new Request("http://portal.test/api/portal/ecommerce/orders/by-session?sessionId=cs_confirmation");
  const pending = await getOrderBySessionHandler(request, world.ctx);
  assert.equal(pending.status, 202);
  assert.equal((await pending.json() as { state: string }).state, "pending");

  await applyVerifiedEcommerceWebhookEvent(
    checkoutEvent("evt_confirmation", "cs_confirmation"),
    world.ctx,
  );
  const ready = await getOrderBySessionHandler(request, world.ctx);
  const body = await ready.json() as { state: string; order: { items: Array<{ unitAmount: number }> } };
  assert.equal(ready.status, 200);
  assert.equal(body.state, "ready");
  assert.equal(body.order.items[0]?.unitAmount, 1_000);

  const routes = await readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/api/routes.ts"), "utf8");
  assert.match(routes, /path: "orders\/by-session"/);
});

test("provider expiry releases checkout state durably and replay is deduped", async () => {
  const world = buildWorld();
  await primeCheckout(world, "cs_expired");
  const event = expiredEvent("evt_expired", "cs_expired");
  const first = await applyVerifiedEcommerceWebhookEvent(event, world.ctx);
  const replay = await applyVerifiedEcommerceWebhookEvent(event, world.ctx);
  assert.equal(first.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal((await world.services().checkout.getOperation("checkout-cs_expired"))?.status, "expired");
  assert.equal((await world.services().orders.listOrdersForClient(CLIENT_ID)).length, 0);
});

test("a gift card can settle an exact zero-balance order without Stripe credentials", async () => {
  const world = buildWorld();
  await world.services().products.upsertProduct({
    id: "product-zero-balance",
    slug: "zero-balance",
    name: "Zero balance product",
    price: 1_000,
    currency: "gbp",
    digital: true,
  });
  const card = await world.services().giftCards.issue({
    amount: 1_000,
    recipientName: "Buyer",
    recipientEmail: "buyer@example.test",
    senderName: "Sender",
    message: "",
  });
  const payload = {
    version: 1,
    operationId: "checkout-zero-balance",
    items: [{ productId: "product-zero-balance", quantity: 1 }],
    discountCode: card.code,
    successPath: "/order-confirmed?session_id={CHECKOUT_SESSION_ID}",
  };
  const request = () => new Request("http://portal.test/api/portal/ecommerce/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const first = await stripeCheckoutHandler(request(), world.ctx);
  const firstBody = await first.json() as { ok: boolean; id: string; url: string; zeroBalance: boolean };
  const replay = await stripeCheckoutHandler(request(), world.ctx);
  const replayBody = await replay.json() as { ok: boolean; id: string };
  assert.equal(first.status, 200);
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.zeroBalance, true);
  assert.equal(replayBody.id, firstBody.id);
  assert.match(firstBody.url, /session_id=zero_/);
  const order = await world.services().orders.getOrderByStripeSession(firstBody.id);
  assert.equal(order?.amountTotal, 0);
  assert.equal(order?.discountSource, "gift_card");
  assert.equal((await world.services().giftCards.getCard(card.code))?.balance, 0);
  assert.equal((await world.services().orders.listOrdersForClient(CLIENT_ID)).length, 1);
});
