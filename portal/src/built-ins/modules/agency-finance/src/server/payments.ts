// PaymentService — money-in events tied to invoices. R007 addition.
//
// Storage layout:
//   payments/index               → string[] of payment ids (a fast path; reads
//                                  also scan by-id, see server/rowIndex.ts)
//   payments/by-id/<id>          → Payment
//   refunds/index                → string[] of refund ids
//   refunds/by-id/<id>           → Refund
//   payment-disputes/index       → string[] of dispute ids
//   payment-disputes/by-id/<id>  → PaymentDispute
//
// There used to be `payments/by-invoice/<invId>` and `payments/by-client/<cid>`
// arrays here. Nothing ever read them — `listForInvoice`/`list({clientId})` go
// through `list()` — so every recorded payment paid for four storage ops (and
// two more racy read-modify-writes) maintaining indexes no query used. Removed.
// Any left in existing stores are inert: unread keys in the plugin's own slice.
//
// Recording accepts collectible invoices, caps each allocation at the live net
// outstanding balance and transitions the linked Invoice to `paid` only when
// the accepted allocation exactly clears that balance. Refunds are immutable
// negative allocations, never edits to the original receipt.

import { deriveRecordId, normaliseIdempotencyKey } from "../lib/idempotency";
import {
  invoiceNetPaidCents,
  invoiceOutstandingCents,
  invoicePaidCents,
  invoiceRefundedCents,
  isCollectibleInvoiceStatus,
} from "../lib/paymentAllocation";
import { listRowIds } from "./rowIndex";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreatePaymentInput,
  CreateRefundInput,
  Invoice,
  Payment,
  PaymentDispute,
  PaymentFilter,
  Refund,
  RefundFilter,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import type { InvoiceService } from "./invoices";
import {
  assertAllowedValue,
  assertCurrency,
  assertKnownFields,
  assertNonEmptyText,
  assertOptionalText,
  assertOptionalTimestamp,
  assertSafeInteger,
} from "../lib/runtimeValidation";

const INDEX_KEY = "payments/index";
const payKey = (id: string): string => `payments/by-id/${id}`;
const REFUND_INDEX_KEY = "refunds/index";
const refundKey = (id: string): string => `refunds/by-id/${id}`;
const DISPUTE_INDEX_KEY = "payment-disputes/index";
const disputeKey = (id: string): string => `payment-disputes/by-id/${id}`;
const PAYMENT_METHODS = ["stripe", "bank-transfer", "cash", "manual", "other"] as const;
const REFUND_PROVIDERS = ["stripe", "manual", "other"] as const;

const paymentAllocationTails = new Map<string, Promise<void>>();

async function withLocalPaymentAllocationLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = paymentAllocationTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  paymentAllocationTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (paymentAllocationTails.get(key) === tail) paymentAllocationTails.delete(key);
  }
}

export class PaymentService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private invoices: InvoiceService,
  ) {}

  private inScope(p: Payment): boolean {
    return p.agencyId === this.agencyId;
  }

  // Index + row scan (see server/rowIndex.ts): a payment whose index slot was
  // lost to a concurrent write is still real money and must still be listed.
  async list(filter: PaymentFilter = {}): Promise<Payment[]> {
    const ids = await listRowIds(this.storage, INDEX_KEY, "payments/by-id/");
    const out: Payment[] = [];
    for (const id of ids) {
      const p = await this.storage.get<Payment>(payKey(id));
      if (!p || !this.inScope(p)) continue;
      if (filter.invoiceId && p.invoiceId !== filter.invoiceId) continue;
      if (filter.clientId && p.clientId !== filter.clientId) continue;
      if (filter.method && p.method !== filter.method) continue;
      if (filter.fromPaidAt !== undefined && p.paidAt < filter.fromPaidAt) continue;
      if (filter.toPaidAt !== undefined && p.paidAt >= filter.toPaidAt) continue;
      out.push(p);
    }
    return out.sort((a, b) => b.paidAt - a.paidAt);
  }

  async get(id: string): Promise<Payment | null> {
    const p = await this.storage.get<Payment>(payKey(id));
    return p && this.inScope(p) ? p : null;
  }

  async listForInvoice(invoiceId: string): Promise<Payment[]> {
    return this.list({ invoiceId });
  }

  // Find a payment by its external reference (e.g. a Stripe PaymentIntent id).
  // Reconciling a Stripe webhook is idempotent on this, and a refund/chargeback
  // routes back to the invoice through it.
  async findByExternalRef(externalRef: string): Promise<Payment | null> {
    if (!externalRef) return null;
    const all = await this.list();
    return all.find(p => p.externalRef === externalRef) ?? null;
  }

  async listRefunds(filter: RefundFilter = {}): Promise<Refund[]> {
    const ids = await listRowIds(this.storage, REFUND_INDEX_KEY, "refunds/by-id/");
    const out: Refund[] = [];
    for (const id of ids) {
      const refund = await this.storage.get<Refund>(refundKey(id));
      if (!refund || refund.agencyId !== this.agencyId) continue;
      if (filter.paymentId && refund.paymentId !== filter.paymentId) continue;
      if (filter.invoiceId && refund.invoiceId !== filter.invoiceId) continue;
      if (filter.clientId && refund.clientId !== filter.clientId) continue;
      if (filter.fromRefundedAt !== undefined && refund.refundedAt < filter.fromRefundedAt) continue;
      if (filter.toRefundedAt !== undefined && refund.refundedAt >= filter.toRefundedAt) continue;
      out.push(refund);
    }
    return out.sort((left, right) => right.refundedAt - left.refundedAt || left.id.localeCompare(right.id));
  }

  async listRefundsForPayment(paymentId: string): Promise<Refund[]> {
    return this.listRefunds({ paymentId });
  }

  async listRefundsForInvoice(invoiceId: string): Promise<Refund[]> {
    return this.listRefunds({ invoiceId });
  }

  async getRefund(id: string): Promise<Refund | null> {
    const refund = await this.storage.get<Refund>(refundKey(id));
    return refund?.agencyId === this.agencyId ? refund : null;
  }

  async recordRefund(actor: UserId, input: CreateRefundInput): Promise<{
    refund: Refund;
    payment: Payment;
    invoice: Invoice | null;
    deduped: boolean;
  }> {
    assertKnownFields(input, ["paymentId", "amountCents", "currency", "provider", "providerId", "providerEventId", "reason", "refundedAt"]);
    assertNonEmptyText(input.paymentId, "paymentId");
    assertSafeInteger(input.amountCents, "amountCents", { min: 1 });
    assertCurrency(input.currency);
    assertAllowedValue(input.provider, REFUND_PROVIDERS, "provider");
    assertNonEmptyText(input.providerId, "providerId");
    assertOptionalText(input.providerEventId, "providerEventId");
    assertOptionalText(input.reason, "reason");
    assertOptionalTimestamp(input.refundedAt, "refundedAt");

    const transactionKey = `payment-refund:${this.agencyId}:${input.paymentId}`;
    const recordOnce = async () => {
      const payment = await this.get(input.paymentId);
      if (!payment) throw new Error("agency-finance: payment not found");
      if (payment.currency !== input.currency) throw new Error("agency-finance: refund currency must match payment currency");
      const providerId = input.providerId.trim();
      const id = deriveRecordId("ref", `${input.provider}:${providerId}`);
      const existing = await this.getRefund(id);
      if (existing) {
        if (
          existing.paymentId !== payment.id
          || existing.amountCents !== input.amountCents
          || existing.currency !== input.currency
          || existing.provider !== input.provider
        ) {
          throw new Error("agency-finance: provider refund id belongs to a different refund");
        }
        const invoice = await this.syncInvoiceRefundStatus(payment, actor);
        await this.logRefund(existing, payment, invoice, actor);
        return { refund: existing, payment, invoice, deduped: true };
      }

      const prior = await this.listRefundsForPayment(payment.id);
      const alreadyRefunded = prior.reduce((sum, refund) => sum + refund.amountCents, 0);
      const refundableCents = payment.amountCents - alreadyRefunded;
      if (input.amountCents > refundableCents) {
        throw new Error(`agency-finance: refund exceeds refundable balance of ${refundableCents} ${payment.currency.toUpperCase()}`);
      }
      const createdAt = now();
      const refund: Refund = {
        id,
        agencyId: this.agencyId,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        clientId: payment.clientId,
        amountCents: input.amountCents,
        currency: payment.currency,
        provider: input.provider,
        providerId,
        providerEventId: input.providerEventId?.trim() || undefined,
        reason: input.reason?.trim() || undefined,
        refundedAt: input.refundedAt ?? createdAt,
        createdBy: actor,
        createdAt,
      };
      await this.storage.set(refundKey(refund.id), refund);
      const ids = (await this.storage.get<string[]>(REFUND_INDEX_KEY)) ?? [];
      if (!ids.includes(refund.id)) await this.storage.set(REFUND_INDEX_KEY, [...ids, refund.id]);
      const invoice = await this.syncInvoiceRefundStatus(payment, actor);
      await this.logRefund(refund, payment, invoice, actor);
      this.events.emit(
        { agencyId: this.agencyId, clientId: payment.clientId },
        "agency-finance.payment.refunded",
        { refundId: refund.id, paymentId: payment.id, invoiceId: payment.invoiceId, amountCents: refund.amountCents },
      );
      return { refund, payment, invoice, deduped: false };
    };
    return this.storage.runExclusive
      ? this.storage.runExclusive(transactionKey, recordOnce)
      : withLocalPaymentAllocationLock(transactionKey, recordOnce);
  }

  /** Reconcile Stripe's cumulative `amount_refunded` without double-counting older events. */
  async reconcileCumulativeRefund(actor: UserId, input: {
    externalRef: string;
    totalRefundedCents: number;
    providerId: string;
    providerEventId?: string;
    refundedAt?: number;
    reason?: string;
  }): Promise<{ refund: Refund | null; payment: Payment; invoice: Invoice | null; deduped: boolean } | null> {
    assertNonEmptyText(input.externalRef, "externalRef");
    assertSafeInteger(input.totalRefundedCents, "totalRefundedCents", { min: 0 });
    assertNonEmptyText(input.providerId, "providerId");
    assertOptionalText(input.providerEventId, "providerEventId");
    assertOptionalText(input.reason, "reason");
    assertOptionalTimestamp(input.refundedAt, "refundedAt");
    const payment = await this.findByExternalRef(input.externalRef);
    if (!payment) return null;
    const transactionKey = `payment-refund:${this.agencyId}:${payment.id}`;
    const reconcileOnce = async () => {
      const providerId = input.providerId.trim();
      const id = deriveRecordId("ref", `stripe:${providerId}`);
      const existing = await this.getRefund(id);
      if (existing) {
        const invoice = await this.syncInvoiceRefundStatus(payment, actor);
        await this.logRefund(existing, payment, invoice, actor);
        return { refund: existing, payment, invoice, deduped: true };
      }
      const prior = await this.listRefundsForPayment(payment.id);
      const alreadyRefunded = prior.reduce((sum, refund) => sum + refund.amountCents, 0);
      const target = Math.min(payment.amountCents, input.totalRefundedCents);
      const amountCents = target - alreadyRefunded;
      if (amountCents <= 0) {
        return { refund: null, payment, invoice: await this.syncInvoiceRefundStatus(payment, actor), deduped: true };
      }
      return this.recordRefundUnlocked(actor, payment, {
        amountCents,
        providerId,
        providerEventId: input.providerEventId,
        refundedAt: input.refundedAt,
        reason: input.reason,
      });
    };
    return this.storage.runExclusive
      ? this.storage.runExclusive(transactionKey, reconcileOnce)
      : withLocalPaymentAllocationLock(transactionKey, reconcileOnce);
  }

  async listDisputes(): Promise<PaymentDispute[]> {
    const ids = await listRowIds(this.storage, DISPUTE_INDEX_KEY, "payment-disputes/by-id/");
    const rows = await Promise.all(ids.map(id => this.storage.get<PaymentDispute>(disputeKey(id))));
    return rows.filter((row): row is PaymentDispute => row?.agencyId === this.agencyId)
      .sort((left, right) => right.openedAt - left.openedAt || left.id.localeCompare(right.id));
  }

  // A dispute is durable but does not become a refund. It remains contested and
  // therefore does not alter cash or invoice allocation until a settled money
  // movement arrives as its own provider event.
  async markDisputed(externalRef: string | undefined, actor: UserId, input: {
    providerId?: string;
    providerEventId?: string;
    amountCents?: number;
    openedAt?: number;
  } = {}): Promise<Payment | null> {
    const payment = externalRef ? await this.findByExternalRef(externalRef) : null;
    if (!payment) return null;
    const providerId = input.providerId?.trim() || input.providerEventId?.trim() || externalRef || payment.id;
    const id = deriveRecordId("dsp", `stripe:${providerId}`);
    const transactionKey = `payment-dispute:${this.agencyId}:${payment.id}`;
    const recordOnce = async () => {
      const existing = await this.storage.get<PaymentDispute>(disputeKey(id));
      if (existing?.agencyId === this.agencyId) return;
      const amountCents = input.amountCents ?? payment.amountCents;
      assertSafeInteger(amountCents, "amountCents", { min: 1, max: payment.amountCents });
      assertOptionalTimestamp(input.openedAt, "openedAt");
      const createdAt = now();
      const dispute: PaymentDispute = {
        id,
        agencyId: this.agencyId,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        clientId: payment.clientId,
        amountCents,
        currency: payment.currency,
        providerId,
        providerEventId: input.providerEventId,
        openedAt: input.openedAt ?? createdAt,
        createdBy: actor,
        createdAt,
      };
      await this.storage.set(disputeKey(id), dispute);
      const ids = (await this.storage.get<string[]>(DISPUTE_INDEX_KEY)) ?? [];
      if (!ids.includes(id)) await this.storage.set(DISPUTE_INDEX_KEY, [...ids, id]);
    };
    if (this.storage.runExclusive) await this.storage.runExclusive(transactionKey, recordOnce);
    else await withLocalPaymentAllocationLock(transactionKey, recordOnce);
    await this.activity.logActivity({
      idempotencyKey: `finance:payment-dispute:${id}`,
      agencyId: this.agencyId, clientId: payment.clientId, actorUserId: actor,
      category: "finance", action: "payment.disputed",
      message: `Chargeback opened on invoice ${payment.invoiceId}.`,
      metadata: { disputeId: id, paymentId: payment.id, invoiceId: payment.invoiceId, externalRef, amountCents: input.amountCents },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: payment.clientId }, "agency-finance.payment.disputed", { disputeId: id, paymentId: payment.id, invoiceId: payment.invoiceId });
    return payment;
  }

  private async recordRefundUnlocked(actor: UserId, payment: Payment, input: {
    amountCents: number;
    providerId: string;
    providerEventId?: string;
    refundedAt?: number;
    reason?: string;
  }): Promise<{ refund: Refund; payment: Payment; invoice: Invoice | null; deduped: boolean }> {
    const createdAt = now();
    const refund: Refund = {
      id: deriveRecordId("ref", `stripe:${input.providerId}`),
      agencyId: this.agencyId,
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      clientId: payment.clientId,
      amountCents: input.amountCents,
      currency: payment.currency,
      provider: "stripe",
      providerId: input.providerId,
      providerEventId: input.providerEventId,
      reason: input.reason,
      refundedAt: input.refundedAt ?? createdAt,
      createdBy: actor,
      createdAt,
    };
    await this.storage.set(refundKey(refund.id), refund);
    const ids = (await this.storage.get<string[]>(REFUND_INDEX_KEY)) ?? [];
    if (!ids.includes(refund.id)) await this.storage.set(REFUND_INDEX_KEY, [...ids, refund.id]);
    const invoice = await this.syncInvoiceRefundStatus(payment, actor);
    await this.logRefund(refund, payment, invoice, actor);
    this.events.emit(
      { agencyId: this.agencyId, clientId: payment.clientId },
      "agency-finance.payment.refunded",
      { refundId: refund.id, paymentId: payment.id, invoiceId: payment.invoiceId, amountCents: refund.amountCents },
    );
    return { refund, payment, invoice, deduped: false };
  }

  private async syncInvoiceRefundStatus(payment: Payment, actor: UserId): Promise<Invoice | null> {
    const invoice = await this.invoices.get(payment.invoiceId);
    if (!invoice || invoice.status === "draft" || invoice.status === "void") return invoice;
    const [payments, refunds] = await Promise.all([
      this.listForInvoice(invoice.id),
      this.listRefundsForInvoice(invoice.id),
    ]);
    const grossPaidCents = invoicePaidCents(invoice.id, payments);
    const refundedCents = invoiceRefundedCents(invoice.id, refunds);
    const netPaidCents = invoiceNetPaidCents(invoice.id, payments, refunds);
    if (refundedCents <= 0) return invoice;
    if (netPaidCents >= invoice.totalCents) {
      return invoice.status === "paid"
        ? invoice
        : this.invoices.markPaid(invoice.id, { paidVia: payment.method === "other" ? "manual" : payment.method }, actor);
    }
    const status = grossPaidCents >= invoice.totalCents && netPaidCents === 0
      ? "refunded"
      : "partially-refunded";
    if (invoice.status === status) return invoice;
    return this.invoices.update(invoice.id, { status }, actor);
  }

  private async logRefund(refund: Refund, payment: Payment, invoice: Invoice | null, actor: UserId): Promise<void> {
    await this.activity.logActivity({
      idempotencyKey: `finance:payment-refund:${refund.id}`,
      agencyId: this.agencyId, clientId: payment.clientId, actorUserId: actor,
      category: "finance", action: "payment.refunded",
      message: `Refund on invoice ${invoice?.number ?? payment.invoiceId}: ${refund.amountCents} ${refund.currency.toUpperCase()}.`,
      metadata: {
        refundId: refund.id,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        amountCents: refund.amountCents,
        provider: refund.provider,
        providerId: refund.providerId,
        providerEventId: refund.providerEventId,
      },
    });
  }

  // Record a payment. Optionally settles the invoice when this allocation
  // exactly clears the live outstanding balance.
  //
  // Idempotent on `input.idempotencyKey`: a resubmit of the SAME intent (a
  // double-click / retry) returns the first payment instead of double-counting
  // money-in. A genuine second/partial payment carries a NEW key → a new id →
  // is recorded normally (partial payments stay legal). Without a key, behaviour
  // is unchanged (a fresh random id every call).
  async record(actor: UserId, input: CreatePaymentInput): Promise<{ payment: Payment; invoice: Invoice; settled: boolean; deduped: boolean }> {
    assertKnownFields(input, ["invoiceId", "amountCents", "currency", "method", "paidAt", "notes", "externalRef", "idempotencyKey"]);
    assertNonEmptyText(input.invoiceId, "invoiceId");
    assertOptionalText(input.idempotencyKey, "idempotencyKey");
    const transactionKey = `payment-allocation:${this.agencyId}:${input.invoiceId}`;
    const recordOnce = async (): Promise<{ payment: Payment; invoice: Invoice; settled: boolean; deduped: boolean }> => {
      const inv = await this.invoices.get(input.invoiceId);
      if (!inv) throw new Error("agency-finance: invoice not found");

      const key = normaliseIdempotencyKey(input.idempotencyKey);
      const id = deriveRecordId("pay", key);
      if (key) {
        // Adoption comes before status/outstanding checks: a retry after the
        // first request settled the invoice must return its original payment.
        const existing = await this.get(id);
        if (existing) {
          if (
            existing.invoiceId !== input.invoiceId
            || existing.amountCents !== input.amountCents
            || existing.currency !== input.currency
            || existing.method !== input.method
          ) {
            throw new Error("agency-finance: idempotency key belongs to a different payment intent");
          }
          return { payment: existing, invoice: inv, settled: inv.status === "paid", deduped: true };
        }
      }

      assertSafeInteger(input.amountCents, "amountCents", { min: 1 });
      assertCurrency(input.currency);
      assertAllowedValue(input.method, PAYMENT_METHODS, "method");
      assertOptionalTimestamp(input.paidAt, "paidAt");
      assertOptionalText(input.notes, "notes");
      assertOptionalText(input.externalRef, "externalRef");
      if (input.currency !== inv.currency) {
        throw new Error("agency-finance: payment currency must match invoice currency");
      }
      if (!isCollectibleInvoiceStatus(inv.status)) {
        throw new Error(`agency-finance: ${inv.status} invoice is not collectible`);
      }

      const [before, refunds] = await Promise.all([
        this.listForInvoice(inv.id),
        this.listRefundsForInvoice(inv.id),
      ]);
      const outstandingCents = invoiceOutstandingCents(inv, before, refunds);
      if (outstandingCents <= 0) {
        throw new Error("agency-finance: invoice has no outstanding balance");
      }
      if (input.amountCents > outstandingCents) {
        throw new Error(`agency-finance: payment exceeds outstanding balance of ${outstandingCents} ${inv.currency.toUpperCase()}`);
      }

      const t = now();
      const payment: Payment = {
        id,
        agencyId: this.agencyId,
        invoiceId: inv.id,
        clientId: inv.clientId,
        amountCents: input.amountCents,
        currency: input.currency,
        method: input.method,
        paidAt: input.paidAt ?? t,
        notes: input.notes,
        externalRef: input.externalRef,
        createdAt: t,
      };
      await this.storage.set(payKey(payment.id), payment);
      const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
      if (!ids.includes(payment.id)) await this.storage.set(INDEX_KEY, [...ids, payment.id]);

      this.activity.logActivity({
        agencyId: this.agencyId, clientId: inv.clientId, actorUserId: actor,
        category: "finance", action: "payment.recorded",
        message: `Payment ${payment.id} for invoice ${inv.number}: ${input.amountCents} ${inv.currency.toUpperCase()}`,
        metadata: { paymentId: payment.id, invoiceId: inv.id, amountCents: input.amountCents, method: input.method },
      });
      this.events.emit({ agencyId: this.agencyId, clientId: inv.clientId },
        "agency-finance.payment.recorded", { paymentId: payment.id, invoiceId: inv.id });

      let updatedInvoice = inv;
      let settled = false;
      if (input.amountCents === outstandingCents) {
        const result = await this.invoices.markPaid(
          inv.id,
          { paidVia: (["stripe", "bank-transfer", "cash", "manual"].includes(payment.method) ? payment.method : "manual") as Invoice["paidVia"] },
          actor,
        );
        if (result) {
          updatedInvoice = result;
          settled = true;
        }
      }
      return { payment, invoice: updatedInvoice, settled, deduped: false };
    };

    return this.storage.runExclusive
      ? this.storage.runExclusive(transactionKey, recordOnce)
      : withLocalPaymentAllocationLock(transactionKey, recordOnce);
  }
}
