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
  PayoutBalance,
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
import { withAffiliateDependencyLock } from "./dependencies";
import {
  assertMarkPayoutPaidInput,
  assertPayout,
  assertProviderId,
  assertSchedulePayoutInput,
} from "../lib/runtimeValidation";

const PAYOUT_INDEX_KEY = "payouts/index";
const payoutKey = (id: string): string => `payouts/by-id/${id}`;
const byAffiliateKey = (aff: string): string => `payouts/by-affiliate/${aff}`;
const scheduleOperationPrefix = (affiliateId: string): string => `payouts/schedule-operation/${affiliateId}/`;
const scheduleOperationKey = (affiliateId: string, currency: string): string => `${scheduleOperationPrefix(affiliateId)}${currency}`;
const completionOperationKey = (payoutId: string): string => `payouts/completion-operation/${payoutId}`;

interface ScheduleOperation {
  id: string;
  affiliateId: string;
  payout: Payout;
  status: "pending" | "completed";
  createdAt: number;
  updatedAt: number;
}

interface CompletionOperation {
  payoutId: string;
  method: PayoutMethod;
  externalRef: string;
  status: "pending" | "attributions_paid" | "adjustments_applied" | "payout_completed" | "earnings_reconciled" | "completed";
  actor?: UserId;
  createdAt: number;
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
  try {
    return await operation();
  } finally {
    release();
    if (localTails.get(key) === tail) localTails.delete(key);
  }
}

function cleanOperationId(value?: string): string {
  const cleaned = value?.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160);
  return cleaned || makeId("payout_schedule_operation");
}

function normalizedCurrency(value?: string): string {
  return value?.trim().toLowerCase() || "unknown";
}

function payableCommission(amountCents: number, reversedAmountCents = 0): number {
  return Math.max(0, amountCents - reversedAmountCents);
}

function pendingOffset(offsetAmountCents = 0, offsetAppliedCents = 0): number {
  return Math.max(0, offsetAmountCents - offsetAppliedCents);
}

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
      .filter(p => !filter?.currency || normalizedCurrency(p.currency) === normalizedCurrency(filter.currency))
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

  async availableBalances(affiliateId?: string): Promise<PayoutBalance[]> {
    return this.attributions.payoutBalances(affiliateId);
  }

  // Rolls all of an affiliate's `approved` attributions into a single
  // `scheduled` Payout. Returns null when there are no approved
  // attributions outstanding (handler returns 422 with a clear message
  // — there's nothing to pay out).
  async schedule(input: SchedulePayoutInput, actor: UserId, defaultMethod: PayoutMethod = "manual"): Promise<Payout | null> {
    assertSchedulePayoutInput(input, defaultMethod);
    return withAffiliateDependencyLock(this.storage, this.agencyId, this.clientId, async () => {
      const affiliate = await this.affiliates.get(input.affiliateId);
      if (!affiliate) throw new Error(`Affiliate ${input.affiliateId} not found.`);

      const requestedCurrency = input.currency ? normalizedCurrency(input.currency) : undefined;
      if (requestedCurrency === "unknown") throw new Error("A valid payout currency is required.");
      const existingOperation = await this.findScheduleOperation(
        input.affiliateId,
        requestedCurrency,
        input.operationId,
      );
      if (existingOperation?.status === "pending") {
        return this.finishSchedule(existingOperation, affiliate.displayName, actor);
      }
      if (
        existingOperation?.status === "completed" &&
        input.operationId &&
        existingOperation.id === input.operationId
      ) {
        return await this.get(existingOperation.payout.id) ?? existingOperation.payout;
      }

      const balances = (await this.availableBalances(input.affiliateId))
        .filter(balance => balance.grossApprovedCents > 0);
      if (balances.length === 0) return null;
      const currencies = [...new Set(balances.map(balance => balance.currency))];
      if (!requestedCurrency && currencies.length > 1) {
        throw new Error(`Currency required: approved balances exist in ${currencies.map(value => value.toUpperCase()).join(", ")}.`);
      }
      const currency = requestedCurrency ?? currencies[0]!;
      if (currency === "unknown") {
        throw new Error("Legacy attributions without currency must be reconciled to their source orders before payout.");
      }
      const balance = balances.find(row => row.currency === currency);
      if (!balance) return null;
      if (balance.availableCents <= 0) {
        throw new Error(
          `${currency.toUpperCase()} approved commission is fully offset by ${formatMoney(balance.pendingAdjustmentCents, currency)} of refunds/cancellations.`,
        );
      }

      const affiliateAttributions = await this.attributions.listForAffiliate(input.affiliateId);
      const approvedAttributions = affiliateAttributions.filter(attribution =>
        attribution.status === "approved"
        && !attribution.payoutId
        && normalizedCurrency(attribution.currency) === currency
        && payableCommission(attribution.amountCents, attribution.reversedAmountCents) > 0,
      );
      const adjustments = affiliateAttributions.filter(attribution =>
        !attribution.offsetClaimPayoutId
        && normalizedCurrency(attribution.currency) === currency
        && pendingOffset(attribution.offsetAmountCents, attribution.offsetAppliedCents) > 0,
      );

      const attributionAmounts = Object.fromEntries(approvedAttributions.map(attribution => [
        attribution.id,
        payableCommission(attribution.amountCents, attribution.reversedAmountCents),
      ]));
      const adjustmentAmounts = Object.fromEntries(adjustments.map(attribution => [
        attribution.id,
        pendingOffset(attribution.offsetAmountCents, attribution.offsetAppliedCents),
      ]));
      const grossAmountCents = Object.values(attributionAmounts).reduce((sum, amount) => sum + amount, 0);
      const adjustmentAmountCents = Object.values(adjustmentAmounts).reduce((sum, amount) => sum + amount, 0);
      const amountCents = grossAmountCents - adjustmentAmountCents;
      if (amountCents <= 0) {
        throw new Error(
          `${currency.toUpperCase()} approved commission is fully offset by refunds/cancellations; no transferable payout exists yet.`,
        );
      }
      const ts = now();
      const payout: Payout = {
        id: makeId("po"),
        agencyId: this.agencyId,
        clientId: this.clientId,
        affiliateId: input.affiliateId,
        currency,
        amountCents,
        grossAmountCents,
        adjustmentAmountCents,
        attributionIds: approvedAttributions.map(attribution => attribution.id),
        attributionAmounts,
        adjustmentAttributionIds: adjustments.map(attribution => attribution.id),
        adjustmentAmounts,
        method: input.method ?? defaultMethod,
        status: "scheduled",
        scheduledFor: input.scheduledFor ?? ts,
        createdAt: ts,
      };
      assertPayout(payout);
      const operation: ScheduleOperation = {
        id: cleanOperationId(input.operationId),
        affiliateId: input.affiliateId,
        payout,
        status: "pending",
        createdAt: ts,
        updatedAt: ts,
      };
      await this.storage.set(scheduleOperationKey(input.affiliateId, currency), operation);
      return this.finishSchedule(operation, affiliate.displayName, actor);
    });
  }

  async markPaid(id: string, input: MarkPayoutPaidInput, actor: UserId): Promise<Payout | null> {
    assertMarkPayoutPaidInput(input);
    return this.completePayout(
      id,
      input.method,
      input.externalRef,
      actor,
    );
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
    const payoutCurrency = normalizedCurrency(existing.currency);
    if (payoutCurrency === "unknown") {
      throw new Error(`Payout ${id} has no currency and cannot be sent to a payment provider.`);
    }
    if (args.currency && normalizedCurrency(args.currency) !== payoutCurrency) {
      throw new Error(
        `Payout ${id} is locked to ${payoutCurrency.toUpperCase()}; caller currency overrides are not allowed.`,
      );
    }
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
        currency: payoutCurrency,
        idempotencyKey: `payout:${existing.id}`,
        description: args.description ?? `Affiliate payout ${existing.id} for ${affiliate.displayName}`,
        transferGroup: `affiliate:${affiliate.id}`,
      });
      assertProviderId(transfer.transferId, "transfer.id");
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
    assertPayout(next);
    await this.storage.set(payoutKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.payout_processing",
      message: `Submitted Stripe transfer ${transfer.transferId} for payout ${existing.id} (${affiliate.displayName}, ${formatMoney(existing.amountCents, existing.currency)}).`,
      metadata: {
        payoutId: id,
        affiliateId: existing.affiliateId,
        amountCents: existing.amountCents,
        currency: existing.currency,
        externalRef: transfer.transferId,
        stripeAccountId: affiliate.stripeAccountId,
      },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.payout_processing",
      { payoutId: id, affiliateId: existing.affiliateId, amountCents: existing.amountCents, currency: existing.currency, externalRef: transfer.transferId },
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
    return this.completePayout(payout.id, "stripe-connect", transferId, actor);
  }

  private async finishSchedule(
    operation: ScheduleOperation,
    affiliateName: string,
    actor: UserId,
  ): Promise<Payout> {
    const payout = operation.payout;
    assertPayout(payout);
    await this.attributions._claimForPayout(payout.attributionIds, payout.id, payout.attributionAmounts);
    await this.attributions._claimOffsets(payout.adjustmentAmounts, payout.id);
    await this.storage.set(payoutKey(payout.id), payout);
    const index = (await this.storage.get<string[]>(PAYOUT_INDEX_KEY)) ?? [];
    if (!index.includes(payout.id)) {
      await this.storage.set(PAYOUT_INDEX_KEY, [...index, payout.id]);
    }
    const affiliateIndex = (await this.storage.get<string[]>(byAffiliateKey(payout.affiliateId))) ?? [];
    if (!affiliateIndex.includes(payout.id)) {
      await this.storage.set(byAffiliateKey(payout.affiliateId), [...affiliateIndex, payout.id]);
    }
    await this.activity.logActivity({
      idempotencyKey: `affiliates:payout-schedule:${operation.id}`,
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.payout_scheduled",
      message: `Scheduled payout for ${affiliateName} (${payout.attributionIds.length} attributions, ${formatMoney(payout.amountCents, payout.currency)} after ${formatMoney(payout.adjustmentAmountCents, payout.currency)} adjustments).`,
      metadata: {
        payoutId: payout.id,
        affiliateId: payout.affiliateId,
        amountCents: payout.amountCents,
        grossAmountCents: payout.grossAmountCents,
        adjustmentAmountCents: payout.adjustmentAmountCents,
        currency: payout.currency,
        count: payout.attributionIds.length,
        operationId: operation.id,
      },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.payout_scheduled",
      {
        payoutId: payout.id,
        affiliateId: payout.affiliateId,
        amountCents: payout.amountCents,
        currency: payout.currency,
        operationId: operation.id,
      },
    );
    await this.storage.set(scheduleOperationKey(payout.affiliateId, payout.currency), {
      ...operation,
      status: "completed",
      updatedAt: now(),
    } satisfies ScheduleOperation);
    return payout;
  }

  private async completePayout(
    id: string,
    requestedMethod: PayoutMethod | undefined,
    externalRef: string,
    actor?: UserId,
  ): Promise<Payout | null> {
    return this.withLock(`complete:${id}`, async () => {
      let payout = await this.get(id);
      if (!payout) return null;
      let operation = await this.storage.get<CompletionOperation>(completionOperationKey(id));
      if (operation?.status === "completed") return payout;
      if (!operation) {
        const ts = now();
        operation = {
          payoutId: id,
          method: requestedMethod ?? payout.method,
          externalRef,
          status: "pending",
          actor,
          createdAt: ts,
          updatedAt: ts,
        };
        await this.storage.set(completionOperationKey(id), operation);
      } else if (operation.externalRef !== externalRef) {
        throw new Error(
          `Payout ${id} is already completing under external reference ${operation.externalRef}.`,
        );
      }

      if (operation.status === "pending") {
        await this.attributions._markPaid(payout.attributionIds, payout.id, payout.attributionAmounts);
        operation = await this.saveCompletion(operation, "attributions_paid");
      }
      if (operation.status === "attributions_paid") {
        await this.attributions._markOffsetsApplied(payout.adjustmentAmounts, payout.id);
        operation = await this.saveCompletion(operation, "adjustments_applied");
      }
      if (operation.status === "adjustments_applied") {
        payout = {
          ...payout,
          status: "completed",
          method: operation.method,
          externalRef: operation.externalRef,
          completedAt: payout.completedAt ?? now(),
          failureReason: undefined,
        };
        assertPayout(payout);
        await this.storage.set(payoutKey(id), payout);
        operation = await this.saveCompletion(operation, "payout_completed");
      }
      if (operation.status === "payout_completed") {
        const earnings = await this.attributions._totalPaidForAffiliateByCurrency(payout.affiliateId);
        await this.affiliates._setLifetimeEarningsByCurrency(payout.affiliateId, earnings);
        operation = await this.saveCompletion(operation, "earnings_reconciled");
      }
      if (operation.status === "earnings_reconciled") {
        await this.activity.logActivity({
          idempotencyKey: `affiliates:payout-complete:${id}`,
          agencyId: this.agencyId,
          clientId: this.clientId,
          actorUserId: operation.actor,
          category: "affiliates",
          action: "affiliate.payout_completed",
          message: operation.method === "stripe-connect"
            ? `Paid affiliate payout ${id} via Stripe transfer ${operation.externalRef}.`
            : `Paid affiliate payout ${id} (${operation.externalRef}).`,
          metadata: {
            payoutId: id,
            affiliateId: payout.affiliateId,
            amountCents: payout.amountCents,
            currency: payout.currency,
            externalRef: operation.externalRef,
            method: operation.method,
          },
        });
        this.events.emit(
          { agencyId: this.agencyId, clientId: this.clientId },
          "affiliate.payout_completed",
          {
            payoutId: id,
            affiliateId: payout.affiliateId,
            amountCents: payout.amountCents,
            currency: payout.currency,
            operationId: `payout-complete:${id}`,
          },
        );
        operation = await this.saveCompletion(operation, "completed");
      }
      return await this.get(id) ?? payout;
    });
  }

  private async saveCompletion(
    operation: CompletionOperation,
    status: CompletionOperation["status"],
  ): Promise<CompletionOperation> {
    const next = { ...operation, status, updatedAt: now() };
    await this.storage.set(completionOperationKey(operation.payoutId), next);
    return next;
  }

  private async findScheduleOperation(
    affiliateId: string,
    currency?: string,
    operationId?: string,
  ): Promise<ScheduleOperation | undefined> {
    if (currency) {
      return this.storage.get<ScheduleOperation>(scheduleOperationKey(affiliateId, currency));
    }
    const keys = await this.storage.list(scheduleOperationPrefix(affiliateId));
    let replay: ScheduleOperation | undefined;
    for (const key of keys) {
      const operation = await this.storage.get<ScheduleOperation>(key);
      if (operation?.status === "pending") return operation;
      if (operationId && operation?.id === operationId) replay = operation;
    }
    return replay;
  }

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.storage.runExclusive) {
      return this.storage.runExclusive(`affiliate-payout:${key}`, operation);
    }
    return localExclusive(`${this.agencyId}:${this.clientId}:${key}`, operation);
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
    assertPayout(next);
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
