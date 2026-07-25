// Payout service. Manual `markPaid` for v1; Stripe Connect / PayPal
// API integration deferred to a future round.
//
// Storage:
//   payouts/by-id/<id>         → Payout
//   payouts/by-affiliate/<aff> → string[] of payout ids
//   payouts/index              → string[] of all payout ids

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  MarkPayoutPaidInput,
  Payout,
  PayoutFilter,
  PayoutMethod,
  SchedulePayoutInput,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
  StripeConnectPort,
} from "./ports";
import type { AffiliateService } from "./affiliates";
import type { AttributionService } from "./attributions";

const PAYOUT_INDEX_KEY = "payouts/index";
const payoutKey = (id: string): string => `payouts/by-id/${id}`;
const byAffiliateKey = (aff: string): string => `payouts/by-affiliate/${aff}`;

export class PayoutService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private affiliates: AffiliateService,
    private attributions: AttributionService,
    // R12: Stripe Connect for real Transfer execution. Optional so the
    // service still constructs in tests / installs that haven't wired
    // a Stripe driver — `processPayout` throws cleanly when absent.
    private stripe?: StripeConnectPort,
  ) {}

  async list(filter?: PayoutFilter): Promise<Payout[]> {
    const ids = (await this.storage.get<string[]>(PAYOUT_INDEX_KEY)) ?? [];
    const out: Payout[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Payout>(payoutKey(id));
      if (row) out.push(row);
    }
    return out
      .filter(p => !filter?.affiliateId || p.affiliateId === filter.affiliateId)
      .filter(p => !filter?.status || p.status === filter.status)
      .sort((a, b) => b.scheduledFor - a.scheduledFor);
  }

  async get(id: string): Promise<Payout | null> {
    const row = await this.storage.get<Payout>(payoutKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  async listForAffiliate(affiliateId: string): Promise<Payout[]> {
    const ids = (await this.storage.get<string[]>(byAffiliateKey(affiliateId))) ?? [];
    const out: Payout[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Payout>(payoutKey(id));
      if (row) out.push(row);
    }
    return out.sort((a, b) => b.scheduledFor - a.scheduledFor);
  }

  // Rolls all of an affiliate's `approved` attributions into a single
  // `scheduled` Payout. Returns null when there are no approved
  // attributions outstanding (handler returns 422 with a clear message
  // — there's nothing to pay out).
  async schedule(input: SchedulePayoutInput, actor: UserId, defaultMethod: PayoutMethod = "manual"): Promise<Payout | null> {
    const affiliate = await this.affiliates.get(input.affiliateId);
    if (!affiliate) throw new Error(`Affiliate ${input.affiliateId} not found.`);

    const approvedAttributions = await this.attributions.list({
      affiliateId: input.affiliateId,
      status: "approved",
    });
    if (approvedAttributions.length === 0) return null;

    const amountCents = approvedAttributions.reduce((sum, a) => sum + a.amountCents, 0);
    const id = makeId("po");
    const ts = now();
    const row: Payout = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      affiliateId: input.affiliateId,
      amountCents,
      attributionIds: approvedAttributions.map(a => a.id),
      method: input.method ?? defaultMethod,
      status: "scheduled",
      scheduledFor: input.scheduledFor ?? ts,
      createdAt: ts,
    };
    await this.storage.set(payoutKey(id), row);
    const ix = (await this.storage.get<string[]>(PAYOUT_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(PAYOUT_INDEX_KEY, [...ix, id]);
    }
    const affIx = (await this.storage.get<string[]>(byAffiliateKey(input.affiliateId))) ?? [];
    if (!affIx.includes(id)) {
      await this.storage.set(byAffiliateKey(input.affiliateId), [...affIx, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.payout_scheduled",
      message: `Scheduled payout for ${affiliate.displayName} (${approvedAttributions.length} attributions, ${formatMoney(amountCents, "usd")}).`,
      metadata: { payoutId: id, affiliateId: input.affiliateId, amountCents, count: approvedAttributions.length },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.payout_scheduled",
      { payoutId: id, affiliateId: input.affiliateId, amountCents },
    );
    return row;
  }

  async markPaid(id: string, input: MarkPayoutPaidInput, actor: UserId): Promise<Payout | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status === "completed") return existing;        // idempotent
    const next: Payout = {
      ...existing,
      status: "completed",
      method: input.method ?? existing.method,
      externalRef: input.externalRef,
      completedAt: now(),
    };
    await this.storage.set(payoutKey(id), next);

    // Flip the rolled attributions to paid + bump the affiliate's
    // lifetime-earnings counter.
    await this.attributions._markPaid(existing.attributionIds, id);
    await this.affiliates._incrementCounters(existing.affiliateId, {
      addEarningsCents: existing.amountCents,
    });

    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.payout_completed",
      message: `Paid affiliate payout ${id} (${input.externalRef}).`,
      metadata: { payoutId: id, affiliateId: existing.affiliateId, amountCents: existing.amountCents, externalRef: input.externalRef },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.payout_completed",
      { payoutId: id, affiliateId: existing.affiliateId, amountCents: existing.amountCents },
    );
    return next;
  }

  // R12 — replaces manual `markPaid(externalRef)` with a real Stripe
  // Transfer call. Two-stage state machine:
  //
  //   scheduled → in_progress  (transfer created + externalRef recorded)
  //   in_progress → completed  (transfer.paid webhook arrives)
  //
  // Idempotency: the Stripe idempotencyKey is `payout:<id>`. If
  // `processPayout` is invoked again on the same payout id we short-
  // circuit when status is in_progress / completed — the connected
  // Stripe transfer either already exists (Stripe collapses by
  // idempotencyKey) or has already paid out. `failed` payouts can be
  // retried; a fresh idempotencyKey isn't needed because Stripe
  // returns the same Transfer for a given key (same affiliate/amount).
  //
  // Affiliate readiness check uses the persisted
  // `stripeOnboardingStatus`. Webhook-driven `account.updated` is the
  // canonical source for that flag, so this stays read-only here.
  async processPayout(
    id: string,
    actor: UserId,
    args: { currency?: string; description?: string } = {},
  ): Promise<Payout | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    // Idempotent — already in flight or done.
    if (existing.status === "in_progress" || existing.status === "completed") {
      return existing;
    }
    if (!this.stripe) {
      throw new Error("Stripe Connect not configured for this install — cannot processPayout.");
    }
    const affiliate = await this.affiliates.get(existing.affiliateId);
    if (!affiliate) throw new Error(`Affiliate ${existing.affiliateId} not found.`);
    if (!affiliate.stripeAccountId) {
      throw new Error(
        `Affiliate ${affiliate.displayName} has no Stripe Connect account — onboard before processing.`,
      );
    }
    if (affiliate.stripeOnboardingStatus !== "complete") {
      throw new Error(
        `Affiliate ${affiliate.displayName} Stripe onboarding is ${affiliate.stripeOnboardingStatus ?? "absent"}; payouts blocked until complete.`,
      );
    }

    let transfer: { transferId: string; created: number };
    try {
      transfer = await this.stripe.createTransfer({
        destinationAccountId: affiliate.stripeAccountId,
        amountCents: existing.amountCents,
        currency: (args.currency ?? "usd").toLowerCase(),
        idempotencyKey: `payout:${existing.id}`,
        description: args.description ?? `Affiliate payout ${existing.id} for ${affiliate.displayName}`,
        transferGroup: `affiliate:${affiliate.id}`,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.markFailed(existing.id, reason, actor);
      throw err;
    }

    const next: Payout = {
      ...existing,
      status: "in_progress",
      method: "stripe-connect",
      externalRef: transfer.transferId,
    };
    await this.storage.set(payoutKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.payout_processing",
      message: `Submitted Stripe transfer ${transfer.transferId} for payout ${existing.id} (${affiliate.displayName}, ${formatMoney(existing.amountCents, args.currency ?? "usd")}).`,
      metadata: {
        payoutId: id,
        affiliateId: existing.affiliateId,
        amountCents: existing.amountCents,
        externalRef: transfer.transferId,
        stripeAccountId: affiliate.stripeAccountId,
      },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.payout_processing",
      { payoutId: id, affiliateId: existing.affiliateId, amountCents: existing.amountCents, externalRef: transfer.transferId },
    );
    return next;
  }

  // Webhook entry point — Stripe `transfer.paid` fired for a transfer
  // we created via processPayout. Looks the payout up by externalRef
  // (the transfer id) and flips it to completed. Idempotent on
  // double-fire (Stripe occasionally re-delivers webhooks).
  async confirmTransferPaid(transferId: string, actor?: UserId): Promise<Payout | null> {
    const payout = await this._findByExternalRef(transferId);
    if (!payout) return null;
    if (payout.status === "completed") return payout;
    const next: Payout = {
      ...payout,
      status: "completed",
      method: "stripe-connect",
      completedAt: now(),
    };
    await this.storage.set(payoutKey(payout.id), next);
    await this.attributions._markPaid(payout.attributionIds, payout.id);
    await this.affiliates._incrementCounters(payout.affiliateId, {
      addEarningsCents: payout.amountCents,
    });
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.payout_completed",
      message: `Paid affiliate payout ${payout.id} via Stripe transfer ${transferId}.`,
      metadata: {
        payoutId: payout.id,
        affiliateId: payout.affiliateId,
        amountCents: payout.amountCents,
        externalRef: transferId,
        method: "stripe-connect",
      },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.payout_completed",
      { payoutId: payout.id, affiliateId: payout.affiliateId, amountCents: payout.amountCents },
    );
    return next;
  }

  private async _findByExternalRef(externalRef: string): Promise<Payout | null> {
    const ids = (await this.storage.get<string[]>(PAYOUT_INDEX_KEY)) ?? [];
    for (const id of ids) {
      const row = await this.storage.get<Payout>(payoutKey(id));
      if (row && row.externalRef === externalRef && row.agencyId === this.agencyId && row.clientId === this.clientId) {
        return row;
      }
    }
    return null;
  }

  async markFailed(id: string, reason: string, actor: UserId): Promise<Payout | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const next: Payout = {
      ...existing,
      status: "failed",
      failureReason: reason,
    };
    await this.storage.set(payoutKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.payout_failed",
      message: `Payout ${id} failed: ${reason}`,
      metadata: { payoutId: id, affiliateId: existing.affiliateId, reason },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.payout_failed",
      { payoutId: id, affiliateId: existing.affiliateId, reason },
    );
    return next;
  }
}

function formatMoney(cents: number, currency: string): string {
  const symbol = currency.toLowerCase() === "usd" ? "$" : currency.toLowerCase() === "gbp" ? "£" : currency.toLowerCase() === "eur" ? "€" : "";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}
