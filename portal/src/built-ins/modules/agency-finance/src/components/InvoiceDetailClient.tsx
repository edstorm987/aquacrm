"use client";

import { useMemo, useState } from "react";
import { CreditCard, Download, FilePenLine, Plus, Printer, Trash2, X } from "lucide-react";
import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import type { Invoice, InvoiceTemplate } from "../lib/domain";
import { isFinanceMutationAck, isFinanceMutationHttpsUrl } from "../lib/mutationPayloads";
import { dateInputValue, formatUkDate } from "../lib/safeDate";

const API_BASE = "/api/portal/agency-finance";
const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/35";

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function date(value: number): string {
  return formatUkDate(value, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function InvoiceDetailClient({
  invoice,
  agencyName,
  clientName,
  template,
  stripeConfigured = false,
}: {
  invoice: Invoice;
  agencyName: string;
  clientName: string;
  template: InvoiceTemplate;
  stripeConfigured?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payLink, setPayLink] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [dueAt, setDueAt] = useState(dateInputValue(invoice.dueAt));
  const [taxAmount, setTaxAmount] = useState((invoice.taxCents / 100).toFixed(2));
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [items, setItems] = useState(invoice.lineItems.map(item => ({
    description: item.description,
    quantity: String(item.quantity),
    unitAmount: (item.unitCents / 100).toFixed(2),
  })));

  const draftSubtotal = useMemo(() => items.reduce((sum, item) => {
    return sum + Math.round(Number(item.quantity || 0) * Number(item.unitAmount || 0) * 100);
  }, 0), [items]);
  const draftTax = Math.round(Number(taxAmount || 0) * 100);
  const downloadUrl = `${API_BASE}/invoices/download?id=${encodeURIComponent(invoice.id)}`;
  const printUrl = `${downloadUrl}&print=1`;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await checkedJsonMutation<{ ok: boolean }>(`${API_BASE}/invoices`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: invoice.id, patch: body }),
      }, {
        fallback: "Invoice update failed.",
        validate: isFinanceMutationAck,
      });
      return true;
    } catch (requestError) {
      setError(mutationErrorMessage(requestError, "Invoice update failed."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveAmendments() {
    if (!items.length || items.some(item => !item.description.trim() || Number(item.quantity) <= 0 || Number(item.unitAmount) < 0)) {
      setError("Every line needs a description, positive quantity, and valid unit amount.");
      return;
    }
    const saved = await patch({
      dueAt: Date.parse(dueAt),
      lineItems: items.map(item => ({
        description: item.description.trim(),
        quantity: Number(item.quantity),
        unitCents: Math.round(Number(item.unitAmount) * 100),
      })),
      taxCents: draftTax,
      notes: notes.trim() || undefined,
    });
    if (saved) window.location.reload();
  }

  async function issueInvoice() {
    if (await patch({ status: "sent" })) window.location.reload();
  }

  // Create a Stripe Checkout pay-link for this invoice. The webhook reconciles
  // it to paid; money goes to your Stripe account directly — the app never
  // holds funds.
  async function createPayLink() {
    setPayBusy(true);
    setError(null);
    try {
      const result = await checkedJsonMutation<{ ok: boolean; url?: string }>(`${API_BASE}/invoices/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      }, {
        fallback: "Could not create a pay-link.",
        validate: payload => isFinanceMutationHttpsUrl(payload),
      });
      setPayLink(result.url ?? null);
    } catch (requestError) {
      const message = mutationErrorMessage(requestError, "Could not create a pay-link.");
      setError(message === "stripe_not_configured"
        ? "Set up Stripe in Finance settings to take card payments."
        : message);
    } finally {
      setPayBusy(false);
    }
  }

  const canTakeCard = stripeConfigured && (invoice.status === "sent" || invoice.status === "overdue");

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Invoice</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-black/90">{invoice.number}</h1>
            <span className="rounded-full bg-black/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-black/60">{invoice.status}</span>
          </div>
          <p className="mt-1 text-sm text-black/50">{clientName} · {money(invoice.totalCents, invoice.currency)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={downloadUrl} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium hover:bg-black/[0.03]">
            <Download size={16} aria-hidden /> Download
          </a>
          <a href={printUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium hover:bg-black/[0.03]">
            <Printer size={16} aria-hidden /> Print / save PDF
          </a>
          {canTakeCard ? (
            <button type="button" disabled={payBusy} onClick={createPayLink} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium hover:bg-black/[0.03] disabled:opacity-50">
              <CreditCard size={16} aria-hidden /> {payBusy ? "Creating…" : "Pay by card"}
            </button>
          ) : null}
          {invoice.status === "draft" ? (
            <button type="button" onClick={() => setEditing(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white">
              {editing ? <X size={16} aria-hidden /> : <FilePenLine size={16} aria-hidden />} {editing ? "Cancel" : "Amend"}
            </button>
          ) : null}
        </div>
      </header>

      {invoice.status !== "draft" ? (
        <p className="border-l-2 border-black/25 bg-black/[0.025] px-4 py-3 text-sm text-black/60">
          This invoice has been {invoice.status}. Its financial details are locked to preserve the accounting record.
        </p>
      ) : null}
      {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      {payLink ? (
        <div className="flex flex-wrap items-center gap-3 border-l-2 border-black/25 bg-black/[0.025] px-4 py-3 text-sm">
          <span className="font-medium text-black/70">Stripe pay-link ready.</span>
          <a href={payLink} target="_blank" rel="noreferrer" className="font-medium text-black/80 underline underline-offset-2">Open checkout →</a>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(payLink)} className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs font-medium hover:bg-black/[0.03]">Copy link</button>
          <span className="text-xs text-black/45">Send this to your client. It settles to your Stripe account; the app never holds the funds.</span>
        </div>
      ) : null}

      {editing ? (
        <div className="border-y border-black/10 bg-black/[0.015] p-5">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="font-semibold text-black/85">Amend draft</h2><p className="mt-1 text-sm text-black/45">Changes update the existing draft. The invoice number stays the same.</p></div>
            <button type="button" onClick={() => setItems(current => [...current, { description: "", quantity: "1", unitAmount: "0.00" }])} className="inline-flex items-center gap-1 rounded-md border border-black/15 bg-white px-2 py-1.5 text-xs font-medium"><Plus size={14} /> Add line</button>
          </div>
          <div className="mt-5 space-y-3">
            {items.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_100px_140px_36px] sm:items-end">
                <label className="grid gap-1 text-xs font-medium text-black/55">Description<input className={control} value={item.description} onChange={event => setItems(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, description: event.target.value } : row))} /></label>
                <label className="grid gap-1 text-xs font-medium text-black/55">Quantity<input className={control} type="number" min="0.01" step="0.01" value={item.quantity} onChange={event => setItems(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row))} /></label>
                <label className="grid gap-1 text-xs font-medium text-black/55">Unit amount<input className={control} type="number" min="0" step="0.01" value={item.unitAmount} onChange={event => setItems(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, unitAmount: event.target.value } : row))} /></label>
                <button type="button" aria-label={`Remove line ${index + 1}`} title="Remove line" disabled={items.length === 1} onClick={() => setItems(current => current.filter((_, rowIndex) => rowIndex !== index))} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45 hover:bg-red-50 hover:text-red-700 disabled:opacity-25"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-black/55">Payment due<input className={control} type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/55">Tax amount<input className={control} type="number" min="0" step="0.01" value={taxAmount} onChange={event => setTaxAmount(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/55 sm:col-span-2">Invoice note<textarea rows={3} className="w-full resize-y rounded-md border border-black/15 bg-white px-3 py-2 text-sm" value={notes} onChange={event => setNotes(event.target.value)} /></label>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
            <p className="text-sm text-black/55">Updated total: <strong className="text-black/85">{money(draftSubtotal + draftTax, invoice.currency)}</strong></p>
            <button type="button" disabled={busy} onClick={saveAmendments} className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save amendments"}</button>
          </div>
        </div>
      ) : null}

      <article className="relative mx-auto min-h-[720px] max-w-4xl overflow-hidden border border-black/10 bg-white shadow-sm">
        {template.letterheadDataUrl ? <img src={template.letterheadDataUrl} alt="" className="absolute inset-0 size-full object-cover" /> : null}
        <div className="relative z-10 p-6 sm:p-10 lg:p-14">
        <div className="flex flex-wrap items-start justify-between gap-8 border-b-[3px] pb-7" style={{ borderColor: template.accentColor }}>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">{template.documentTitle}</p><h2 className="mt-2 text-xl font-semibold text-black/90">{agencyName}</h2>{template.businessDetails ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-black/50">{template.businessDetails}</p> : null}</div>
          <div className="text-right"><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Invoice</p><p className="mt-2 text-2xl font-semibold text-black/90">{invoice.number}</p></div>
        </div>
        <div className="grid gap-8 py-8 sm:grid-cols-2">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Bill to</p><p className="mt-2 font-semibold text-black/85">{clientName}</p></div>
          <dl className="grid gap-2 text-sm sm:text-right"><div><dt className="inline text-black/45">Issued </dt><dd className="inline text-black/75">{date(invoice.issuedAt)}</dd></div><div><dt className="inline text-black/45">Due </dt><dd className="inline text-black/75">{date(invoice.dueAt)}</dd></div></dl>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-black/15 text-left text-[11px] uppercase tracking-wide text-black/45"><tr><th className="py-3">Description</th><th className="py-3 text-right">Qty</th><th className="py-3 text-right">Unit</th><th className="py-3 text-right">Total</th></tr></thead>
            <tbody>{invoice.lineItems.map((item, index) => <tr key={`${item.description}-${index}`} className="border-b border-black/[0.07]"><td className="py-4 pr-4 font-medium text-black/80">{item.description}</td><td className="py-4 text-right text-black/55">{item.quantity}</td><td className="py-4 text-right font-mono text-black/55">{money(item.unitCents, invoice.currency)}</td><td className="py-4 text-right font-mono font-semibold text-black/80">{money(item.totalCents, invoice.currency)}</td></tr>)}</tbody>
          </table>
        </div>
        <dl className="ml-auto mt-8 max-w-sm divide-y divide-black/10 text-sm">
          <Total label="Subtotal" value={money(invoice.subtotalCents, invoice.currency)} />
          <Total label="Tax" value={money(invoice.taxCents, invoice.currency)} />
          <Total label="Total" value={money(invoice.totalCents, invoice.currency)} strong />
        </dl>
        {invoice.notes ? <div className="mt-10 border-t border-black/10 pt-5"><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/60">{invoice.notes}</p></div> : null}
        {template.paymentDetails ? <div className="mt-8 border-t border-black/10 pt-5"><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Payment details</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-black/60">{template.paymentDetails}</p></div> : null}
        {template.footerText ? <p className="mt-12 border-t border-black/10 pt-4 text-center text-xs leading-5 text-black/40">{template.footerText}</p> : null}
        </div>
      </article>

      {invoice.status === "draft" ? (
        <div className="flex justify-end"><button type="button" disabled={busy} onClick={issueInvoice} className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Issuing…" : "Issue invoice"}</button></div>
      ) : null}
    </section>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-4 py-3"><dt className={strong ? "font-semibold text-black/85" : "text-black/55"}>{label}</dt><dd className={`font-mono ${strong ? "text-lg font-semibold text-black/90" : "text-black/70"}`}>{value}</dd></div>;
}
