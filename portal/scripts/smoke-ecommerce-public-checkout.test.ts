import assert from "node:assert/strict";
import { before, test } from "node:test";

// The real catch-all reads request-local auth state. Import this shim before
// the route/auth modules, matching the tenancy guard's mounted test.
import { withRequestScope, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";

import { ecommerceApiUrl } from "../src/built-ins/modules/website-editor/src/components/storefrontCommerceScope";
import { containerFor } from "../src/built-ins/modules/ecommerce/src/server/foundationAdapter";
import type { Product } from "../src/built-ins/modules/ecommerce/src/lib/products";
import { ensureEcommerceFoundationRegistered } from "../src/built-ins/runtime/foundation-adapters/ecommerceFoundation";
import { makePluginStorage } from "../src/lib/server/pluginStorage";
import { upsertInstall } from "../src/server/pluginInstalls";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { issueSession } from "../src/lib/server/auth/auth";
import { createUser } from "../src/server/users";

let agencyId = "";
let clientId = "";
let giftCardCode = "";
let ownerToken = "";
let ownerUserId = "";
let ecommerceInstallId = "";

interface Reply {
  status: number;
  headers: Headers;
  json: Record<string, unknown>;
}

async function call(
  rest: string[],
  input: {
    method?: "GET" | "POST";
    query?: Record<string, string>;
    body?: unknown;
    ip?: string;
    token?: string;
  } = {},
): Promise<Reply> {
  const { NextRequest } = await import("next/server");
  const route = await import("../src/app/api/portal/[module]/[...rest]/route");
  const method = input.method ?? "GET";
  const handler = route[method] as (
    request: import("next/server").NextRequest,
    context: { params: Promise<{ module: string; rest: string[] }> },
  ) => Promise<Response>;
  const query = new URLSearchParams(input.query ?? {}).toString();
  const url = `http://localhost/api/portal/ecommerce/${rest.join("/")}${query ? `?${query}` : ""}`;
  const request = new NextRequest(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": input.ip ?? "198.51.100.69",
    },
    ...(method === "POST" ? { body: JSON.stringify(input.body ?? {}) } : {}),
  });
  const run = async () => {
    const response = await handler(request, {
      params: Promise.resolve({ module: "ecommerce", rest }),
    });
    return {
      status: response.status,
      headers: response.headers,
      json: await response.json() as Record<string, unknown>,
    };
  };
  return input.token ? withSession(input.token, run) : withRequestScope({}, run);
}

before(async () => {
  await ensureHydrated();
  ensureEcommerceFoundationRegistered();
  const agency = createAgency({ name: "Public Checkout Test", slug: `public-checkout-${Date.now()}` });
  const client = createClient(agency.id, { name: "Public Shop", slug: `public-shop-${Date.now()}` });
  agencyId = agency.id;
  clientId = client.id;
  const owner = createUser({
    email: `public-checkout-owner-${Date.now()}@example.test`,
    name: "Public Checkout Owner",
    role: "agency-owner",
    agencyId,
    password: "public-checkout-owner-passphrase",
  });
  ownerToken = issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId,
    sessionRev: owner.sessionRev ?? 0,
  });
  ownerUserId = owner.id;

  upsertInstall({
    pluginId: "website-editor",
    scope: { agencyId, clientId },
    enabled: true,
    config: {},
    features: {},
  });
  const install = upsertInstall({
    pluginId: "ecommerce",
    scope: { agencyId, clientId },
    enabled: true,
    config: { defaultCurrency: "gbp", defaultTaxRatePercent: 0 },
    features: {},
  });
  ecommerceInstallId = install.id;

  const commerce = containerFor(makePluginStorage(install.id));
  await commerce.products.upsertProduct({
    id: "product_public_checkout",
    slug: "public-checkout-product",
    range: "published-range",
    name: "Public checkout product",
    tagline: "Public product tagline",
    price: 1_000,
    salePrice: 900,
    onSale: true,
    image: "https://public.example.test/product.jpg",
    badge: "Popular",
    badgeColor: "blue",
    showLowStock: true,
    available: 7,
    rating: 4.8,
    reviewCount: 12,
    origin: "Made in Britain",
    shortBullets: ["Public benefit"],
    description: ["Public description"],
    note: "Public product note",
    formats: ["digital"],
    sizes: [{ label: "Standard", price: 1_000 }],
    formatSizes: { digital: [{ label: "Download", price: 1_000 }] },
    formatContent: {
      digital: {
        tagline: "Digital edition",
        description: ["Instant access after payment"],
        shortBullets: ["PDF format"],
        note: "Customer-facing format note",
        ingredients: [{ name: "Public content", note: "Included" }],
        directions: "Complete checkout",
        productionNotes: "PRIVATE_FORMAT_NOTE",
      } as NonNullable<Product["formatContent"]>["digital"] & { productionNotes: string },
    },
    fragrances: ["Original"],
    fragranceContent: {
      Original: {
        note: "Public fragrance note",
        description: ["Public fragrance description"],
        shortBullets: ["Fresh"],
        supplierReference: "PRIVATE_SUPPLIER_REFERENCE",
      } as NonNullable<Product["fragranceContent"]>[string] & { supplierReference: string },
    },
    ingredients: [{ name: "Public ingredient", note: "Public ingredient note" }],
    directions: "Use as directed",
    benefits: [{ icon: "sparkle", title: "Public benefit", body: "Public body" }],
    reviews: [{ name: "Buyer", location: "London", stars: 5, title: "Great", body: "Loved it" }],
    options: [{
      id: "format",
      name: "Format",
      displayType: "text",
      required: true,
      allowCustom: false,
      internalCost: 125,
      values: [{
        id: "pdf",
        label: "PDF",
        priceModifier: 50,
        available: true,
        supplierCode: "PRIVATE_OPTION_SUPPLIER",
      }],
    } as NonNullable<Product["options"]>[number]],
    variants: [{
      id: "variant_pdf",
      optionValues: { format: "pdf" },
      price: 1_050,
      salePrice: 950,
      image: "https://public.example.test/product-pdf.jpg",
      available: 7,
      isCustom: false,
      sku: "PRIVATE-VARIANT-SKU",
      providerPriceId: "PRIVATE_PROVIDER_PRICE",
    } as NonNullable<Product["variants"]>[number]],
    customColorSurcharge: 75,
    currency: "gbp",
    digital: true,
    taxBehavior: "inclusive",
    downloadUrl: "https://private.example.test/delivery/file.pdf",
    licenseKey: "PRIVATE-LICENSE-KEY",
    stockSku: "PRIVATE-PRODUCT-SKU",
    weightGrams: 321,
    hidden: false,
    archived: false,
    shopifyVariants: [{ format: "digital", size: "standard", fragrance: "original", id: "PRIVATE-SHOPIFY-ID" }],
    createdAt: 111,
    updatedAt: 222,
    version: 7,
    adminNotes: "PRIVATE_ADMIN_NOTE",
    deliveryToken: "PRIVATE_DELIVERY_TOKEN",
  } as Product & { adminNotes: string; deliveryToken: string });
  await commerce.products.setInventory({
    sku: "PRIVATE-VARIANT-SKU",
    onHand: 100,
    reserved: 0,
    lowAt: 5,
  });
  await commerce.products.upsertProduct({
    id: "product_hidden_checkout",
    slug: "hidden-checkout-product",
    name: "Hidden checkout product",
    price: 1_000,
    currency: "gbp",
    digital: true,
    hidden: true,
  });
  const giftCard = await commerce.giftCards.issue({
    amount: 1_000,
    recipientName: "Public buyer",
    recipientEmail: "buyer@example.test",
    senderName: "Test store",
    message: "Public no-provider acceptance",
  });
  giftCardCode = giftCard.code;
});

const scope = () => ({ agencyId, clientId });

test("the mounted storefront rewrites only commerce calls onto its explicit public facade", () => {
  assert.equal(
    ecommerceApiUrl("/api/portal/ecommerce/stripe/checkout", { agencyId: "agency_a", clientId: "client_a" }),
    "/api/portal/ecommerce/storefront/stripe/checkout?agencyId=agency_a&clientId=client_a",
  );
  assert.equal(
    ecommerceApiUrl("/api/portal/ecommerce/products?q=soap", { agencyId: "agency a", clientId: "client/a" }),
    "/api/portal/ecommerce/storefront/products?q=soap&agencyId=agency+a&clientId=client%2Fa",
  );
  assert.equal(ecommerceApiUrl("/api/portal/ecommerce/products", null), "/api/portal/ecommerce/products");
});

test("anonymous catalogue access is facade-only and cannot reveal hidden products", async () => {
  const internal = await call(["products"], { query: scope() });
  assert.equal(internal.status, 401, "the operator catalogue route became anonymous");

  const unscoped = await call(["storefront", "products"]);
  assert.equal(unscoped.status, 401, "a public call without an exact enabled install was accepted");

  const visible = await call(["storefront", "products"], {
    query: { ...scope(), includeHidden: "true", includeArchived: "true" },
  });
  assert.equal(visible.status, 200);
  const products = visible.json.products as Array<Record<string, unknown>>;
  assert.deepEqual(products.map(product => product.id), ["product_public_checkout"]);
  assert.equal(visible.headers.get("cache-control"), "no-store");

  const expectedPublicKeys = [
    "available", "badge", "badgeColor", "benefits", "currency", "customColorSurcharge",
    "description", "digital", "directions", "formatContent", "formatSizes", "formats",
    "fragranceContent", "fragrances", "id", "image", "ingredients", "name", "note",
    "onSale", "options", "origin", "price", "range", "rating", "reviewCount", "reviews",
    "salePrice", "shortBullets", "showLowStock", "sizes", "slug", "tagline", "taxBehavior",
    "variants",
  ].sort();
  assert.deepEqual(Object.keys(products[0]!).sort(), expectedPublicKeys, "the public catalogue contract stopped being an explicit allowlist");
  assert.deepEqual(
    Object.keys((products[0]!.options as Array<Record<string, unknown>>)[0]!).sort(),
    ["allowCustom", "displayType", "id", "name", "required", "values"],
    "an option leaked a storage-only field",
  );
  assert.deepEqual(
    Object.keys(((products[0]!.options as Array<Record<string, unknown>>)[0]!.values as Array<Record<string, unknown>>)[0]!).sort(),
    ["available", "id", "label", "priceModifier"],
    "an option value leaked a storage-only field",
  );
  assert.deepEqual(
    Object.keys((products[0]!.variants as Array<Record<string, unknown>>)[0]!).sort(),
    ["available", "id", "image", "isCustom", "optionValues", "price", "salePrice"],
    "a variant leaked its private SKU/provider metadata",
  );
  const publicCatalogueJson = JSON.stringify(visible.json);
  for (const marker of [
    "PRIVATE-LICENSE-KEY",
    "private.example.test/delivery",
    "PRIVATE-PRODUCT-SKU",
    "PRIVATE-VARIANT-SKU",
    "PRIVATE_PROVIDER_PRICE",
    "PRIVATE-SHOPIFY-ID",
    "PRIVATE_ADMIN_NOTE",
    "PRIVATE_DELIVERY_TOKEN",
    "PRIVATE_FORMAT_NOTE",
    "PRIVATE_SUPPLIER_REFERENCE",
    "PRIVATE_OPTION_SUPPLIER",
  ]) {
    assert.doesNotMatch(publicCatalogueJson, new RegExp(marker), `public catalogue leaked ${marker}`);
  }

  const visibleProduct = await call(["storefront", "products", "get"], {
    query: { ...scope(), slug: "public-checkout-product" },
  });
  assert.equal(visibleProduct.status, 200);
  const detail = visibleProduct.json.product as Record<string, unknown>;
  assert.equal(detail.id, "product_public_checkout");
  assert.deepEqual(Object.keys(detail).sort(), expectedPublicKeys, "public detail did not use the catalogue allowlist");
  assert.doesNotMatch(JSON.stringify(detail), /PRIVATE_|downloadUrl|licenseKey|stockSku|weightGrams|shopifyVariants/);

  const authorisedInternal = await call(["products"], { token: ownerToken, query: scope() });
  assert.equal(authorisedInternal.status, 200, "authorised operator catalogue was no longer readable");
  const internalProduct = (authorisedInternal.json.products as Array<Record<string, unknown>>).find(product => product.id === "product_public_checkout");
  assert.equal(internalProduct?.downloadUrl, "https://private.example.test/delivery/file.pdf");
  assert.equal(internalProduct?.licenseKey, "PRIVATE-LICENSE-KEY");
  assert.equal(internalProduct?.stockSku, "PRIVATE-PRODUCT-SKU");
  assert.equal((internalProduct?.variants as Array<Record<string, unknown>>)[0]?.sku, "PRIVATE-VARIANT-SKU");
  const authorisedInternalDetail = await call(["products", "get"], {
    token: ownerToken,
    query: { ...scope(), slug: "public-checkout-product" },
  });
  assert.equal(authorisedInternalDetail.status, 200, "authorised operator product detail was no longer readable");
  assert.equal(
    (authorisedInternalDetail.json.product as Record<string, unknown>).downloadUrl,
    "https://private.example.test/delivery/file.pdf",
    "the public serializer was incorrectly applied to the authorised operator detail route",
  );

  const hiddenProduct = await call(["storefront", "products", "get"], {
    query: { ...scope(), slug: "hidden-checkout-product" },
  });
  assert.equal(hiddenProduct.status, 404, "a hidden product was readable through the public detail route");
});

test("public quote is server-priced and refuses browser-asserted customer identity", async () => {
  const payload = {
    version: 1,
    operationId: "public-quote-identity-001",
    items: [{ productId: "product_public_checkout", variantId: "variant_pdf", quantity: 1 }],
    discountCode: giftCardCode,
  };
  const quote = await call(["storefront", "checkout", "quote"], {
    method: "POST",
    query: scope(),
    body: payload,
  });
  assert.equal(quote.status, 200);
  assert.equal((quote.json.quote as { subtotal: number }).subtotal, 950);
  assert.equal((quote.json.quote as { discountAmount: number }).discountAmount, 950);
  assert.equal((quote.json.quote as { amountTotal: number }).amountTotal, 0);

  const forgedIdentity = await call(["storefront", "checkout", "quote"], {
    method: "POST",
    query: scope(),
    body: { ...payload, operationId: "public-quote-identity-002", endCustomerUserId: "user_somebody_else" },
  });
  assert.equal(forgedIdentity.status, 400);
  assert.match(String(forgedIdentity.json.error), /server-owned/);

  const forgedAuthenticatedIdentity = await call(["checkout", "quote"], {
    method: "POST",
    token: ownerToken,
    query: scope(),
    body: { ...payload, operationId: "authenticated-quote-identity-003", endCustomerUserId: "user_somebody_else" },
  });
  assert.equal(forgedAuthenticatedIdentity.status, 400);
  assert.match(String(forgedAuthenticatedIdentity.json.error), /server-owned/);
});

test("authenticated checkout derives customer lineage from the fresh session", async () => {
  const commerce = containerFor(makePluginStorage(ecommerceInstallId));
  const giftCard = await commerce.giftCards.issue({
    amount: 1_000,
    recipientName: "Authenticated buyer",
    recipientEmail: "authenticated@example.test",
    senderName: "Test store",
  });

  const checkout = await call(["stripe", "checkout"], {
    method: "POST",
    token: ownerToken,
    query: scope(),
    body: {
      version: 1,
      operationId: "authenticated-session-lineage-001",
      items: [{ productId: "product_public_checkout", variantId: "variant_pdf", quantity: 1 }],
      discountCode: giftCard.code,
      customerEmail: "authenticated@example.test",
      successPath: "/order-confirmed?session_id={CHECKOUT_SESSION_ID}",
      cancelPath: "/cart",
    },
  });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.json));
  const order = await commerce.orders.getOrderByStripeSession(String(checkout.json.id));
  assert.equal(order?.endCustomerUserId, ownerUserId, "checkout trusted a browser field instead of the session actor");
});

test("a public provider failure is retryable without exposing Stripe configuration", async () => {
  const unavailable = await call(["storefront", "stripe", "checkout"], {
    method: "POST",
    query: scope(),
    body: {
      version: 1,
      operationId: "public-provider-unavailable-001",
      items: [{ productId: "product_public_checkout", variantId: "variant_pdf", quantity: 1 }],
      customerEmail: "buyer@example.test",
    },
  });
  assert.equal(unavailable.status, 503, JSON.stringify(unavailable.json));
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
  assert.equal(unavailable.json.error, "Storefront is temporarily unavailable. Please try again.");
  assert.doesNotMatch(JSON.stringify(unavailable.json), /stripe|secret|key|config/i);
});

test("anonymous checkout completes and replays through the real dispatcher without Stripe credentials", async () => {
  const body = {
    version: 1,
    operationId: "public-zero-checkout-001",
    items: [{ productId: "product_public_checkout", variantId: "variant_pdf", quantity: 1 }],
    discountCode: giftCardCode,
    customerEmail: "buyer@example.test",
    successPath: "/order-confirmed?session_id={CHECKOUT_SESSION_ID}",
    cancelPath: "/cart",
  };

  const before = await call(["storefront", "orders", "by-session"], {
    query: { ...scope(), sessionId: "zero_public-zero-checkout-001" },
  });
  assert.equal(before.status, 404, "an unknown provider session looked complete");

  const first = await call(["storefront", "stripe", "checkout"], {
    method: "POST",
    query: scope(),
    body,
  });
  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.equal(first.json.ok, true);
  assert.equal(first.json.zeroBalance, true);
  assert.match(String(first.json.url), /order-confirmed\?session_id=zero_/);

  const replay = await call(["storefront", "stripe", "checkout"], {
    method: "POST",
    query: scope(),
    body,
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.id, first.json.id, "checkout replay minted another provider session");

  const sessionBearingPublicReplay = await call(["storefront", "stripe", "checkout"], {
    method: "POST",
    token: ownerToken,
    query: scope(),
    body,
  });
  assert.equal(sessionBearingPublicReplay.status, 200);
  assert.equal(
    sessionBearingPublicReplay.json.id,
    first.json.id,
    "a session-bearing request to the public facade stopped replaying the anonymous checkout",
  );

  const privateOrder = await containerFor(makePluginStorage(ecommerceInstallId)).orders
    .getOrderByStripeSession(String(first.json.id));
  assert.equal(
    privateOrder?.endCustomerUserId,
    undefined,
    "the public facade attached a session actor to an anonymous checkout",
  );

  const order = await call(["storefront", "orders", "by-session"], {
    query: { ...scope(), sessionId: String(first.json.id) },
  });
  assert.equal(order.status, 200);
  const receipt = order.json.order as Record<string, unknown>;
  assert.equal(receipt.amountTotal, 0);
  assert.equal(receipt.customerEmail, "buyer@example.test");
  assert.deepEqual(
    Object.keys(receipt).sort(),
    ["amountTotal", "createdAt", "currency", "customerEmail", "id", "items", "status"],
    "the public receipt leaked an operator/provider-only order field",
  );
  assert.deepEqual(
    Object.keys((receipt.items as Array<Record<string, unknown>>)[0]!).sort(),
    ["currency", "name", "quantity", "unitAmount"],
    "the public receipt leaked an internal fulfilment item field",
  );
  assert.equal(order.headers.get("cache-control"), "no-store");
});

test("the anonymous Stripe webhook is reachable only as a signature-authorised route", async () => {
  const missingSignature = await call(["stripe", "webhook"], {
    method: "POST",
    query: scope(),
    body: {},
  });
  assert.equal(missingSignature.status, 400);
  assert.match(String(missingSignature.json.error), /stripe-signature/);
});
