// Activity service. Append-only event log per Contact. Cross-plugin
// events (ecommerce order.created, memberships subscription.*,
// affiliates affiliate.attribution_recorded) flow in via the
// `/events/ingest` API route — foundation routes them when its
// cross-plugin event router lands; until then the route is callable
// directly for testing.
//
// Storage:
//   activity/by-id/<id>            → ActivityRecord
//   activity/by-contact/<cid>      → string[] of activity ids
//   activity/index                 → string[] of all activity ids

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  ActivityFilter,
  ActivityKind,
  ActivityRecord,
  IngestAffiliateAttributionPayload,
  IngestOrderCreatedPayload,
  IngestSubscriptionEventPayload,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EcommerceOrdersPort,
  EventBusPort,
  StoragePort,
} from "./ports";
import type { ContactService } from "./contacts";

const ACT_INDEX_KEY = "activity/index";
const actKey = (id: string): string => `activity/by-id/${id}`;
const byContactKey = (cid: string): string => `activity/by-contact/${cid}`;

export class ActivityService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private foundationActivity: ActivityLogPort,
    private events: EventBusPort,
    private contacts: ContactService,
    private ecommerceOrders?: EcommerceOrdersPort,
  ) {}

  async list(filter?: ActivityFilter): Promise<ActivityRecord[]> {
    const ids = filter?.contactId
      ? ((await this.storage.get<string[]>(byContactKey(filter.contactId))) ?? [])
      : ((await this.storage.get<string[]>(ACT_INDEX_KEY)) ?? []);
    const out: ActivityRecord[] = [];
    for (const id of ids) {
      const row = await this.storage.get<ActivityRecord>(actKey(id));
      if (row) out.push(row);
    }
    const filtered = out
      .filter(a => !filter?.kind || a.kind === filter.kind)
      .filter(a => !filter?.fromOccurredAt || a.occurredAt >= filter.fromOccurredAt)
      .filter(a => !filter?.toOccurredAt || a.occurredAt <= filter.toOccurredAt)
      // Newest first.
      .sort((a, b) => b.occurredAt - a.occurredAt);
    if (filter?.limit && filter.limit > 0) {
      return filtered.slice(0, filter.limit);
    }
    return filtered;
  }

  async listForContact(contactId: string, limit?: number): Promise<ActivityRecord[]> {
    return this.list({ contactId, limit });
  }

  async record(args: {
    contactId: string;
    kind: ActivityKind;
    summary: string;
    details?: Record<string, unknown>;
    occurredAt?: number;
    actor?: UserId;
  }): Promise<ActivityRecord> {
    const contact = await this.contacts.get(args.contactId);
    if (!contact) throw new Error(`Contact ${args.contactId} not found.`);

    const id = makeId("act");
    const ts = now();
    const occurredAt = args.occurredAt ?? ts;
    const row: ActivityRecord = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      contactId: args.contactId,
      kind: args.kind,
      summary: args.summary,
      details: args.details,
      occurredAt,
      createdAt: ts,
    };
    await this.storage.set(actKey(id), row);
    const ix = (await this.storage.get<string[]>(ACT_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(ACT_INDEX_KEY, [...ix, id]);
    }
    const cIx = (await this.storage.get<string[]>(byContactKey(args.contactId))) ?? [];
    if (!cIx.includes(id)) {
      await this.storage.set(byContactKey(args.contactId), [...cIx, id]);
    }

    // Bump the contact's lastSeenAt when the kind reflects engagement.
    if (isEngagementKind(args.kind)) {
      await this.contacts._touchLastSeen(args.contactId, occurredAt);
    }

    await this.foundationActivity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: args.actor,
      category: "crm",
      action: "crm.activity.recorded",
      message: args.summary,
      metadata: { activityId: id, contactId: args.contactId, kind: args.kind },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "crm.activity.recorded", {
      activityId: id, contactId: args.contactId, kind: args.kind,
    });
    return row;
  }

  // Append a free-form note. Most common case from ContactDetail UI.
  async addNote(contactId: string, note: string, actor: UserId): Promise<ActivityRecord> {
    return this.record({
      contactId,
      kind: "note",
      summary: note,
      actor,
    });
  }

  // ─── Cross-plugin event ingest ────────────────────────────────────────
  //
  // Foundation routes these from ecommerce / memberships / affiliates
  // event emits. Until that's wired, the API handler accepts them
  // directly. Each ingest method is idempotent on a synthesized
  // (kind, source-id) tuple — re-receiving the same Stripe webhook
  // fan-out doesn't double-record.

  async ingestOrderCreated(payload: IngestOrderCreatedPayload, actor?: UserId): Promise<ActivityRecord | null> {
    const contact = await this.resolveContactForIngest({
      userId: payload.endCustomerUserId,
      email: payload.customerEmail,
      autoCreateSource: "order",
      actor,
    });
    if (!contact) return null;

    if (await this.alreadyIngested(contact.id, "order", payload.orderId)) return null;

    return this.record({
      contactId: contact.id,
      kind: "order",
      summary: `Placed order ${payload.orderId} (${(payload.amountTotal / 100).toFixed(2)} ${payload.currency}).`,
      details: { orderId: payload.orderId, amountTotal: payload.amountTotal, currency: payload.currency },
      occurredAt: payload.occurredAt,
      actor,
    });
  }

  async ingestSubscription(payload: IngestSubscriptionEventPayload, actor?: UserId): Promise<ActivityRecord | null> {
    const contact = await this.resolveContactForIngest({
      userId: payload.endCustomerUserId,
      autoCreateSource: "signup",
      actor,
    });
    if (!contact) return null;
    const kind: ActivityKind = payload.status === "started" ? "subscription_started" : "subscription_canceled";
    if (await this.alreadyIngested(contact.id, kind, `${payload.planId}:${payload.status}`)) return null;
    return this.record({
      contactId: contact.id,
      kind,
      summary: payload.status === "started"
        ? `Started subscription on plan ${payload.planId}.`
        : `Canceled subscription on plan ${payload.planId}.`,
      details: { planId: payload.planId, status: payload.status },
      occurredAt: payload.occurredAt,
      actor,
    });
  }

  async ingestAffiliateAttribution(payload: IngestAffiliateAttributionPayload, actor?: UserId): Promise<ActivityRecord | null> {
    const contact = await this.resolveContactForIngest({
      userId: payload.affiliateUserId,
      email: payload.affiliateEmail,
      autoCreateSource: "manual",
      actor,
    });
    if (!contact) return null;
    if (await this.alreadyIngested(contact.id, "affiliate_referral", payload.orderId)) return null;
    return this.record({
      contactId: contact.id,
      kind: "affiliate_referral",
      summary: `Referred order ${payload.orderId} (commission ${(payload.amountCents / 100).toFixed(2)}).`,
      details: { orderId: payload.orderId, amountCents: payload.amountCents },
      occurredAt: payload.occurredAt,
      actor,
    });
  }

  // ─── Internals ────────────────────────────────────────────────────────

  // Resolve to a contact by userId → email → null. When no contact
  // exists but we have enough info (email at minimum), auto-create
  // one with the given source. Returns null when even auto-create
  // can't be done (e.g. neither userId nor email provided).
  private async resolveContactForIngest(args: {
    userId?: UserId;
    email?: string;
    autoCreateSource: "signup" | "order" | "manual";
    actor?: UserId;
  }): ReturnType<ContactService["get"]> {
    if (args.userId) {
      const byUser = await this.contacts.getByUser(args.userId);
      if (byUser) return byUser;
    }
    if (args.email) {
      const byEmail = await this.contacts.getByEmail(args.email);
      if (byEmail) {
        // Reverse-link if we now know the userId.
        if (args.userId && !byEmail.endCustomerUserId) {
          return await this.contacts.update(byEmail.id, { endCustomerUserId: args.userId }, args.actor ?? "system");
        }
        return byEmail;
      }
      // Auto-create.
      return this.contacts.create({
        email: args.email,
        endCustomerUserId: args.userId,
        source: args.autoCreateSource,
      }, args.actor ?? "system", args.autoCreateSource);
    }
    return null;
  }

  // Idempotency check: walk the contact's activity index and look
  // for an existing row with the same kind + matching identifier in
  // details. Cheap because a single contact's activity list is
  // bounded by their lifetime engagement.
  private async alreadyIngested(contactId: string, kind: ActivityKind, sourceId: string): Promise<boolean> {
    const ids = (await this.storage.get<string[]>(byContactKey(contactId))) ?? [];
    for (const id of ids) {
      const row = await this.storage.get<ActivityRecord>(actKey(id));
      if (!row || row.kind !== kind) continue;
      const details = row.details ?? {};
      if (kind === "order" || kind === "affiliate_referral") {
        if (details.orderId === sourceId) return true;
      } else if (kind === "subscription_started" || kind === "subscription_canceled") {
        const synth = `${details.planId ?? ""}:${details.status ?? ""}`;
        if (synth === sourceId) return true;
      }
    }
    return false;
  }

  // Backfill helper — when a Contact is first linked to a User, pull
  // recent ecommerce orders via the optional port and ingest them.
  // No-op when ecommerceOrders port isn't wired.
  async backfillFromEcommerce(contactId: string, actor?: UserId): Promise<number> {
    if (!this.ecommerceOrders) return 0;
    const contact = await this.contacts.get(contactId);
    if (!contact) return 0;
    const orders = await this.ecommerceOrders.listForUser({
      agencyId: this.agencyId,
      clientId: this.clientId,
      userId: contact.endCustomerUserId,
      email: contact.email,
      limit: 50,
    });
    let recorded = 0;
    for (const order of orders) {
      const r = await this.ingestOrderCreated({
        orderId: order.orderId,
        endCustomerUserId: order.endCustomerUserId,
        customerEmail: order.customerEmail,
        amountTotal: order.amountTotal,
        currency: order.currency,
        occurredAt: order.createdAt,
      }, actor);
      if (r) recorded += 1;
    }
    return recorded;
  }
}

function isEngagementKind(kind: ActivityKind): boolean {
  return kind !== "note";
}
