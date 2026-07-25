// API handlers — pure request/response functions invoked by the manifest's
// `api` routes. Each handler receives `PluginCtx` and uses
// `containerFor(ctx.storage)` to assemble a per-request services bundle.
//
// Convention: every handler returns a Web `Response` and never throws.
// Errors become JSON responses with shape `{ ok: false, error }`.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import {
  createCheckoutSession,
  createBillingPortalSession,
  constructWebhookEvent,
  readStripeKeysFromInstall,
  type StripeLineItem,
} from "../lib/stripe/server";
import type { ServerOrderItem } from "../server/orders";
import type { Product } from "../lib/products";
import type { CustomDiscountCode } from "../server/discounts";
import type { GiftCard } from "../server/giftCards";
import type { ShippingRate, ShippingZone } from "../lib/admin/shipping";
import type { ProductCollection } from "../lib/admin/collections";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
function badRequest(msg: string): Response { return json({ ok: false, error: msg }, 400); }
function notFound(msg: string): Response { return json({ ok: false, error: msg }, 404); }
function serverError(err: unknown): Response {
  const m = err instanceof Error ? err.message : String(err);
  return json({ ok: false, error: m }, 500);
}
function methodGuard(req: Request, expected: string): Response | null {
  if (req.method !== expected) {
    return new Response(JSON.stringify({ ok: false, error: `Use ${expected}` }), {
      status: 405,
      headers: { "content-type": "application/json", allow: expected },
    });
  }
  return null;
}
async function safeJson<T = unknown>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}

function requireClientScope(ctx: PluginCtx): string | Response {
  if (!ctx.clientId) {
    return badRequest("Ecommerce is client-scoped — clientId required.");
  }
  return ctx.clientId;
}

// ─── Products ──────────────────────────────────────────────────────────────

export async function listProductsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const url = new URL(req.url);
  try {
    const c = containerFor(ctx.storage);
    const products = await c.products.listProducts({
      includeHidden: url.searchParams.get("includeHidden") === "true",
      includeArchived: url.searchParams.get("includeArchived") === "true",
    });
    return json({ ok: true, products });
  } catch (err) {
    return serverError(err);
  }
}

export async function getProductHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return badRequest("slug required.");
  try {
    const c = containerFor(ctx.storage);
    const p = await c.products.getProduct(slug);
    if (!p) return notFound("Product not found.");
    return json({ ok: true, product: p });
  } catch (err) {
    return serverError(err);
  }
}

export async function upsertProductHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const scope = requireClientScope(ctx); if (typeof scope !== "string") return scope;
  const body = await safeJson<Product>(req);
  if (!body || typeof body.slug !== "string" || typeof body.name !== "string") {
    return badRequest("slug + name required.");
  }
  try {
    const c = containerFor(ctx.storage);
    const product = await c.products.upsertProduct(body);
    c.events.emit({ agencyId: ctx.agencyId, clientId: scope }, "product.updated", { slug: body.slug });
    return json({ ok: true, product }, 200);
  } catch (err) {
    return serverError(err);
  }
}

export async function deleteProductHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE"); if (guard) return guard;
  const scope = requireClientScope(ctx); if (typeof scope !== "string") return scope;
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return badRequest("slug required.");
  try {
    const c = containerFor(ctx.storage);
    const removed = await c.products.deleteProduct(slug);
    if (removed) {
      c.events.emit({ agencyId: ctx.agencyId, clientId: scope }, "product.deleted", { slug });
    }
    return json({ ok: removed });
  } catch (err) {
    return serverError(err);
  }
}

// ─── Orders ────────────────────────────────────────────────────────────────

export async function listOrdersHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx); if (typeof scope !== "string") return scope;
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "100");
  try {
    const c = containerFor(ctx.storage);
    const orders = await c.orders.listOrdersForClient(scope, Number.isFinite(limit) ? limit : 100);
    return json({ ok: true, orders });
  } catch (err) {
    return serverError(err);
  }
}

export async function getOrderHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id required.");
  try {
    const c = containerFor(ctx.storage);
    const order = await c.orders.getOrder(id);
    if (!order) return notFound("Order not found.");
    if (ctx.clientId && order.clientId !== ctx.clientId) return notFound("Order not found.");
    return json({ ok: true, order });
  } catch (err) {
    return serverError(err);
  }
}

export interface UpdateOrderStatusBody {
  id: string;
  status: "pending" | "paid" | "fulfilled" | "shipped" | "delivered" | "refunded" | "cancelled";
  trackingNumber?: string;
  trackingCarrier?: string;
}

export async function updateOrderStatusHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const scope = requireClientScope(ctx); if (typeof scope !== "string") return scope;
  const body = await safeJson<UpdateOrderStatusBody>(req);
  if (!body?.id || !body.status) return badRequest("id + status required.");
  try {
    const c = containerFor(ctx.storage);
    const next = await c.orders.updateOrderStatus(body.id, body.status, {
      trackingNumber: body.trackingNumber,
      trackingCarrier: body.trackingCarrier,
    });
    if (!next) return notFound("Order not found.");
    c.events.emit({ agencyId: ctx.agencyId, clientId: scope }, "order.shipped", { orderId: body.id, status: body.status });
    return json({ ok: true, order: next });
  } catch (err) {
    return serverError(err);
  }
}

// ─── Stripe — checkout ────────────────────────────────────────────────────

export interface CheckoutBody {
  lineItems: StripeLineItem[];
  customerEmail?: string;
  metadata?: Record<string, string>;
  discountAmount?: number;
}

export async function stripeCheckoutHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const body = await safeJson<CheckoutBody>(req);
  if (!body || !Array.isArray(body.lineItems) || body.lineItems.length === 0) {
    return badRequest("lineItems required.");
  }
  try {
    const keys = readStripeKeysFromInstall(ctx.install.config);
    const config = ctx.install.config as Record<string, string>;
    const successUrl = config.successUrl ?? `${getOrigin(req)}/checkout/success?session={CHECKOUT_SESSION_ID}`;
    const cancelUrl = config.cancelUrl ?? `${getOrigin(req)}/cart`;
    const session = await createCheckoutSession(keys, {
      lineItems: body.lineItems,
      customerEmail: body.customerEmail,
      metadata: {
        ...body.metadata,
        agencyId: ctx.agencyId,
        clientId: ctx.clientId ?? "",
        installId: ctx.install.id,
      },
      successUrl,
      cancelUrl,
      discountAmount: body.discountAmount,
    });
    return json({ ok: true, ...session });
  } catch (err) {
    return serverError(err);
  }
}

// ─── Stripe — webhook ─────────────────────────────────────────────────────

const processedEventIds = new Set<string>();

export async function stripeWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const sig = req.headers.get("stripe-signature");
  if (!sig) return badRequest("Missing stripe-signature header.");
  let rawBody: string;
  try { rawBody = await req.text(); } catch { return badRequest("Could not read body."); }

  try {
    const keys = readStripeKeysFromInstall(ctx.install.config);
    const event = (await constructWebhookEvent(keys, rawBody, sig)) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };

    // Idempotency cache (single-process). For HA, swap to a SETNX/Redis or
    // a `processed_webhook_events` table with a unique index.
    if (processedEventIds.has(event.id)) {
      return json({ ok: true, deduped: true });
    }
    processedEventIds.add(event.id);

    const c = containerFor(ctx.storage);

    switch (event.type) {
      case "checkout.session.completed": {
        const sess = event.data.object as {
          id: string;
          payment_intent?: string;
          amount_total?: number;
          currency?: string;
          customer_email?: string;
          customer_details?: { name?: string };
          shipping_details?: { address?: Record<string, string> };
          metadata?: Record<string, string>;
          line_items?: { data?: Array<{ description?: string; quantity?: number; amount_total?: number; currency?: string; price?: { metadata?: Record<string, string> } }> };
        };
        const items: ServerOrderItem[] = (sess.line_items?.data ?? []).map(li => ({
          name: li.description ?? "Item",
          quantity: li.quantity ?? 1,
          unitAmount: li.amount_total ? Math.round(li.amount_total / (li.quantity ?? 1)) : 0,
          currency: li.currency ?? "gbp",
        }));
        // R6 — `referralCodeId` and `endCustomerUserId` are stamped at
        // checkout into the Stripe session metadata by the storefront's
        // checkout API. Reading them here lets the order-creation event
        // payload carry them downstream to affiliates + memberships.
        const referralCodeId = sess.metadata?.referralCodeId || undefined;
        const endCustomerUserId = sess.metadata?.endCustomerUserId || undefined;
        const { order, isNew } = await c.orders.upsertOrderByStripeSession({
          clientId: ctx.clientId ?? sess.metadata?.clientId ?? "",
          stripeSessionId: sess.id,
          paymentIntentId: sess.payment_intent,
          amountTotal: sess.amount_total ?? 0,
          currency: sess.currency ?? "gbp",
          customerEmail: sess.customer_email,
          customerName: sess.customer_details?.name,
          shippingAddress: sess.shipping_details?.address as never,
          items,
          metadata: sess.metadata,
          referralCodeId,
          endCustomerUserId,
        });
        if (isNew) {
          // R6 — emit order.created exactly once per order. Foundation
          // routes this to affiliates' AttributionService when an
          // affiliates install exists for the same client. The
          // `referralCodeId` + `endCustomerUserId` fields are the
          // load-bearing additions; `subtotal` is the pre-discount
          // amount (falls back to amountTotal when no discount applied).
          const subtotal = order.amountTotal + (order.discountAmount ?? 0);
          c.events.emit(
            { agencyId: ctx.agencyId, clientId: ctx.clientId },
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
          await c.activity.logActivity({
            agencyId: ctx.agencyId,
            clientId: ctx.clientId,
            category: "ecommerce",
            action: "order.created",
            message: `Order ${order.id} created (${order.amountTotal / 100} ${order.currency})${order.referralCodeId ? ` via referral ${order.referralCodeId}` : ""}.`,
            metadata: {
              orderId: order.id,
              sessionId: sess.id,
              referralCodeId: order.referralCodeId,
              endCustomerUserId: order.endCustomerUserId,
            },
          });
        }
        c.events.emit(
          { agencyId: ctx.agencyId, clientId: ctx.clientId },
          "order.paid",
          { orderId: order.id, amountTotal: order.amountTotal, currency: order.currency },
        );
        await c.activity.logActivity({
          agencyId: ctx.agencyId,
          clientId: ctx.clientId,
          category: "ecommerce",
          action: "order.paid",
          message: `Order ${order.id} paid (${order.amountTotal / 100} ${order.currency}).`,
          metadata: { orderId: order.id, sessionId: sess.id },
        });
        return json({ ok: true, orderId: order.id });
      }

      case "charge.refunded": {
        const charge = event.data.object as { payment_intent?: string };
        if (charge.payment_intent) {
          const refunded = await c.orders.markOrderRefunded(charge.payment_intent);
          if (refunded) {
            c.events.emit(
              { agencyId: ctx.agencyId, clientId: ctx.clientId },
              "order.refunded",
              { orderId: refunded.id },
            );
          }
        }
        return json({ ok: true });
      }

      default:
        return json({ ok: true, ignored: event.type });
    }
  } catch (err) {
    return serverError(err);
  }
}

// ─── Stripe — billing portal ──────────────────────────────────────────────

export async function stripeBillingPortalHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const body = await safeJson<{ customerId?: string; customerEmail?: string; returnUrl?: string }>(req);
  if (!body) return badRequest("body required.");
  try {
    const keys = readStripeKeysFromInstall(ctx.install.config);
    const result = await createBillingPortalSession(keys, {
      customerId: body.customerId,
      customerEmail: body.customerEmail,
      returnUrl: body.returnUrl ?? getOrigin(req),
    });
    return json({ ok: true, ...result });
  } catch (err) {
    return serverError(err);
  }
}

// ─── Discounts ─────────────────────────────────────────────────────────────

export async function listDiscountsHandler(_req: Request, ctx: PluginCtx): Promise<Response> {
  try {
    const c = containerFor(ctx.storage);
    const codes = await c.discounts.listCustomCodes();
    return json({ ok: true, codes });
  } catch (err) {
    return serverError(err);
  }
}

export async function upsertDiscountHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const body = await safeJson<CustomDiscountCode>(req);
  if (!body?.code) return badRequest("code required.");
  try {
    const c = containerFor(ctx.storage);
    const code = await c.discounts.upsertCustomCode(body);
    return json({ ok: true, code });
  } catch (err) {
    return serverError(err);
  }
}

export async function deleteDiscountHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE"); if (guard) return guard;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return badRequest("code required.");
  try {
    const c = containerFor(ctx.storage);
    const removed = await c.discounts.deleteCustomCode(code);
    return json({ ok: removed });
  } catch (err) {
    return serverError(err);
  }
}

export async function applyDiscountHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const body = await safeJson<{ code: string; subtotal: number; alreadyApplied?: string[] }>(req);
  if (!body?.code || typeof body.subtotal !== "number") {
    return badRequest("code + subtotal required.");
  }
  try {
    const c = containerFor(ctx.storage);
    const result = await c.discounts.resolveCode(body.code, body.subtotal, body.alreadyApplied ?? []);
    return json(result, result.ok ? 200 : 422);
  } catch (err) {
    return serverError(err);
  }
}

// ─── Gift cards ────────────────────────────────────────────────────────────

export async function listGiftCardsHandler(_req: Request, ctx: PluginCtx): Promise<Response> {
  try {
    const c = containerFor(ctx.storage);
    const cards = await c.giftCards.listAll();
    return json({ ok: true, cards });
  } catch (err) {
    return serverError(err);
  }
}

export async function issueGiftCardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const body = await safeJson<Omit<GiftCard, "code" | "balance" | "createdAt" | "redemptions">>(req);
  if (!body || typeof body.amount !== "number") return badRequest("amount required.");
  try {
    const c = containerFor(ctx.storage);
    const card = await c.giftCards.issue(body);
    return json({ ok: true, card }, 201);
  } catch (err) {
    return serverError(err);
  }
}

// ─── Inventory ─────────────────────────────────────────────────────────────

export async function listInventoryHandler(_req: Request, ctx: PluginCtx): Promise<Response> {
  try {
    const c = containerFor(ctx.storage);
    const items = await c.products.listInventory();
    return json({ ok: true, items });
  } catch (err) {
    return serverError(err);
  }
}

export async function setInventoryHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const scope = requireClientScope(ctx); if (typeof scope !== "string") return scope;
  const body = await safeJson<{ sku: string; onHand: number; reserved?: number; lowAt?: number; unlimited?: boolean }>(req);
  if (!body?.sku) return badRequest("sku required.");
  try {
    const c = containerFor(ctx.storage);
    await c.products.setInventory({
      sku: body.sku,
      onHand: body.onHand,
      reserved: body.reserved ?? 0,
      lowAt: body.lowAt ?? 5,
      unlimited: body.unlimited,
    });
    c.events.emit({ agencyId: ctx.agencyId, clientId: scope }, "inventory.updated", { sku: body.sku });
    return json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}

export async function reserveInventoryHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const body = await safeJson<{ reservations: Record<string, number> }>(req);
  if (!body?.reservations) return badRequest("reservations required.");
  try {
    const c = containerFor(ctx.storage);
    const errors: string[] = [];
    for (const [sku, qty] of Object.entries(body.reservations)) {
      const current = await c.products.getInventory(sku);
      if (!current) continue;
      // Mirror cart total: reserved = qty supplied
      await c.products.setInventory({ ...current, reserved: qty });
    }
    return json({ ok: true, errors });
  } catch (err) {
    return serverError(err);
  }
}

// ─── Shipping ──────────────────────────────────────────────────────────────

const SHIPPING_ZONES_KEY = "shipping/zones";
const SHIPPING_RATES_KEY = "shipping/rates";

export async function listShippingHandler(_req: Request, ctx: PluginCtx): Promise<Response> {
  try {
    const zones = (await ctx.storage.get<ShippingZone[]>(SHIPPING_ZONES_KEY)) ?? [];
    const rates = (await ctx.storage.get<ShippingRate[]>(SHIPPING_RATES_KEY)) ?? [];
    return json({ ok: true, zones, rates });
  } catch (err) {
    return serverError(err);
  }
}

export async function saveShippingHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const body = await safeJson<{ zones?: ShippingZone[]; rates?: ShippingRate[] }>(req);
  if (!body) return badRequest("body required.");
  try {
    if (body.zones) await ctx.storage.set(SHIPPING_ZONES_KEY, body.zones);
    if (body.rates) await ctx.storage.set(SHIPPING_RATES_KEY, body.rates);
    return json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}

// ─── Collections ───────────────────────────────────────────────────────────

const COLLECTIONS_KEY = "collections";

export async function listCollectionsHandler(_req: Request, ctx: PluginCtx): Promise<Response> {
  try {
    const collections = (await ctx.storage.get<ProductCollection[]>(COLLECTIONS_KEY)) ?? [];
    return json({ ok: true, collections });
  } catch (err) {
    return serverError(err);
  }
}

export async function saveCollectionsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const body = await safeJson<{ collections: ProductCollection[] }>(req);
  if (!body || !Array.isArray(body.collections)) return badRequest("collections array required.");
  try {
    await ctx.storage.set(COLLECTIONS_KEY, body.collections);
    return json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getOrigin(req: Request): string {
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}
