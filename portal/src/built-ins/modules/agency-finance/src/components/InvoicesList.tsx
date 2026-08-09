"use client";

import { useMemo, useState } from "react";
import { Download, FileImage, Plus, X } from "lucide-react";
import Link from "next/link";

import type { Invoice, InvoiceStatus, InvoiceTemplate } from "../lib/domain";
import type { Client } from "../lib/tenancy";
import { InvoiceTemplateEditor } from "./InvoiceTemplateEditor";
import { FinanceNav } from "./FinanceNav";

export interface InvoicesListProps {
  invoices: Invoice[];
  clients: Client[];
  apiBase: string;
  canMutate: boolean;
  template: InvoiceTemplate;
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue",
  void: "Void", refunded: "Refunded",
};

export function InvoicesList({ invoices, clients, apiBase, canMutate, template }: InvoicesListProps) {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientNames = new Map(clients.map(client => [client.id, client.name]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter(i => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (q && !`${i.number} ${i.notes ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [invoices, statusFilter, query]);

  function downloadCsv() {
    const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Invoice", "Client", "Issued", "Due", "Subtotal", "Tax", "Total", "Currency", "Status", "Notes"],
      ...filtered.map(invoice => [
        invoice.number,
        clientNames.get(invoice.clientId) ?? invoice.clientId,
        new Date(invoice.issuedAt).toISOString().slice(0, 10),
        new Date(invoice.dueAt).toISOString().slice(0, 10),
        (invoice.subtotalCents / 100).toFixed(2),
        (invoice.taxCents / 100).toFixed(2),
        (invoice.totalCents / 100).toFixed(2),
        invoice.currency.toUpperCase(),
        invoice.status,
        invoice.notes ?? "",
      ]),
    ];
    const blob = new Blob([rows.map(row => row.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `milesymedia-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 pb-12">
      <FinanceNav active="invoices" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Finance</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90">Invoices</h1>
          <p className="mt-1 text-sm text-black/55">Create, issue, and record payment against client invoices.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadCsv} className="inline-flex size-10 items-center justify-center rounded-md border border-black/15 bg-white text-black/60 hover:bg-black/[0.03]" aria-label="Download invoice list" title="Download invoice list"><Download size={16} /></button>
          <button type="button" onClick={() => setEditingTemplate(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium hover:bg-black/[0.03]"><FileImage size={16} /> Invoice template</button>
          {canMutate ? <button type="button" onClick={() => setAdding(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white">
            {adding ? <X size={16} aria-hidden /> : <Plus size={16} aria-hidden />} {adding ? "Close" : "Create invoice"}
          </button> : null}
        </div>
      </header>

      {editingTemplate ? (
        <div className="fixed inset-0 z-50 grid items-end bg-black/35 p-0 sm:items-center sm:p-6" role="presentation">
          <button type="button" aria-label="Close invoice template" className="absolute inset-0 cursor-default" onClick={() => setEditingTemplate(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="invoice-template-heading" className="relative mx-auto w-full max-w-6xl overflow-hidden bg-white shadow-2xl sm:rounded-lg">
            <InvoiceTemplateEditor apiBase={apiBase} initialTemplate={template} onClose={() => setEditingTemplate(false)} />
          </div>
        </div>
      ) : null}

      {adding ? (
        <div className="fixed inset-0 z-50 grid items-end bg-black/35 p-0 sm:items-center sm:p-6" role="presentation">
          <button type="button" aria-label="Close invoice form" className="absolute inset-0 cursor-default" onClick={() => setAdding(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="new-invoice-heading" className="relative mx-auto max-h-[100dvh] w-full max-w-4xl overflow-y-auto rounded-t-lg bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-lg">
            <NewInvoiceForm apiBase={apiBase} clients={clients} busy={busy} onBusy={setBusy} onError={setError} onClose={() => setAdding(false)} />
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <div className="flex flex-wrap gap-2 border-b border-black/10 pb-3">
          <input className="min-h-10 min-w-56 flex-1 rounded-md border border-black/15 bg-white px-3 text-sm" type="search" placeholder="Search invoice number or note" value={query} onChange={e => setQuery(e.target.value)} />
          <select className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm" aria-label="Invoice status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as InvoiceStatus | "all")}>
            <option value="all">All</option>
            {(Object.keys(STATUS_LABEL) as InvoiceStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
      </div>

      {invoices.length === 0 ? (
        <div className="border-y border-dashed border-black/15 py-12 text-center" role="status">
          <h3>No invoices yet</h3>
          <p>Issue your first invoice to start tracking client payments.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-y border-dashed border-black/15 py-12 text-center" role="status">
          <h3>No matches</h3>
          <p>No invoices match the current filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-black/10 text-left text-[11px] uppercase tracking-wide text-black/45"><tr><th className="py-2">Invoice</th><th className="py-2">Client</th><th className="py-2">Issued / due</th><th className="py-2 text-right">Total</th><th className="py-2">Status</th><th className="py-2 text-right">Action</th></tr></thead>
          <tbody>
          {filtered.map(i => (
            <tr key={i.id} className="border-b border-black/[0.07]">
                <td className="py-3 font-medium text-black/80"><Link className="underline decoration-black/20 underline-offset-2 hover:decoration-black" href={`/portal/agency/agency-finance/invoices/${i.id}`}>{i.number}</Link></td>
                <td className="py-3 text-black/60">{clientNames.get(i.clientId) ?? i.clientId}</td>
                <td className="py-3 text-black/55">{new Date(i.issuedAt).toLocaleDateString("en-GB")} · {new Date(i.dueAt).toLocaleDateString("en-GB")}</td>
                <td className="py-3 text-right font-mono font-semibold">{new Intl.NumberFormat("en-GB", { style: "currency", currency: i.currency.toUpperCase() }).format(i.totalCents / 100)}</td>
                <td className="py-3"><span className="rounded-full bg-black/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-black/60">{STATUS_LABEL[i.status]}</span></td>
                <td className="py-3 text-right">
                {canMutate && i.status === "sent" && (
                  <MarkPaidButton apiBase={apiBase} invoiceId={i.id} />
                )}
                {canMutate && i.status === "draft" ? <IssueButton apiBase={apiBase} invoiceId={i.id} /> : null}
                <Link href={`/portal/agency/agency-finance/invoices/${i.id}`} className="ml-2 rounded-md border border-black/15 px-2 py-1 text-xs font-medium">Inspect</Link>
                </td>
            </tr>
          ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}

function IssueButton({ apiBase, invoiceId }: { apiBase: string; invoiceId: string }) {
  const [busy, setBusy] = useState(false);
  return <button type="button" disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/invoices`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: invoiceId, patch: { status: "sent" } }),
      });
      if (response.ok) window.location.reload();
    } finally { setBusy(false); }
  }} className="rounded-md border border-black/15 px-2 py-1 text-xs font-medium">{busy ? "Issuing…" : "Issue"}</button>;
}

function NewInvoiceForm({ apiBase, clients, busy, onBusy, onError, onClose }: {
  apiBase: string;
  clients: Client[];
  busy: boolean;
  onBusy: (value: boolean) => void;
  onError: (value: string | null) => void;
  onClose: () => void;
}) {
  const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm";
  return (
    <form className="p-5 sm:p-6" onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const netCents = Math.round(Number(data.get("netAmount") ?? 0) * 100);
      const taxRate = Number(data.get("taxRate") ?? 0);
      const taxCents = Math.round(netCents * taxRate / 100);
      if (!data.get("clientId") || !data.get("description") || netCents <= 0) {
        onError("Choose a client, describe the work, and enter a positive amount.");
        return;
      }
      onBusy(true);
      onError(null);
      try {
        const response = await fetch(`${apiBase}/invoices`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId: String(data.get("clientId")),
            dueAt: Date.parse(String(data.get("dueAt"))) || Date.now() + 14 * 86_400_000,
            lineItems: [{ description: String(data.get("description")).trim(), quantity: 1, unitCents: netCents }],
            taxCents,
            currency: "gbp",
            notes: String(data.get("notes") ?? "").trim() || undefined,
          }),
        });
        const result = await response.json() as { ok?: boolean; error?: string; invoice?: Invoice };
        if (!response.ok || !result.ok) {
          onError(result.error ?? "Could not create invoice.");
          return;
        }
        if (data.get("issueNow") === "on" && result.invoice) {
          await fetch(`${apiBase}/invoices`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: result.invoice.id, patch: { status: "sent" } }),
          });
        }
        window.location.reload();
      } finally { onBusy(false); }
    }}>
      <div className="flex items-start justify-between gap-4">
        <div><h2 id="new-invoice-heading" className="text-lg font-semibold text-black/85">New invoice</h2><p className="mt-1 text-sm text-black/45">Create a private draft or issue it to the client now.</p></div>
        <button type="button" onClick={onClose} aria-label="Close" title="Close" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/5"><X size={16} /></button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-medium text-black/60">Client<select name="clientId" required defaultValue="" className={control}><option value="" disabled>Choose client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-medium text-black/60 sm:col-span-2">Service or product<input name="description" required className={control} placeholder="Website design and development" /></label>
        <label className="grid gap-1 text-xs font-medium text-black/60">Net amount (£)<input name="netAmount" type="number" min="0.01" step="0.01" required className={control} /></label>
        <label className="grid gap-1 text-xs font-medium text-black/60">Tax rate<select name="taxRate" defaultValue="20" className={control}><option value="0">No tax</option><option value="5">5%</option><option value="20">20% VAT</option></select></label>
        <label className="grid gap-1 text-xs font-medium text-black/60">Payment due<input name="dueAt" type="date" defaultValue={new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)} className={control} /></label>
        <label className="grid gap-1 text-xs font-medium text-black/60 sm:col-span-2">Internal note<input name="notes" className={control} /></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-black/65"><input name="issueNow" type="checkbox" /> Issue now instead of saving a draft</label>
        <button disabled={busy} className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save invoice"}</button>
      </div>
    </form>
  );
}

function MarkPaidButton({ apiBase, invoiceId }: { apiBase: string; invoiceId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="rounded-md bg-black px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
      onClick={async () => {
        const ref = window.prompt("External payment reference (e.g. bank txn id):") ?? undefined;
        setBusy(true);
        try {
          await fetch(`${apiBase}/invoices/mark-paid`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: invoiceId, externalRef: ref }),
          });
          window.location.reload();
        } finally { setBusy(false); }
      }}
    >
      {busy ? "…" : "Mark paid"}
    </button>
  );
}
