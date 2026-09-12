import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import type { PluginCtx } from "../src/built-ins/modules/ecommerce/src/lib/aquaPluginTypes";
import {
  storefrontCheckoutHandler,
  storefrontCheckoutQuoteHandler,
  storefrontGetOrderBySessionHandler,
  storefrontListProductsHandler,
} from "../src/built-ins/modules/ecommerce/src/api/handlers";
import {
  buildEcommerceContainer,
  clearEcommerceFoundation,
  registerEcommerceFoundation,
} from "../src/built-ins/modules/ecommerce/src/server/index";
import type { StoragePort } from "../src/built-ins/modules/ecommerce/src/server/ports";
import {
  exactStorefrontWebsiteHost,
  exactStorefrontRequestHost,
  verifyStorefrontCheckoutAdmission,
} from "../src/built-ins/modules/ecommerce/src/server/storefrontCheckoutSecurity";
import { getState, mutate } from "../src/server/storage";

const ctx = {
  agencyId: "agency-store-a",
  clientId: "client-store-a",
  install: { id: "install-store-a" },
  storage: {},
} as unknown as PluginCtx;

let originalSources: typeof getState extends () => infer T
  ? T extends { websiteSources?: infer S } ? S : never
  : never;
let originalNodeEnv: string | undefined;
let originalSiteKey: string | undefined;
let originalSecretKey: string | undefined;

class TestStorage implements StoragePort {
  readonly data = new Map<string, unknown>();
  private tail: Promise<void> = Promise.resolve();
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.data.get(key)) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.data.set(key, structuredClone(value)); }
  async del(key: string): Promise<void> { this.data.delete(key); }
  async list(prefix = ""): Promise<string[]> { return [...this.data.keys()].filter(key => key.startsWith(prefix)); }
  async runExclusive<T>(_key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }
}

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  originalSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  originalSecretKey = process.env.TURNSTILE_SECRET_KEY;
  process.env.NODE_ENV = "test";
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  originalSources = structuredClone(getState().websiteSources ?? {});
  mutate(state => {
    state.websiteSources = {
      storefront_a: {
        id: "storefront_a",
        agencyId: "agency-store-a",
        host: "shop.example.test",
        label: "Store A",
        destinationClientId: "client-store-a",
        createdAt: 1,
        createdBy: "owner-a",
      },
    };
  });
});

afterEach(() => {
  clearEcommerceFoundation();
  mutate(state => { state.websiteSources = structuredClone(originalSources ?? {}); });
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  if (originalSiteKey === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY; else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalSiteKey;
  if (originalSecretKey === undefined) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = originalSecretKey;
});

test("public checkout binds the dispatcher scope to one registered host and exact proof hostname", async () => {
  const seen: Array<Record<string, unknown>> = [];
  const result = await verifyStorefrontCheckoutAdmission(
    new Request("https://aqua.example.test/api/portal/ecommerce/storefront/stripe/checkout", {
      method: "POST",
      headers: { origin: "https://www.shop.example.test", "x-forwarded-for": "203.0.113.9" },
    }),
    ctx,
    {
      version: 1,
      operationId: "checkout-operation-a",
      items: [{ productId: "product-a", quantity: 1 }],
      checkoutKind: "paid",
      captchaToken: "proof-paid-a",
    },
    async input => {
      seen.push(input as unknown as Record<string, unknown>);
      return { ok: true, enforced: true, reason: "ok", message: "" };
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.kind, "paid");
  assert.equal(result.ok && result.checkout.checkoutKind, undefined);
  assert.equal(result.ok && result.checkout.captchaToken, undefined);
  assert.deepEqual(seen.map(row => ({ action: row.action, hostname: row.hostname, token: row.token })), [{
    action: "storefront-checkout",
    hostname: "www.shop.example.test",
    token: "proof-paid-a",
  }]);
});

test("a duplicate registered host across tenants fails closed before proof", async () => {
  mutate(state => {
    state.websiteSources!.storefront_b = {
      id: "storefront_b",
      agencyId: "agency-store-b",
      host: "shop.example.test",
      label: "Store B",
      destinationClientId: "client-store-b",
      createdAt: 2,
      createdBy: "owner-b",
    };
  });
  let verifierCalls = 0;
  const result = await verifyStorefrontCheckoutAdmission(
    new Request("https://aqua.example.test/api/portal/ecommerce/storefront/stripe/checkout", {
      method: "POST",
      headers: { origin: "https://shop.example.test" },
    }),
    ctx,
    { checkoutKind: "paid", captchaToken: "proof", version: 1, operationId: "checkout-operation-a", items: [] },
    async () => {
      verifierCalls += 1;
      return { ok: true, enforced: true, reason: "ok", message: "" };
    },
  );
  assert.deepEqual(result, { ok: false, status: 403, error: "This storefront could not be verified." });
  assert.equal(verifierCalls, 0);
  assert.equal(exactStorefrontWebsiteHost(ctx, "https://shop.example.test"), null);
});

test("zero-value completion has a distinct managed-proof action", async () => {
  const actions: string[] = [];
  const result = await verifyStorefrontCheckoutAdmission(
    new Request("https://aqua.example.test/api/portal/ecommerce/storefront/stripe/checkout", {
      method: "POST",
      headers: { origin: "https://shop.example.test" },
    }),
    ctx,
    { checkoutKind: "free", captchaToken: "proof-free-a", version: 1, operationId: "checkout-operation-a", items: [] },
    async input => {
      actions.push(input.action);
      return { ok: true, enforced: true, reason: "ok", message: "" };
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(actions, ["storefront-free-order"]);
});

test("missing Origin and caller-selected client scope are refused", async () => {
  const missingOrigin = await verifyStorefrontCheckoutAdmission(
    new Request("https://aqua.example.test/api/portal/ecommerce/storefront/stripe/checkout", { method: "POST" }),
    ctx,
    { checkoutKind: "paid", captchaToken: "proof", version: 1, operationId: "checkout-operation-a", items: [] },
    async () => ({ ok: true, enforced: true, reason: "ok", message: "" }),
  );
  assert.equal(missingOrigin.ok, false);

  const wrongClient = { ...ctx, clientId: "client-store-b" } as PluginCtx;
  assert.equal(exactStorefrontWebsiteHost(wrongClient, "https://shop.example.test"), null);
});

test("all public storefront reads bind the selected install to the registered host before storage work", async () => {
  const storage = new TestStorage();
  const publicCtx = { ...ctx, storage } as PluginCtx;
  const routes = [
    storefrontListProductsHandler,
    storefrontCheckoutQuoteHandler,
    storefrontGetOrderBySessionHandler,
  ];
  for (const handler of routes) {
    const request = new Request("https://aqua.example.test/api/portal/ecommerce/public", {
      method: handler === storefrontListProductsHandler || handler === storefrontGetOrderBySessionHandler ? "GET" : "POST",
      headers: {
        origin: "https://attacker.example.test",
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.61",
      },
      ...(handler === storefrontCheckoutQuoteHandler ? { body: JSON.stringify({}) } : {}),
    });
    const response = await handler(request, publicCtx);
    assert.equal(response.status, 403);
  }
  assert.equal(storage.data.size, 0, "host refusal happens before rate-limit or ecommerce storage writes");
});

test("same-origin storefront GET can use Referer, but conflicting or malformed browser headers fail closed", () => {
  const refererOnly = new Request("https://aqua.example.test/api/portal/ecommerce/storefront/products", {
    headers: { referer: "https://www.shop.example.test/catalogue?page=2" },
  });
  assert.equal(exactStorefrontRequestHost(ctx, refererOnly), "www.shop.example.test");

  const conflict = new Request("https://aqua.example.test/api/portal/ecommerce/storefront/products", {
    headers: {
      origin: "https://shop.example.test",
      referer: "https://attacker.example.test/relay",
    },
  });
  assert.equal(exactStorefrontRequestHost(ctx, conflict), null);

  const malformed = new Request("https://aqua.example.test/api/portal/ecommerce/storefront/products", {
    headers: { referer: "not a URL" },
  });
  assert.equal(exactStorefrontRequestHost(ctx, malformed), null);

  process.env.NODE_ENV = "production";
  const nonstandardProductionPort = new Request("https://aqua.example.test/api/portal/ecommerce/storefront/products", {
    headers: { origin: "https://shop.example.test:8443" },
  });
  assert.equal(exactStorefrontRequestHost(ctx, nonstandardProductionPort), null);
});

test("public checkout and quote refuse declared or chunked oversized JSON before commerce work", async () => {
  const storage = new TestStorage();
  const publicCtx = { ...ctx, storage } as PluginCtx;
  const declared = new Request("https://aqua.example.test/api/portal/ecommerce/storefront/stripe/checkout", {
    method: "POST",
    headers: {
      origin: "https://shop.example.test",
      "content-type": "application/json",
      "content-length": String(80 * 1_024),
    },
    body: "{}",
  });
  assert.equal((await storefrontCheckoutHandler(declared, publicCtx)).status, 413);

  const oversizedBody = JSON.stringify({ padding: "x".repeat(70 * 1_024) });
  const chunked = new Request("https://aqua.example.test/api/portal/ecommerce/storefront/checkout/quote", {
    method: "POST",
    headers: { origin: "https://shop.example.test", "content-type": "application/json" },
    body: oversizedBody,
  });
  assert.equal((await storefrontCheckoutQuoteHandler(chunked, publicCtx)).status, 413);
  assert.equal(storage.data.size, 1, "only the quote rate-limit bucket may precede bounded body parsing");
});

test("a paid proof cannot complete a zero-value order; the distinct free proof can", async () => {
  const storage = new TestStorage();
  const foundation = {
    tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
    activity: {
      logActivity(input: unknown) { return { id: "activity", ts: Date.now(), ...(input as object) } as never; },
      listActivity() { return [] as never; },
    },
    events: { emit() {} },
    pluginInstalls: { getInstall() { return null; } },
  };
  registerEcommerceFoundation(foundation);
  const services = buildEcommerceContainer({ storage, ...foundation });
  await services.products.upsertProduct({
    id: "product-free-order",
    slug: "free-order",
    name: "Covered product",
    price: 1_000,
    currency: "gbp",
    digital: true,
  });
  const giftCard = await services.giftCards.issue({
    amount: 1_000,
    recipientName: "Buyer",
    recipientEmail: "buyer@example.test",
    senderName: "Sender",
    message: "",
  });
  const mountedCtx = {
    agencyId: "agency-store-a",
    clientId: "client-store-a",
    install: {
      id: "install-store-a",
      pluginId: "ecommerce",
      agencyId: "agency-store-a",
      clientId: "client-store-a",
      enabled: true,
      features: {},
      config: {},
    },
    storage,
  } as unknown as PluginCtx;
  const request = (
    kind: "paid" | "free",
    operationId: string,
    discountCode: string | null | undefined = giftCard.code,
  ) => new Request(
    "https://aqua.example.test/api/portal/ecommerce/storefront/stripe/checkout",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://shop.example.test",
        "x-forwarded-for": "203.0.113.90",
      },
      body: JSON.stringify({
        version: 1,
        operationId,
        items: [{ productId: "product-free-order", quantity: 1 }],
        ...(discountCode ? { discountCode } : {}),
        customerEmail: "buyer@example.test",
        checkoutKind: kind,
        captchaToken: `${kind}-proof`,
        successPath: "/order-confirmed?session_id={CHECKOUT_SESSION_ID}",
      }),
    },
  );

  const wrong = await storefrontCheckoutHandler(request("paid", "checkout-wrong-kind"), mountedCtx);
  assert.equal(wrong.status, 400);
  assert.match((await wrong.json() as { error: string }).error, /total changed/i);
  assert.equal(await services.checkout.getOperation("checkout-wrong-kind"), null);
  assert.equal((await services.giftCards.getCard(giftCard.code))?.balance, 1_000);

  const paidFailure = await storefrontCheckoutHandler(
    request("paid", "checkout-provider-pending", null),
    mountedCtx,
  );
  assert.equal(paidFailure.status, 503, "provider configuration is intentionally absent in this local harness");
  const pendingBeforeWrongProof = await services.checkout.getOperation("checkout-provider-pending");
  assert.ok(pendingBeforeWrongProof, "the retryable provider operation was not retained");
  const wrongProofReplay = await storefrontCheckoutHandler(
    request("free", "checkout-provider-pending", null),
    mountedCtx,
  );
  assert.equal(wrongProofReplay.status, 400);
  const pendingAfterWrongProof = await services.checkout.getOperation("checkout-provider-pending");
  assert.equal(pendingAfterWrongProof?.status, pendingBeforeWrongProof.status,
    "a wrong-class replay released or rewrote an existing provider operation");
  assert.deepEqual(pendingAfterWrongProof?.lines, pendingBeforeWrongProof.lines,
    "a wrong-class replay changed the existing inventory snapshot");

  const accepted = await storefrontCheckoutHandler(request("free", "checkout-free-kind"), mountedCtx);
  const acceptedBody = await accepted.json() as { ok: boolean; id?: string; zeroBalance?: boolean };
  assert.equal(accepted.status, 200);
  assert.equal(acceptedBody.ok, true);
  assert.equal(acceptedBody.zeroBalance, true);
  assert.equal((await services.giftCards.getCard(giftCard.code))?.balance, 0);
  assert.equal((await services.orders.listOrdersForClient("client-store-a")).length, 1);
});
