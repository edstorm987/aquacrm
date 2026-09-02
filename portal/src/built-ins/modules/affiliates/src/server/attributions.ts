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
  Payout,
  PayoutBalance,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EcommerceOrdersPort,
  EventBusPort,
  StoragePort,
} from "./ports";
import type { AffiliateService } from "./affiliates";
import type { ReferralCodeService } from "./codes";
import { withAffiliateDependencyLock } from "./dependencies";
import {
  assertCommissionRate,
  assertOrderForAttribution,
  normalizeSupportedCurrency,
} from "../lib/runtimeValidation";

const ATTR_INDEX_KEY = "attributions/index";
const attrKey = (id: string): string => `attributions/by-id/${id}`;
const orderLookupKey = (orderId: string): string => `attributions/by-order/${orderId}`;
const byAffiliateKey = (aff: string): string => `attributions/by-affiliate/${aff}`;
const payoutKey = (id: string): string => `payouts/by-id/${id}`;
const attributionClaimKey = (orderId: string): string => `attributions/claims/by-order/${encodeURIComponent(orderId)}`;

interface AttributionClaim {
  row: Attribution;
  status: "pending" | "completed";
  updatedAt: number;
}

const localTails = new Map<string, Promise<void>>();

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

const ELIGIBLE_ORDER_STATUSES = new Set(["paid", "fulfilled", "shipped", "delivered"]);

function normalizedCurrency(value: string | undefined): string {
  return value?.trim().toLowerCase() || "unknown";
}

function payableCommission(row: Attribution): number {
  return Math.max(0, row.amountCents - (row.reversedAmountCents ?? 0));
}

function pendingOffset(row: Attribution): number {
  return Math.max(0, (row.offsetAmountCents ?? 0) - (row.offsetAppliedCents ?? 0));
}

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
    return withAffiliateDependencyLock(this.storage, this.agencyId, this.clientId, async () => {
      const claimKey = attributionClaimKey(args.orderId);
      let claim = await this.storage.get<AttributionClaim>(claimKey);
      const existing = await this.getByOrder(args.orderId);
      if (existing && (!claim || claim.status === "completed")) return existing;
      if (existing && claim) claim = { ...claim, row: existing };
      let affiliateDisplayName: string | undefined;
      if (!claim) {
        const order = await this.orders.getOrder({
          agencyId: this.agencyId,
          clientId: this.clientId,
          orderId: args.orderId,
        });
        if (!order) return null;
        assertOrderForAttribution(order);
        if (!ELIGIBLE_ORDER_STATUSES.has(order.status)) return null;
        const currency = normalizeSupportedCurrency(order.currency, "order.currency");

        // Resolve the referral code: explicit codeId wins over `code` string,
        // which wins over the order's own `referralCodeId`.
        const codeRow = args.referralCodeId
          ? await this.codes.get(args.referralCodeId)
          : args.code
            ? await this.codes.findByCode(args.code)
            : order.referralCodeId
              ? await this.codes.get(order.referralCodeId)
              : null;
        if (!codeRow || codeRow.status !== "active") return null;

        const affiliate = await this.affiliates.get(codeRow.affiliateId);
        if (!affiliate || affiliate.status !== "active") return null;
        affiliateDisplayName = affiliate.displayName;

        const rate =
          args.overridePercent ??
          codeRow.commissionPercentOverride ??
          affiliate.defaultCommissionPercent ??
          args.defaultCommissionPercent ??
          10;
        assertCommissionRate(args.overridePercent, "overridePercent");
        assertCommissionRate(codeRow.commissionPercentOverride, "commissionPercentOverride");
        assertCommissionRate(affiliate.defaultCommissionPercent, "defaultCommissionPercent");
        assertCommissionRate(args.defaultCommissionPercent, "install.defaultCommissionPercent");
        assertCommissionRate(rate, "commissionPercentSnapshot");
        if (rate <= 0) return null;

        const amountCents = Math.round((order.subtotal * rate) / 100);
        if (amountCents <= 0) return null;
        const ts = now();
        const row: Attribution = {
          id: makeId("attr"),
          agencyId: this.agencyId,
          clientId: this.clientId,
          orderId: order.id,
          affiliateId: affiliate.id,
          referralCodeId: codeRow.id,
          amountCents,
          currency,
          orderAmountCents: order.amountTotal,
          orderSubtotalCents: order.subtotal,
          orderStatusSnapshot: order.status,
          orderPaidAt: order.paidAt,
          commissionPercentSnapshot: rate,
          status: "pending",
          createdAt: ts,
        };
        claim = { row, status: "pending", updatedAt: ts };
        // The durable identity is committed before any row, reverse lookup,
        // index or counter mutation. A retry can therefore adopt this row.
        await this.storage.set(claimKey, claim);
      }

      const row = await this.get(claim.row.id) ?? claim.row;
      const affiliate = await this.affiliates.get(row.affiliateId);
      affiliateDisplayName ??= affiliate?.displayName;
      await this.storage.set(attrKey(row.id), row);
      await this.storage.set(orderLookupKey(row.orderId), row.id);
      const index = (await this.storage.get<string[]>(ATTR_INDEX_KEY)) ?? [];
      if (!index.includes(row.id)) await this.storage.set(ATTR_INDEX_KEY, [...index, row.id]);
      const affiliateIndex = (await this.storage.get<string[]>(byAffiliateKey(row.affiliateId))) ?? [];
      if (!affiliateIndex.includes(row.id)) {
        await this.storage.set(byAffiliateKey(row.affiliateId), [...affiliateIndex, row.id]);
      }

      // These operation markers are replay-safe. `lockHeld` prevents nested
      // durable transactions when the file/Postgres backends use one broad lock.
      await this.codes._incrementRedemption(row.referralCodeId, row.id, true);
      await this.affiliates._incrementCounters(row.affiliateId, { addReferred: 1 }, row.id, true);

      await this.activity.logActivity({
        idempotencyKey: `affiliates:attribution-record:${row.id}`,
        agencyId: this.agencyId,
        clientId: this.clientId,
        category: "affiliates",
        action: "affiliate.attribution_recorded",
        message: `Attributed order ${row.orderId} to ${affiliateDisplayName ?? row.affiliateId} (${row.commissionPercentSnapshot}% = ${formatMoney(row.amountCents, row.currency)}).`,
        metadata: {
          attributionId: row.id,
          orderId: row.orderId,
          affiliateId: row.affiliateId,
          codeId: row.referralCodeId,
          amountCents: row.amountCents,
          currency: row.currency,
          commissionPercent: row.commissionPercentSnapshot,
        },
      });
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "affiliate.attribution_recorded",
        {
          attributionId: row.id,
          orderId: row.orderId,
          affiliateId: row.affiliateId,
          amountCents: row.amountCents,
          currency: row.currency,
        },
      );
      await this.storage.set(claimKey, { ...claim, row, status: "completed", updatedAt: now() });
      return row;
    });
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
    return this.applyReversal(existing, existing.amountCents, "manual", actor, reason);
  }

  // Reconciles the current cumulative order refund/cancellation into the
  // commission ledger. Replaying the same source state is a no-op.
  async reconcileOrder(orderId: string, actor?: UserId): Promise<Attribution | null> {
    const [order, existing] = await Promise.all([
      this.orders.getOrder({ agencyId: this.agencyId, clientId: this.clientId, orderId }),
      this.getByOrder(orderId),
    ]);
    if (!order || !existing) return existing;
    const isCancelled = order.status === "cancelled";
    const refundedAmount = isCancelled
      ? order.amountTotal
      : Math.min(order.amountTotal, Math.max(0, order.refundedAmountCents ?? 0));
    if (!isCancelled && refundedAmount <= 0) return existing;
    const sourceTotal = Math.max(1, existing.orderAmountCents || order.amountTotal);
    const reversedCommission = isCancelled
      ? existing.amountCents
      : Math.min(
          existing.amountCents,
          Math.round((existing.amountCents * refundedAmount) / sourceTotal),
        );
    return this.applyReversal(
      existing,
      reversedCommission,
      isCancelled ? "cancelled" : "refunded",
      actor,
      isCancelled ? "source order cancelled" : `source order refunded ${refundedAmount} ${normalizedCurrency(order.currency)}`,
      refundedAmount,
    );
  }

  async payoutBalances(affiliateId?: string): Promise<PayoutBalance[]> {
    const rows = affiliateId
      ? await this.listForAffiliate(affiliateId)
      : await this.list();
    const balances = new Map<string, PayoutBalance>();
    for (const row of rows) {
      const currency = normalizedCurrency(row.currency);
      const key = `${row.affiliateId}:${currency}`;
      const balance = balances.get(key) ?? {
        affiliateId: row.affiliateId,
        currency,
        grossApprovedCents: 0,
        pendingAdjustmentCents: 0,
        availableCents: 0,
      };
      if (row.status === "approved" && !row.payoutId) {
        balance.grossApprovedCents += payableCommission(row);
      }
      if (!row.offsetClaimPayoutId) {
        balance.pendingAdjustmentCents += pendingOffset(row);
      }
      balance.availableCents = balance.grossApprovedCents - balance.pendingAdjustmentCents;
      balances.set(key, balance);
    }
    return [...balances.values()]
      .filter(balance => balance.grossApprovedCents > 0 || balance.pendingAdjustmentCents > 0)
      .sort((left, right) => left.affiliateId.localeCompare(right.affiliateId)
        || left.currency.localeCompare(right.currency));
  }

  // Internal — atomically claim approved rows into one payout. Replays for the
  // same payout are harmless; a competing payout is refused.
  async _claimForPayout(
    ids: string[],
    payoutId: string,
    attributionAmounts?: Record<string, number>,
  ): Promise<void> {
    for (const id of ids) {
      const row = await this.get(id);
      if (!row) throw new Error(`Attribution ${id} not found while scheduling payout.`);
      if (row.payoutId && row.payoutId !== payoutId) {
        throw new Error(`Attribution ${id} is already claimed by payout ${row.payoutId}.`);
      }
      if (row.status !== "approved") {
        throw new Error(`Attribution ${id} is ${row.status}, not approved for payout.`);
      }
      const expected = attributionAmounts?.[id];
      if (expected !== undefined && payableCommission(row) !== expected) {
        throw new Error(`Attribution ${id} changed value before payout ${payoutId} was claimed.`);
      }
      if (!row.payoutId) await this.storage.set(attrKey(id), { ...row, payoutId });
    }
  }

  async _claimOffsets(adjustmentAmounts: Record<string, number>, payoutId: string): Promise<void> {
    for (const [id, amount] of Object.entries(adjustmentAmounts)) {
      const row = await this.get(id);
      if (!row) throw new Error(`Reversal attribution ${id} not found while scheduling payout.`);
      if (row.offsetClaimPayoutId && row.offsetClaimPayoutId !== payoutId) {
        throw new Error(`Reversal attribution ${id} is already claimed by payout ${row.offsetClaimPayoutId}.`);
      }
      if (pendingOffset(row) !== amount) {
        throw new Error(`Reversal attribution ${id} changed value before payout ${payoutId} was claimed.`);
      }
      if (!row.offsetClaimPayoutId) {
        await this.storage.set(attrKey(id), { ...row, offsetClaimPayoutId: payoutId });
      }
    }
  }

  // Internal — flips approved → paid when its owning Payout settles. Caller
  // owns the activity log + event bus emit on the payout side.
  async _markPaid(
    ids: string[],
    payoutId: string,
    attributionAmounts?: Record<string, number>,
  ): Promise<void> {
    const ts = now();
    for (const id of ids) {
      const row = await this.get(id);
      if (!row) throw new Error(`Attribution ${id} not found while completing payout.`);
      if (row.payoutId && row.payoutId !== payoutId) {
        throw new Error(`Attribution ${id} belongs to payout ${row.payoutId}, not ${payoutId}.`);
      }
      if (row.paidAt && row.payoutId === payoutId) continue;
      if (row.status !== "approved" && row.status !== "reversed") {
        throw new Error(`Attribution ${id} is ${row.status}, not payable.`);
      }
      const paidCommissionCents = attributionAmounts?.[id] ?? payableCommission(row);
      const offsetAmountCents = Math.max(
        0,
        paidCommissionCents + (row.reversedAmountCents ?? 0) - row.amountCents,
      );
      await this.storage.set(attrKey(id), {
        ...row,
        status: row.status === "reversed" ? "reversed" : "paid" as AttributionStatus,
        paidAt: ts,
        paidCommissionCents,
        offsetAmountCents,
        payoutId,
      });
    }
  }

  async _markOffsetsApplied(adjustmentAmounts: Record<string, number>, payoutId: string): Promise<void> {
    const ts = now();
    for (const [id, amount] of Object.entries(adjustmentAmounts)) {
      const row = await this.get(id);
      if (!row) throw new Error(`Reversal attribution ${id} not found while completing payout.`);
      if (!row.offsetClaimPayoutId && row.lastOffsetPayoutId === payoutId) continue;
      if (row.offsetClaimPayoutId !== payoutId) {
        throw new Error(`Reversal attribution ${id} is not claimed by payout ${payoutId}.`);
      }
      const alreadyApplied = row.offsetAppliedCents ?? 0;
      if (alreadyApplied + amount > (row.offsetAmountCents ?? 0)) {
        throw new Error(`Payout ${payoutId} would over-apply reversal attribution ${id}.`);
      }
      await this.storage.set(attrKey(id), {
        ...row,
        offsetAppliedCents: alreadyApplied + amount,
        offsetClaimPayoutId: undefined,
        lastOffsetPayoutId: payoutId,
        offsetAppliedAt: ts,
      });
    }
  }

  async _totalPaidForAffiliate(affiliateId: string): Promise<number> {
    const totals = await this._totalPaidForAffiliateByCurrency(affiliateId);
    return Object.values(totals).reduce((sum, amount) => sum + amount, 0);
  }

  async _totalPaidForAffiliateByCurrency(affiliateId: string): Promise<Record<string, number>> {
    const rows = await this.listForAffiliate(affiliateId);
    const totals: Record<string, number> = {};
    for (const row of rows) {
      if (!row.paidAt) continue;
      const currency = normalizedCurrency(row.currency);
      const net = Math.max(0, (row.paidCommissionCents ?? row.amountCents) - (row.offsetAppliedCents ?? 0));
      totals[currency] = (totals[currency] ?? 0) + net;
    }
    return totals;
  }

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.storage.runExclusive) {
      return this.storage.runExclusive(`affiliate-attribution:${key}`, operation);
    }
    return localExclusive(`${this.agencyId}:${this.clientId}:${key}`, operation);
  }

  private async applyReversal(
    existing: Attribution,
    reversedAmountCents: number,
    reversalReason: Attribution["reversalReason"],
    actor?: UserId,
    detail?: string,
    orderRefundedAmountCents?: number,
  ): Promise<Attribution> {
    const boundedReversal = Math.min(existing.amountCents, Math.max(0, Math.round(reversedAmountCents)));
    if (
      boundedReversal <= (existing.reversedAmountCents ?? 0)
      && (orderRefundedAmountCents ?? 0) <= (existing.orderRefundedAmountCents ?? 0)
    ) {
      return existing;
    }

    let paidCommissionCents = existing.paidCommissionCents;
    const owningPayout = existing.payoutId
      ? await this.storage.get<Payout>(payoutKey(existing.payoutId))
      : undefined;
    const payoutAlreadySubmitted = owningPayout?.status === "in_progress" || owningPayout?.status === "completed";
    if (payoutAlreadySubmitted && paidCommissionCents === undefined) {
      paidCommissionCents = owningPayout?.attributionAmounts?.[existing.id] ?? existing.amountCents;
    }
    const offsetAmountCents = paidCommissionCents === undefined
      ? 0
      : Math.max(0, paidCommissionCents + boundedReversal - existing.amountCents);
    const next: Attribution = {
      ...existing,
      status: boundedReversal >= existing.amountCents ? "reversed" : existing.status,
      reversedAt: now(),
      reversalReason,
      orderRefundedAmountCents: Math.max(
        existing.orderRefundedAmountCents ?? 0,
        orderRefundedAmountCents ?? 0,
      ),
      reversedAmountCents: boundedReversal,
      paidCommissionCents,
      offsetAmountCents,
    };
    await this.storage.set(attrKey(existing.id), next);

    if (owningPayout && !payoutAlreadySubmitted) {
      await this.repriceOpenPayout(owningPayout, next);
    }
    if (existing.offsetClaimPayoutId) {
      const offsetPayout = await this.storage.get<Payout>(payoutKey(existing.offsetClaimPayoutId));
      if (offsetPayout && offsetPayout.status !== "in_progress" && offsetPayout.status !== "completed") {
        await this.repriceOpenOffsetPayout(offsetPayout, next);
      }
    }

    await this.activity.logActivity({
      idempotencyKey: `affiliates:attribution-reversal:${existing.id}:${boundedReversal}`,
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.attribution_reversed",
      message: `Reconciled ${reversalReason} for attribution ${existing.id}${detail ? ` (${detail})` : ""}.`,
      metadata: {
        attributionId: existing.id,
        affiliateId: existing.affiliateId,
        currency: normalizedCurrency(existing.currency),
        reversedAmountCents: boundedReversal,
        offsetAmountCents,
        reason: reversalReason,
      },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.attribution_reversed",
      {
        attributionId: existing.id,
        orderId: existing.orderId,
        currency: normalizedCurrency(existing.currency),
        reversedAmountCents: boundedReversal,
        offsetAmountCents,
        reason: reversalReason,
      },
    );
    return await this.get(existing.id) ?? next;
  }

  private async repriceOpenPayout(payout: Payout, changed: Attribution): Promise<void> {
    const attributionAmounts = {
      ...(payout.attributionAmounts ?? Object.fromEntries(
        payout.attributionIds.map(id => [id, id === changed.id ? changed.amountCents : 0]),
      )),
    };
    if (!(changed.id in attributionAmounts)) return;
    const nextContribution = payableCommission(changed);
    if (nextContribution > 0) attributionAmounts[changed.id] = nextContribution;
    else delete attributionAmounts[changed.id];
    const attributionIds = payout.attributionIds.filter(id => id !== changed.id || nextContribution > 0);
    const grossAmountCents = Object.values(attributionAmounts).reduce((sum, amount) => sum + amount, 0);
    const amountCents = grossAmountCents - (payout.adjustmentAmountCents ?? 0);

    if (amountCents <= 0) {
      for (const id of attributionIds) {
        const row = await this.get(id);
        if (row?.payoutId === payout.id && !row.paidAt) {
          await this.storage.set(attrKey(id), { ...row, payoutId: undefined });
        }
      }
      for (const id of payout.adjustmentAttributionIds ?? []) {
        const row = await this.get(id);
        if (row?.offsetClaimPayoutId === payout.id) {
          await this.storage.set(attrKey(id), { ...row, offsetClaimPayoutId: undefined });
        }
      }
      await this.storage.set(payoutKey(payout.id), {
        ...payout,
        amountCents: 0,
        grossAmountCents,
        attributionIds: [],
        attributionAmounts: {},
        adjustmentAttributionIds: [],
        adjustmentAmounts: {},
        adjustmentAmountCents: 0,
        status: "failed",
        failureReason: "Payout cancelled because order reversals removed the transferable balance.",
      } satisfies Payout);
      return;
    }

    await this.storage.set(payoutKey(payout.id), {
      ...payout,
      amountCents,
      grossAmountCents,
      attributionIds,
      attributionAmounts,
    } satisfies Payout);
  }

  private async repriceOpenOffsetPayout(payout: Payout, changed: Attribution): Promise<void> {
    const adjustmentAmounts = { ...(payout.adjustmentAmounts ?? {}) };
    if (!(changed.id in adjustmentAmounts)) return;
    adjustmentAmounts[changed.id] = pendingOffset(changed);
    const adjustmentAmountCents = Object.values(adjustmentAmounts)
      .reduce((sum, amount) => sum + amount, 0);
    const amountCents = payout.grossAmountCents - adjustmentAmountCents;
    if (amountCents <= 0) {
      for (const id of payout.attributionIds) {
        const row = await this.get(id);
        if (row?.payoutId === payout.id && !row.paidAt) {
          await this.storage.set(attrKey(id), { ...row, payoutId: undefined });
        }
      }
      for (const id of payout.adjustmentAttributionIds) {
        const row = await this.get(id);
        if (row?.offsetClaimPayoutId === payout.id) {
          await this.storage.set(attrKey(id), { ...row, offsetClaimPayoutId: undefined });
        }
      }
      await this.storage.set(payoutKey(payout.id), {
        ...payout,
        amountCents: 0,
        attributionIds: [],
        attributionAmounts: {},
        adjustmentAttributionIds: [],
        adjustmentAmounts: {},
        adjustmentAmountCents: 0,
        status: "failed",
        failureReason: "Payout cancelled because new order reversals removed the transferable balance.",
      } satisfies Payout);
      return;
    }
    await this.storage.set(payoutKey(payout.id), {
      ...payout,
      amountCents,
      adjustmentAmountCents,
      adjustmentAmounts,
    } satisfies Payout);
  }
}

function formatMoney(cents: number, currency: string): string {
  const symbol = currency.toLowerCase() === "usd" ? "$" : currency.toLowerCase() === "gbp" ? "£" : currency.toLowerCase() === "eur" ? "€" : "";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}
