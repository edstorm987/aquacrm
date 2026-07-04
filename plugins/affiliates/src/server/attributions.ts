// Attribution service. The bridge between ecommerce orders and
// affiliates: when an order with a `referralCodeId` lands, we persist
// an Attribution row pinning the commission earned + which affiliate.
//
// Storage:
//   attributions/by-id/<id>          → Attribution
//   attributions/by-order/<orderId>  → attributionId  (idempotency lookup)
//   attributions/by-affiliate/<aff>  → string[] of attribution ids
//   attributions/index               → string[] of all attribution ids
//
// Commission calculation (effective rate, locked at attribution time):
//   ReferralCode.commissionPercentOverride
//     ?? Affiliate.defaultCommissionPercent
//     ?? install.config.defaultCommissionPercent (settings)
//     ?? 10                        // hardcoded floor

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  Attribution,
  AttributionFilter,
  AttributionStatus,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EcommerceOrdersPort,
  EventBusPort,
  StoragePort,
} from "./ports";
import type { AffiliateService } from "./affiliates";
import type { ReferralCodeService } from "./codes";

const ATTR_INDEX_KEY = "attributions/index";
const attrKey = (id: string): string => `attributions/by-id/${id}`;
const orderLookupKey = (orderId: string): string => `attributions/by-order/${orderId}`;
const byAffiliateKey = (aff: string): string => `attributions/by-affiliate/${aff}`;

export interface RecordOrderArgs {
  orderId: string;
  // If the caller already resolved the code → row, pass it through to
  // skip a lookup. Otherwise pass `code` as the raw string.
  code?: string;
  referralCodeId?: string;
  // Override of the default commission percent for this single
  // attribution. Rare — typically used for promotional events.
  overridePercent?: number;
  defaultCommissionPercent?: number;   // install setting fallback
}

export class AttributionService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private affiliates: AffiliateService,
    private codes: ReferralCodeService,
    private orders: EcommerceOrdersPort,
  ) {}

  async list(filter?: AttributionFilter): Promise<Attribution[]> {
    const ids = (await this.storage.get<string[]>(ATTR_INDEX_KEY)) ?? [];
    const out: Attribution[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Attribution>(attrKey(id));
      if (row) out.push(row);
    }
    return out
      .filter(a => !filter?.affiliateId || a.affiliateId === filter.affiliateId)
      .filter(a => !filter?.orderId || a.orderId === filter.orderId)
      .filter(a => !filter?.status || a.status === filter.status)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<Attribution | null> {
    const row = await this.storage.get<Attribution>(attrKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  async getByOrder(orderId: string): Promise<Attribution | null> {
    const id = await this.storage.get<string>(orderLookupKey(orderId));
    return id ? this.get(id) : null;
  }

  async listForAffiliate(affiliateId: string): Promise<Attribution[]> {
    const ids = (await this.storage.get<string[]>(byAffiliateKey(affiliateId))) ?? [];
    const out: Attribution[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Attribution>(attrKey(id));
      if (row) out.push(row);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Idempotent on orderId — calling twice for the same order is a no-op.
  // Returns null when:
  //   - the order is not found via the EcommerceOrdersPort
  //   - the order has no referralCodeId AND none was passed
  //   - the resolved code is archived / non-existent / for a different agency
  //   - the affiliate is not active
  async recordOrder(args: RecordOrderArgs): Promise<Attribution | null> {
    // Idempotency check first.
    const existing = await this.getByOrder(args.orderId);
    if (existing) return existing;

    const order = await this.orders.getOrder({
      agencyId: this.agencyId,
      clientId: this.clientId,
      orderId: args.orderId,
    });
    if (!order) return null;

    // Resolve the referral code: explicit codeId wins over `code` string,
    // which wins over the order's own `referralCodeId`.
    const codeRow = args.referralCodeId
      ? await this.codes.get(args.referralCodeId)
      : args.code
        ? await this.codes.findByCode(args.code)
        : order.referralCodeId
          ? await this.codes.get(order.referralCodeId)
          : null;
    if (!codeRow) return null;
    if (codeRow.status !== "active") return null;

    const affiliate = await this.affiliates.get(codeRow.affiliateId);
    if (!affiliate || affiliate.status !== "active") return null;

    // Effective rate.
    const rate =
      args.overridePercent ??
      codeRow.commissionPercentOverride ??
      affiliate.defaultCommissionPercent ??
      args.defaultCommissionPercent ??
      10;
    if (rate <= 0) return null;

    const amountCents = Math.round((order.subtotal * rate) / 100);
    if (amountCents <= 0) return null;

    const id = makeId("attr");
    const ts = now();
    const row: Attribution = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      orderId: order.id,
      affiliateId: affiliate.id,
      referralCodeId: codeRow.id,
      amountCents,
      commissionPercentSnapshot: rate,
      status: "pending",
      createdAt: ts,
    };
    await this.storage.set(attrKey(id), row);
    await this.storage.set(orderLookupKey(order.id), id);
    const ix = (await this.storage.get<string[]>(ATTR_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(ATTR_INDEX_KEY, [...ix, id]);
    }
    const affIx = (await this.storage.get<string[]>(byAffiliateKey(affiliate.id))) ?? [];
    if (!affIx.includes(id)) {
      await this.storage.set(byAffiliateKey(affiliate.id), [...affIx, id]);
    }

    await this.codes._incrementRedemption(codeRow.id);
    await this.affiliates._incrementCounters(affiliate.id, { addReferred: 1 });

    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      category: "affiliates",
      action: "affiliate.attribution_recorded",
      message: `Attributed order ${order.id} to ${affiliate.displayName} (${rate}% = ${formatMoney(amountCents, order.currency)}).`,
      metadata: {
        attributionId: id,
        orderId: order.id,
        affiliateId: affiliate.id,
        codeId: codeRow.id,
        amountCents,
        commissionPercent: rate,
      },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.attribution_recorded",
      { attributionId: id, orderId: order.id, affiliateId: affiliate.id, amountCents },
    );
    return row;
  }

  async approve(id: string, actor: UserId): Promise<Attribution | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status !== "pending") return existing;        // double-approve no-op
    const next: Attribution = {
      ...existing,
      status: "approved",
      approvedAt: now(),
    };
    await this.storage.set(attrKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.attribution_approved",
      message: `Approved attribution ${id}.`,
      metadata: { attributionId: id, affiliateId: existing.affiliateId, amountCents: existing.amountCents },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.attribution_approved",
      { attributionId: id, affiliateId: existing.affiliateId },
    );
    return next;
  }

  async reverse(id: string, actor: UserId, reason?: string): Promise<Attribution | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status === "paid") {
      throw new Error("Cannot reverse a paid attribution. Process a manual refund externally.");
    }
    const next: Attribution = {
      ...existing,
      status: "reversed",
      reversedAt: now(),
    };
    await this.storage.set(attrKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.attribution_reversed",
      message: `Reversed attribution ${id}${reason ? ` (${reason})` : ""}.`,
      metadata: { attributionId: id, affiliateId: existing.affiliateId, reason },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.attribution_reversed",
      { attributionId: id, reason },
    );
    return next;
  }

  // Internal — flips approved → paid when a Payout settles. Caller owns
  // the activity log + event bus emit on the payout side.
  async _markPaid(ids: string[], payoutId: string): Promise<void> {
    const ts = now();
    for (const id of ids) {
      const row = await this.get(id);
      if (!row || row.status !== "approved") continue;
      await this.storage.set(attrKey(id), {
        ...row,
        status: "paid" as AttributionStatus,
        paidAt: ts,
        payoutId,
      });
    }
  }
}

function formatMoney(cents: number, currency: string): string {
  const symbol = currency.toLowerCase() === "usd" ? "$" : currency.toLowerCase() === "gbp" ? "£" : currency.toLowerCase() === "eur" ? "€" : "";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}
