"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClientContract } from "@/lib/clientContracts";
import { ContractsPanel } from "./_ContractsPanel";

interface Invoice {
  id: string;
  number: string;
  issuedAt: number;
  dueAt: number;
  totalCents: number;
  currency: "usd" | "gbp" | "eur" | string;
  status: "draft" | "sent" | "paid" | "overdue" | "void";
  paidAt?: number;
  lineItems?: Array<{ description: string }>;
  notes?: string;
}

interface InitialState {
  planTier?: "foundational" | "expansion" | "mastery";
  lockInPaid?: boolean;
  stripeLink?: string;
}

const PLAN_LABELS: Record<NonNullable<InitialState["planTier"]>, string> = {
  foundational: "Foundational Flow",
  expansion: "Expansion Plan",
  mastery: "Mastery Plan",
};

const STATUS_PALETTE: Record<Invoice["status"], string> = {
  draft:   "bg-black/5 text-black/60",
  sent:    "bg-blue-50 text-blue-800",
  paid:    "bg-emerald-50 text-emerald-800",
  overdue: "bg-red-50 text-red-800",
  void:    "bg-black/10 text-black/45",
};

function fmtMoney(cents: number, currency: string): string {
  const v = (cents / 100).toFixed(2);
  const code = currency.toUpperCase();
  const sym = code === "GBP" ? "£" : code === "USD" ? "$" : code === "EUR" ? "€" : `${code} `;
  return `${sym}${v}`;
}

function fmtDate(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ts));
}

function defaultDueDate(): string {
  const due = new Date();
  due.setDate(due.getDate() + 14);
  return due.toISOString().slice(0, 10);
}

export function FinanceTabClient({
  clientId,
  initial,
  initialContracts,
}: {
  clientId: string;
  initial: InitialState;
  initialContracts: ClientContract[];
}) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pluginMissing, setPluginMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    description: "",
    amount: "",
    dueAt: defaultDueDate(),
    notes: "",
    status: "draft" as "draft" | "sent" | "paid",
  });

  async function refresh() {
    try {
      const res = await fetch(`/api/portal/agency-finance/invoices?clientId=${encodeURIComponent(clientId)}`, { method: "GET" });
      if (!res.ok) {
        setPluginMissing(true);
        setInvoices([]);
        return;
      }
      const data = await res.json() as { ok: boolean; invoices?: Invoice[] };
      setInvoices(data.invoices ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function addManualInvoice() {
    setError(null);
    const amountFloat = parseFloat(draft.amount);
    if (!draft.description.trim() || !Number.isFinite(amountFloat) || amountFloat <= 0) {
      setError("Add a service description and a positive amount.");
      return;
    }
    const cents = Math.round(amountFloat * 100);
    const dueTs = draft.dueAt ? Date.parse(draft.dueAt) : Date.now() + 14 * 86_400_000;
    setBusy(true);
    try {
      const createRes = await fetch("/api/portal/agency-finance/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          issuedAt: Date.now(),
          dueAt: dueTs,
          lineItems: [{ description: draft.description.trim(), quantity: 1, unitCents: cents }],
          taxCents: 0,
          currency: "gbp",
          notes: draft.notes.trim() || undefined,
        }),
      });
      const data = await createRes.json() as { ok: boolean; invoice?: Invoice; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Add invoice failed.");
        return;
      }
      if (data.invoice && draft.status === "sent") {
        await updateInvoiceStatus(data.invoice.id, "sent", false);
      }
      if (data.invoice && draft.status === "paid") {
        await updateInvoiceStatus(data.invoice.id, "sent", false);
        await markPaid(data.invoice.id, false);
      }
      setDraft({
        description: "",
        amount: "",
        dueAt: defaultDueDate(),
        notes: "",
        status: "draft",
      });
      setAdding(false);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateInvoiceStatus(id: string, status: Invoice["status"], shouldRefresh = true) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/agency-finance/invoices", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, patch: { status } }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Invoice update failed.");
        return;
      }
      if (shouldRefresh) await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(id: string, shouldRefresh = true) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/agency-finance/invoices/mark-paid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, paidVia: "manual" }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Mark paid failed.");
        return;
      }
      if (shouldRefresh) await refresh();
    } finally {
      setBusy(false);
    }
  }

  // 12-month MRR rollup over PAID invoices only — no fabrication
  // (chapter #68 honesty contract).
  const mrrSeries = useMemo(() => {
    if (!invoices || invoices.length === 0) return null;
    const buckets = new Array(12).fill(0) as number[];
    const now = new Date();
    for (const inv of invoices) {
      if (inv.status !== "paid" || !inv.paidAt) continue;
      const d = new Date(inv.paidAt);
      const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (monthsAgo < 0 || monthsAgo > 11) continue;
      buckets[11 - monthsAgo] += inv.totalCents;
    }
    const total = buckets.reduce((a, b) => a + b, 0);
    return total > 0 ? buckets : null;
  }, [invoices]);

  const max = mrrSeries ? Math.max(...mrrSeries) : 0;
  const totalPaid = mrrSeries ? mrrSeries.reduce((a, b) => a + b, 0) : 0;
  const planLabel = initial.planTier ? PLAN_LABELS[initial.planTier] : null;

  return (
    <div data-testid="client-finance-tab" className="flex flex-col gap-4">
      {/* Header strip */}
      <header className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-xs">
        <span className="font-semibold uppercase tracking-wide text-black/55">Plan</span>
        <span className={[
          "rounded-full px-2 py-0.5 font-medium",
          planLabel ? "bg-brand/10 text-brand" : "bg-black/5 text-black/55",
        ].join(" ")}>
          {planLabel ?? "Not set"}
        </span>
        <span className="font-semibold uppercase tracking-wide text-black/55">· Lock-in</span>
        <span className={[
          "rounded-full px-2 py-0.5 font-medium",
          initial.lockInPaid
            ? "bg-emerald-100 text-emerald-800"
            : "border border-black/10 bg-white text-black/55",
        ].join(" ")}>
          {initial.lockInPaid ? "£100 paid" : "Unpaid"}
        </span>
        {initial.stripeLink && (
          <a
            href={initial.stripeLink}
            target="_blank"
            rel="noreferrer"
            className="ml-auto rounded-md border border-black/15 px-2 py-0.5 hover:bg-black/5"
          >
            Open Stripe ↗
          </a>
        )}
      </header>

      {/* MRR strip */}
      <section className="rounded-xl border border-black/10 bg-white p-4">
        <header className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-black/85">12-month paid total</h2>
          {mrrSeries ? (
            <span className="text-base font-semibold text-black/90">{fmtMoney(totalPaid, "GBP")}</span>
          ) : (
            <a href="/portal/agency/agency-finance" className="text-xs text-brand hover:underline">
              Open finance →
            </a>
          )}
        </header>
        {mrrSeries ? (
          <svg
            viewBox={`0 0 240 40`}
            className="mt-2 h-10 w-full"
            aria-label="12-month paid invoice sparkline"
            role="img"
          >
            {mrrSeries.map((v, i) => {
              const h = max > 0 ? (v / max) * 36 : 0;
              return (
                <rect
                  key={i}
                  x={i * 20 + 2}
                  y={40 - h}
                  width={16}
                  height={Math.max(h, v > 0 ? 1 : 0)}
                  fill={v > 0 ? "var(--brand-primary)" : "rgba(0,0,0,0.08)"}
                  rx={2}
                />
              );
            })}
          </svg>
        ) : (
          <p className="mt-1 text-xs text-black/50">
            No paid invoices have been recorded for this client yet.
          </p>
        )}
      </section>

      <ContractsPanel clientId={clientId} initialContracts={initialContracts} />

      {/* Invoices */}
      <section className="rounded-xl border border-black/10 bg-white">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/10 p-3">
          <h2 className="text-sm font-medium text-black/85">Invoices</h2>
          <div className="flex items-center gap-2 text-xs">
            <a href="/portal/agency/agency-finance" className="text-black/55 hover:underline">
              Open agency finance →
            </a>
            {!pluginMissing && (
              <button
                type="button"
                onClick={() => setAdding(o => !o)}
                disabled={busy}
                className="rounded-md border border-black/15 px-2 py-1 hover:bg-black/5 disabled:opacity-50"
              >
                {adding ? "Cancel" : "Create invoice"}
              </button>
            )}
          </div>
        </header>
        {adding && (
          <form
            onSubmit={e => { e.preventDefault(); addManualInvoice(); }}
            className="border-b border-black/10 bg-black/[0.015] p-4"
          >
            <div className="mb-4">
              <p className="text-sm font-medium text-black/85">New invoice</p>
              <p className="mt-1 text-xs text-black/45">
                Milesymedia generates the invoice number. Drafts remain private until sent.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium text-black/60">
                Service or product
                <input
                  type="text"
                  placeholder="Website design and development"
                  value={draft.description}
                  disabled={busy}
                  onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                  className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black"
                  autoFocus
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-black/60">
                Amount
                <div className="flex min-h-10 overflow-hidden rounded-md border border-black/15 bg-white">
                  <span className="grid w-10 place-items-center border-r border-black/10 text-sm text-black/45">£</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={draft.amount}
                    disabled={busy}
                    onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))}
                    className="min-w-0 flex-1 px-3 text-sm font-normal text-black outline-none"
                  />
                </div>
              </label>
              <label className="grid gap-1 text-xs font-medium text-black/60">
                Payment due
                <input
                  type="date"
                  value={draft.dueAt}
                  disabled={busy}
                  onChange={e => setDraft(d => ({ ...d, dueAt: e.target.value }))}
                  className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black"
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-black/60">
                Save as
                <select
                  value={draft.status}
                  disabled={busy}
                  onChange={e => setDraft(d => ({ ...d, status: e.target.value as typeof draft.status }))}
                  className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black"
                >
                  <option value="draft">Draft — review first</option>
                  <option value="sent">Issued — show in client portal</option>
                  <option value="paid">Paid — record an existing payment</option>
                </select>
              </label>
            </div>
            <label className="mt-3 grid gap-1 text-xs font-medium text-black/60">
              Internal note <span className="font-normal text-black/35">(optional)</span>
              <textarea
                rows={2}
                placeholder="Reference, payment terms, or context for the team"
                value={draft.notes}
                disabled={busy}
                onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                className="resize-y rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-normal text-black"
              />
            </label>
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="min-h-10 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : draft.status === "draft" ? "Save draft" : draft.status === "sent" ? "Issue invoice" : "Record paid invoice"}
              </button>
            </div>
          </form>
        )}
        {error && <p role="alert" className="border-b border-black/10 px-3 py-1 text-xs text-red-700">{error}</p>}
        {invoices === null ? (
          <p className="px-3 py-6 text-center text-sm text-black/55">Loading…</p>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <p className="text-sm text-black/65">
              {pluginMissing ? "Finance is not connected yet." : "No invoices yet."}
            </p>
            <a
              href="/portal/agency/agency-finance"
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white shadow hover:opacity-90"
            >
              Open Finance
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-black/[0.02] text-[11px] uppercase tracking-wide text-black/55">
              <tr>
                <th className="px-3 py-2 text-left">Number</th>
                <th className="px-3 py-2 text-left">Issued</th>
                <th className="px-3 py-2 text-left">Due</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-t border-black/5">
                  <td className="px-3 py-2">
                    <p className="font-medium text-black/85">{inv.number}</p>
                    {inv.lineItems?.[0]?.description ? (
                      <p className="mt-0.5 max-w-52 truncate text-xs text-black/45">{inv.lineItems[0].description}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5 text-black/65">{fmtDate(inv.issuedAt)}</td>
                  <td className="px-3 py-1.5 text-black/65">{fmtDate(inv.dueAt)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-black/85">{fmtMoney(inv.totalCents, inv.currency)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_PALETTE[inv.status]}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {inv.status === "draft" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => updateInvoiceStatus(inv.id, "sent")}
                        className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-50"
                      >
                        Send
                      </button>
                    )}
                    {(inv.status === "sent" || inv.status === "overdue") && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => markPaid(inv.id)}
                        className="rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        Mark paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
