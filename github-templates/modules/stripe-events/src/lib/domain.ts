// Stripe-events domain.

import type { AgencyId } from "./tenancy";

// We deliberately do NOT bring in the @stripe/stripe-js types — the
// plugin treats events as opaque JSON + a small parsed summary so
// the bundle stays zero-dep. Stripe's event shape is documented at
// https://stripe.com/docs/api/events/types.

export interface StripeEventRaw {
  id: string;                 // evt_*
  type: string;               // e.g. "customer.subscription.updated"
  created?: number;           // seconds since epoch
  livemode?: boolean;
  api_version?: string;
  data?: { object?: Record<string, unknown> };
  // Anything else Stripe sends is preserved on the raw row.
  [key: string]: unknown;
}

export interface StripeEventRow {
  id: string;                 // mirrors event.id (Stripe is the source-of-truth id)
  agencyId: AgencyId;
  type: string;
  receivedAt: number;
  livemode: boolean;
  // Parsed summary — small projection for activity-inbox / UI.
  summary?: StripeEventSummary;
  // Original payload for audit + replay. Capped at the raw-body
  // size limit configured at ingestion time (default 1MB).
  raw: StripeEventRaw;
}

export interface StripeEventSummary {
  // The customer / subscription / object id touched, if extractable.
  objectId?: string;
  customerId?: string;
  subscriptionId?: string;
  status?: string;
  amount?: number;
  currency?: string;
}

export type SubscriptionStatus =
  | "incomplete" | "incomplete_expired"
  | "trialing" | "active"
  | "past_due" | "canceled" | "unpaid"
  | "paused";

export interface StripeSubscription {
  id: string;                 // sub_*
  agencyId: AgencyId;
  customerId: string;         // cus_*
  status: SubscriptionStatus;
  priceId?: string;
  currentPeriodEnd?: number;  // ms
  cancelAtPeriodEnd?: boolean;
  createdAt: number;
  updatedAt: number;
  // Source-event id for the most recent mutation; lets the UI link
  // a row back to the Stripe event that wrote it.
  lastEventId?: string;
}

// ── Ingestion result ─────────────────────────────────────────

export type IngestRejection =
  | "missing_signature"
  | "missing_secret"
  | "invalid_signature_format"
  | "signature_mismatch"
  | "timestamp_too_old"
  | "invalid_body"
  | "missing_event_id";

export interface IngestAccepted {
  ok: true;
  eventId: string;
  deduped: boolean;            // true on second arrival of same event.id
  applied?: { kind: "subscription.upsert" | "subscription.deleted" | "noop"; subscriptionId?: string };
}

export interface IngestRejected {
  ok: false;
  reason: IngestRejection;
  message?: string;
}

export type IngestResult = IngestAccepted | IngestRejected;

// Stripe webhook signature header parser. Stripe sends:
//   Stripe-Signature: t=1492774577,v1=<hex>,v0=<hex>
// We support v1 only (HMAC-SHA256 over `<timestamp>.<rawBody>`).
export interface ParsedSignature {
  timestamp: number;            // seconds
  v1: string[];                 // possibly multiple if Stripe rotated secrets
}

export function parseStripeSignature(header: string): ParsedSignature | null {
  if (!header) return null;
  const parts = header.split(",").map(s => s.trim()).filter(Boolean);
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    if (k === "t") t = Number(v);
    else if (k === "v1" && /^[0-9a-f]+$/i.test(v)) v1.push(v.toLowerCase());
  }
  if (t === null || !Number.isFinite(t) || v1.length === 0) return null;
  return { timestamp: t, v1 };
}

// Default tolerance: 5 minutes — Stripe's recommended replay window.
export const DEFAULT_TIMESTAMP_TOLERANCE_S = 300;
// Default raw-body cap (matches typical proxy limits).
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

// Subset of event types this plugin projects into the subscription
// mirror. Other events are still LOGGED, just not projected.
export const SUBSCRIPTION_EVENT_TYPES: readonly string[] = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

export function isSubscriptionEvent(type: string): boolean {
  return (SUBSCRIPTION_EVENT_TYPES as readonly string[]).includes(type);
}

// Extract a minimal summary from a raw event. Pure — no IO. Public
// so the smoke can assert.
export function summarise(event: StripeEventRaw): StripeEventSummary {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;
  const summary: StripeEventSummary = {};
  if (typeof obj.id === "string") summary.objectId = obj.id;
  if (typeof obj.customer === "string") summary.customerId = obj.customer;
  // For subscription-shaped objects `id` IS the subscription id.
  if (event.type.startsWith("customer.subscription.") && typeof obj.id === "string") {
    summary.subscriptionId = obj.id;
  } else if (typeof obj.subscription === "string") {
    summary.subscriptionId = obj.subscription;
  }
  if (typeof obj.status === "string") summary.status = obj.status;
  if (typeof obj.amount === "number") summary.amount = obj.amount;
  else if (typeof obj.amount_total === "number") summary.amount = obj.amount_total;
  if (typeof obj.currency === "string") summary.currency = obj.currency;
  return summary;
}
