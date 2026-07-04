// Server-side order persistence.
//
// Lifted from `02 felicias aqua portal work/src/portal/server/orders.ts`
// and rewired for the new tenancy model:
//
//   - `orgId` → `clientId`. Each order belongs to one client (Felicia's
//     store, future client stores).
//   - Storage is the per-install plugin slice (`StoragePort`), not a
//     dedicated `serverOrders` field on the foundation portal state.
//
// The Stripe webhook calls `upsertOrderByStripeSession` to land an order
// when payment clears. The function is idempotent — Stripe retries the
// same event, so we update the existing row rather than insert a duplicate.

import { now } from "../lib/time";
import { makeId } from "../lib/ids";
import type { ClientId } from "../lib/tenancy";
import type { StoragePort } from "./ports";
import type { DiscountType } from "./discounts";
import type { MembershipDiscountSnapshot } from "./ports";

export type OrderStatus =
  | "pending"
  | "paid"
  | "fulfilled"
  | "shipped"
  | "delivered"
  | "refunded"
  | "cancelled";

export interface ServerOrderItem {
  sku?: string;
  name: string;
  description?: string;
  quantity: number;
  unitAmount: number;            // pence/cents
  currency: string;
  digital?: boolean;
  downloadUrl?: string;
  licenseKey?: string;
}

export interface ServerOrder {
  id: string;                    // ord_<short>
  clientId: ClientId;
  stripeSessionId?: string;      // dedupe key on the Stripe side
  paymentIntentId?: string;      // for refunds
  status: OrderStatus;
  amountTotal: number;           // pence/cents
  currency: string;
  customerEmail?: string;
  customerName?: string;
  shippingAddress?: {
    line1?: string; line2?: string; city?: string;
    postalCode?: string; country?: string; state?: string;
  };
  items: ServerOrderItem[];
  metadata?: Record<string, string>;
  createdAt: number;
  paidAt?: number;
  refundedAt?: number;
  fulfilledAt?: number;
  shippedAt?: number;
  trackingNumber?: string;
  trackingCarrier?: string;
  // R5 — discount provenance. Populated when the discount chain
  // applied a discount to the cart. `discountSource: "membership"`
  // also carries `discountSnapshot` with the planId so the source
  // remains auditable even if the user later changes plan.
  discountSource?: DiscountType;
  discountAmount?: number;          // pence
  discountCode?: string;
  discountSnapshot?: MembershipDiscountSnapshot;
  // The end-customer that placed the order. Used by the membership
  // discount lookup at checkout. Null for guest checkouts (no
  // membership lookup possible).
  endCustomerUserId?: string;
  // R6 — referral attribution. Stamped at checkout when the cart
  // carried an affiliate referral code. Foundation routes the
  // `order.created` event payload (which mirrors this field) to
  // `@aqua/plugin-affiliates` so its AttributionService records the
  // commission. Persisted on the order so retries / late routing /
  // backfills can still attribute.
  referralCodeId?: string;
}

// R6 — `upsertOrderByStripeSession` returns whether the call inserted
// a new row or patched an existing one. The Stripe-webhook handler
// uses this to decide whether to emit `order.created` (only on first
// insert — webhooks retry, and we don't want to re-emit on retries).
export interface UpsertOrderResult {
  order: ServerOrder;
  isNew: boolean;
}

const KEY_PREFIX = "order:";

export class OrderService {
  constructor(private storage: StoragePort) {}

  private orderKey(id: string): string {
    return `${KEY_PREFIX}${id}`;
  }

  // ─── Reads ──────────────────────────────────────────────────────────

  async getOrder(id: string): Promise<ServerOrder | null> {
    const stored = await this.storage.get<ServerOrder>(this.orderKey(id));
    return stored ?? null;
  }

  async getOrderByStripeSession(sessionId: string): Promise<ServerOrder | null> {
    const all = await this.listAllRaw();
    return all.find(o => o.stripeSessionId === sessionId) ?? null;
  }

  async getOrderByPaymentIntent(paymentIntentId: string): Promise<ServerOrder | null> {
    const all = await this.listAllRaw();
    return all.find(o => o.paymentIntentId === paymentIntentId) ?? null;
  }

  async listOrdersForClient(clientId: ClientId, limit = 100): Promise<ServerOrder[]> {
    const all = await this.listAllRaw();
    return all
      .filter(o => o.clientId === clientId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  // The plugin storage slice is per-install — fetching every order key in
  // a list is bounded by one install's order count (~1k typical, well
  // within JSON-blob limits). For high-volume tenants the foundation can
  // swap the storage backend to Postgres.
  private async listAllRaw(): Promise<ServerOrder[]> {
    const keys = await this.storage.list(KEY_PREFIX);
    const orders = await Promise.all(
      keys.map(async k => this.storage.get<ServerOrder>(k)),
    );
    return orders.filter((o): o is ServerOrder => o !== undefined);
  }

  // ─── Writes ─────────────────────────────────────────────────────────

  async upsertOrderByStripeSession(input: {
    clientId: ClientId;
    stripeSessionId?: string;
    paymentIntentId?: string;
    amountTotal: number;
    currency: string;
    customerEmail?: string;
    customerName?: string;
    shippingAddress?: ServerOrder["shippingAddress"];
    items: ServerOrderItem[];
    metadata?: Record<string, string>;
    discountSource?: DiscountType;
    discountAmount?: number;
    discountCode?: string;
    discountSnapshot?: MembershipDiscountSnapshot;
    endCustomerUserId?: string;
    referralCodeId?: string;
  }): Promise<UpsertOrderResult> {
    const existing = input.stripeSessionId
      ? await this.getOrderByStripeSession(input.stripeSessionId)
      : null;

    if (existing) {
      const patched: ServerOrder = {
        ...existing,
        paymentIntentId: input.paymentIntentId ?? existing.paymentIntentId,
        amountTotal: input.amountTotal || existing.amountTotal,
        currency: input.currency || existing.currency,
        customerEmail: input.customerEmail ?? existing.customerEmail,
        customerName: input.customerName ?? existing.customerName,
        shippingAddress: input.shippingAddress ?? existing.shippingAddress,
        items: input.items.length > 0 ? input.items : existing.items,
        metadata: { ...existing.metadata, ...input.metadata },
        status: existing.status === "pending" ? "paid" : existing.status,
        paidAt: existing.paidAt ?? now(),
        // Discount provenance is set on first upsert; later upserts
        // (Stripe webhook retries, fulfillment patches) don't overwrite.
        discountSource: existing.discountSource ?? input.discountSource,
        discountAmount: existing.discountAmount ?? input.discountAmount,
        discountCode: existing.discountCode ?? input.discountCode,
        discountSnapshot: existing.discountSnapshot ?? input.discountSnapshot,
        endCustomerUserId: existing.endCustomerUserId ?? input.endCustomerUserId,
        referralCodeId: existing.referralCodeId ?? input.referralCodeId,
      };
      await this.storage.set(this.orderKey(patched.id), patched);
      return { order: patched, isNew: false };
    }

    const order: ServerOrder = {
      id: makeId("ord"),
      clientId: input.clientId,
      stripeSessionId: input.stripeSessionId,
      paymentIntentId: input.paymentIntentId,
      amountTotal: input.amountTotal,
      currency: input.currency,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      shippingAddress: input.shippingAddress,
      items: input.items,
      metadata: input.metadata,
      status: "paid",
      createdAt: now(),
      paidAt: now(),
      discountSource: input.discountSource,
      discountAmount: input.discountAmount,
      discountCode: input.discountCode,
      discountSnapshot: input.discountSnapshot,
      endCustomerUserId: input.endCustomerUserId,
      referralCodeId: input.referralCodeId,
    };
    await this.storage.set(this.orderKey(order.id), order);
    return { order, isNew: true };
  }

  async markOrderRefunded(paymentIntentId: string): Promise<ServerOrder | null> {
    const order = await this.getOrderByPaymentIntent(paymentIntentId);
    if (!order) return null;
    const next: ServerOrder = { ...order, status: "refunded", refundedAt: now() };
    await this.storage.set(this.orderKey(order.id), next);
    return next;
  }

  async updateOrderStatus(
    id: string,
    status: OrderStatus,
    extras?: Partial<ServerOrder>,
  ): Promise<ServerOrder | null> {
    const existing = await this.getOrder(id);
    if (!existing) return null;
    const next: ServerOrder = { ...existing, ...extras, status };
    if (status === "shipped" && !next.shippedAt) next.shippedAt = now();
    if (status === "fulfilled" && !next.fulfilledAt) next.fulfilledAt = now();
    await this.storage.set(this.orderKey(id), next);
    return next;
  }
}
