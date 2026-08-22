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
import type { ServerOrderItem, UpdateOrderPatch } from "../server/orders";
import type { Product } from "../lib/products";
import type { CustomDiscountCode } from "../server/discounts";
import type { GiftCard } from "../server/giftCards";
import { formatUkDate } from "../lib/safeDate";
import type { ShippingRate, ShippingZone } from "../lib/admin/shipping";
import type { ProductCollection } from "../lib/admin/collections";
import { installConfigWithSecrets } from "@/lib/server/plugins/pluginSecretConfig";

// Stripe keys are declared in the manifest but stored in the encrypted
// integrations vault, NOT on `install.config` (that record is handed to page
// props and therefore to the browser). Merge them back under their manifest
// ids so the pure `readStripeKeysFromInstall` reader keeps its shape, and so a
// client-scoped install resolves that client's own Stripe account.
function stripeConfig(ctx: PluginCtx): Record<string, unknown> {
  return installConfigWithSecrets(ctx.install.pluginId, { agencyId: ctx.agencyId, clientId: ctx.clientId }, ctx.install.config);
}

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
    const existing = await c.orders.getOrder(body.id);
    if (!existing || existing.clientId !== scope) return notFound("Order not found.");
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

export async function updateOrderHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH"); if (guard) return guard;
  const scope = requireClientScope(ctx); if (typeof scope !== "string") return scope;
  const body = await safeJson<{ id: string; patch: UpdateOrderPatch }>(req);
  if (!body?.id || !body.patch) return badRequest("id + patch required.");
  try {
    const c = containerFor(ctx.storage);
    const existing = await c.orders.getOrder(body.id);
    if (!existing || existing.clientId !== scope) return notFound("Order not found.");
    const order = await c.orders.updateOrder(body.id, body.patch);
    if (!order) return notFound("Order not found.");
    await c.activity.logActivity({
      agencyId: ctx.agencyId,
      clientId: scope,
      category: "ecommerce",
      action: "order.updated",
      message: `Updated order ${order.id}.`,
      metadata: { orderId: order.id, status: order.status },
    });
    return json({ ok: true, order });
  } catch (err) {
    return serverError(err);
  }
}

export async function downloadOrderHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx); if (typeof scope !== "string") return scope;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const format = url.searchParams.get("format") ?? "html";
  const print = url.searchParams.get("print") === "1";
  if (!id) return badRequest("id required.");
  const c = containerFor(ctx.storage);
  const order = await c.orders.getOrder(id);
  if (!order || order.clientId !== scope) return notFound("Order not found.");
  if (format === "json") {
    return new Response(JSON.stringify(order, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="${order.id}.json"`,
        "cache-control": "private, no-store",
      },
    });
  }
  const client = await c.tenant.getClientForAgency(ctx.agencyId, scope);
  const lineRows = order.items.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${money(item.unitAmount, item.currency)}</td><td>${money(item.unitAmount * item.quantity, item.currency)}</td></tr>`).join("");
  const address = order.shippingAddress
    ? [order.shippingAddress.line1, order.shippingAddress.line2, order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.postalCode, order.shippingAddress.country].filter(Boolean).map(value => escapeHtml(String(value))).join("<br>")
    : "";
  const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(order.id)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f3f3f1;color:#171717;font:14px/1.5 Arial,sans-serif}.document{max-width:800px;min-height:1120px;margin:24px auto;background:#fff;padding:64px;box-shadow:0 12px 40px rgba(0,0,0,.08)}
header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #171717;padding-bottom:24px}h1{margin:4px 0 0;font-size:30px}.eyebrow,h2{color:#666;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}section{margin-top:30px}.details{display:grid;grid-template-columns:1fr 1fr;gap:32px}.details p{color:#555;line-height:1.7}table{width:100%;border-collapse:collapse}th,td{padding:13px 8px;border-bottom:1px solid #ddd;text-align:left}th{color:#666;font-size:10px;text-transform:uppercase}th:nth-child(n+2),td:nth-child(n+2){text-align:right}.total{margin:28px 0 0 auto;max-width:320px;border-bottom:3px solid #171717;padding:12px 0;display:flex;justify-content:space-between;font-size:17px}.notes{white-space:pre-wrap;color:#555}
@media print{@page{size:A4;margin:0}body{background:#fff}.document{min-height:297mm;margin:0;padding:18mm 16mm;box-shadow:none}}</style></head><body><article class="document"><header><div><span class="eyebrow">Order</span><h1>${escapeHtml(order.id)}</h1></div><div style="text-align:right"><strong>${escapeHtml(client?.name ?? "Store")}</strong><p>${formatUkDate(order.createdAt, { dateStyle: "medium" })}</p></div></header><section class="details"><div><h2>Customer</h2><p>${escapeHtml(order.customerName ?? "Customer")}<br>${escapeHtml(order.customerEmail ?? "")}</p></div>${address ? `<div><h2>Delivery</h2><p>${address}</p></div>` : ""}</section><section><h2>Items</h2><table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${lineRows}</tbody></table><div class="total"><strong>Total</strong><strong>${money(order.amountTotal, order.currency)}</strong></div></section><section><h2>Order status</h2><p>${escapeHtml(order.status)}</p></section>${order.internalNotes ? `<section><h2>Internal notes</h2><p class="notes">${escapeHtml(order.internalNotes)}</p></section>` : ""}</article>${print ? '<script>window.addEventListener("load",function(){window.print()})</script>' : ""}</body></html>`;
  return new Response(document, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `${print ? "inline" : "attachment"}; filename="${order.id}.html"`,
      "cache-control": "private, no-store",
    },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
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
    const keys = readStripeKeysFromInstall(stripeConfig(ctx));
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
    const keys = readStripeKeysFromInstall(stripeConfig(ctx));
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
    const keys = readStripeKeysFromInstall(stripeConfig(ctx));
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
