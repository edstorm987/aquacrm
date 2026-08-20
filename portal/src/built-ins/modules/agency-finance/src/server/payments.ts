// PaymentService — money-in events tied to invoices. R007 addition.
//
// Storage layout:
//   payments/index               → string[] of payment ids (a fast path; reads
//                                  also scan by-id, see server/rowIndex.ts)
//   payments/by-id/<id>          → Payment
//
// There used to be `payments/by-invoice/<invId>` and `payments/by-client/<cid>`
// arrays here. Nothing ever read them — `listForInvoice`/`list({clientId})` go
// through `list()` — so every recorded payment paid for four storage ops (and
// two more racy read-modify-writes) maintaining indexes no query used. Removed.
// Any left in existing stores are inert: unread keys in the plugin's own slice.
//
// Recording a payment optionally transitions the linked Invoice to
// `paid` (when the full total is covered, considering prior payments).

import { deriveRecordId, normaliseIdempotencyKey } from "../lib/idempotency";
import { listRowIds } from "./rowIndex";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreatePaymentInput,
  Invoice,
  Payment,
  PaymentFilter,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import type { InvoiceService } from "./invoices";

const INDEX_KEY = "payments/index";
const payKey = (id: string): string => `payments/by-id/${id}`;

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

  // A refund flowed back (e.g. Stripe `charge.refunded`): settle the invoice to
  // `refunded` (paid → refunded is the allowed transition) and surface it.
  // Returns null when no payment matches the reference. Record + surface only.
  async markRefunded(externalRef: string, actor: UserId): Promise<{ payment: Payment; invoice: Invoice | null } | null> {
    const payment = await this.findByExternalRef(externalRef);
    if (!payment) return null;
    const invoice = await this.invoices.get(payment.invoiceId);
    let updated = invoice;
    if (invoice && invoice.status === "paid") {
      updated = (await this.invoices.update(payment.invoiceId, { status: "refunded" }, actor)) ?? invoice;
    }
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: payment.clientId, actorUserId: actor,
      category: "finance", action: "payment.refunded",
      message: `Refund on invoice ${updated?.number ?? payment.invoiceId}.`,
      metadata: { paymentId: payment.id, invoiceId: payment.invoiceId, externalRef },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: payment.clientId }, "agency-finance.payment.refunded", { paymentId: payment.id, invoiceId: payment.invoiceId });
    return { payment, invoice: updated };
  }

  // A chargeback/dispute opened (e.g. Stripe `charge.dispute.created`): surface
  // it, but DON'T force the invoice status — a dispute is contested and may be
  // won. `externalRef` may be absent. Returns the matched payment, or null.
  async markDisputed(externalRef: string | undefined, actor: UserId): Promise<Payment | null> {
    const payment = externalRef ? await this.findByExternalRef(externalRef) : null;
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: payment?.clientId, actorUserId: actor,
      category: "finance", action: "payment.disputed",
      message: `Chargeback opened${payment ? ` on invoice ${payment.invoiceId}` : ""}.`,
      metadata: { paymentId: payment?.id, invoiceId: payment?.invoiceId, externalRef },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: payment?.clientId }, "agency-finance.payment.disputed", { paymentId: payment?.id, invoiceId: payment?.invoiceId });
    return payment;
  }

  // Record a payment. Optionally settles the invoice when the running
  // paid total >= invoice.totalCents.
  //
  // Idempotent on `input.idempotencyKey`: a resubmit of the SAME intent (a
  // double-click / retry) returns the first payment instead of double-counting
  // money-in. A genuine second/partial payment carries a NEW key → a new id →
  // is recorded normally (partial payments stay legal). Without a key, behaviour
  // is unchanged (a fresh random id every call).
  async record(actor: UserId, input: CreatePaymentInput): Promise<{ payment: Payment; invoice: Invoice; settled: boolean; deduped: boolean }> {
    const inv = await this.invoices.get(input.invoiceId);
    if (!inv) throw new Error("agency-finance: invoice not found");
    if (input.amountCents <= 0) throw new Error("agency-finance: amountCents must be > 0");
    if (input.currency !== inv.currency) {
      throw new Error("agency-finance: payment currency must match invoice currency");
    }

    const key = normaliseIdempotencyKey(input.idempotencyKey);
    const id = deriveRecordId("pay", key);
    if (key) {
      // Already recorded under this key → return the first payment, don't mint,
      // settle, log or emit again.
      const existing = await this.get(id);
      if (existing) return { payment: existing, invoice: inv, settled: inv.status === "paid", deduped: true };
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

    // Decide settlement.
    const allPayments = await this.listForInvoice(inv.id);
    const paidSum = allPayments.reduce((s, p) => s + p.amountCents, 0);
    let updatedInvoice = inv;
    let settled = false;
    if (paidSum >= inv.totalCents && inv.status !== "paid" && (inv.status === "sent" || inv.status === "overdue")) {
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
  }
}
