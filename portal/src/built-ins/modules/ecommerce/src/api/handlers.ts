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
} from "../lib/stripe/server";
import { OrderTransitionError, type ServerOrderItem, type UpdateOrderPatch } from "../server/orders";
import { CheckoutValidationError, parseCheckoutRequest } from "../server/checkout";
import { ProductConflictError } from "../server/productsStore";
import type { Product } from "../lib/products";
import type { CustomDiscountCode } from "../server/discounts";
import type { GiftCardIssueInput } from "../server/giftCards";
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
function conflict(msg: string): Response { return json({ ok: false, error: msg }, 409); }
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
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const requestedLimit = Number(url.searchParams.get("limit") ?? products.length);
    const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : products.length;
    const filtered = (query
      ? products.filter(product => [product.name, product.slug, product.tagline, product.range]
          .some(value => value?.toLowerCase().includes(query)))
      : products).slice(0, limit);
    return json({ ok: true, count: filtered.length, products: filtered });
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
  const body = await safeJson<
    | { command: "details"; product: Product; expectedVersion?: number; create?: boolean }
    | { command: "variants"; productId: string; expectedVersion: number; options: Product["options"]; variants: Product["variants"] }
  >(req);
  if (!body || (body.command !== "details" && body.command !== "variants")) {
    return badRequest("A versioned product command is required.");
  }
  try {
    const c = containerFor(ctx.storage);
    const product = body.command === "details"
      ? body.create
        ? await c.products.createProduct(body.product)
        : await c.products.saveProductDetails(body.product, body.expectedVersion)
      : await c.products.saveProductVariants(
          body.productId,
          body.expectedVersion,
          body.options,
          body.variants,
        );
    c.events.emit(
      { agencyId: ctx.agencyId, clientId: scope },
      body.command === "details" && body.create ? "product.created" : "product.updated",
      { slug: product.slug, id: product.id, version: product.version },
    );
    return json({ ok: true, product }, 200);
  } catch (err) {
    if (err instanceof ProductConflictError) return conflict(err.message);
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
    const archived = await c.products.archiveProduct(slug);
    if (archived) {
      c.events.emit({ agencyId: ctx.agencyId, clientId: scope }, "product.updated", { slug, archived: true, version: archived.version });
    }
    return json({ ok: Boolean(archived), product: archived });
  } catch (err) {
    if (err instanceof ProductConflictError) return conflict(err.message);
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

export async function getOrderBySessionHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx); if (typeof scope !== "string") return scope;
  const sessionId = new URL(req.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) return badRequest("sessionId required.");
  try {
    const c = containerFor(ctx.storage);
    const order = await c.orders.getOrderByStripeSession(sessionId);
    if (order) {
      if (order.clientId !== scope) return notFound("Order not found.");
      return json({ ok: true, state: "ready", order });
    }
    const operation = await c.checkout.getOperationBySession(sessionId);
    if (operation) {
      return json({ ok: true, state: "pending" }, 202, { "retry-after": "1" });
    }
    return notFound("Checkout session not found.");
  } catch (err) {
    return serverError(err);
  }
}

export interface UpdateOrderStatusBody {
  id: string;
  status: "pending" | "paid" | "fulfilled" | "shipped" | "delivered" | "refunded" | "cancelled";
  trackingNumber?: string;
  trackingCarrier?: string;
  operationId?: string;
}

function emitOrderLifecycle(
  ctx: PluginCtx,
  order: { id: string; status: UpdateOrderStatusBody["status"]; amountTotal: number; currency: string; refundedAmountCents?: number },
  emit: ReturnType<typeof containerFor>["events"]["emit"],
): void {
  const eventName = order.status === "refunded"
    ? "order.refunded"
    : order.status === "cancelled"
      ? "order.cancelled"
      : order.status === "paid"
        ? "order.paid"
        : order.status === "shipped"
          ? "order.shipped"
          : order.status === "fulfilled" || order.status === "delivered"
            ? "order.fulfilled"
            : null;
  if (!eventName) return;
  emit(
    { agencyId: ctx.agencyId, clientId: ctx.clientId },
    eventName,
    {
      orderId: order.id,
      status: order.status,
      amountTotal: order.amountTotal,
      currency: order.currency,
      refundedAmountCents: order.status === "cancelled"
        ? order.amountTotal
        : order.refundedAmountCents,
    },
  );
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
    }, body.operationId);
    if (!next) return notFound("Order not found.");
    emitOrderLifecycle(ctx, next, c.events.emit.bind(c.events));
    return json({ ok: true, order: next });
  } catch (err) {
    if (err instanceof OrderTransitionError) return conflict(err.message);
    return serverError(err);
  }
}

export async function updateOrderHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH"); if (guard) return guard;
  const scope = requireClientScope(ctx); if (typeof scope !== "string") return scope;
  const body = await safeJson<{ id: string; patch: UpdateOrderPatch; operationId?: string }>(req);
  if (!body?.id || !body.patch) return badRequest("id + patch required.");
  try {
    const c = containerFor(ctx.storage);
    const existing = await c.orders.getOrder(body.id);
    if (!existing || existing.clientId !== scope) return notFound("Order not found.");
    const order = await c.orders.updateOrder(body.id, body.patch, { operationId: body.operationId });
    if (!order) return notFound("Order not found.");
    if (body.patch.status && body.patch.status !== existing.status) {
      emitOrderLifecycle(ctx, order, c.events.emit.bind(c.events));
    }
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
    if (err instanceof OrderTransitionError) return conflict(err.message);
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

export async function stripeCheckoutHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const scope = requireClientScope(ctx); if (typeof scope !== "string") return scope;
  const rawBody = await safeJson<unknown>(req);
  try {
    const body = parseCheckoutRequest(rawBody);
    const c = containerFor(ctx.storage);
    const config = ctx.install.config as Record<string, unknown>;
    const operation = await c.checkout.prepare(body, checkoutServiceConfig(ctx, scope));
    const origin = getOrigin(req);
    const successUrl = checkoutReturnUrl(
      body.successPath,
      typeof config.successUrl === "string" ? config.successUrl : undefined,
      "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      origin,
    );
    const cancelUrl = checkoutReturnUrl(
      body.cancelPath,
      typeof config.cancelUrl === "string" ? config.cancelUrl : undefined,
      "/cart",
      origin,
    );
    const metadata = {
      agencyId: ctx.agencyId,
      clientId: scope,
      installId: ctx.install.id,
      checkoutOperationId: operation.id,
      expectedAmountTotal: String(operation.amountTotal),
      expectedCurrency: operation.currency,
      expectedItemCount: String(operation.lines.length),
      referralCodeId: body.referralCodeId ?? "",
      endCustomerUserId: body.endCustomerUserId ?? "",
    };
    if (operation.amountTotal === 0) {
      const sessionId = operation.providerSessionId ?? `zero_${operation.id}`;
      const completedUrl = checkoutCompletionUrl(successUrl, sessionId);
      if (!operation.providerSessionId) {
        await c.checkout.recordProviderSession(operation.id, { id: sessionId, url: completedUrl });
      }
      const applied = await applyVerifiedEcommerceWebhookEvent({
        id: `checkout-zero:${operation.id}`,
        type: "checkout.session.completed",
        data: { object: {
          id: sessionId,
          payment_status: "paid",
          amount_total: 0,
          currency: operation.currency,
          customer_email: body.customerEmail,
          metadata,
        } },
      }, ctx);
      if (!applied.ok) return json({ ok: false, error: applied.error, retryable: true }, 503);
      return json({ ok: true, id: sessionId, url: completedUrl, zeroBalance: true });
    }
    if (operation.providerSessionId && operation.providerUrl) {
      const repaired = await c.checkout.recordProviderSession(operation.id, {
        id: operation.providerSessionId,
        url: operation.providerUrl,
      });
      return json({ ok: true, id: repaired.providerSessionId, url: repaired.providerUrl, replayed: true });
    }
    const keys = readStripeKeysFromInstall(stripeConfig(ctx));
    const session = await createCheckoutSession(keys, {
      lineItems: c.checkout.providerLineItems(operation),
      customerEmail: body.customerEmail,
      metadata,
      successUrl,
      cancelUrl,
      discountAmount: operation.discountAmount,
      idempotencyKey: `aqua-checkout-${ctx.install.id}-${operation.id}`,
      expiresAt: operation.expiresAt,
      collectShippingAddress: operation.lines.some(line => !line.digital),
      allowedShippingCountries: operation.shipping.allowedCountries,
    });
    const recorded = await c.checkout.recordProviderSession(operation.id, session);
    return json({ ok: true, id: recorded.providerSessionId, url: recorded.providerUrl });
  } catch (err) {
    if (err instanceof CheckoutValidationError) return badRequest(err.message);
    return serverError(err);
  }
}

export async function checkoutQuoteHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const scope = requireClientScope(ctx); if (typeof scope !== "string") return scope;
  try {
    const body = parseCheckoutRequest(await safeJson<unknown>(req));
    const quote = await containerFor(ctx.storage).checkout.quote(body, checkoutServiceConfig(ctx, scope));
    return json({ ok: true, quote });
  } catch (err) {
    if (err instanceof CheckoutValidationError) return badRequest(err.message);
    return serverError(err);
  }
}

// ─── Stripe — webhook ─────────────────────────────────────────────────────

export interface EcommerceWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

interface EcommerceWebhookResult {
  kind: "checkout" | "refund" | "expired" | "ignored";
  orderId?: string;
  isNew?: boolean;
  ignoredType?: string;
}

interface EcommerceWebhookDelivery {
  id: string;
  type: string;
  status: "processing" | "failed" | "completed";
  attempts: number;
  receivedAt: number;
  updatedAt: number;
  completedAt?: number;
  lastError?: string;
  result?: EcommerceWebhookResult;
}

export interface EcommerceWebhookApplyResult {
  ok: boolean;
  duplicate?: boolean;
  retryable?: boolean;
  orderId?: string;
  ignored?: string;
  error?: string;
}

const webhookDeliveryKey = (eventId: string): string =>
  `ecommerce/webhook/delivery/${encodeURIComponent(eventId)}`;
const webhookLocalTails = new Map<string, Promise<void>>();

async function localWebhookExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = webhookLocalTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  webhookLocalTails.set(key, tail);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (webhookLocalTails.get(key) === tail) webhookLocalTails.delete(key);
  }
}

export async function stripeWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const sig = req.headers.get("stripe-signature");
  if (!sig) return badRequest("Missing stripe-signature header.");
  let rawBody: string;
  try { rawBody = await req.text(); } catch { return badRequest("Could not read body."); }

  try {
    const keys = readStripeKeysFromInstall(stripeConfig(ctx));
    const event = (await constructWebhookEvent(keys, rawBody, sig)) as EcommerceWebhookEvent;
    const result = await applyVerifiedEcommerceWebhookEvent(event, ctx);
    if (!result.ok) return json({ ok: false, error: result.error, retryable: true }, 503);
    return json({ ok: true, deduped: result.duplicate, orderId: result.orderId, ignored: result.ignored });
  } catch (err) {
    return serverError(err);
  }
}

export async function applyVerifiedEcommerceWebhookEvent(
  event: EcommerceWebhookEvent,
  ctx: PluginCtx,
): Promise<EcommerceWebhookApplyResult> {
  const execute = async (): Promise<EcommerceWebhookApplyResult> => {
    const stored = await ctx.storage.get<EcommerceWebhookDelivery>(webhookDeliveryKey(event.id));
    if (stored?.status === "completed") {
      return {
        ok: true,
        duplicate: true,
        orderId: stored.result?.orderId,
        ignored: stored.result?.ignoredType,
      };
    }
    let delivery: EcommerceWebhookDelivery = {
      id: event.id,
      type: event.type,
      status: "processing",
      attempts: (stored?.attempts ?? 0) + 1,
      receivedAt: stored?.receivedAt ?? Date.now(),
      updatedAt: Date.now(),
      result: stored?.result,
    };
    await ctx.storage.set(webhookDeliveryKey(event.id), delivery);
    try {
      const c = containerFor(ctx.storage);
      if (!delivery.result) {
        delivery = {
          ...delivery,
          result: await applyEcommerceWebhookState(event, ctx, c),
          updatedAt: Date.now(),
        };
        await ctx.storage.set(webhookDeliveryKey(event.id), delivery);
      }
      const result = delivery.result;
      if (!result) throw new Error(`Webhook ${event.id} did not persist an application result.`);
      if (result.kind === "checkout" || result.kind === "refund") {
        const order = result.orderId ? await c.orders.getOrder(result.orderId) : null;
        if (!order) throw new Error(`Webhook ${event.id} lost its applied order result.`);
        if (result.kind === "checkout") {
          if (result.isNew) {
            await c.activity.logActivity({
              idempotencyKey: `ecommerce:webhook:${event.id}:order-created`,
              agencyId: ctx.agencyId,
              clientId: order.clientId,
              category: "ecommerce",
              action: "order.created",
              message: `Order ${order.id} created (${order.amountTotal / 100} ${order.currency})${order.referralCodeId ? ` via referral ${order.referralCodeId}` : ""}.`,
              metadata: {
                orderId: order.id,
                sessionId: order.stripeSessionId,
                referralCodeId: order.referralCodeId,
                endCustomerUserId: order.endCustomerUserId,
              },
            });
            const subtotal = order.subtotal ?? order.amountTotal + (order.discountAmount ?? 0);
            c.events.emit(
              { agencyId: ctx.agencyId, clientId: order.clientId },
              "order.created",
              {
                operationId: event.id,
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
          await c.activity.logActivity({
            idempotencyKey: `ecommerce:webhook:${event.id}:order-paid`,
            agencyId: ctx.agencyId,
            clientId: order.clientId,
            category: "ecommerce",
            action: "order.paid",
            message: `Order ${order.id} paid (${order.amountTotal / 100} ${order.currency}).`,
            metadata: { orderId: order.id, sessionId: order.stripeSessionId },
          });
          c.events.emit(
            { agencyId: ctx.agencyId, clientId: order.clientId },
            "order.paid",
            { operationId: event.id, orderId: order.id, amountTotal: order.amountTotal, currency: order.currency },
          );
        } else {
          await c.activity.logActivity({
            idempotencyKey: `ecommerce:webhook:${event.id}:order-refunded`,
            agencyId: ctx.agencyId,
            clientId: order.clientId,
            category: "ecommerce",
            action: "order.refunded",
            message: `Order ${order.id} refund total is ${(order.refundedAmountCents ?? 0) / 100} ${order.currency}.`,
            metadata: {
              orderId: order.id,
              paymentIntentId: order.paymentIntentId,
              refundedAmountCents: order.refundedAmountCents,
            },
          });
          c.events.emit(
            { agencyId: ctx.agencyId, clientId: order.clientId },
            "order.refunded",
            {
              operationId: event.id,
              orderId: order.id,
              status: order.status,
              amountTotal: order.amountTotal,
              currency: order.currency,
              refundedAmountCents: order.refundedAmountCents,
            },
          );
        }
      }
      delivery = {
        ...delivery,
        status: "completed",
        completedAt: Date.now(),
        updatedAt: Date.now(),
        lastError: undefined,
      };
      await ctx.storage.set(webhookDeliveryKey(event.id), delivery);
      return {
        ok: true,
        duplicate: false,
        orderId: result.orderId,
        ignored: result.ignoredType,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      delivery = { ...delivery, status: "failed", lastError: error, updatedAt: Date.now() };
      try { await ctx.storage.set(webhookDeliveryKey(event.id), delivery); }
      catch (recordError) {
        return {
          ok: false,
          retryable: true,
          error: `${error}; failed to persist webhook retry state: ${recordError instanceof Error ? recordError.message : String(recordError)}`,
        };
      }
      return { ok: false, retryable: true, error };
    }
  };
  try {
    if (ctx.storage.runExclusive) {
      return await ctx.storage.runExclusive("ecommerce:webhook-collection", execute);
    }
    return await localWebhookExclusive(`${ctx.install.id}:webhook-collection`, execute);
  } catch (err) {
    return { ok: false, retryable: true, error: err instanceof Error ? err.message : String(err) };
  }
}

async function applyEcommerceWebhookState(
  event: EcommerceWebhookEvent,
  ctx: PluginCtx,
  c: ReturnType<typeof containerFor>,
): Promise<EcommerceWebhookResult> {
  if (event.type === "checkout.session.completed") {
    const sess = event.data.object as {
      id?: string;
      payment_status?: string;
      payment_intent?: string;
      amount_total?: number;
      currency?: string;
      customer_email?: string;
      customer_details?: { name?: string };
      shipping_details?: { address?: Record<string, string> };
      metadata?: Record<string, string>;
      line_items?: { data?: Array<{ description?: string; quantity?: number; amount_total?: number; currency?: string }> };
    };
    if (!sess.id) throw new Error("Checkout webhook session id is required.");
    if (sess.payment_status !== "paid") {
      throw new Error(`Checkout session ${sess.id} is ${sess.payment_status ?? "missing payment_status"}, not paid.`);
    }
    if (!Number.isSafeInteger(sess.amount_total) || (sess.amount_total ?? -1) < 0) {
      throw new Error(`Checkout session ${sess.id} amount_total must be a non-negative integer.`);
    }
    const currency = sess.currency?.trim().toLowerCase();
    if (!currency) throw new Error(`Checkout session ${sess.id} currency is required.`);
    const clientId = ctx.clientId ?? sess.metadata?.clientId;
    if (!clientId) throw new Error(`Checkout session ${sess.id} has no client scope.`);
    if (ctx.clientId && sess.metadata?.clientId && sess.metadata.clientId !== ctx.clientId) {
      throw new Error(`Checkout session ${sess.id} client scope does not match this install.`);
    }
    const operationId = sess.metadata?.checkoutOperationId;
    if (!operationId) throw new Error(`Checkout session ${sess.id} has no authoritative checkout operation.`);
    const checkout = await c.checkout.getOperation(operationId);
    if (!checkout) throw new Error(`Checkout session ${sess.id} references unknown operation ${operationId}.`);
    if (checkout.providerSessionId !== sess.id) {
      throw new Error(`Checkout session ${sess.id} does not own operation ${operationId}.`);
    }
    if (checkout.amountTotal !== sess.amount_total || checkout.currency !== currency) {
      throw new Error(`Checkout session ${sess.id} does not match its authoritative total or currency.`);
    }
    if (Number(sess.metadata?.expectedAmountTotal) !== checkout.amountTotal
      || sess.metadata?.expectedCurrency?.toLowerCase() !== checkout.currency
      || Number(sess.metadata?.expectedItemCount) !== checkout.lines.length) {
      throw new Error(`Checkout session ${sess.id} metadata does not match operation ${operationId}.`);
    }
    const settledCheckout = await c.checkout.settle(operationId, sess.id, true);
    const items: ServerOrderItem[] = checkout.lines.map(line => ({
      sku: line.sku,
      name: line.name,
      description: line.description,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      currency: line.currency,
      digital: line.digital,
      downloadUrl: line.downloadUrl,
      licenseKey: line.kind === "gift_card_purchase" ? settledCheckout.issuedGiftCardCode : undefined,
    }));
    const { order, isNew } = await c.orders.upsertOrderByStripeSession({
      clientId,
      stripeSessionId: sess.id,
      paymentIntentId: sess.payment_intent,
      amountTotal: checkout.amountTotal,
      subtotal: checkout.subtotal,
      shippingAmount: checkout.shipping.amount,
      taxAmount: checkout.taxAmount,
      taxAddedAmount: checkout.taxAddedAmount,
      shippingRateId: checkout.shipping.rateId,
      checkoutOperationId: checkout.id,
      currency: checkout.currency,
      customerEmail: sess.customer_email,
      customerName: sess.customer_details?.name,
      shippingAddress: sess.shipping_details?.address as never,
      items,
      metadata: sess.metadata,
      discountSource: checkout.discount?.type,
      discountAmount: checkout.discountAmount || undefined,
      discountCode: checkout.discount?.code,
      discountSnapshot: checkout.discount?.membershipSnapshot,
      referralCodeId: checkout.request.referralCodeId,
      endCustomerUserId: checkout.request.endCustomerUserId,
      providerEventId: event.id,
    }, true);
    return { kind: "checkout", orderId: order.id, isNew };
  }
  if (event.type === "checkout.session.expired") {
    const sess = event.data.object as { id?: string; metadata?: Record<string, string> };
    if (!sess.id) throw new Error("Expired checkout session id is required.");
    const operationId = sess.metadata?.checkoutOperationId;
    if (!operationId) throw new Error(`Expired checkout session ${sess.id} has no checkout operation.`);
    const operation = await c.checkout.getOperation(operationId);
    if (!operation || operation.providerSessionId !== sess.id) {
      throw new Error(`Expired checkout session ${sess.id} does not match operation ${operationId}.`);
    }
    await c.checkout.release(operationId, true, true);
    return { kind: "expired" };
  }
  if (event.type === "charge.refunded") {
    const charge = event.data.object as { payment_intent?: string; amount_refunded?: number };
    if (!charge.payment_intent) throw new Error("Refund webhook payment_intent is required.");
    if (!Number.isSafeInteger(charge.amount_refunded) || (charge.amount_refunded ?? -1) < 0) {
      throw new Error("Refund webhook amount_refunded must be a non-negative integer.");
    }
    const order = await c.orders.markOrderRefunded(
      charge.payment_intent,
      charge.amount_refunded,
      event.id,
      true,
    );
    if (!order) throw new Error(`Refund webhook ${event.id} arrived before its paid order.`);
    if (order.status === "refunded" && order.checkoutOperationId) {
      await c.checkout.restoreGiftCardAfterFullRefund(order.checkoutOperationId, true);
    }
    return { kind: "refund", orderId: order.id };
  }
  return { kind: "ignored", ignoredType: event.type };
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
  const body = await safeJson<GiftCardIssueInput>(req);
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
  const body = await safeJson<{ sku: string; onHand: number; expectedVersion?: number; lowAt?: number; unlimited?: boolean }>(req);
  if (!body?.sku) return badRequest("sku required.");
  if (!Number.isSafeInteger(body.onHand) || body.onHand < 0) return badRequest("onHand must be a non-negative integer.");
  if (body.lowAt !== undefined && (!Number.isSafeInteger(body.lowAt) || body.lowAt < 0)) {
    return badRequest("lowAt must be a non-negative integer.");
  }
  try {
    const c = containerFor(ctx.storage);
    const write = async () => {
      const existing = await c.products.getInventory(body.sku);
      if (existing && body.expectedVersion !== (existing.version ?? 1)) {
        throw new ProductConflictError(`Inventory ${body.sku} changed while this adjustment was open. Reload before saving.`);
      }
      if (!body.unlimited && body.onHand < (existing?.reserved ?? 0)) {
        throw new ProductConflictError(`On-hand stock cannot be lower than ${existing?.reserved ?? 0} active reserved units.`);
      }
      await c.products.setInventory({
        sku: body.sku,
        onHand: body.onHand,
        // Reserved stock and operation markers belong to CheckoutService;
        // an inventory form must never erase active customer reservations.
        reserved: existing?.reserved ?? 0,
        lowAt: body.lowAt ?? existing?.lowAt ?? 5,
        unlimited: body.unlimited ?? existing?.unlimited,
        checkoutOperations: existing?.checkoutOperations,
        version: (existing?.version ?? 0) + 1,
      });
    };
    if (ctx.storage.runExclusive) await ctx.storage.runExclusive("ecommerce:checkout-collection", write);
    else await write();
    c.events.emit({ agencyId: ctx.agencyId, clientId: scope }, "inventory.updated", { sku: body.sku });
    return json({ ok: true });
  } catch (err) {
    if (err instanceof ProductConflictError) return conflict(err.message);
    return serverError(err);
  }
}

export async function reserveInventoryHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST"); if (guard) return guard;
  const body = await safeJson<{ reservations: Record<string, number> }>(req);
  if (!body?.reservations) return badRequest("reservations required.");
  void ctx;
  return conflict("Cart-level inventory mirroring is retired. Stock is reserved by an authoritative checkout operation.");
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

function checkoutReturnUrl(
  requested: string | undefined,
  configured: string | undefined,
  fallbackPath: string,
  origin: string,
): string {
  try {
    if (requested) {
      if (requested.startsWith("/") && !requested.startsWith("//")) return new URL(requested, origin).toString();
      const parsed = new URL(requested);
      if (parsed.origin !== origin) throw new CheckoutValidationError("Checkout return URLs must stay on this site.");
      return parsed.toString();
    }
    if (configured) {
      if (configured.startsWith("/") && !configured.startsWith("//")) return new URL(configured, origin).toString();
      const parsed = new URL(configured);
      if (parsed.protocol !== "https:" && parsed.origin !== origin) {
        throw new CheckoutValidationError("Configured checkout return URL must use HTTPS.");
      }
      return parsed.toString();
    }
    return new URL(fallbackPath, origin).toString();
  } catch (error) {
    if (error instanceof CheckoutValidationError) throw error;
    throw new CheckoutValidationError("Checkout return URL is invalid.");
  }
}

function checkoutDenominations(value: unknown): number[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [2500, 5000, 10000];
  const parsed = values
    .map(item => Number(typeof item === "string" ? item.trim() : item))
    .filter(amount => Number.isSafeInteger(amount) && amount > 0);
  return parsed.length > 0 ? [...new Set(parsed)] : [2500, 5000, 10000];
}

function checkoutCompletionUrl(successUrl: string, sessionId: string): string {
  if (successUrl.includes("{CHECKOUT_SESSION_ID}")) {
    return successUrl.replace("{CHECKOUT_SESSION_ID}", encodeURIComponent(sessionId));
  }
  const completed = new URL(successUrl);
  completed.searchParams.set("session_id", sessionId);
  return completed.toString();
}

function checkoutServiceConfig(ctx: PluginCtx, clientId: string) {
  const config = ctx.install.config as Record<string, unknown>;
  return {
    agencyId: ctx.agencyId,
    clientId,
    defaultCurrency: typeof config.defaultCurrency === "string" ? config.defaultCurrency : "gbp",
    taxRatePercent: typeof config.defaultTaxRatePercent === "number"
      ? config.defaultTaxRatePercent
      : Number(config.defaultTaxRatePercent ?? 0),
    giftCardDenominations: checkoutDenominations(config.giftCardDenominations),
  };
}
