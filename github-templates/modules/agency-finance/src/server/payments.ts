// PaymentService — money-in events tied to invoices. R007 addition.
//
// Storage layout:
//   payments/index               → string[] of payment ids
//   payments/by-id/<id>          → Payment
//   payments/by-invoice/<invId>  → string[] of payment ids
//   payments/by-client/<cid>     → string[] of payment ids
//
// Recording a payment optionally transitions the linked Invoice to
// `paid` (when the full total is covered, considering prior payments).

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
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
const byInvoiceKey = (id: string): string => `payments/by-invoice/${id}`;
const byClientKey = (id: ClientId): string => `payments/by-client/${id}`;

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

  async list(filter: PaymentFilter = {}): Promise<Payment[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
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

  // Record a payment. Optionally settles the invoice when the running
  // paid total >= invoice.totalCents.
  async record(actor: UserId, input: CreatePaymentInput): Promise<{ payment: Payment; invoice: Invoice; settled: boolean }> {
    const inv = await this.invoices.get(input.invoiceId);
    if (!inv) throw new Error("agency-finance: invoice not found");
    if (input.amountCents <= 0) throw new Error("agency-finance: amountCents must be > 0");
    if (input.currency !== inv.currency) {
      throw new Error("agency-finance: payment currency must match invoice currency");
    }
    const t = now();
    const payment: Payment = {
      id: makeId("pay"),
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

    const invIdx = (await this.storage.get<string[]>(byInvoiceKey(inv.id))) ?? [];
    if (!invIdx.includes(payment.id)) await this.storage.set(byInvoiceKey(inv.id), [...invIdx, payment.id]);
    const cliIdx = (await this.storage.get<string[]>(byClientKey(inv.clientId))) ?? [];
    if (!cliIdx.includes(payment.id)) await this.storage.set(byClientKey(inv.clientId), [...cliIdx, payment.id]);

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
    return { payment, invoice: updatedInvoice, settled };
  }
}
