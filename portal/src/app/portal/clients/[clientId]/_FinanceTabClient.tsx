"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientContract, ClientContractTemplate } from "@/lib/clients/clientContracts";
import type { ClientPaymentPlan } from "@/lib/clients/clientPaymentPlans";
import {
  beginClientFinanceRead,
  clientFinanceReadPresentation,
  initialClientFinanceReadState,
  readClientFinanceSources,
  settleClientFinanceRead,
  type ClientFinanceExpense as ClientExpense,
  type ClientFinanceExpenseCategory as ExpenseCategory,
  type ClientFinanceInvoice as Invoice,
} from "@/lib/client/clientFinanceReads";
import { ContractsPanel } from "./_ContractsPanel";
import { PaymentPlansPanel, type PaymentPlanEvidenceFile } from "./_PaymentPlansPanel";
import { addBusinessCalendarDays, businessCalendarDate, formatUkDate } from "@/lib/shared/formatDateTime";

interface InitialState {
  planTier?: "foundational" | "expansion" | "mastery";
  servicePlan?: string;
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
  "partially-refunded": "bg-amber-50 text-amber-800",
  void:    "bg-black/10 text-black/45",
  refunded: "bg-violet-50 text-violet-800",
};

function fmtMoney(cents: number, currency: string): string {
  const v = (cents / 100).toFixed(2);
  const code = currency.toUpperCase();
  const sym = code === "GBP" ? "£" : code === "USD" ? "$" : code === "EUR" ? "€" : `${code} `;
  return `${sym}${v}`;
}

function fmtDate(ts: number): string {
  return formatUkDate(ts, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function defaultDueDate(): string {
  return addBusinessCalendarDays(14);
}

export function FinanceTabClient({
  clientId,
  initial,
  initialContracts,
  initialContractTemplates,
  initialPaymentPlans,
  initialCommercialFiles,
  products,
  clientName,
  recipientEmail,
  showContracts = true,
  canManage = true,
  canConfigure = canManage,
}: {
  clientId: string;
  initial: InitialState;
  initialContracts: ClientContract[];
  initialContractTemplates: ClientContractTemplate[];
  initialPaymentPlans: ClientPaymentPlan[];
  initialCommercialFiles: PaymentPlanEvidenceFile[];
  products: Array<{ id: string; name: string }>;
  clientName?: string;
  recipientEmail?: string;
  showContracts?: boolean;
  canManage?: boolean;
  canConfigure?: boolean;
}) {
  const [invoiceRead, setInvoiceRead] = useState(() => initialClientFinanceReadState<Invoice>());
  const [expenseRead, setExpenseRead] = useState(() => initialClientFinanceReadState<ClientExpense>());
  const [categoryRead, setCategoryRead] = useState(() => initialClientFinanceReadState<ExpenseCategory>());
  const [error, setError] = useState<string | null>(null);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingCost, setAddingCost] = useState(false);
  const refreshGeneration = useRef(0);
  const [draft, setDraft] = useState({
    description: "",
    amount: "",
    dueAt: defaultDueDate(),
    notes: "",
    status: "draft" as "draft" | "sent" | "paid",
  });

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const generation = ++refreshGeneration.current;
    setInvoiceRead(beginClientFinanceRead);
    setExpenseRead(beginClientFinanceRead);
    setCategoryRead(beginClientFinanceRead);

    const result = await readClientFinanceSources({ clientId, signal });
    if (signal?.aborted || generation !== refreshGeneration.current) return;
    setInvoiceRead(current => settleClientFinanceRead(current, result.invoices));
    setExpenseRead(current => settleClientFinanceRead(current, result.expenses));
    setCategoryRead(current => settleClientFinanceRead(current, result.categories));
  }, [clientId]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  async function addManualInvoice() {
    setError(null);
    if (!canMutateInvoices) {
      setError("Current invoice evidence is required before creating an invoice. Retry the Finance read.");
      return;
    }
    const amountFloat = parseFloat(draft.amount);
    if (!draft.description.trim() || !Number.isFinite(amountFloat) || amountFloat <= 0) {
      setError("Add a service description and a positive amount.");
      return;
    }
    const cents = Math.round(amountFloat * 100);
    const dueTs = Date.parse(draft.dueAt || addBusinessCalendarDays(14));
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
        await updateInvoiceStatus(data.invoice.id, "sent", false, true);
      }
      if (data.invoice && draft.status === "paid") {
        await updateInvoiceStatus(data.invoice.id, "sent", false, false);
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
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateInvoiceStatus(id: string, status: Invoice["status"], shouldRefresh = true, deliver = status === "sent") {
    if (!canMutateInvoices) {
      setError("Current invoice evidence is required before changing an invoice.");
      return;
    }
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
      if (deliver && status === "sent") await deliverPaymentRequest(id);
      if (shouldRefresh) await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deliverPaymentRequest(invoiceId: string) {
    setDeliveryNotice(null);
    const response = await fetch("/api/portal/journey/payment-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, invoiceId }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; delivered?: boolean; error?: string; reason?: string } | null;
    if (payload?.delivered) {
      setDeliveryNotice(`Payment request emailed to ${recipientEmail || "the client"} and published in the portal.`);
      return;
    }
    setDeliveryNotice(payload?.reason || payload?.error || "Payment request is in the client portal, but email delivery is not configured.");
  }

  async function markPaid(id: string, shouldRefresh = true) {
    if (!canMutateInvoices) {
      setError("Current invoice evidence is required before recording payment.");
      return;
    }
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

  const invoicePresentation = clientFinanceReadPresentation(invoiceRead);
  const expensePresentation = clientFinanceReadPresentation(expenseRead);
  const categoryPresentation = clientFinanceReadPresentation(categoryRead);
  const invoices = invoiceRead.rows;
  const clientExpenses = expenseRead.rows;
  const expenseCategories = categoryRead.rows;
  const pluginMissing = invoiceRead.phase === "plugin-missing";
  const currentInvoices = invoicePresentation.current ? invoices : null;
  const currentExpenses = expensePresentation.current ? clientExpenses : null;
  const canMutateInvoices = invoicePresentation.canMutate;
  const canAddClientCost = expensePresentation.canMutate && categoryPresentation.canMutate;

  // 12-month rollup over PAID invoices only. A retained snapshot may still be
  // shown as labelled evidence, but it cannot authorise a current total.
  const mrrSeries = useMemo(() => {
    if (!currentInvoices || currentInvoices.length === 0) return null;
    const buckets = new Array(12).fill(0) as number[];
    const now = new Date();
    for (const inv of currentInvoices) {
      if (inv.status !== "paid" || !inv.paidAt) continue;
      const d = new Date(inv.paidAt);
      const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (monthsAgo < 0 || monthsAgo > 11) continue;
      buckets[11 - monthsAgo] += inv.totalCents;
    }
    const total = buckets.reduce((a, b) => a + b, 0);
    return total > 0 ? buckets : null;
  }, [currentInvoices]);

  const max = mrrSeries ? Math.max(...mrrSeries) : 0;
  const totalPaid = mrrSeries ? mrrSeries.reduce((a, b) => a + b, 0) : 0;
  const directCosts = currentExpenses
    ?.filter(expense => expense.status === "reimbursed")
    .reduce((sum, expense) => sum + expense.amountCents, 0) ?? null;
  const grossProfit = currentInvoices && directCosts !== null ? totalPaid - directCosts : null;
  const planLabel = initial.servicePlan?.trim()
    || (initial.planTier ? PLAN_LABELS[initial.planTier] : null);
  const depositPaid = initial.lockInPaid === true || Boolean(currentInvoices?.some(invoice =>
    invoice.status === "paid"
    && invoice.lineItems?.some(item => /\b(deposit|lock[\s-]?in)\b/i.test(item.description)),
  ));
  const depositKnown = initial.lockInPaid === true || Boolean(currentInvoices);

  function openInvoiceComposer() {
    if (!canMutateInvoices) return;
    setAdding(true);
    requestAnimationFrame(() => document.getElementById("client-invoices")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

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
        <span className="font-semibold uppercase tracking-wide text-black/55">· Deposit</span>
        <span className={[
          "rounded-full px-2 py-0.5 font-medium",
          depositPaid
            ? "bg-emerald-100 text-emerald-800"
            : depositKnown
              ? "border border-black/10 bg-white text-black/55"
              : "bg-amber-50 text-amber-800",
        ].join(" ")}>
          {depositPaid ? "Received" : depositKnown ? "Unpaid" : "Not confirmed"}
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

      {canManage ? <CloseDealCard clientId={clientId} disabled={!canMutateInvoices} onClosed={refresh} /> : null}

      {/* MRR strip */}
      <section className="rounded-xl border border-black/10 bg-white p-4">
        <header className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-black/85">12-month paid total</h2>
          {mrrSeries && currentInvoices ? (
            <span className="text-base font-semibold text-black/90">{fmtMoney(totalPaid, "GBP")}</span>
          ) : currentInvoices && currentInvoices.length === 0 && canManage ? (
            <button type="button" onClick={openInvoiceComposer} className="text-xs font-semibold text-brand hover:underline">
              Create first invoice
            </button>
          ) : currentInvoices ? (
            <span className="text-xs font-semibold text-black/35">No paid invoices</span>
          ) : <span className="text-base font-semibold text-black/35">—</span>}
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
        ) : currentInvoices ? (
          <p className="mt-1 text-xs text-black/50">No paid invoices have been recorded for this client yet.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800">
            <p>{invoicePresentation.showLoading
              ? "Loading current invoice evidence…"
              : invoicePresentation.showPluginMissing
                ? "The Finance engine is not enabled for this workspace."
                : invoicePresentation.retainedSnapshotIsStale
                  ? "Current totals are unavailable. Last-confirmed invoice rows remain visible below."
                  : "Invoice totals are unavailable, so no paid-income claim is shown."}</p>
            {!invoicePresentation.showLoading && !invoicePresentation.showPluginMissing ? <button type="button" onClick={() => void refresh()} className="rounded-md border border-amber-300 px-2 py-1 font-semibold">Retry Finance reads</button> : null}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 p-4">
          <div>
            <h2 className="text-sm font-medium text-black/85">Client profitability</h2>
            <p className="mt-1 text-xs text-black/45">Actual paid invoices less costs allocated to this client.</p>
          </div>
          {canManage ? <button
            type="button"
            onClick={() => setAddingCost(value => !value)}
            disabled={!canAddClientCost}
            title={!canAddClientCost ? "Current client-cost and category reads are required." : undefined}
            className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {addingCost ? "Cancel" : "Add client cost"}
          </button> : <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">Read-only</span>}
        </header>
        <dl className="grid grid-cols-3 divide-x divide-black/10 border-b border-black/10">
          <div className="p-4"><dt className="text-xs text-black/45">Paid income</dt><dd className="mt-1 font-semibold text-black/85">{currentInvoices ? fmtMoney(totalPaid, "GBP") : "—"}</dd></div>
          <div className="p-4"><dt className="text-xs text-black/45">Direct costs</dt><dd className="mt-1 font-semibold text-black/85">{directCosts !== null ? fmtMoney(directCosts, "GBP") : "—"}</dd></div>
          <div className="p-4"><dt className="text-xs text-black/45">Gross profit</dt><dd className={`mt-1 font-semibold ${grossProfit === null ? "text-black/35" : grossProfit < 0 ? "text-red-700" : "text-emerald-800"}`}>{grossProfit === null ? "—" : fmtMoney(grossProfit, "GBP")}</dd></div>
        </dl>
        {grossProfit === null ? <p className="border-b border-black/10 bg-amber-50 px-4 py-2 text-xs text-amber-900">Profit is withheld until both invoices and client costs have a current confirmed read.</p> : null}
        {canManage && addingCost && canAddClientCost ? (
          <ClientCostForm
            clientId={clientId}
            categories={expenseCategories.filter(category => category.status === "active")}
            busy={busy}
            onBusy={setBusy}
            onError={setError}
            onSaved={async () => {
              setAddingCost(false);
              await refresh();
            }}
          />
        ) : null}
        {expensePresentation.retainedSnapshotIsStale ? <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-amber-50 px-4 py-2 text-xs text-amber-900"><span>Last-confirmed client costs are shown below; current totals and cost changes are locked.</span><button type="button" onClick={() => void refresh()} className="rounded-md border border-amber-300 px-2 py-1 font-semibold">Retry costs</button></div> : null}
        {expensePresentation.showRows ? (
          <div className="divide-y divide-black/[0.07]" aria-label={expensePresentation.retainedSnapshotIsStale ? "Last-confirmed client costs" : "Client costs"}>
            {clientExpenses.slice(0, 5).map(expense => (
              <div key={expense.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-black/80">{expense.vendor || expense.description || "Client cost"}</p>
                  <p className="mt-0.5 text-xs text-black/45">{formatUkDate(expense.incurredAt, { day: "numeric", month: "short", year: "numeric" })} · {expense.status === "reimbursed" ? "Paid" : "Needs review"}</p>
                </div>
                <span className="font-mono font-semibold text-black/75">{fmtMoney(expense.amountCents, expense.currency)}</span>
              </div>
            ))}
          </div>
        ) : expensePresentation.showEmpty ? (
          <p className="px-4 py-6 text-center text-sm text-black/45">No direct costs recorded for this client.</p>
        ) : expensePresentation.showLoading ? (
          <p className="px-4 py-6 text-center text-sm text-black/45">Loading client costs…</p>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm text-amber-900"><p>Client costs are unavailable; this is not confirmation that there are none.</p><button type="button" onClick={() => void refresh()} className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold">Retry costs</button></div>
        )}
        {!categoryPresentation.current && !categoryPresentation.showLoading ? <p className="border-t border-black/10 bg-amber-50 px-4 py-2 text-xs text-amber-900">Expense categories are unavailable, so adding a client cost is locked until retry succeeds.</p> : null}
      </section>

      {showContracts ? <div data-resolution-focus="contract"><ContractsPanel
        clientId={clientId}
        clientName={clientName}
        recipientEmail={recipientEmail}
        initialContracts={initialContracts}
        initialTemplates={initialContractTemplates}
        canManage={canManage}
        canConfigure={canConfigure}
      /></div> : null}

      <PaymentPlansPanel
        clientId={clientId}
        clientName={clientName}
        recipientEmail={recipientEmail}
        products={products}
        initialPlans={initialPaymentPlans}
        initialFiles={initialCommercialFiles}
        invoices={invoices}
        invoiceReadState={invoiceRead.phase}
        invoiceHasConfirmedSnapshot={invoiceRead.hasConfirmedSnapshot}
        onRetryInvoices={refresh}
        onInvoiceCreated={refresh}
        canManage={canManage}
        canConfigure={canConfigure}
      />

      {/* Invoices */}
      <section id="client-invoices" className="scroll-mt-24 rounded-xl border border-black/10 bg-white">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/10 p-3">
          <div>
            <h2 className="text-sm font-medium text-black/85">Payment requests & invoices</h2>
            <p className="mt-0.5 text-xs text-black/45">Issue a request to the client portal and email it through your connected sender.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {canManage && canMutateInvoices && (
              <button
                type="button"
                onClick={() => setAdding(o => !o)}
                disabled={busy}
                className="rounded-md bg-black px-3 py-2 font-semibold text-white hover:bg-black/85 disabled:opacity-50"
              >
                {adding ? "Cancel" : "Create invoice"}
              </button>
            )}
          </div>
        </header>
        {canManage && canMutateInvoices && adding && (
          <form
            onSubmit={e => { e.preventDefault(); addManualInvoice(); }}
            className="border-b border-black/10 bg-black/[0.015] p-4"
          >
            <div className="mb-4">
              <p className="text-sm font-medium text-black/85">New invoice</p>
              <p className="mt-1 text-xs text-black/45">
                The workspace generates the invoice number. Drafts remain private until sent.
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
        {error && <p role="alert" className="border-b border-black/10 px-3 py-2 text-xs text-red-700">{error}</p>}
        {deliveryNotice && <p role="status" className="border-b border-black/10 bg-blue-50 px-3 py-2 text-xs text-blue-800">{deliveryNotice}</p>}
        {invoicePresentation.showLoading && !invoiceRead.hasConfirmedSnapshot ? (
          <p className="px-3 py-6 text-center text-sm text-black/55">Loading invoices…</p>
        ) : invoicePresentation.showPluginMissing && !invoiceRead.hasConfirmedSnapshot ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <p className="text-sm font-semibold text-black/65">Client invoicing is not enabled</p>
            <p className="max-w-md text-xs leading-5 text-black/45">A workspace owner must enable the Finance engine. This state is only used for an explicit not-installed or feature-disabled response.</p>
          </div>
        ) : invoicePresentation.showUnavailable && !invoiceRead.hasConfirmedSnapshot ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <p className="text-sm font-semibold text-amber-900">Invoices are unavailable</p>
            <p className="max-w-md text-xs leading-5 text-black/45">This is not confirmation that this client has no invoices. Invoice totals and changes remain locked.</p>
            <button type="button" onClick={() => void refresh()} className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900">Retry invoices</button>
          </div>
        ) : invoicePresentation.showEmpty ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <p className="text-sm font-semibold text-black/65">No invoices yet</p>
            <p className="max-w-md text-xs leading-5 text-black/45">Create, issue and track this client’s first invoice without leaving their workspace.</p>
            {canManage ? <button type="button" onClick={openInvoiceComposer} className="mt-2 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white shadow hover:opacity-90">Create first invoice</button> : null}
          </div>
        ) : invoicePresentation.showRows ? (
          <>
          {invoicePresentation.retainedSnapshotIsStale || invoicePresentation.showLoading ? <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-amber-50 px-3 py-2 text-xs text-amber-900"><span>{invoicePresentation.showLoading ? "Refreshing invoices. Last-confirmed rows remain visible and locked." : "Last-confirmed invoice rows are visible; current totals and invoice changes are locked."}</span>{!invoicePresentation.showLoading && !pluginMissing ? <button type="button" onClick={() => void refresh()} className="rounded-md border border-amber-300 px-2 py-1 font-semibold">Retry invoices</button> : null}</div> : null}
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" aria-label={invoicePresentation.retainedSnapshotIsStale ? "Last-confirmed invoices" : "Invoices"}>
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
                    {canManage && inv.status === "draft" && (
                      <button
                        type="button"
                        disabled={busy || !canMutateInvoices}
                        title={!canMutateInvoices ? "Current invoice evidence is required." : undefined}
                        onClick={() => updateInvoiceStatus(inv.id, "sent")}
                        className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-50"
                      >
                        Send
                      </button>
                    )}
                    {canConfigure && (inv.status === "sent" || inv.status === "overdue") && (
                      <button
                        type="button"
                        disabled={busy || !canMutateInvoices}
                        title={!canMutateInvoices ? "Current invoice evidence is required." : undefined}
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
          </>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-black/55">Loading invoices…</p>
        )}
      </section>
    </div>
  );
}

const CLOSE_CHANNELS: Array<{ value: string; label: string }> = [
  { value: "stripe", label: "Stripe — card pay-link" },
  { value: "bank-transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

// A one-time idempotency key per close intent: a double-click / retry on the
// same close carries the same key, so the server bills once. Closing a *new*
// deal (after reset) rotates the key, so it's recorded normally.
function freshIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

// The one-button "close the deal" for an existing client: one action →
// contract (sent) + invoice (issued) + a routed payment. Money flows to your
// own Stripe/bank/cash directly; the app never holds funds.
function CloseDealCard({ clientId, disabled, onClosed }: { clientId: string; disabled: boolean; onClosed: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ invoiceNumber?: string; payLink?: string; paymentInstruction?: string; agreementOutcome?: string; contractStatus?: string } | null>(null);
  const [form, setForm] = useState({ title: "", amount: "", channel: "stripe", dueInDays: "30", contractSummary: "", contractBody: "" });
  const [idempotencyKey, setIdempotencyKey] = useState(freshIdempotencyKey);

  function reset() {
    setForm({ title: "", amount: "", channel: "stripe", dueInDays: "30", contractSummary: "", contractBody: "" });
    setResult(null);
    setError(null);
    setOpen(false);
    setIdempotencyKey(freshIdempotencyKey());   // next close is a new intent
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled) {
      setError("Current invoice evidence is required before closing a deal.");
      return;
    }
    const amount = parseFloat(form.amount);
    if (!form.title.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError("Add a deal title and a positive amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/close-deal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          title: form.title.trim(),
          amountCents: Math.round(amount * 100),
          currency: "gbp",
          channel: form.channel,
          dueInDays: Number(form.dueInDays) || 30,
          contractSummary: form.contractSummary.trim() || undefined,
          contractBody: form.contractBody.trim() || undefined,
          idempotencyKey,
        }),
      });
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string; invoiceNumber?: string; payLink?: string; paymentInstruction?: string; agreementOutcome?: string; contractStatus?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Could not close the deal.");
        return;
      }
      setResult(data);
      await onClosed();
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black";

  return (
    <section className="rounded-xl border border-black/10 bg-white p-4">
      {result ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-emerald-800">Deal closed ✓</p>
          {/* What actually happened to the agreement — never a blanket "Contract
              sent". A terms-less close is a draft; a send whose email bounced
              says so. The server is the only thing that knows, so it says it. */}
          <p className={`text-xs ${result.contractStatus === "sent" ? "text-black/60" : "text-amber-800"}`}>{result.agreementOutcome ?? "Agreement recorded."}</p>
          {result.invoiceNumber ? <p className="text-xs text-black/60">Invoice {result.invoiceNumber} issued.</p> : null}
          {result.payLink ? (
            <a href={result.payLink} target="_blank" rel="noreferrer" className="inline-block rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white">Open the Stripe pay-link →</a>
          ) : null}
          {result.paymentInstruction ? <p className="text-xs text-black/50">{result.paymentInstruction}</p> : null}
          <div><button type="button" onClick={reset} disabled={disabled} className="text-xs font-medium text-brand underline disabled:text-black/35">Close another deal</button></div>
        </div>
      ) : !open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-black/85">Close the deal</h2>
            <p className="mt-0.5 text-xs text-black/45">One action → contract, invoice, and a routed payment. The money goes straight to you.</p>
          </div>
          <button type="button" onClick={() => setOpen(true)} disabled={disabled} title={disabled ? "Current invoice evidence is required." : undefined} className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white shadow hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">Close the deal</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-black/85">Close the deal</p>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-black/50 hover:underline">Cancel</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-black/60 sm:col-span-2">What did you agree?<input className={inputClass} placeholder="Website build + care plan" value={form.title} disabled={busy} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus /></label>
            <label className="grid gap-1 text-xs font-medium text-black/60">Amount
              <div className="flex min-h-10 overflow-hidden rounded-md border border-black/15 bg-white">
                <span className="grid w-10 place-items-center border-r border-black/10 text-sm text-black/45">£</span>
                <input type="number" step="0.01" min="0.01" placeholder="0.00" className="min-w-0 flex-1 px-3 text-sm outline-none" value={form.amount} disabled={busy} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
            </label>
            <label className="grid gap-1 text-xs font-medium text-black/60">Take payment by<select className={inputClass} value={form.channel} disabled={busy} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>{CLOSE_CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-medium text-black/60">Payment due in (days)<input type="number" min="0" step="1" className={inputClass} value={form.dueInDays} disabled={busy} onChange={e => setForm(f => ({ ...f, dueInDays: e.target.value }))} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/60">Contract summary <span className="font-normal text-black/35">(optional)</span><input className={inputClass} placeholder="Scope, terms" value={form.contractSummary} disabled={busy} onChange={e => setForm(f => ({ ...f, contractSummary: e.target.value }))} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/60 sm:col-span-2">Agreed terms
              <textarea rows={5} className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-normal text-black" placeholder="What you are delivering, for how long, and what the client owes." value={form.contractBody} disabled={busy} onChange={e => setForm(f => ({ ...f, contractBody: e.target.value }))} />
              <span className="font-normal text-black/45">
                {form.contractBody.trim()
                  ? "The client can review and accept exactly these terms in their portal."
                  : "Without terms the agreement is saved as a draft — the client cannot review or accept it. The invoice is still issued."}
              </span>
            </label>
          </div>
          {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
          <div className="flex justify-end">
            <button type="submit" disabled={busy || disabled} className="min-h-10 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">{busy ? "Closing…" : "Close the deal"}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function ClientCostForm({
  clientId,
  categories,
  busy,
  onBusy,
  onError,
  onSaved,
}: {
  clientId: string;
  categories: ExpenseCategory[];
  busy: boolean;
  onBusy: (value: boolean) => void;
  onError: (value: string | null) => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <form
      className="border-b border-black/10 bg-black/[0.015] p-4"
      onSubmit={async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const amountCents = Math.round(Number(data.get("amount") ?? 0) * 100);
        const taxRate = Number(data.get("taxRate") ?? 0);
        const taxCents = taxRate > 0 ? Math.round(amountCents - amountCents / (1 + taxRate / 100)) : 0;
        if (!data.get("categoryId") || amountCents <= 0) {
          onError("Choose a category and enter a positive cost.");
          return;
        }
        onBusy(true);
        onError(null);
        try {
          const response = await fetch("/api/portal/agency-finance/expenses", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              clientId,
              categoryId: String(data.get("categoryId")),
              vendor: String(data.get("vendor") ?? "").trim() || undefined,
              description: String(data.get("description") ?? "").trim() || undefined,
              amountCents,
              taxCents,
              taxRateBps: Math.round(taxRate * 100),
              taxDeductible: true,
              businessUsePercent: 100,
              incurredAt: Date.parse(String(data.get("incurredAt"))) || Date.now(),
              receiptUrl: String(data.get("receiptUrl") ?? "").trim() || undefined,
              currency: "gbp",
              recordAsPaid: true,
            }),
          });
          const result = await response.json() as { ok?: boolean; error?: string };
          if (!response.ok || !result.ok) {
            onError(result.error ?? "Could not save client cost.");
            return;
          }
          await onSaved();
        } finally {
          onBusy(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium text-black/60">Supplier<input name="vendor" className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm" placeholder="Hosting provider" /></label>
        <label className="grid gap-1 text-xs font-medium text-black/60">Category
          <select name="categoryId" required defaultValue="" className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm">
            <option value="" disabled>Choose category</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-black/60">Gross amount (£)<input name="amount" type="number" min="0.01" step="0.01" required className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm" /></label>
        <label className="grid gap-1 text-xs font-medium text-black/60">Tax included
          <select name="taxRate" defaultValue="20" className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm">
            <option value="0">No tax</option><option value="5">5%</option><option value="20">20% VAT</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-black/60">Date<input name="incurredAt" type="date" defaultValue={businessCalendarDate()} className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm" /></label>
        <label className="grid gap-1 text-xs font-medium text-black/60">Receipt URL<input name="receiptUrl" type="url" className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm" /></label>
        <label className="grid gap-1 text-xs font-medium text-black/60 sm:col-span-2 lg:col-span-3">Description<input name="description" className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm" placeholder="What this cost covered" /></label>
      </div>
      <div className="mt-4 flex justify-end">
        <button disabled={busy} className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save client cost"}</button>
      </div>
    </form>
  );
}
