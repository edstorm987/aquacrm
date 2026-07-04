"use client";

// Per-client Finance tab (T1 R11). Pulls from T2's `agency-finance`
// plugin; falls back to client metadata + honesty CTA per chapter §68
// honesty contract — no fabricated MRR / invoice numbers.

import { useEffect, useMemo, useState } from "react";

interface Invoice {
  id: string;
  number: string;
  issuedAt: number;
  dueAt: number;
  totalCents: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "overdue" | "void";
  paidAt?: number;
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
  const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  return `${sym}${v}`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

export function FinanceTabClient({
  clientId,
  initial,
}: {
  clientId: string;
  initial: InitialState;
}) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pluginMissing, setPluginMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ number: "", amount: "", dueAt: "", status: "draft" as Invoice["status"] });

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
    if (!draft.number.trim() || !Number.isFinite(amountFloat) || amountFloat <= 0) {
      setError("Number + positive amount required.");
      return;
    }
    const cents = Math.round(amountFloat * 100);
    const dueTs = draft.dueAt ? Date.parse(draft.dueAt) : Date.now() + 14 * 86_400_000;
    setBusy(true);
    try {
      const res = await fetch("/api/portal/agency-finance/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          number: draft.number.trim(),
          issuedAt: Date.now(),
          dueAt: dueTs,
          lineItems: [{ description: "Manual entry", quantity: 1, unitPriceCents: cents }],
          subtotalCents: cents,
          taxCents: 0,
          totalCents: cents,
          currency: "GBP",
          status: draft.status,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Add invoice failed.");
        return;
      }
      setDraft({ number: "", amount: "", dueAt: "", status: "draft" });
      setAdding(false);
      refresh();
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
          planLabel ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]" : "bg-black/5 text-black/55",
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
            <a href="/portal/agency/agency-finance" className="text-xs text-[var(--brand-primary)] hover:underline">
              Connect billing →
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
          <p className="mt-1 text-xs italic text-black/55">
            Connect billing to see numbers. No paid invoices recorded yet — chapter §68 honesty: we don&apos;t
            fabricate MRR when there&apos;s no data.
          </p>
        )}
      </section>

      {/* Invoices */}
      <section className="rounded-xl border border-black/10 bg-white">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/10 p-3">
          <h2 className="text-sm font-medium text-black/85">Invoices</h2>
          <div className="flex items-center gap-2 text-xs">
            <a href="/portal/agency/agency-finance" className="text-black/55 hover:underline">
              Open agency-finance →
            </a>
            {!pluginMissing && (
              <button
                type="button"
                onClick={() => setAdding(o => !o)}
                disabled={busy}
                className="rounded-md border border-black/15 px-2 py-1 hover:bg-black/5 disabled:opacity-50"
              >
                {adding ? "Cancel" : "+ Manual invoice"}
              </button>
            )}
          </div>
        </header>
        {adding && (
          <form
            onSubmit={e => { e.preventDefault(); addManualInvoice(); }}
            className="grid gap-2 border-b border-black/10 p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
          >
            <input
              type="text"
              placeholder="Invoice number"
              value={draft.number}
              disabled={busy}
              onChange={e => setDraft(d => ({ ...d, number: e.target.value }))}
              className="rounded-md border border-black/15 px-2 py-1 text-sm"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount (£)"
              value={draft.amount}
              disabled={busy}
              onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))}
              className="rounded-md border border-black/15 px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={draft.dueAt}
              disabled={busy}
              onChange={e => setDraft(d => ({ ...d, dueAt: e.target.value }))}
              className="rounded-md border border-black/15 px-2 py-1 text-sm"
            />
            <select
              value={draft.status}
              disabled={busy}
              onChange={e => setDraft(d => ({ ...d, status: e.target.value as Invoice["status"] }))}
              className="rounded-md border border-black/15 px-2 py-1 text-sm"
            >
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--brand-primary)] px-3 py-1 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
          </form>
        )}
        {error && <p role="alert" className="border-b border-black/10 px-3 py-1 text-xs text-red-700">{error}</p>}
        {invoices === null ? (
          <p className="px-3 py-6 text-center text-sm text-black/55">Loading…</p>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <p className="text-sm text-black/65">
              {pluginMissing ? "agency-finance plugin not installed." : "No invoices yet."}
            </p>
            <a
              href="/portal/agency/agency-finance"
              className="rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-medium text-white shadow hover:opacity-90"
            >
              Connect billing → Open agency-finance
            </a>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-[11px] uppercase tracking-wide text-black/55">
              <tr>
                <th className="px-3 py-2 text-left">Number</th>
                <th className="px-3 py-2 text-left">Issued</th>
                <th className="px-3 py-2 text-left">Due</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-t border-black/5">
                  <td className="px-3 py-1.5 font-medium text-black/85">{inv.number}</td>
                  <td className="px-3 py-1.5 text-black/65">{fmtDate(inv.issuedAt)}</td>
                  <td className="px-3 py-1.5 text-black/65">{fmtDate(inv.dueAt)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-black/85">{fmtMoney(inv.totalCents, inv.currency)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_PALETTE[inv.status]}`}>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
