// Invoice service. CRUD + status transitions + per-agency sequence.
//
// Storage:
//   invoices/by-id/<id>          → Invoice
//   invoices/by-client/<cid>     → string[] of invoice ids
//   invoices/index               → string[] of all invoice ids
//   invoices/seq/<year>          → integer (next sequence number)

import { formatInvoiceNumber, makeId } from "../lib/ids";
import { now, yearOf } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CreateInvoiceInput,
  Currency,
  Invoice,
  InvoiceFilter,
  InvoiceLineItem,
  UpdateInvoicePatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort, TenantPort } from "./ports";

const INV_INDEX_KEY = "invoices/index";
const invKey = (id: string): string => `invoices/by-id/${id}`;
const byClientKey = (cid: ClientId): string => `invoices/by-client/${cid}`;
const seqKey = (year: number): string => `invoices/seq/${year}`;

function buildLineItems(input: CreateInvoiceInput["lineItems"]): InvoiceLineItem[] {
  return input.map(li => ({
    description: li.description.trim(),
    quantity: li.quantity,
    unitCents: li.unitCents,
    totalCents: li.quantity * li.unitCents,
  }));
}

export class InvoiceService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private tenant: TenantPort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(filter?: InvoiceFilter): Promise<Invoice[]> {
    const ids = (await this.storage.get<string[]>(INV_INDEX_KEY)) ?? [];
    const out: Invoice[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Invoice>(invKey(id));
      if (row) out.push(row);
    }
    const q = filter?.query?.toLowerCase().trim();
    return out
      .filter(i => !filter?.status || i.status === filter.status)
      .filter(i => !filter?.clientId || i.clientId === filter.clientId)
      .filter(i => !filter?.fromIssuedAt || i.issuedAt >= filter.fromIssuedAt)
      .filter(i => !filter?.toIssuedAt || i.issuedAt <= filter.toIssuedAt)
      .filter(i => !q || `${i.number} ${i.notes ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => b.issuedAt - a.issuedAt);
  }

  async get(id: string): Promise<Invoice | null> {
    const row = await this.storage.get<Invoice>(invKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async listForClient(clientId: ClientId): Promise<Invoice[]> {
    const ids = (await this.storage.get<string[]>(byClientKey(clientId))) ?? [];
    const out: Invoice[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Invoice>(invKey(id));
      if (row) out.push(row);
    }
    return out.sort((a, b) => b.issuedAt - a.issuedAt);
  }

  async create(input: CreateInvoiceInput, actor: UserId, defaultCurrency: Currency = "usd"): Promise<Invoice> {
    if (!input.lineItems || input.lineItems.length === 0) {
      throw new Error("Invoice must have at least one line item.");
    }
    const client = await this.tenant.getClientForAgency(this.agencyId, input.clientId);
    if (!client) throw new Error(`Client ${input.clientId} not found in this agency.`);

    const issuedAt = input.issuedAt ?? now();
    const year = yearOf(issuedAt);
    const seq = ((await this.storage.get<number>(seqKey(year))) ?? 0) + 1;
    await this.storage.set(seqKey(year), seq);

    const lineItems = buildLineItems(input.lineItems);
    const subtotalCents = lineItems.reduce((s, li) => s + li.totalCents, 0);
    const taxCents = input.taxCents ?? 0;
    const totalCents = subtotalCents + taxCents;

    const id = makeId("inv");
    const ts = now();
    const row: Invoice = {
      id,
      agencyId: this.agencyId,
      clientId: input.clientId,
      number: formatInvoiceNumber(year, seq),
      issuedAt,
      dueAt: input.dueAt,
      lineItems,
      subtotalCents,
      taxCents,
      totalCents,
      currency: input.currency ?? defaultCurrency,
      status: "draft",
      notes: input.notes,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(invKey(id), row);
    const ix = (await this.storage.get<string[]>(INV_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(INV_INDEX_KEY, [...ix, id]);
    }
    const cIx = (await this.storage.get<string[]>(byClientKey(input.clientId))) ?? [];
    if (!cIx.includes(id)) {
      await this.storage.set(byClientKey(input.clientId), [...cIx, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: input.clientId,
      actorUserId: actor,
      category: "finance",
      action: "invoice.created",
      message: `Drafted invoice ${row.number} for ${client.name} (${(totalCents / 100).toFixed(2)} ${row.currency}).`,
      metadata: { invoiceId: id, number: row.number, totalCents, currency: row.currency },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: input.clientId }, "invoice.created", {
      invoiceId: id, number: row.number, totalCents,
    });
    return row;
  }

  async update(id: string, patch: UpdateInvoicePatch, actor: UserId): Promise<Invoice | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    // Status transitions allowed via update():
    //   draft → sent | void
    //   sent → overdue | void | refunded
    //   overdue → void
    //   paid → refunded | void
    //
    // **Not** via update: any transition to "paid". `markPaid` is the
    // sole path so the side-effects (paidAt + paidVia + externalRef +
    // activity entry + event emit) always fire together.
    if (patch.status && patch.status !== existing.status) {
      const allowed: Record<Invoice["status"], Invoice["status"][]> = {
        draft: ["sent", "void"],
        sent: ["overdue", "void", "refunded"],
        paid: ["refunded", "void"],
        overdue: ["void"],
        void: [],
        refunded: [],
      };
      if (!allowed[existing.status].includes(patch.status)) {
        throw new Error(`Cannot transition invoice ${existing.number} from ${existing.status} → ${patch.status}. Use markPaid for sent/overdue → paid.`);
      }
    }

    let lineItems = existing.lineItems;
    let subtotalCents = existing.subtotalCents;
    if (patch.lineItems) {
      lineItems = buildLineItems(patch.lineItems);
      subtotalCents = lineItems.reduce((s, li) => s + li.totalCents, 0);
    }
    const taxCents = patch.taxCents ?? existing.taxCents;
    const totalCents = subtotalCents + taxCents;

    const next: Invoice = {
      ...existing,
      ...patch,
      lineItems,
      subtotalCents,
      taxCents,
      totalCents,
      updatedAt: now(),
    };
    await this.storage.set(invKey(id), next);

    if (patch.status === "sent" && existing.status === "draft") {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: existing.clientId,
        actorUserId: actor,
        category: "finance",
        action: "invoice.sent",
        message: `Sent invoice ${next.number} to client.`,
        metadata: { invoiceId: id },
      });
      this.events.emit({ agencyId: this.agencyId, clientId: existing.clientId }, "invoice.sent", { invoiceId: id });
    }
    if (patch.status === "void") {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: existing.clientId,
        actorUserId: actor,
        category: "finance",
        action: "invoice.voided",
        message: `Voided invoice ${next.number}.`,
        metadata: { invoiceId: id },
      });
      this.events.emit({ agencyId: this.agencyId, clientId: existing.clientId }, "invoice.voided", { invoiceId: id });
    }
    return next;
  }

  async markPaid(id: string, args: { externalRef?: string; paidVia?: Invoice["paidVia"] }, actor: UserId): Promise<Invoice | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status === "paid") return existing;
    if (existing.status !== "sent" && existing.status !== "overdue") {
      throw new Error(`Cannot mark ${existing.status} invoice as paid.`);
    }
    const next: Invoice = {
      ...existing,
      status: "paid",
      paidAt: now(),
      paidVia: args.paidVia ?? "manual",
      externalRef: args.externalRef ?? existing.externalRef,
      updatedAt: now(),
    };
    await this.storage.set(invKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: existing.clientId,
      actorUserId: actor,
      category: "finance",
      action: "invoice.paid",
      message: `Recorded payment for invoice ${next.number} (${(next.totalCents / 100).toFixed(2)} ${next.currency}).`,
      metadata: { invoiceId: id, totalCents: next.totalCents, paidVia: next.paidVia, externalRef: next.externalRef },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: existing.clientId }, "invoice.paid", {
      invoiceId: id, totalCents: next.totalCents,
    });
    return next;
  }

  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    if (existing.status !== "draft") {
      throw new Error(`Only draft invoices can be deleted. Void ${existing.number} instead.`);
    }
    await this.storage.del(invKey(id));
    const ix = (await this.storage.get<string[]>(INV_INDEX_KEY)) ?? [];
    await this.storage.set(INV_INDEX_KEY, ix.filter(x => x !== id));
    const cIx = (await this.storage.get<string[]>(byClientKey(existing.clientId))) ?? [];
    await this.storage.set(byClientKey(existing.clientId), cIx.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: existing.clientId,
      actorUserId: actor,
      category: "finance",
      action: "invoice.deleted",
      message: `Deleted draft invoice ${existing.number}.`,
      metadata: { invoiceId: id },
    });
    return true;
  }

  // Simple HTML rendering — used by InvoiceDetail page + a future
  // PDF-export round. Returns plain HTML; brand kit injection happens
  // at the foundation chrome layer.
  async renderInvoiceHtml(id: string): Promise<string | null> {
    const invoice = await this.get(id);
    if (!invoice) return null;
    const client = await this.tenant.getClientForAgency(this.agencyId, invoice.clientId);
    const agency = await this.tenant.getAgency(this.agencyId);
    const fmt = (cents: number): string => (cents / 100).toFixed(2);
    const itemsHtml = invoice.lineItems.map(li =>
      `<tr><td>${escapeHtml(li.description)}</td><td>${li.quantity}</td><td>${fmt(li.unitCents)}</td><td>${fmt(li.totalCents)}</td></tr>`,
    ).join("\n");
    return `<article class="invoice">
  <header><h1>${invoice.number}</h1><p>${escapeHtml(agency?.name ?? "Agency")} → ${escapeHtml(client?.name ?? invoice.clientId)}</p></header>
  <section><p>Issued ${new Date(invoice.issuedAt).toISOString().slice(0, 10)} · Due ${new Date(invoice.dueAt).toISOString().slice(0, 10)}</p></section>
  <table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${itemsHtml}</tbody></table>
  <footer>
    <p>Subtotal: ${fmt(invoice.subtotalCents)} ${invoice.currency}</p>
    <p>Tax: ${fmt(invoice.taxCents)} ${invoice.currency}</p>
    <p><strong>Total: ${fmt(invoice.totalCents)} ${invoice.currency}</strong></p>
    ${invoice.notes ? `<p>${escapeHtml(invoice.notes)}</p>` : ""}
  </footer>
</article>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
