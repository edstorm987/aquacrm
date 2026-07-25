// Stripe-events service.
//
// Webhook ingestion — verify signature, dedupe on event.id, store
// raw + summary, project subscription events into a per-tenant
// mirror, emit activity + bus events.
//
// Storage layout (per-install — install is per-agency):
//   events/index                      → string[] of event ids (most-recent first)
//   events/by-id/<eventId>            → StripeEventRow
//   subs/index                        → string[] of subscription ids
//   subs/by-id/<subId>                → StripeSubscription

import { now } from "../lib/time";
import type { AgencyId } from "../lib/tenancy";
import type {
  IngestResult,
  StripeEventRaw,
  StripeEventRow,
  StripeSubscription,
  SubscriptionStatus,
} from "../lib/domain";
import {
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_TIMESTAMP_TOLERANCE_S,
  isSubscriptionEvent,
  summarise,
} from "../lib/domain";
import { verifyStripeSignature } from "../lib/signature";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
  VaultPort,
} from "./ports";

const EVENT_INDEX = "events/index";
const SUB_INDEX = "subs/index";
const eventKey = (id: string): string => `events/by-id/${id}`;
const subKey = (id: string): string => `subs/by-id/${id}`;

async function pushIndexHead(storage: StoragePort, key: string, id: string, cap = 500): Promise<void> {
  const ids = (await storage.get<string[]>(key)) ?? [];
  if (ids[0] === id) return;
  const next = [id, ...ids.filter(x => x !== id)];
  if (next.length > cap) next.length = cap;
  await storage.set(key, next);
}

export interface StripeEventsDeps {
  agencyId: AgencyId;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  vault?: VaultPort;
}

export interface IngestOptions {
  rawBody: string;
  signatureHeader: string;
  // Override for tests — if not supplied, vault.getWebhookSecret is consulted.
  secret?: string;
  toleranceS?: number;
  maxBodyBytes?: number;
  nowS?: number;                  // for deterministic timestamp checks
}

export class StripeEventsService {
  private readonly agencyId: AgencyId;
  private readonly storage: StoragePort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;
  private readonly vault?: VaultPort;

  constructor(deps: StripeEventsDeps) {
    this.agencyId = deps.agencyId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
    if (deps.vault) this.vault = deps.vault;
  }

  // ── Reads ────────────────────────────────────────────────────

  async listEvents(opts: { limit?: number; type?: string } = {}): Promise<StripeEventRow[]> {
    const ids = (await this.storage.get<string[]>(EVENT_INDEX)) ?? [];
    const limit = opts.limit ?? 100;
    const out: StripeEventRow[] = [];
    for (const id of ids) {
      if (out.length >= limit) break;
      const row = await this.storage.get<StripeEventRow>(eventKey(id));
      if (!row || row.agencyId !== this.agencyId) continue;
      if (opts.type && row.type !== opts.type) continue;
      out.push(row);
    }
    return out;
  }

  async getEvent(id: string): Promise<StripeEventRow | null> {
    const row = await this.storage.get<StripeEventRow>(eventKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async listSubscriptions(): Promise<StripeSubscription[]> {
    const ids = (await this.storage.get<string[]>(SUB_INDEX)) ?? [];
    const out: StripeSubscription[] = [];
    for (const id of ids) {
      const row = await this.storage.get<StripeSubscription>(subKey(id));
      if (!row || row.agencyId !== this.agencyId) continue;
      out.push(row);
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getSubscription(id: string): Promise<StripeSubscription | null> {
    const row = await this.storage.get<StripeSubscription>(subKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  // ── Ingest ───────────────────────────────────────────────────

  async ingest(opts: IngestOptions): Promise<IngestResult> {
    const max = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    if (opts.rawBody.length > max) {
      return { ok: false, reason: "invalid_body", message: "raw body exceeds size cap" };
    }

    // Resolve secret via tests-override first, then vault.
    let secret = opts.secret;
    if (secret === undefined && this.vault) {
      const fromVault = await Promise.resolve(this.vault.getWebhookSecret({ agencyId: this.agencyId }));
      if (fromVault) secret = fromVault;
    }
    if (!secret) {
      this.emitRejection("missing_secret");
      return { ok: false, reason: "missing_secret" };
    }

    const verify = await verifyStripeSignature({
      rawBody: opts.rawBody,
      signatureHeader: opts.signatureHeader,
      secret,
      toleranceS: opts.toleranceS ?? DEFAULT_TIMESTAMP_TOLERANCE_S,
      ...(opts.nowS !== undefined ? { nowS: opts.nowS } : {}),
    });
    if (!verify.ok) {
      this.emitRejection(verify.reason);
      return { ok: false, reason: verify.reason };
    }

    let event: StripeEventRaw;
    try { event = JSON.parse(opts.rawBody) as StripeEventRaw; }
    catch { this.emitRejection("invalid_body"); return { ok: false, reason: "invalid_body" }; }
    if (!event.id || !event.type) {
      this.emitRejection("missing_event_id");
      return { ok: false, reason: "missing_event_id" };
    }

    // Dedupe on event.id.
    const existing = await this.storage.get<StripeEventRow>(eventKey(event.id));
    if (existing) {
      this.events.emit({ agencyId: this.agencyId },
        "stripe.event.deduped",
        { eventId: event.id, type: event.type });
      return { ok: true, eventId: event.id, deduped: true };
    }

    const row: StripeEventRow = {
      id: event.id,
      agencyId: this.agencyId,
      type: event.type,
      receivedAt: now(),
      livemode: event.livemode === true,
      summary: summarise(event),
      raw: event,
    };
    await this.storage.set(eventKey(event.id), row);
    await pushIndexHead(this.storage, EVENT_INDEX, event.id);

    this.activity.logActivity({
      agencyId: this.agencyId,
      category: "stripe", action: `stripe.event.${event.type}`,
      message: `Stripe event ${event.type} (${event.id})`,
      metadata: { eventId: event.id, summary: row.summary, livemode: row.livemode },
    });
    this.events.emit({ agencyId: this.agencyId },
      "stripe.event.received",
      { eventId: event.id, type: event.type, summary: row.summary });

    let applied: { kind: "subscription.upsert" | "subscription.deleted" | "noop"; subscriptionId?: string } = { kind: "noop" };
    if (isSubscriptionEvent(event.type)) {
      applied = await this.projectSubscription(event);
    }

    return { ok: true, eventId: event.id, deduped: false, applied };
  }

  // ── Subscription mirror ─────────────────────────────────────

  private async projectSubscription(event: StripeEventRaw): Promise<{ kind: "subscription.upsert" | "subscription.deleted"; subscriptionId?: string }> {
    const obj = (event.data?.object ?? {}) as Record<string, unknown>;
    const subId = typeof obj.id === "string" ? obj.id : undefined;
    if (!subId) return { kind: "subscription.upsert" };

    if (event.type === "customer.subscription.deleted") {
      const existing = await this.storage.get<StripeSubscription>(subKey(subId));
      if (existing && existing.agencyId === this.agencyId) {
        const t = now();
        await this.storage.set(subKey(subId), { ...existing, status: "canceled", updatedAt: t, lastEventId: event.id });
      } else {
        const t = now();
        const row: StripeSubscription = {
          id: subId,
          agencyId: this.agencyId,
          customerId: typeof obj.customer === "string" ? obj.customer : "",
          status: "canceled",
          createdAt: t, updatedAt: t,
          lastEventId: event.id,
        };
        await this.storage.set(subKey(subId), row);
        await pushIndexHead(this.storage, SUB_INDEX, subId);
      }
      this.events.emit({ agencyId: this.agencyId },
        "stripe.subscription.deleted",
        { subscriptionId: subId });
      return { kind: "subscription.deleted", subscriptionId: subId };
    }

    // created / updated → upsert
    const items = (obj.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data ?? [];
    const priceId = items[0]?.price?.id;
    const customerId = typeof obj.customer === "string" ? obj.customer : "";
    const status = (typeof obj.status === "string" ? obj.status : "incomplete") as SubscriptionStatus;
    const currentPeriodEnd = typeof obj.current_period_end === "number" ? obj.current_period_end * 1000 : undefined;
    const cancelAtPeriodEnd = obj.cancel_at_period_end === true;

    const t = now();
    const existing = await this.storage.get<StripeSubscription>(subKey(subId));
    const row: StripeSubscription = existing && existing.agencyId === this.agencyId
      ? {
          ...existing,
          customerId: customerId || existing.customerId,
          status,
          ...(priceId !== undefined ? { priceId } : (existing.priceId !== undefined ? { priceId: existing.priceId } : {})),
          ...(currentPeriodEnd !== undefined ? { currentPeriodEnd } : (existing.currentPeriodEnd !== undefined ? { currentPeriodEnd: existing.currentPeriodEnd } : {})),
          cancelAtPeriodEnd,
          updatedAt: t,
          lastEventId: event.id,
        }
      : {
          id: subId,
          agencyId: this.agencyId,
          customerId,
          status,
          ...(priceId !== undefined ? { priceId } : {}),
          ...(currentPeriodEnd !== undefined ? { currentPeriodEnd } : {}),
          cancelAtPeriodEnd,
          createdAt: t, updatedAt: t,
          lastEventId: event.id,
        };
    await this.storage.set(subKey(subId), row);
    await pushIndexHead(this.storage, SUB_INDEX, subId);
    this.events.emit({ agencyId: this.agencyId },
      "stripe.subscription.upserted",
      { subscriptionId: subId, status });
    return { kind: "subscription.upsert", subscriptionId: subId };
  }

  private emitRejection(reason: string): void {
    this.events.emit({ agencyId: this.agencyId },
      "stripe.event.rejected",
      { reason });
    this.activity.logActivity({
      agencyId: this.agencyId,
      category: "stripe", action: "stripe.event.rejected",
      message: `Stripe webhook rejected: ${reason}`,
      metadata: { reason },
    });
  }
}
