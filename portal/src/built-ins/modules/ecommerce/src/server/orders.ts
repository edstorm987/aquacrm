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
  subtotal?: number;
  shippingAmount?: number;
  taxAmount?: number;
  taxAddedAmount?: number;
  shippingRateId?: string;
  checkoutOperationId?: string;
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
  refundedAmountCents?: number;
  fulfilledAt?: number;
  shippedAt?: number;
  trackingNumber?: string;
  trackingCarrier?: string;
  internalNotes?: string;
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

export interface UpdateOrderPatch {
  status?: OrderStatus;
  customerEmail?: string;
  customerName?: string;
  shippingAddress?: ServerOrder["shippingAddress"];
  trackingNumber?: string;
  trackingCarrier?: string;
  internalNotes?: string;
}

export type OrderTransitionSource = "provider" | "operator";

export interface OrderTransition {
  id: string;
  orderId: string;
  fromStatus?: OrderStatus;
  toStatus: OrderStatus;
  source: OrderTransitionSource;
  sourceId: string;
  occurredAt: number;
  refundedAmountCents?: number;
}

export class OrderTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderTransitionError";
  }
}

interface OrderUpdateOperation {
  orderId: string;
  sourceId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  status: "pending" | "completed";
  updatedAt: number;
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
const TRANSITION_PREFIX = "order-transition:";
const transitionKey = (orderId: string, sourceId: string): string =>
  `${TRANSITION_PREFIX}${orderId}:${encodeURIComponent(sourceId)}`;
const updateOperationKey = (orderId: string, sourceId: string): string =>
  `order-update-operation:${orderId}:${encodeURIComponent(sourceId)}`;
const localTails = new Map<string, Promise<void>>();

const OPERATOR_TRANSITIONS: Partial<Record<OrderStatus, ReadonlySet<OrderStatus>>> = {
  pending: new Set(["cancelled"]),
  paid: new Set(["fulfilled", "shipped"]),
  fulfilled: new Set(["shipped", "delivered"]),
  shipped: new Set(["delivered"]),
};

async function localExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = localTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  localTails.set(key, tail);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (localTails.get(key) === tail) localTails.delete(key);
  }
}

function cleanOptional(value: string | undefined, existing: string | undefined): string | undefined {
  return value === undefined ? existing : value.trim() || undefined;
}

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
    subtotal?: number;
    shippingAmount?: number;
    taxAmount?: number;
    taxAddedAmount?: number;
    shippingRateId?: string;
    checkoutOperationId?: string;
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
    providerEventId?: string;
  }, lockHeld = false): Promise<UpsertOrderResult> {
    const operation = async (): Promise<UpsertOrderResult> => {
    const existing = input.stripeSessionId
      ? await this.getOrderByStripeSession(input.stripeSessionId)
      : null;

    if (existing) {
      if (existing.amountTotal !== input.amountTotal) {
        throw new Error(`Stripe session ${input.stripeSessionId} total changed from ${existing.amountTotal} to ${input.amountTotal}.`);
      }
      if (existing.currency.toLowerCase() !== input.currency.toLowerCase()) {
        throw new Error(`Stripe session ${input.stripeSessionId} currency changed from ${existing.currency} to ${input.currency}.`);
      }
      if (existing.status === "cancelled") {
        throw new OrderTransitionError(`Cancelled order ${existing.id} cannot be reopened by a checkout event.`);
      }
      const patched: ServerOrder = {
        ...existing,
        paymentIntentId: input.paymentIntentId ?? existing.paymentIntentId,
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
        subtotal: existing.subtotal ?? input.subtotal,
        shippingAmount: existing.shippingAmount ?? input.shippingAmount,
        taxAmount: existing.taxAmount ?? input.taxAmount,
        taxAddedAmount: existing.taxAddedAmount ?? input.taxAddedAmount,
        shippingRateId: existing.shippingRateId ?? input.shippingRateId,
        checkoutOperationId: existing.checkoutOperationId ?? input.checkoutOperationId,
      };
      await this.storage.set(this.orderKey(patched.id), patched);
      if (existing.status === "pending" && input.providerEventId) {
        await this.saveTransition({
          orderId: patched.id,
          fromStatus: "pending",
          toStatus: "paid",
          source: "provider",
          sourceId: input.providerEventId,
          occurredAt: patched.paidAt ?? now(),
        });
      }
      return { order: patched, isNew: false };
    }

    const order: ServerOrder = {
      id: makeId("ord"),
      clientId: input.clientId,
      stripeSessionId: input.stripeSessionId,
      paymentIntentId: input.paymentIntentId,
      amountTotal: input.amountTotal,
      subtotal: input.subtotal,
      shippingAmount: input.shippingAmount,
      taxAmount: input.taxAmount,
      taxAddedAmount: input.taxAddedAmount,
      shippingRateId: input.shippingRateId,
      checkoutOperationId: input.checkoutOperationId,
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
    if (input.providerEventId) {
      await this.saveTransition({
        orderId: order.id,
        toStatus: "paid",
        source: "provider",
        sourceId: input.providerEventId,
        occurredAt: order.paidAt ?? order.createdAt,
      });
    }
    return { order, isNew: true };
    };
    if (lockHeld) return operation();
    return this.withLock("order-collection", operation);
  }

  async markOrderRefunded(
    paymentIntentId: string,
    refundedAmountCents?: number,
    providerEventId?: string,
    lockHeld = false,
  ): Promise<ServerOrder | null> {
    const operation = async (): Promise<ServerOrder | null> => {
    const order = await this.getOrderByPaymentIntent(paymentIntentId);
    if (!order) return null;
    if (order.status === "cancelled") {
      throw new OrderTransitionError(`Cancelled order ${order.id} cannot accept a refund event.`);
    }
    const cumulativeRefund = Math.max(
      order.refundedAmountCents ?? 0,
      Math.min(
      order.amountTotal,
      Math.max(0, Math.round(refundedAmountCents ?? order.amountTotal)),
      ),
    );
    const next: ServerOrder = {
      ...order,
      status: cumulativeRefund >= order.amountTotal ? "refunded" : order.status,
      refundedAt: cumulativeRefund > 0 ? now() : order.refundedAt,
      refundedAmountCents: cumulativeRefund,
    };
    await this.storage.set(this.orderKey(order.id), next);
    if (providerEventId) {
      await this.saveTransition({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: next.status,
        source: "provider",
        sourceId: providerEventId,
        occurredAt: next.refundedAt ?? now(),
        refundedAmountCents: cumulativeRefund,
      });
    }
    return next;
    };
    if (lockHeld) return operation();
    return this.withLock("order-collection", operation);
  }

  async updateOrderStatus(
    id: string,
    status: OrderStatus,
    extras?: Partial<ServerOrder>,
    operationId?: string,
    lockHeld = false,
  ): Promise<ServerOrder | null> {
    return this.updateOrder(id, {
      status,
      trackingNumber: extras?.trackingNumber,
      trackingCarrier: extras?.trackingCarrier,
    }, { operationId, lockHeld });
  }

  async updateOrder(
    id: string,
    patch: UpdateOrderPatch,
    options: { operationId?: string; lockHeld?: boolean } = {},
  ): Promise<ServerOrder | null> {
    const operation = async (): Promise<ServerOrder | null> => {
      const existing = await this.getOrder(id);
      if (!existing) return null;
      const status = patch.status ?? existing.status;
      const sourceId = options.operationId?.trim();
      let updateOperation = sourceId
        ? await this.storage.get<OrderUpdateOperation>(updateOperationKey(id, sourceId))
        : undefined;
      if (updateOperation && updateOperation.toStatus !== status) {
        throw new OrderTransitionError(
          `Order operation ${sourceId} was replayed for ${status} after claiming ${updateOperation.toStatus}.`,
        );
      }
      if (updateOperation && existing.status !== updateOperation.fromStatus && existing.status !== updateOperation.toStatus) {
        throw new OrderTransitionError(
          `Order ${id} changed to ${existing.status} after operation ${sourceId} began.`,
        );
      }
      const fromStatus = updateOperation?.fromStatus ?? existing.status;
      if (status !== fromStatus) {
        const allowed = OPERATOR_TRANSITIONS[fromStatus];
        if (!allowed?.has(status)) {
          throw new OrderTransitionError(
            `Order ${id} cannot move from ${fromStatus} to ${status} through an operator edit. Payment, refund and cancellation facts must come from their owning provider flow.`,
          );
        }
        if (sourceId && !updateOperation) {
          updateOperation = {
            orderId: id,
            sourceId,
            fromStatus,
            toStatus: status,
            status: "pending",
            updatedAt: now(),
          };
          await this.storage.set(updateOperationKey(id, sourceId), updateOperation);
        }
      }
      const next: ServerOrder = {
        ...existing,
        status,
        customerEmail: cleanOptional(patch.customerEmail, existing.customerEmail),
        customerName: cleanOptional(patch.customerName, existing.customerName),
        trackingNumber: cleanOptional(patch.trackingNumber, existing.trackingNumber),
        trackingCarrier: cleanOptional(patch.trackingCarrier, existing.trackingCarrier),
        internalNotes: cleanOptional(patch.internalNotes, existing.internalNotes),
        shippingAddress: patch.shippingAddress
          ? {
              line1: patch.shippingAddress.line1?.trim() || undefined,
              line2: patch.shippingAddress.line2?.trim() || undefined,
              city: patch.shippingAddress.city?.trim() || undefined,
              state: patch.shippingAddress.state?.trim() || undefined,
              postalCode: patch.shippingAddress.postalCode?.trim() || undefined,
              country: patch.shippingAddress.country?.trim() || undefined,
            }
          : existing.shippingAddress,
      };
      if (status === "shipped" && !next.shippedAt) next.shippedAt = now();
      if ((status === "fulfilled" || status === "delivered") && !next.fulfilledAt) next.fulfilledAt = now();
      await this.storage.set(this.orderKey(id), next);
      if (status !== fromStatus) {
        await this.saveTransition({
          orderId: id,
          fromStatus,
          toStatus: status,
          source: "operator",
          sourceId: sourceId || makeId("order-operation"),
          occurredAt: now(),
        });
      }
      if (updateOperation) {
        await this.storage.set(updateOperationKey(id, updateOperation.sourceId), {
          ...updateOperation,
          status: "completed",
          updatedAt: now(),
        } satisfies OrderUpdateOperation);
      }
      return next;
    };
    if (options.lockHeld) return operation();
    return this.withLock("order-collection", operation);
  }

  async listTransitions(orderId: string): Promise<OrderTransition[]> {
    const keys = await this.storage.list(`${TRANSITION_PREFIX}${orderId}:`);
    const rows = await Promise.all(keys.map(key => this.storage.get<OrderTransition>(key)));
    return rows
      .filter((row): row is OrderTransition => !!row)
      .sort((left, right) => left.occurredAt - right.occurredAt || left.id.localeCompare(right.id));
  }

  private async saveTransition(input: Omit<OrderTransition, "id">): Promise<OrderTransition> {
    const key = transitionKey(input.orderId, input.sourceId);
    const existing = await this.storage.get<OrderTransition>(key);
    if (existing) {
      if (
        existing.fromStatus !== input.fromStatus
        || existing.toStatus !== input.toStatus
        || existing.source !== input.source
        || existing.refundedAmountCents !== input.refundedAmountCents
      ) {
        throw new OrderTransitionError(`Order transition source ${input.sourceId} was replayed with different facts.`);
      }
      return existing;
    }
    const row: OrderTransition = { id: makeId("order-transition"), ...input };
    await this.storage.set(key, row);
    return row;
  }

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.storage.runExclusive) return this.storage.runExclusive(`ecommerce:${key}`, operation);
    return localExclusive(key, operation);
  }
}
