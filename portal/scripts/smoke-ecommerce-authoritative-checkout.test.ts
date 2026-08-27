import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import type { Product } from "../src/built-ins/modules/ecommerce/src/lib/products";
import {
  buildEcommerceContainer,
  CheckoutValidationError,
  parseCheckoutRequest,
} from "../src/built-ins/modules/ecommerce/src/server/index";
import type { StoragePort } from "../src/built-ins/modules/ecommerce/src/server/ports";

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
      throw new Error(`forced authoritative checkout failure: ${key}`);
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

function world(storage = new FaultStorage()) {
  const services = buildEcommerceContainer({
    storage,
    activity: { logActivity: input => ({ id: "activity", ts: Date.now(), ...input }), listActivity: () => [] },
    events: { emit() {} },
    tenant: { getClient: () => null, getClientForAgency: () => null },
    pluginInstalls: { getInstall: () => null },
  });
  return { storage, services };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product_authoritative",
    slug: "authoritative-product",
    name: "Authoritative product",
    price: 1_000,
    currency: "gbp",
    taxBehavior: "exclusive",
    stockSku: "SKU-AUTH",
    weightGrams: 500,
    ...overrides,
  };
}

const config = {
  agencyId: "agency_checkout",
  clientId: "client_checkout",
  defaultCurrency: "gbp",
  taxRatePercent: 20,
};

test("checkout request schema rejects browser money and unknown fields", () => {
  assert.throws(
    () => parseCheckoutRequest({
      version: 1,
      operationId: "checkout-tampered-price",
      items: [{ productId: "product_authoritative", quantity: 1, priceCents: 1 }],
    }),
    /Unknown item field: priceCents/,
  );
  assert.throws(
    () => parseCheckoutRequest({
      version: 1,
      operationId: "checkout-tampered-total",
      items: [{ productId: "product_authoritative", quantity: 1 }],
      discountAmount: 99_999,
    }),
    /Unknown checkout field: discountAmount/,
  );
});

test("server resolves variant price, shipping, discount and tax then commits once", async () => {
  const { storage, services } = world();
  await services.products.upsertProduct(product({
    variants: [{ id: "variant-blue", optionValues: { colour: "blue" }, price: 1_200, sku: "SKU-BLUE" }],
    options: [{
      id: "colour",
      name: "Colour",
      displayType: "text",
      values: [{ id: "blue", label: "Blue" }],
    }],
  }));
  await services.products.setInventory({ sku: "SKU-BLUE", onHand: 10, reserved: 0, lowAt: 2 });
  await services.discounts.upsertCustomCode({
    code: "ONLYONCE",
    type: "percent",
    value: 10,
    active: true,
    maxUses: 1,
    uses: 0,
    createdAt: Date.now(),
  });
  await storage.set("shipping/zones", [{ id: "zone-uk", name: "United Kingdom", countries: ["GB"], default: true }]);
  await storage.set("shipping/rates", [{
    id: "rate-standard",
    zoneId: "zone-uk",
    name: "Standard",
    type: "fixed",
    amount: 200,
    active: true,
    createdAt: Date.now(),
  }]);

  const request = parseCheckoutRequest({
    version: 1,
    operationId: "checkout-server-quote-001",
    items: [{ productId: "product_authoritative", variantId: "variant-blue", quantity: 1 }],
    discountCode: "onlyonce",
    shippingCountry: "gb",
  });
  const prepared = await services.checkout.prepare(request, config);
  const replay = await services.checkout.prepare(request, config);
  assert.equal(prepared.lines[0]?.unitAmount, 1_200);
  assert.equal(prepared.lines[0]?.description, "Blue");
  assert.equal(prepared.subtotal, 1_200);
  assert.equal(prepared.discountAmount, 120);
  assert.equal(prepared.shipping.amount, 200);
  assert.equal(prepared.taxAddedAmount, 216);
  assert.equal(prepared.amountTotal, 1_496);
  assert.equal(replay.id, prepared.id);
  assert.equal((await services.products.getInventory("SKU-BLUE"))?.reserved, 1, "replay must not reserve twice");

  await services.checkout.recordProviderSession(prepared.id, { id: "cs_authoritative", url: "https://checkout.stripe.test/cs_authoritative" });
  const paid = await services.checkout.settle(prepared.id, "cs_authoritative");
  const paidReplay = await services.checkout.settle(prepared.id, "cs_authoritative");
  const inventory = await services.products.getInventory("SKU-BLUE");
  assert.equal(paid.status, "paid");
  assert.equal(paidReplay.status, "paid");
  assert.equal(inventory?.onHand, 9);
  assert.equal(inventory?.reserved, 0);
  assert.equal((await services.discounts.getCustomCode("ONLYONCE"))?.uses, 1);

  await assert.rejects(
    services.checkout.prepare(parseCheckoutRequest({
      version: 1,
      operationId: "checkout-max-use-002",
      items: [{ productId: "product_authoritative", variantId: "variant-blue", quantity: 1 }],
      discountCode: "ONLYONCE",
      shippingCountry: "GB",
    }), config),
    CheckoutValidationError,
  );
  assert.equal((await services.products.getInventory("SKU-BLUE"))?.reserved, 0, "failed discount must release stock");
});

test("gift-card capacity is reserved across concurrent checkouts and released for reuse", async () => {
  const { services } = world();
  await services.products.upsertProduct(product({ digital: true, stockSku: undefined, price: 1_200, taxBehavior: "inclusive" }));
  const card = await services.giftCards.issue({
    amount: 1_000,
    recipientName: "Buyer",
    recipientEmail: "buyer@example.test",
    senderName: "Sender",
    message: "",
  });
  const makeRequest = (operationId: string) => parseCheckoutRequest({
    version: 1,
    operationId,
    items: [{ productId: "product_authoritative", quantity: 1 }],
    discountCode: card.code,
  });
  const results = await Promise.allSettled([
    services.checkout.prepare(makeRequest("checkout-gift-card-one"), { ...config, taxRatePercent: 0 }),
    services.checkout.prepare(makeRequest("checkout-gift-card-two"), { ...config, taxRatePercent: 0 }),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  const winner = results.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof services.checkout.prepare>>> => result.status === "fulfilled")!.value;
  await services.checkout.release(winner.id);
  const replacement = await services.checkout.prepare(
    makeRequest("checkout-gift-card-three"),
    { ...config, taxRatePercent: 0 },
  );
  assert.equal(replacement.status, "reserved");
  assert.equal(replacement.discountAmount, 1_000);
  assert.equal((await services.giftCards.getCard(card.code))?.balance, 1_000, "quoting and releasing must not spend the card");
});

test("gift-card purchase stays pending until paid settlement and activation is replay-safe", async () => {
  const storage = new FaultStorage();
  const { services } = world(storage);
  const request = parseCheckoutRequest({
    version: 1,
    operationId: "checkout-gift-issuance",
    items: [],
    giftCardPurchase: {
      amount: 2_500,
      recipientName: "Recipient",
      recipientEmail: "recipient@example.test",
      senderName: "Sender",
      message: "Enjoy",
    },
  });
  const prepared = await services.checkout.prepare(request, config);
  assert.equal(prepared.amountTotal, 2_500);
  assert.equal(prepared.taxAmount, 0);
  assert.equal((await services.giftCards.listAll()).length, 0, "preparing Checkout must not issue spendable value");
  await services.checkout.recordProviderSession(prepared.id, {
    id: "cs_gift_issuance",
    url: "https://checkout.stripe.test/cs_gift_issuance",
  });
  storage.failNextSetPrefix = "checkout/operation/";
  await assert.rejects(
    services.checkout.settle(prepared.id, "cs_gift_issuance"),
    /forced authoritative checkout failure/,
  );
  const afterFailure = await services.giftCards.listAll();
  assert.equal(afterFailure.length, 1, "state-first activation remains recoverable");
  const recovered = await services.checkout.settle(prepared.id, "cs_gift_issuance");
  const replay = await services.checkout.settle(prepared.id, "cs_gift_issuance");
  assert.equal(recovered.status, "paid");
  assert.equal(replay.issuedGiftCardCode, afterFailure[0]?.code);
  assert.equal((await services.giftCards.listAll()).length, 1);
});

test("a full-refund policy restores redeemed gift-card value exactly once", async () => {
  const { services } = world();
  await services.products.upsertProduct(product({ digital: true, stockSku: undefined, price: 1_200, taxBehavior: "inclusive" }));
  const card = await services.giftCards.issue({
    amount: 1_000,
    recipientName: "Buyer",
    recipientEmail: "buyer@example.test",
    senderName: "Sender",
    message: "",
  });
  const operation = await services.checkout.prepare(parseCheckoutRequest({
    version: 1,
    operationId: "checkout-gift-refund",
    items: [{ productId: "product_authoritative", quantity: 1 }],
    discountCode: card.code,
  }), { ...config, taxRatePercent: 0 });
  await services.checkout.recordProviderSession(operation.id, {
    id: "cs_gift_refund",
    url: "https://checkout.stripe.test/cs_gift_refund",
  });
  await services.checkout.settle(operation.id, "cs_gift_refund");
  assert.equal((await services.giftCards.getCard(card.code))?.balance, 0);
  await services.checkout.restoreGiftCardAfterFullRefund(operation.id);
  await services.checkout.restoreGiftCardAfterFullRefund(operation.id);
  const restored = await services.giftCards.getCard(card.code);
  assert.equal(restored?.balance, 1_000);
  assert.equal(restored?.refunds?.length, 1);
});

test("interrupted multi-SKU reservation resumes without double-counting", async () => {
  const storage = new FaultStorage();
  const { services } = world(storage);
  await services.products.upsertProduct(product({ id: "product-a", slug: "product-a", stockSku: "SKU-A", digital: true }));
  await services.products.upsertProduct(product({ id: "product-b", slug: "product-b", stockSku: "SKU-B", digital: true }));
  await services.products.setInventory({ sku: "SKU-A", onHand: 3, reserved: 0, lowAt: 1 });
  await services.products.setInventory({ sku: "SKU-B", onHand: 3, reserved: 0, lowAt: 1 });
  storage.failNextSetPrefix = "inventory/SKU-B";
  const request = parseCheckoutRequest({
    version: 1,
    operationId: "checkout-resume-stock",
    items: [
      { productId: "product-a", quantity: 1 },
      { productId: "product-b", quantity: 1 },
    ],
  });
  await assert.rejects(services.checkout.prepare(request, { ...config, taxRatePercent: 0 }), /forced authoritative checkout failure/);
  assert.equal((await services.products.getInventory("SKU-A"))?.reserved, 1);
  const recovered = await services.checkout.prepare(request, { ...config, taxRatePercent: 0 });
  assert.equal(recovered.status, "reserved");
  assert.equal((await services.products.getInventory("SKU-A"))?.reserved, 1);
  assert.equal((await services.products.getInventory("SKU-B"))?.reserved, 1);
});

test("weight/free shipping, inclusive tax, unsupported zones and quote immutability are server-owned", async () => {
  const { storage, services } = world();
  await services.products.upsertProduct(product({
    stockSku: undefined,
    weightGrams: 750,
    price: 1_200,
    taxBehavior: "inclusive",
  }));
  await storage.set("shipping/zones", [{ id: "zone-gb", name: "GB", countries: ["GB"], default: true }]);
  await storage.set("shipping/rates", [{
    id: "weight-rate",
    zoneId: "zone-gb",
    name: "Weight",
    type: "weight",
    weightBands: [{ upToGrams: 1_000, amount: 300 }, { upToGrams: 2_000, amount: 500 }],
    active: true,
    createdAt: 1,
  }]);
  const request = parseCheckoutRequest({
    version: 1,
    operationId: "checkout-weight-quote",
    items: [{ productId: "product_authoritative", quantity: 2 }],
    shippingCountry: "GB",
  });
  const quoted = await services.checkout.prepare(request, config);
  assert.equal(quoted.shipping.amount, 500);
  assert.deepEqual(quoted.shipping.allowedCountries, ["GB"]);
  assert.equal(quoted.taxAmount, 400);
  assert.equal(quoted.taxAddedAmount, 0);
  assert.equal(quoted.amountTotal, 2_900);
  await storage.set("shipping/rates", [{
    id: "changed-rate",
    zoneId: "zone-gb",
    name: "Changed",
    type: "fixed",
    amount: 999,
    active: true,
    createdAt: 2,
  }]);
  assert.equal((await services.checkout.prepare(request, config)).shipping.amount, 500, "a retry retains the quoted snapshot");

  await assert.rejects(
    services.checkout.prepare(parseCheckoutRequest({
      version: 1,
      operationId: "checkout-unsupported-zone",
      items: [{ productId: "product_authoritative", quantity: 1 }],
      shippingCountry: "US",
    }), config),
    /No shipping zone/,
  );

  await services.discounts.upsertCustomCode({
    code: "FREESHIP",
    type: "freeship",
    value: 0,
    active: true,
    uses: 0,
    createdAt: 1,
  });
  const free = await services.checkout.prepare(parseCheckoutRequest({
    version: 1,
    operationId: "checkout-free-shipping",
    items: [{ productId: "product_authoritative", quantity: 1 }],
    discountCode: "FREESHIP",
    shippingCountry: "GB",
  }), config);
  assert.equal(free.shipping.amount, 0);
});

test("expired checkout releases operation-owned stock without changing on-hand", async () => {
  const { storage, services } = world();
  await services.products.upsertProduct(product({ digital: true }));
  await services.products.setInventory({ sku: "SKU-AUTH", onHand: 4, reserved: 0, lowAt: 1 });
  const operation = await services.checkout.prepare(parseCheckoutRequest({
    version: 1,
    operationId: "checkout-expiry-release",
    items: [{ productId: "product_authoritative", quantity: 2 }],
  }), { ...config, taxRatePercent: 0 });
  await services.checkout.recordProviderSession(operation.id, {
    id: "cs_expiry_release",
    url: "https://checkout.stripe.test/cs_expiry_release",
  });
  assert.equal((await services.products.getInventory("SKU-AUTH"))?.reserved, 2);
  const expired = await services.checkout.release(operation.id, true);
  const inventory = await services.products.getInventory("SKU-AUTH");
  assert.equal(expired?.status, "expired");
  assert.equal(inventory?.reserved, 0);
  assert.equal(inventory?.onHand, 4);
  assert.equal((await storage.get<{ status: string }>(`checkout/operation/${encodeURIComponent(operation.id)}`))?.status, "expired");
});

test("mounted checkout and editor clients share IDs, minor units and registered DTOs", async () => {
  const [handler, cartDrawer, bridge, cartContext, stripe, catalog, card, variant, confirmation, summary, giftPurchase, inventoryTable] = await Promise.all([
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/api/handlers.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/components/CartDrawer.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/website-editor/src/components/ecommerceBridge.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/context/CartContext.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/lib/stripe/server.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/website-editor/src/components/useProducts.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/website-editor/src/components/blocks/ProductCardBlock.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/website-editor/src/components/blocks/VariantPickerBlock.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/website-editor/src/components/blocks/OrderSuccessBlock.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/website-editor/src/components/blocks/CheckoutSummaryBlock.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/components/GiftCardPurchaseForm.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/components/admin/InventoryTable.tsx"), "utf8"),
  ]);
  assert.match(handler, /parseCheckoutRequest/);
  assert.match(handler, /expectedAmountTotal/);
  assert.match(handler, /authoritative checkout operation/);
  assert.match(handler, /Cart-level inventory mirroring is retired/);
  assert.doesNotMatch(cartDrawer, /discountAmount:/);
  assert.doesNotMatch(cartDrawer, /amount: i\.price/);
  assert.match(cartDrawer, /productId: i\.productId/);
  assert.doesNotMatch(bridge, /priceCents: it\.price/);
  assert.doesNotMatch(cartContext, /syncReservations/);
  assert.match(stripe, /idempotencyKey/);
  assert.match(stripe, /allow_promotion_codes: false/);
  assert.match(stripe, /automatic_tax: \{ enabled: false \}/);
  assert.match(catalog, /data\.products \?\? data\.items/);
  assert.match(catalog, /new Map<string, CatalogProduct\[]>/);
  assert.match(catalog, /amount \/ 100/);
  assert.match(card, /cart\.addItem/);
  assert.doesNotMatch(card, /data-portal-add-to-cart/);
  assert.match(variant, /selectedVariant\.optionValues/);
  assert.match(confirmation, /it\.unitAmount/);
  assert.match(bridge, /orders\/by-session\?sessionId=/);
  assert.doesNotMatch(summary, /SHIPPING_FLAT|TAX_RATE/);
  assert.match(summary, /Calculated at secure checkout/);
  assert.match(giftPurchase, /stripe\/checkout/);
  assert.match(giftPurchase, /giftCardPurchase/);
  assert.doesNotMatch(giftPurchase, /\/giftcards`/);
  assert.match(inventoryTable, /expectedVersion/);
  assert.match(handler, /On-hand stock cannot be lower than/);
  assert.match(handler, /checkoutOperations: existing\?\.checkoutOperations/);
});
