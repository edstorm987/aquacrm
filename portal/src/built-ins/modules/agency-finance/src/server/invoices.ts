// Invoice service. CRUD + status transitions + per-agency sequence.
//
// Storage:
//   invoices/by-id/<id>          → Invoice
//   invoices/by-client/<cid>     → string[] of invoice ids
//   invoices/index               → string[] of all invoice ids
//   invoices/seq/<year>          → integer (next sequence number)

import { formatInvoiceNumber, makeId } from "../lib/ids";
import { deriveRecordId, normaliseIdempotencyKey } from "../lib/idempotency";
import { listRowIds } from "./rowIndex";
import { now, yearOf } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CreateInvoiceInput,
  Currency,
  Invoice,
  InvoiceFilter,
  InvoiceIssuerSnapshot,
  InvoiceLineItem,
  InvoiceTemplate,
  UpdateInvoiceTemplateInput,
  UpdateInvoicePatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort, TenantPort } from "./ports";
import { dateInputValue } from "../lib/safeDate";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import {
  assertCurrency,
  assertDateOrder,
  assertInvoiceLineItems,
  assertKnownFields,
  assertNonEmptyText,
  assertOptionalAllowedValue,
  assertOptionalText,
  assertOptionalTimestamp,
  assertSafeInteger,
  assertTimestamp,
} from "../lib/runtimeValidation";

const INV_INDEX_KEY = "invoices/index";
const TEMPLATE_KEY = "invoices/template";
const invKey = (id: string): string => `invoices/by-id/${id}`;
const byClientKey = (cid: ClientId): string => `invoices/by-client/${cid}`;
const seqKey = (year: number): string => `invoices/seq/${year}`;
const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "void", "partially-refunded", "refunded"] as const;
const PAID_VIA_METHODS = ["stripe", "bank-transfer", "cash", "manual"] as const;
const DAY_MS = 86_400_000;

const invoiceCreateTails = new Map<string, Promise<void>>();

async function withLocalInvoiceCreateLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = invoiceCreateTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  invoiceCreateTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (invoiceCreateTails.get(key) === tail) invoiceCreateTails.delete(key);
  }
}

function buildLineItems(input: CreateInvoiceInput["lineItems"]): InvoiceLineItem[] {
  return input.map(li => ({
    description: li.description.trim(),
    quantity: li.quantity,
    unitCents: li.unitCents,
    totalCents: li.quantity * li.unitCents,
  }));
}

function invoiceActivityMetadata(invoice: Invoice): Record<string, unknown> {
  return {
    invoiceId: invoice.id,
    number: invoice.number,
    totalCents: invoice.totalCents,
    currency: invoice.currency,
    status: invoice.status,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    paidAt: invoice.paidAt,
    lineItemDescription: invoice.lineItems[0]?.description,
  };
}

export class InvoiceService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private tenant: TenantPort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  // Index + row scan (see server/rowIndex.ts): an invoice whose index slot was
  // lost to a concurrent create is still owed money and must still be listed.
  async list(filter?: InvoiceFilter): Promise<Invoice[]> {
    const ids = await listRowIds(this.storage, INV_INDEX_KEY, "invoices/by-id/");
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

  async getTemplate(): Promise<InvoiceTemplate> {
    return (await this.storage.get<InvoiceTemplate>(TEMPLATE_KEY)) ?? {
      name: "Milesymedia invoice",
      accentColor: "#171717",
      documentTitle: "Invoice",
      updatedAt: 0,
    };
  }

  async saveTemplate(input: UpdateInvoiceTemplateInput): Promise<InvoiceTemplate> {
    assertKnownFields(input, ["name", "accentColor", "documentTitle", "businessDetails", "paymentDetails", "footerText", "letterheadDataUrl"]);
    assertNonEmptyText(input.name, "name");
    assertNonEmptyText(input.documentTitle, "documentTitle");
    assertNonEmptyText(input.accentColor, "accentColor");
    if (!/^#[0-9a-f]{6}$/i.test(input.accentColor)) {
      throw new Error("agency-finance: accentColor must be a six-digit hex colour");
    }
    assertOptionalText(input.businessDetails, "businessDetails");
    assertOptionalText(input.paymentDetails, "paymentDetails");
    assertOptionalText(input.footerText, "footerText");
    assertOptionalText(input.letterheadDataUrl, "letterheadDataUrl");
    if (input.letterheadDataUrl) {
      if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(input.letterheadDataUrl)) {
        throw new Error("agency-finance: letterheadDataUrl must contain a PNG, JPEG, or WebP data URL");
      }
      if (input.letterheadDataUrl.length > 2_000_000) {
        throw new Error("agency-finance: letterheadDataUrl must be under 1.5 MB");
      }
    }
    const template: InvoiceTemplate = {
      name: input.name.trim(),
      accentColor: input.accentColor,
      documentTitle: input.documentTitle.trim(),
      businessDetails: input.businessDetails?.trim() || undefined,
      paymentDetails: input.paymentDetails?.trim() || undefined,
      footerText: input.footerText?.trim() || undefined,
      letterheadDataUrl: input.letterheadDataUrl || undefined,
      updatedAt: now(),
    };
    await this.storage.set(TEMPLATE_KEY, template);
    return template;
  }

  async get(id: string): Promise<Invoice | null> {
    const row = await this.storage.get<Invoice>(invKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  // Routed through `list` rather than the `invoices/by-client/<id>` array: that
  // secondary index is a read-modify-write too, so a concurrent create could
  // drop a client's invoice from their own tab while it still showed agency-wide
  // — the more confusing failure of the two. Same filter, same ordering.
  async listForClient(clientId: ClientId): Promise<Invoice[]> {
    return this.list({ clientId });
  }

  // Idempotent on `input.idempotencyKey`: a resubmit of the same intent (or a
  // double-clicked "close the deal") returns the first invoice instead of
  // minting a second one — and, crucially, without burning another sequential
  // invoice number. See lib/idempotency.ts.
  async create(input: CreateInvoiceInput, actor: UserId, defaultCurrency: Currency = "gbp"): Promise<Invoice> {
    assertKnownFields(input, ["clientId", "companyId", "issuedAt", "dueAt", "lineItems", "taxCents", "currency", "notes", "idempotencyKey"]);
    assertNonEmptyText(input.clientId, "clientId");
    assertOptionalText(input.companyId, "companyId");
    assertOptionalText(input.notes, "notes");
    assertOptionalText(input.idempotencyKey, "idempotencyKey");
    assertInvoiceLineItems(input.lineItems);
    assertSafeInteger(input.taxCents ?? 0, "taxCents", { min: 0 });
    const issuedAt = input.issuedAt ?? now();
    const workspace = getAgencyWorkspaceSettings(this.agencyId);
    const dueAt = input.dueAt ?? issuedAt + workspace.defaultPaymentTermsDays * DAY_MS;
    assertTimestamp(dueAt, "dueAt");
    assertDateOrder(issuedAt, dueAt, "issuedAt", "dueAt");
    const currency = input.currency ?? defaultCurrency;
    assertCurrency(currency);
    const client = await this.tenant.getClientForAgency(this.agencyId, input.clientId);
    if (!client) throw new Error(`Client ${input.clientId} not found in this agency.`);
    const agency = await this.tenant.getAgency(this.agencyId);
    const issuerSnapshot: InvoiceIssuerSnapshot = {
      legalName: workspace.legalName ?? agency?.name ?? "Agency",
      businessDetails: workspaceBusinessDetails(workspace) || undefined,
    };

    // The deterministic id and the human sequence must be adopted/reserved in
    // one refreshed transaction. Without that boundary, two app processes can
    // both read sequence 0 and persist different rows as INV-<year>-0001; two
    // retries of one key can also burn two numbers before converging on one id.
    const transactionKey = `invoice-create:${this.agencyId}`;
    const createOnce = async (): Promise<Invoice> => {
      const key = normaliseIdempotencyKey(input.idempotencyKey);
      const id = key ? deriveRecordId("inv", key) : makeId("inv");
      if (key) {
        const existing = await this.get(id);
        if (existing) return existing;
      }

      const year = yearOf(issuedAt);
      const seq = ((await this.storage.get<number>(seqKey(year))) ?? 0) + 1;
      await this.storage.set(seqKey(year), seq);

      const lineItems = buildLineItems(input.lineItems);
      const subtotalCents = lineItems.reduce((s, li) => s + li.totalCents, 0);
      const taxCents = input.taxCents ?? 0;
      const totalCents = subtotalCents + taxCents;
      assertSafeInteger(subtotalCents, "subtotalCents", { min: 0 });
      assertSafeInteger(totalCents, "totalCents", { min: 0 });

      const ts = now();
      const row: Invoice = {
        id,
        agencyId: this.agencyId,
        companyId: input.companyId,
        clientId: input.clientId,
        number: formatInvoiceNumber(year, seq),
        issuedAt,
        dueAt,
        lineItems,
        subtotalCents,
        taxCents,
        totalCents,
        currency,
        status: "draft",
        notes: input.notes,
        issuerSnapshot,
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
        metadata: invoiceActivityMetadata(row),
      });
      this.events.emit({ agencyId: this.agencyId, clientId: input.clientId }, "invoice.created", {
        invoiceId: id, number: row.number, totalCents,
      });
      return row;
    };

    return this.storage.runExclusive
      ? this.storage.runExclusive(transactionKey, createOnce)
      : withLocalInvoiceCreateLock(transactionKey, createOnce);
  }

  async update(id: string, patch: UpdateInvoicePatch, actor: UserId): Promise<Invoice | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    assertKnownFields(patch, ["dueAt", "lineItems", "taxCents", "notes", "status", "externalRef", "paidVia"]);
    assertOptionalAllowedValue(patch.status, INVOICE_STATUSES, "status");
    assertOptionalAllowedValue(patch.paidVia, PAID_VIA_METHODS, "paidVia");
    assertOptionalText(patch.externalRef, "externalRef");
    assertOptionalText(patch.notes, "notes");
    assertOptionalTimestamp(patch.dueAt, "dueAt");
    if (patch.lineItems !== undefined) assertInvoiceLineItems(patch.lineItems);
    assertSafeInteger(patch.taxCents ?? existing.taxCents, "taxCents", { min: 0 });
    const dueAt = patch.dueAt ?? existing.dueAt;
    assertDateOrder(existing.issuedAt, dueAt, "issuedAt", "dueAt");
    const changesFinancialContent = patch.dueAt !== undefined
      || patch.lineItems !== undefined
      || patch.taxCents !== undefined
      || patch.notes !== undefined;
    if (changesFinancialContent && existing.status !== "draft") {
      throw new Error(`Only draft invoices can be amended. ${existing.number} is ${existing.status}.`);
    }
    // Status transitions allowed via update():
    //   draft → sent | void
    //   sent → overdue | partially-refunded | refunded | void
    //   overdue → partially-refunded | refunded | void
    //   paid → partially-refunded | refunded | void
    //   partially-refunded → refunded | void
    //
    // **Not** via update: any transition to "paid". `markPaid` is the
    // sole path so the side-effects (paidAt + paidVia + externalRef +
    // activity entry + event emit) always fire together.
    if (patch.status && patch.status !== existing.status) {
      const allowed: Record<Invoice["status"], Invoice["status"][]> = {
        draft: ["sent", "void"],
        sent: ["overdue", "void", "partially-refunded", "refunded"],
        paid: ["partially-refunded", "refunded", "void"],
        overdue: ["partially-refunded", "refunded", "void"],
        void: [],
        "partially-refunded": ["refunded", "void"],
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
    assertSafeInteger(subtotalCents, "subtotalCents", { min: 0 });
    assertSafeInteger(totalCents, "totalCents", { min: 0 });

    const next: Invoice = {
      ...existing,
      ...patch,
      dueAt,
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
        metadata: invoiceActivityMetadata(next),
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
        metadata: invoiceActivityMetadata(next),
      });
      this.events.emit({ agencyId: this.agencyId, clientId: existing.clientId }, "invoice.voided", { invoiceId: id });
    } else if (changesFinancialContent || patch.status) {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: existing.clientId,
        actorUserId: actor,
        category: "finance",
        action: "invoice.updated",
        message: `Updated invoice ${next.number}.`,
        metadata: invoiceActivityMetadata(next),
      });
    }
    return next;
  }

  async markPaid(id: string, args: { externalRef?: string; paidVia?: Invoice["paidVia"] }, actor: UserId): Promise<Invoice | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    assertKnownFields(args, ["externalRef", "paidVia"]);
    assertOptionalAllowedValue(args.paidVia, PAID_VIA_METHODS, "paidVia");
    assertOptionalText(args.externalRef, "externalRef");
    if (existing.status === "paid") return existing;
    if (existing.status !== "sent" && existing.status !== "overdue" && existing.status !== "partially-refunded") {
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
      metadata: { ...invoiceActivityMetadata(next), paidVia: next.paidVia, externalRef: next.externalRef },
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
      metadata: invoiceActivityMetadata(existing),
    });
    return true;
  }

  async renderInvoiceHtml(id: string): Promise<string | null> {
    const invoice = await this.get(id);
    if (!invoice) return null;
    const client = await this.tenant.getClientForAgency(this.agencyId, invoice.clientId);
    const agency = await this.tenant.getAgency(this.agencyId);
    const workspace = getAgencyWorkspaceSettings(this.agencyId);
    const template = await this.getTemplate();
    const fmt = (cents: number): string => (cents / 100).toFixed(2);
    const itemsHtml = invoice.lineItems.map(li =>
      `<tr><td>${escapeHtml(li.description)}</td><td>${li.quantity}</td><td>${fmt(li.unitCents)}</td><td>${fmt(li.totalCents)}</td></tr>`,
    ).join("\n");
    // New rows carry their immutable seller identity. Legacy rows deliberately
    // retain the old live-workspace fallback because no historical snapshot
    // exists to recover for them.
    const issuerName = invoice.issuerSnapshot?.legalName ?? workspace.legalName ?? agency?.name ?? "Agency";
    const issuerBusinessDetails = invoice.issuerSnapshot
      ? invoice.issuerSnapshot.businessDetails
      : workspaceBusinessDetails(workspace);
    const businessDetails = template.businessDetails || issuerBusinessDetails;
    return `<article class="invoice">
  ${template.letterheadDataUrl ? `<img class="letterhead" src="${escapeHtml(template.letterheadDataUrl)}" alt="">` : ""}
  <div class="invoice-content">
  <header><div><span class="eyebrow">${escapeHtml(template.documentTitle)}</span><h1>${invoice.number}</h1></div><div class="from"><strong>${escapeHtml(issuerName)}</strong>${businessDetails ? `<p>${escapeHtml(businessDetails).replace(/\n/g, "<br>")}</p>` : ""}</div></header>
  <section class="meta"><div><span>Bill to</span><strong>${escapeHtml(client?.name ?? invoice.clientId)}</strong></div><div><span>Issued</span><strong>${dateInputValue(invoice.issuedAt)}</strong></div><div><span>Due</span><strong>${dateInputValue(invoice.dueAt)}</strong></div></section>
  <table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${itemsHtml}</tbody></table>
  <div class="summary">
    <p><span>Subtotal</span><span>${fmt(invoice.subtotalCents)} ${invoice.currency.toUpperCase()}</span></p>
    <p><span>Tax</span><span>${fmt(invoice.taxCents)} ${invoice.currency.toUpperCase()}</span></p>
    <p class="grand-total"><strong>Total</strong><strong>${fmt(invoice.totalCents)} ${invoice.currency.toUpperCase()}</strong></p>
  </div>
  ${invoice.notes ? `<section class="notes"><span>Notes</span><p>${escapeHtml(invoice.notes).replace(/\n/g, "<br>")}</p></section>` : ""}
  ${template.paymentDetails ? `<section class="payment"><span>Payment details</span><p>${escapeHtml(template.paymentDetails).replace(/\n/g, "<br>")}</p></section>` : ""}
  ${template.footerText ? `<footer>${escapeHtml(template.footerText).replace(/\n/g, "<br>")}</footer>` : ""}
  </div>
</article>`;
  }
}

function workspaceBusinessDetails(settings: ReturnType<typeof getAgencyWorkspaceSettings>): string {
  return [
    settings.businessAddress,
    settings.companyNumber ? `Company number: ${settings.companyNumber}` : undefined,
    settings.taxNumber ? `VAT or tax number: ${settings.taxNumber}` : undefined,
    settings.supportEmail,
    settings.phone,
    settings.website,
  ].filter((value): value is string => Boolean(value)).join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
