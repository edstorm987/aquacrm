"use client";

import { useMemo, useState } from "react";
import { Banknote, CreditCard, Download, Eye, Landmark, Plus, Search, Wallet, X, type LucideIcon } from "lucide-react";

import type { Currency, IncomeEntry, Invoice, Payment, PaymentMethod, Refund } from "../lib/domain";
import type { Client } from "../lib/tenancy";
import { SUPPORTED_CURRENCIES, formatMoney } from "../lib/currencies";
import { PAYMENT_CHANNELS, channelMeta, normaliseChannel, type PaymentChannel } from "../lib/channels";
import { summariseMoneyInByChannel } from "../lib/moneyIn";
import { FinanceNav } from "./FinanceNav";
import { businessCalendarDate, dateInputValue, formatUkDate } from "../lib/safeDate";
import { invoiceOutstandingCents, isCollectibleInvoiceStatus } from "../lib/paymentAllocation";

const CHANNEL_ICONS: Record<PaymentChannel, LucideIcon> = {
  stripe: CreditCard,
  "bank-transfer": Landmark,
  cash: Banknote,
  other: Wallet,
};

// A one-time idempotency key per record-modal instance: a double-click / retry
// on the same open form carries the same key, so the server records it once.
// Recording a *second* payment means re-opening the form → a fresh key → allowed.
function freshIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

type IncomeRow = {
  id: string;
  title?: string;
  paymentId?: string;
  invoiceId?: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  amountCents: number;
  currency: Currency;
  method: PaymentMethod;
  paidAt: number;
  notes?: string;
  externalRef?: string;
  category?: string;
  description?: string;
  source: "payment" | "refund" | "legacy-invoice" | "other-income";
};

const inputClass = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/35";

export function IncomeSheet({ payments, refunds, otherIncome, invoices, clients, apiBase }: { payments: Payment[]; refunds: Refund[]; otherIncome: IncomeEntry[]; invoices: Invoice[]; clients: Client[]; apiBase: string }) {
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState<PaymentChannel | "all">("all");
  const [selected, setSelected] = useState<IncomeRow | null>(null);
  const [adding, setAdding] = useState<"invoice" | "other" | null>(null);
  const invoiceById = new Map(invoices.map(invoice => [invoice.id, invoice]));
  const clientById = new Map(clients.map(client => [client.id, client]));
  const paymentInvoiceIds = new Set(payments.map(payment => payment.invoiceId));
  const rows: IncomeRow[] = [
    ...payments.map(payment => {
      const invoice = invoiceById.get(payment.invoiceId);
      return {
        id: payment.id,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        invoiceNumber: invoice?.number ?? payment.invoiceId,
        clientId: payment.clientId,
        clientName: clientById.get(payment.clientId)?.name ?? "Unknown client",
        amountCents: payment.amountCents,
        currency: payment.currency,
        method: payment.method,
        paidAt: payment.paidAt,
        notes: payment.notes,
        externalRef: payment.externalRef,
        source: "payment" as const,
      };
    }),
    ...refunds.map(refund => {
      const payment = payments.find(item => item.id === refund.paymentId);
      const invoice = invoiceById.get(refund.invoiceId);
      return {
        id: refund.id,
        title: "Refund",
        paymentId: refund.paymentId,
        invoiceId: refund.invoiceId,
        invoiceNumber: invoice?.number ?? refund.invoiceId,
        clientId: refund.clientId,
        clientName: clientById.get(refund.clientId)?.name ?? "Unknown client",
        amountCents: -refund.amountCents,
        currency: refund.currency,
        method: payment?.method ?? "other",
        paidAt: refund.refundedAt,
        notes: refund.reason,
        externalRef: refund.providerId,
        source: "refund" as const,
      };
    }),
    ...invoices.filter(invoice => invoice.status === "paid" && !paymentInvoiceIds.has(invoice.id)).map(invoice => ({
      id: `invoice-${invoice.id}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      clientId: invoice.clientId,
      clientName: clientById.get(invoice.clientId)?.name ?? "Unknown client",
      amountCents: invoice.totalCents,
      currency: invoice.currency,
      method: (invoice.paidVia ?? "manual") as PaymentMethod,
      paidAt: invoice.paidAt ?? invoice.updatedAt,
      notes: invoice.notes,
      externalRef: invoice.externalRef,
      source: "legacy-invoice" as const,
    })),
    ...otherIncome.map(entry => ({
      id: entry.id,
      clientId: entry.clientId ?? "",
      clientName: entry.clientId ? clientById.get(entry.clientId)?.name ?? "Unknown client" : "Not client-linked",
      invoiceNumber: "Non-invoice income",
      amountCents: entry.amountCents,
      currency: entry.currency,
      method: entry.method,
      paidAt: entry.receivedAt,
      notes: entry.notes,
      externalRef: entry.reference,
      category: entry.category,
      description: entry.description,
      source: "other-income" as const,
      title: entry.title,
    })),
  ].sort((a, b) => b.paidAt - a.paidAt);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row => {
      if (clientFilter !== "all" && row.clientId !== clientFilter) return false;
      if (channelFilter !== "all" && normaliseChannel(row.method) !== channelFilter) return false;
      return !needle || `${row.title ?? ""} ${row.clientName} ${row.invoiceNumber} ${row.category ?? ""} ${row.description ?? ""} ${row.externalRef ?? ""} ${row.notes ?? ""}`.toLowerCase().includes(needle);
    });
  }, [channelFilter, clientFilter, query, rows]);
  const moneyInByChannel = summariseMoneyInByChannel(rows);
  const total = totalsByCurrency(filtered);
  const thisMonth = rows.filter(row => {
    const date = new Date(row.paidAt);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });

  function exportCsv() {
    const header = ["Date", "Source", "Client", "Invoice", "Category", "Channel", "Amount", "Currency", "Reference", "Description", "Notes", "Payment ID"];
    const data = filtered.map(row => [
      dateInputValue(row.paidAt), row.title ?? "Invoice payment", row.clientName, row.invoiceNumber,
      row.category, channelMeta(normaliseChannel(row.method)).label, (row.amountCents / 100).toFixed(2), row.currency.toUpperCase(), row.externalRef,
      row.description, row.notes, row.paymentId,
    ]);
    downloadCsv("milesymedia-income", [header, ...data]);
  }

  return <section className="mx-auto w-full max-w-6xl space-y-6 pb-12">
    <FinanceNav active="income" />
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-black/45">Finance</p><h1 className="mt-1 text-2xl font-semibold text-black/90">Cash movement sheet</h1><p className="mt-1 text-sm text-black/55">Gross receipts and refund reversals across every channel. Positive and negative movements stay tied to their invoice and provider reference.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={exportCsv} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium"><Download size={16} />Export CSV</button><button type="button" onClick={() => setAdding("invoice")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium"><Plus size={16} />Invoice payment</button><button type="button" onClick={() => setAdding("other")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={16} />Other income</button></div>
    </header>
    <dl className="grid grid-cols-2 border-y border-black/10 sm:grid-cols-4">
      <Summary label="Net cash movement" value={formatTotals(totalsByCurrency(rows))} />
      <Summary label="This month" value={formatTotals(totalsByCurrency(thisMonth))} />
      <Summary label="Visible total" value={formatTotals(total)} />
      <Summary label="Transactions" value={String(filtered.length)} />
    </dl>
    <section aria-label="Money in by channel" className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-black/45">Money in by channel</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {moneyInByChannel.channels.map(channel => {
          const Icon = CHANNEL_ICONS[channel.channel];
          const active = channelFilter === channel.channel;
          return <button key={channel.channel} type="button" aria-pressed={active} onClick={() => setChannelFilter(active ? "all" : channel.channel)} className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${active ? "border-black/40 bg-black/[0.03]" : "border-black/10 hover:border-black/25"}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/[0.04] text-black/60"><Icon size={17} aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block text-xs text-black/45">{channel.label}{channel.kind === "automated" ? " · auto" : ""}</span>
              <span className="block truncate text-sm font-semibold text-black/85">{formatTotals(channel.totalsByCurrency)}</span>
              <span className="block text-[11px] text-black/40">{channel.count} {channel.count === 1 ? "receipt" : "receipts"}</span>
            </span>
          </button>;
        })}
      </div>
    </section>
    <div className="flex flex-wrap gap-2 border-b border-black/10 pb-3">
      <label className="relative min-w-56 flex-1"><span className="sr-only">Search income</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} className={`${inputClass} pl-9`} placeholder="Search income, client, invoice, or reference" /></label>
      <select aria-label="Filter income by client" value={clientFilter} onChange={event => setClientFilter(event.target.value)} className={`${inputClass} min-w-44 sm:!w-auto`}><option value="all">All clients</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
      <select aria-label="Filter income by channel" value={channelFilter} onChange={event => setChannelFilter(event.target.value as PaymentChannel | "all")} className={`${inputClass} min-w-40 sm:!w-auto`}><option value="all">All channels</option>{PAYMENT_CHANNELS.map(channel => <option key={channel.channel} value={channel.channel}>{channel.label}</option>)}</select>
    </div>
    {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="border-b border-black/10 text-left text-[11px] uppercase tracking-wide text-black/45"><tr><th className="px-2 py-3">Received</th><th className="px-2 py-3">Client / source</th><th className="px-2 py-3">Invoice or type</th><th className="px-2 py-3">Channel</th><th className="px-2 py-3">Reference</th><th className="px-2 py-3 text-right">Amount</th><th className="px-2 py-3 text-right">Inspect</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id} className="border-b border-black/[0.07] hover:bg-black/[0.015]"><td className="px-2 py-3 text-black/55">{date(row.paidAt)}</td><td className="px-2 py-3 font-medium text-black/80">{row.source === "other-income" ? row.title : row.clientName}<span className="mt-0.5 block text-xs font-normal text-black/40">{row.source === "other-income" ? row.clientName : ""}</span></td><td className="px-2 py-3">{row.invoiceId ? <a href={`/portal/agency/agency-finance/invoices/${row.invoiceId}`} className="font-mono text-xs underline-offset-2 hover:underline">{row.invoiceNumber}</a> : <span className="text-xs text-black/55">{row.category || "Other income"}</span>}</td><td className="px-2 py-3"><ChannelBadge method={row.method} /></td><td className="max-w-44 truncate px-2 py-3 text-black/45">{row.externalRef || "—"}</td><td className="px-2 py-3 text-right font-mono font-semibold">{money(row.amountCents, row.currency)}</td><td className="px-2 py-3 text-right"><button type="button" onClick={() => setSelected(row)} aria-label={`Inspect ${row.title ?? row.invoiceNumber} income`} className="inline-grid size-8 place-items-center rounded-md border border-black/10 text-black/50"><Eye size={15} /></button></td></tr>)}</tbody></table></div> : <Empty text="No income matches these filters." />}
    {selected ? <IncomeDetail row={selected} onClose={() => setSelected(null)} /> : null}
    {adding === "invoice" ? <RecordIncome invoices={invoices} payments={payments} refunds={refunds} apiBase={apiBase} onClose={() => setAdding(null)} /> : null}
    {adding === "other" ? <RecordOtherIncome clients={clients} apiBase={apiBase} onClose={() => setAdding(null)} /> : null}
  </section>;
}

function RecordIncome({ invoices, payments, refunds, apiBase, onClose }: { invoices: Invoice[]; payments: Payment[]; refunds: Refund[]; apiBase: string; onClose: () => void }) {
  const available = invoices.filter(invoice => isCollectibleInvoiceStatus(invoice.status) && invoiceOutstandingCents(invoice, payments, refunds) > 0);
  const [invoiceId, setInvoiceId] = useState(available[0]?.id ?? "");
  const [channel, setChannel] = useState<PaymentChannel>("bank-transfer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(freshIdempotencyKey);
  const invoice = invoices.find(item => item.id === invoiceId);
  const remaining = invoice ? invoiceOutstandingCents(invoice, payments, refunds) : 0;
  return <Modal title="Record income" onClose={onClose}><form className="grid gap-4" onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(""); const response = await fetch(`${apiBase}/payments/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoiceId, amountCents: Math.round(Number(data.get("amount")) * 100), currency: invoice?.currency ?? "gbp", method: data.get("method"), paidAt: Date.parse(String(data.get("paidAt"))), externalRef: String(data.get("externalRef") ?? "").trim() || undefined, notes: String(data.get("notes") ?? "").trim() || undefined, idempotencyKey }) }); const result = await response.json().catch(() => null); setBusy(false); if (!response.ok || !result?.ok) return setError(result?.error ?? "Income could not be recorded."); window.location.reload(); }}>
    {available.length ? <><label className={labelClass}>Invoice<select value={invoiceId} onChange={event => setInvoiceId(event.target.value)} className={inputClass}>{available.map(item => <option key={item.id} value={item.id}>{item.number} · {money(invoiceOutstandingCents(item, payments, refunds), item.currency)} outstanding</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Amount received<input required name="amount" type="number" min="0.01" max={(remaining / 100).toFixed(2)} step="0.01" defaultValue={(remaining / 100).toFixed(2)} key={invoiceId} className={inputClass} /></label><label className={labelClass}>Date received<input required name="paidAt" type="date" defaultValue={businessCalendarDate()} className={inputClass} /></label><label className={labelClass}>Channel<select name="method" value={channel} onChange={event => setChannel(event.target.value as PaymentChannel)} className={inputClass}>{PAYMENT_CHANNELS.map(option => <option key={option.channel} value={option.channel}>{option.label}</option>)}</select></label><label className={labelClass}>{channelMeta(channel).referenceLabel}<input name="externalRef" className={inputClass} /></label></div><label className={labelClass}>Notes<textarea name="notes" rows={3} className={`${inputClass} py-2`} /></label>{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<button disabled={busy} className="ml-auto min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Recording..." : "Record income"}</button></> : <Empty text="No collectible invoice has an outstanding balance." />}
  </form></Modal>;
}

function RecordOtherIncome({ clients, apiBase, onClose }: { clients: Client[]; apiBase: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<PaymentChannel>("bank-transfer");
  const [idempotencyKey] = useState(freshIdempotencyKey);

  return <Modal title="Add other income" onClose={onClose}><form className="grid gap-4" onSubmit={async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    const response = await fetch(`${apiBase}/income`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: String(data.get("title") ?? "").trim(),
        amountCents: Math.round(Number(data.get("amount")) * 100),
        receivedAt: Date.parse(String(data.get("receivedAt"))),
        method: data.get("method"),
        clientId: String(data.get("clientId") ?? "").trim() || undefined,
        category: String(data.get("category") ?? "").trim() || undefined,
        reference: String(data.get("reference") ?? "").trim() || undefined,
        description: String(data.get("description") ?? "").trim() || undefined,
        notes: String(data.get("notes") ?? "").trim() || undefined,
        currency: String(data.get("currency") ?? "gbp"),
        idempotencyKey,
      }),
    });
    const result = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok || !result?.ok) return setError(result?.error ?? "Income could not be added.");
    window.location.reload();
  }}>
    <label className={labelClass}>What is this income?<input required name="title" autoFocus placeholder="For example, referral fee" className={inputClass} /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>Amount received<input required name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" className={inputClass} /></label>
      <label className={labelClass}>Currency<select name="currency" defaultValue="gbp" className={inputClass}>{SUPPORTED_CURRENCIES.map(currency => <option key={currency.code} value={currency.code}>{currency.label}</option>)}</select></label>
      <label className={labelClass}>Date received<input required name="receivedAt" type="date" defaultValue={businessCalendarDate()} className={inputClass} /></label>
      <label className={labelClass}>Income category<input name="category" placeholder="For example, referral" className={inputClass} /></label>
      <label className={labelClass}>Channel<select name="method" value={channel} onChange={event => setChannel(event.target.value as PaymentChannel)} className={inputClass}>{PAYMENT_CHANNELS.map(option => <option key={option.channel} value={option.channel}>{option.label}</option>)}</select></label>
      <label className={labelClass}>Link to a client (optional)<select name="clientId" defaultValue="" className={inputClass}><option value="">No client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
      <label className={labelClass}>{channelMeta(channel).referenceLabel} (optional)<input name="reference" placeholder="Bank or payment reference" className={inputClass} /></label>
    </div>
    <label className={labelClass}>Description (optional)<textarea name="description" rows={2} placeholder="What the income was for" className={`${inputClass} py-2`} /></label>
    <label className={labelClass}>Internal notes (optional)<textarea name="notes" rows={3} className={`${inputClass} py-2`} /></label>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <button disabled={busy} className="ml-auto min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Adding..." : "Add income"}</button>
  </form></Modal>;
}

function IncomeDetail({ row, onClose }: { row: IncomeRow; onClose: () => void }) {
  return <Modal title="Income details" onClose={onClose}><dl className="grid gap-0 divide-y divide-black/10 border-y border-black/10">{row.title ? <Detail label="Income" value={row.title} strong /> : null}<Detail label="Amount" value={money(row.amountCents, row.currency)} strong /><Detail label="Received" value={date(row.paidAt)} /><Detail label="Client" value={row.clientName} /><Detail label="Invoice" value={row.invoiceId ? row.invoiceNumber : "Not invoice-linked"} />{row.category ? <Detail label="Category" value={row.category} /> : null}<Detail label="Channel" value={channelMeta(normaliseChannel(row.method)).label} /><Detail label="Reference" value={row.externalRef || "Not recorded"} />{row.description ? <Detail label="Description" value={row.description} /> : null}<Detail label="Notes" value={row.notes || "No notes"} /><Detail label={row.paymentId ? "Payment ID" : "Record ID"} value={row.paymentId || row.id} /></dl>{row.invoiceId ? <a href={`/portal/agency/agency-finance/invoices/${row.invoiceId}`} className="mt-5 inline-flex min-h-10 items-center rounded-md bg-black px-4 text-sm font-semibold text-white">Inspect invoice</a> : null}</Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[90] grid items-end bg-black/35 sm:items-center sm:p-6"><button className="absolute inset-0" aria-label="Close" onClick={onClose} /><section role="dialog" aria-modal="true" aria-label={title} className="relative mx-auto max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg sm:p-6"><header className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">{title}</h2><button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-md border border-black/10"><X size={16} /></button></header>{children}</section></div>; }
function Summary({ label: text, value }: { label: string; value: string }) { return <div className="px-3 py-4 first:pl-0"><dt className="text-xs text-black/45">{text}</dt><dd className="mt-1 text-xl font-semibold text-black/85">{value}</dd></div>; }
function Detail({ label: text, value, strong }: { label: string; value: string; strong?: boolean }) { return <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 py-3 text-sm"><dt className="text-black/45">{text}</dt><dd className={`${strong ? "font-semibold" : ""} break-words text-black/80`}>{value}</dd></div>; }
function Empty({ text }: { text: string }) { return <div className="grid min-h-44 place-items-center border-y border-black/10 text-center text-sm text-black/45">{text}</div>; }
function ChannelBadge({ method }: { method: PaymentMethod }) {
  const channel = normaliseChannel(method);
  const Icon = CHANNEL_ICONS[channel];
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-2 py-0.5 text-xs text-black/60"><Icon size={12} aria-hidden="true" />{channelMeta(channel).label}</span>;
}
function money(cents: number, currency: string) { return formatMoney(cents, currency); }
function totalsByCurrency(rows: IncomeRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amountCents);
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
}
function formatTotals(totals: Array<[string, number]>) {
  if (!totals.length) return money(0, "gbp");
  return totals.map(([currency, cents]) => money(cents, currency)).join(" / ");
}
function date(value: number) { return formatUkDate(value, { day: "numeric", month: "short", year: "numeric" }); }
function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`; }
function downloadCsv(name: string, rows: unknown[][]) { const blob = new Blob([rows.map(row => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${name}-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url); }
const labelClass = "grid gap-1 text-xs font-medium text-black/60";
