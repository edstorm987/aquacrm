import type { LucideIcon } from "lucide-react";
import { ArrowDownToLine, ArrowRight, CircleAlert, CircleGauge, CreditCard, Landmark, PoundSterling, ReceiptText, TimerReset, TrendingUp } from "lucide-react";
import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { FinanceNav } from "../components/FinanceNav";
import { FinanceCurrencyNav } from "../components/FinanceCurrencyNav";
import { buildBudgetPotSnapshots } from "../lib/budgetHealth";
import { normaliseCurrency } from "../lib/currencies";
import { taxPosition } from "../lib/taxPosition";
import { formatUkDate } from "../lib/safeDate";
import { invoiceNetPaidCents } from "../lib/paymentAllocation";
import { listAgencyCampaignBudgetRecords } from "@/lib/server/finance/financeBudgetCampaigns";
import { resolveFinanceDefaultCurrency } from "@/lib/server/finance/financeCurrency";
import { cleanClientPaymentPlans, summariseClientPaymentPosition, type ClientPaymentCurrencyPosition } from "@/lib/clients/clientPaymentPlans";
import { summariseClientServiceExpansion } from "@/lib/clients/clientCommercialIntelligence";
import { cleanClientProductProcessState, longestActiveClientProductStage } from "@/lib/clients/clientProductProcess";

function money(cents: number, currency = "gbp"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function paymentPositionMoney(
  positions: readonly ClientPaymentCurrencyPosition[],
  field: "agreedCents" | "paidCents" | "outstandingCents",
): string {
  const retained = positions.filter(position => position.agreedCents > 0);
  return retained.length ? retained.map(position => money(position[field], position.currency)).join(" · ") : "—";
}

export default async function FounderDashboardPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const defaultCurrency = resolveFinanceDefaultCurrency(props.agencyId, props.install.config.defaultCurrency);
  const requestedCurrency = typeof props.searchParams.currency === "string" ? props.searchParams.currency : undefined;
  const currency = normaliseCurrency(requestedCurrency, defaultCurrency);
  const now = Date.now();
  const [invoices, expenses, payments, refunds, otherIncome, accounting, clients, budgetPots, campaignBudgets, workforcePayments] = await Promise.all([
    c.invoices.list(),
    c.expenses.list(),
    c.payments.list(),
    c.payments.listRefunds(),
    c.income.list(),
    c.accounting.snapshot({ from: 0, to: now, currency }),
    Promise.resolve(c.tenant.listClients?.(props.agencyId) ?? []),
    c.budgets.list(),
    listAgencyCampaignBudgetRecords(props.agencyId),
    c.operations.listCompensationPayments(),
  ]);

  const paidExpenses = expenses.filter(expense => expense.status === "reimbursed" && expense.currency === currency);
  const paymentInvoiceIds = new Set(payments.map(payment => payment.invoiceId));
  const legacyPaidInvoices = invoices.filter(invoice =>
    invoice.currency === currency && invoice.status === "paid" && !paymentInvoiceIds.has(invoice.id),
  );
  const incomeCents = accounting.cashRevenueCents;
  const expenseCents = accounting.cashExpenseCents;
  const netCents = accounting.cashNetCents;
  const outputTaxCents = accounting.outputTaxCents;
  const inputTaxCents = accounting.inputTaxCents;
  // The SIGNED position, in the direction it actually points.
  //
  // This row rendered `Math.max(0, outputTaxCents - inputTaxCents)`. When
  // recoverable tax exceeds tax charged — money owed BACK — the clamp printed
  // "£0.00" and the operator had no way to know a reclaim existed. Reports was
  // fixed with `taxPosition()`; Overview was named in the same finding and was
  // missed, so it went on saying the same untrue thing on the screen that gets
  // looked at most. One helper, both surfaces, and the label moves with the
  // direction rather than staying "balance" for a refund.
  const tax = taxPosition(outputTaxCents, inputTaxCents);
  const taxReserveRate = Number(props.install.config.taxReserveRate ?? 20);
  const indicativeTaxReserveCents = Math.max(0, Math.round(netCents * taxReserveRate / 100));
  const outstandingCents = accounting.outstandingReceivableCents;
  const missingReceipts = accounting.missingReceiptCount;
  const budgetSnapshots = buildBudgetPotSnapshots(budgetPots, campaignBudgets, expenses, workforcePayments)
    .filter(pot => pot.currency === currency && pot.status !== "closed");
  const allocatedBudgetCents = budgetSnapshots.reduce((sum, pot) => sum + pot.allocatedCents, 0);
  const fundedBudgetCents = budgetSnapshots.reduce((sum, pot) => sum + pot.fundedCents, 0);
  const committedBudgetCents = budgetSnapshots.reduce((sum, pot) => sum + pot.committedCents, 0);
  const overspentPots = budgetSnapshots.filter(pot => pot.overspendCents > 0).length;
  const spendableBalanceCents = netCents - indicativeTaxReserveCents;
  const unallocatedBalanceCents = spendableBalanceCents - fundedBudgetCents;
  const fundingCoverage = allocatedBudgetCents > 0 ? fundedBudgetCents / allocatedBudgetCents : 1;
  const hasFinancialBaseline = accounting.hasData || budgetSnapshots.length > 0;
  const calculatedBalanceHealthScore = Math.max(0, Math.min(100,
    100
    - (netCents < 0 ? 40 : 0)
    - (unallocatedBalanceCents < 0 ? 25 : 0)
    - Math.min(25, overspentPots * 12)
    - (fundingCoverage < 0.5 ? 15 : fundingCoverage < 0.8 ? 7 : 0),
  ));
  const balanceHealthScore = hasFinancialBaseline ? calculatedBalanceHealthScore : 50;
  const balanceHealth = financeHealthLabel(balanceHealthScore, hasFinancialBaseline);

  const clientCommercialRows = clients.map(client => {
    const clientInvoices = invoices.filter(invoice => invoice.clientId === client.id);
    const payment = summariseClientPaymentPosition(
      cleanClientPaymentPlans(client.metadata?.clientPaymentPlans),
      clientInvoices.map(invoice => ({
        ...invoice,
        netPaidCents: invoiceNetPaidCents(invoice.id, payments, refunds),
      })),
    );
    const expansion = summariseClientServiceExpansion(client.metadata?.portalProductAssignmentHistory);
    const longestStage = longestActiveClientProductStage(cleanClientProductProcessState(client.metadata?.clientProductProcess));
    return { client, payment, expansion, longestStage };
  }).sort((left, right) =>
    right.payment.missedPayments - left.payment.missedPayments
    || right.payment.currencyPositions.filter(position => position.outstandingCents > 0).length - left.payment.currencyPositions.filter(position => position.outstandingCents > 0).length
    || right.payment.openInvoices - left.payment.openInvoices
    || (right.longestStage?.elapsedMs ?? 0) - (left.longestStage?.elapsedMs ?? 0),
  );
  const missedPaymentCount = clientCommercialRows.reduce((sum, row) => sum + row.payment.missedPayments, 0);
  const clientsPaidInFull = clientCommercialRows.filter(row => row.payment.state === "paid-in-full").length;

  const clientNameById = new Map(clients.map(client => [client.id, client.name]));
  const clientCashById = new Map(accounting.byClient.map(row => [row.clientId, row]));
  const profitability = clients.map(client => {
    const cash = clientCashById.get(client.id);
    const revenueCents = cash?.cashRevenueCents ?? 0;
    const costCents = cash?.cashExpenseCents ?? 0;
    return {
      clientId: client.id,
      name: client.name,
      revenueCents,
      costCents,
      profitCents: revenueCents - costCents,
    };
  }).filter(row => row.revenueCents > 0 || row.costCents > 0)
    .sort((a, b) => b.profitCents - a.profitCents);

  const invoiceById = new Map(invoices.map(invoice => [invoice.id, invoice]));
  const recent = [
    ...paidExpenses.map(expense => ({
      id: expense.id,
      at: expense.reimbursedAt ?? expense.incurredAt,
      label: expense.vendor || expense.description || "Expense",
      detail: expense.clientId ? clientNameById.get(expense.clientId) ?? "Client cost" : "Business overhead",
      amountCents: -expense.amountCents,
    })),
    ...payments.filter(payment => payment.currency === currency).map(payment => ({
      id: payment.id,
      at: payment.paidAt,
      label: invoiceById.get(payment.invoiceId)?.number ?? payment.invoiceId,
      detail: clientNameById.get(payment.clientId) ?? "Client payment",
      amountCents: payment.amountCents,
    })),
    ...refunds.filter(refund => refund.currency === currency).map(refund => ({
      id: refund.id,
      at: refund.refundedAt,
      label: `Refund · ${invoiceById.get(refund.invoiceId)?.number ?? refund.invoiceId}`,
      detail: clientNameById.get(refund.clientId) ?? "Client refund",
      amountCents: -refund.amountCents,
    })),
    ...legacyPaidInvoices.map(invoice => ({
      id: invoice.id,
      at: invoice.paidAt ?? invoice.issuedAt,
      label: invoice.number,
      detail: clientNameById.get(invoice.clientId) ?? "Client payment",
      amountCents: invoice.totalCents,
    })),
    ...otherIncome.filter(entry => entry.currency === currency).map(entry => ({
      id: entry.id,
      at: entry.receivedAt,
      label: entry.title,
      detail: entry.category || (entry.clientId ? clientNameById.get(entry.clientId) ?? "Other client income" : "Other income"),
      amountCents: entry.amountCents,
    })),
  ].sort((a, b) => b.at - a.at).slice(0, 8);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8 pb-12">
      <FinanceNav active="overview" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">AquaOasis-Web books</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90">Finance overview</h1>
          <p className="mt-1 text-sm text-black/55">Actual recorded income, business spending, tax evidence, and client profitability.</p>
        </div>
        <div className="flex gap-2">
          <a href="/portal/agency/agency-finance/invoices" className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/[0.03]">Create invoice</a>
          <a href="/portal/agency/agency-finance/expenses" className="rounded-md bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-black/85">Add expense</a>
        </div>
      </header>

      <FinanceCurrencyNav
        active={currency}
        available={[...accounting.availableCurrencies, ...budgetPots.map(pot => pot.currency)]}
        path="/portal/agency/agency-finance"
        label="Overview currency"
      />

      <dl className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Metric label="Cash received (net of refunds)" value={money(incomeCents, currency)} icon={ArrowDownToLine} tone="income" />
        <Metric label="Cash paid" value={money(expenseCents, currency)} icon={ReceiptText} tone="expense" />
        <Metric label="Cash net" value={money(netCents, currency)} icon={PoundSterling} tone={netCents < 0 ? "bad" : "good"} />
        <Metric label="Committed costs" value={money(accounting.committedExpenseCents, currency)} icon={ReceiptText} tone="expense" />
        <Metric label="Outstanding invoices" value={money(outstandingCents, currency)} icon={Landmark} tone="outstanding" />
        <Metric label={`Tax reserve (${taxReserveRate}%)`} value={money(indicativeTaxReserveCents, currency)} icon={CircleAlert} tone="reserve" />
        <Metric label="Missed payments" value={String(missedPaymentCount)} icon={CreditCard} tone={missedPaymentCount ? "bad" : "good"} />
        <Metric label="Clients paid in full" value={String(clientsPaidInFull)} icon={TrendingUp} tone="good" />
      </dl>

      <section className={`grid gap-4 border-l-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${balanceHealth.tone === "good" ? "border-emerald-600 bg-emerald-50" : balanceHealth.tone === "watch" ? "border-amber-500 bg-amber-50" : "border-red-600 bg-red-50"}`}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-white/80"><CircleGauge size={18} /></span>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-black/45">Balance health</p><h2 className="mt-1 text-lg font-semibold text-black/85">{balanceHealth.label}</h2><p className="mt-1 text-sm text-black/55">{money(spendableBalanceCents, currency)} after the indicative tax reserve · {money(fundedBudgetCents, currency)} funded into pots · {money(committedBudgetCents, currency)} committed.</p></div>
        </div>
        <div className="flex items-center gap-4 lg:justify-end"><div><p className="text-3xl font-semibold tabular-nums text-black/85">{balanceHealthScore}</p><p className="text-[10px] font-semibold uppercase text-black/40">Health score</p></div><a href="/portal/agency/agency-finance/budgets" className="inline-flex min-h-10 items-center gap-1 rounded-md bg-black px-3 text-sm font-semibold text-white">Manage budgets <ArrowRight size={14} /></a></div>
      </section>

      {(missingReceipts > 0 || expenses.some(expense => expense.status === "pending")) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="inline-flex items-center gap-2">
            <CircleAlert size={17} aria-hidden />
            {missingReceipts > 0 ? `${missingReceipts} paid expense${missingReceipts === 1 ? "" : "s"} need receipt evidence.` : "Expenses are waiting for review."}
          </span>
          <a href="/portal/agency/agency-finance/expenses?evidence=missing" className="font-semibold underline underline-offset-2">Review expenses</a>
        </div>
      ) : null}

      <section className="mm-surface-card overflow-hidden rounded-lg border">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5">
          <div><h2 className="text-base font-semibold text-black/85">Client collection and expansion</h2><p className="mt-1 text-sm text-black/45">The portfolio truth for payment plans, missed instalments, service-stage age and recorded upsells.</p></div>
          <span className="inline-flex items-center gap-2 rounded-md bg-black/[0.04] px-3 py-2 text-xs font-semibold text-black/55"><TimerReset size={14} /> {clientCommercialRows.length} client records</span>
        </header>
        {clientCommercialRows.length === 0 ? <Empty text="Client payment and service evidence will appear here." /> : <div className="overflow-x-auto px-4 pb-2 sm:px-5">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="border-b border-black/10 text-left text-[11px] uppercase tracking-wide text-black/45"><tr><th className="py-2">Client</th><th className="py-2">Payment position</th><th className="py-2 text-right">Agreed</th><th className="py-2 text-right">Collected</th><th className="py-2 text-right">Outstanding</th><th className="py-2 text-center">Missed</th><th className="py-2">Next due</th><th className="py-2">Longest current stage</th><th className="py-2 text-center">Upsells</th></tr></thead>
            <tbody>{clientCommercialRows.map(row => <tr key={row.client.id} className="border-b border-black/[0.07] align-top">
              <td className="py-3 pr-3"><a className="font-medium text-black/80 hover:underline" href={`/portal/clients/${row.client.id}?tab=finance`}>{row.client.name}</a></td>
              <td className="py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${paymentPositionClass(row.payment.state)}`}>{row.payment.label}</span><p className="mt-1 text-[10px] text-black/40">{row.payment.activePlans} active plan{row.payment.activePlans === 1 ? "" : "s"} · {row.payment.openInvoices} open invoice{row.payment.openInvoices === 1 ? "" : "s"}</p></td>
              <td className="py-3 text-right font-mono">{paymentPositionMoney(row.payment.currencyPositions, "agreedCents")}</td>
              <td className="py-3 text-right font-mono text-emerald-800">{paymentPositionMoney(row.payment.currencyPositions, "paidCents")}</td>
              <td className={`py-3 text-right font-mono font-semibold ${row.payment.currencyPositions.some(position => position.outstandingCents > 0) ? "text-amber-800" : "text-black/45"}`}>{paymentPositionMoney(row.payment.currencyPositions, "outstandingCents")}</td>
              <td className={`py-3 text-center font-semibold ${row.payment.missedPayments ? "text-red-700" : "text-emerald-700"}`}>{row.payment.missedPayments}</td>
              <td className="py-3 text-xs text-black/55">{row.payment.nextDueAt ? formatUkDate(row.payment.nextDueAt, { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
              <td className="py-3 text-xs text-black/55">{row.longestStage ? <><span className="font-semibold text-black/70">{humaniseId(row.longestStage.stageId)}</span><br />{duration(row.longestStage.elapsedMs)} in stage</> : "No stage timing"}</td>
              <td className="py-3 text-center"><span className="font-semibold text-black/75">{row.expansion.upsellCount}</span>{row.expansion.latestProductNames.length ? <p className="mt-1 max-w-40 text-[10px] text-black/40">Latest: {row.expansion.latestProductNames.join(", ")}</p> : null}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
        <section className="mm-surface-card overflow-hidden rounded-lg border">
          <header className="flex items-baseline justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5">
            <div>
              <h2 className="text-base font-semibold text-black/85">Client profitability</h2>
              <p className="mt-1 text-sm text-black/45">Paid client revenue less costs allocated directly to that client.</p>
            </div>
          </header>
          {profitability.length === 0 ? (
            <Empty text="Client income and allocated costs will appear here." />
          ) : (
            <div className="overflow-x-auto px-4 pb-2 sm:px-5">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-black/10 text-left text-[11px] uppercase tracking-wide text-black/45">
                  <tr><th className="py-2">Client</th><th className="py-2 text-right">Income</th><th className="py-2 text-right">Direct costs</th><th className="py-2 text-right">Gross profit</th></tr>
                </thead>
                <tbody>
                  {profitability.map(row => (
                    <tr key={row.clientId} className="border-b border-black/[0.07]">
                      <td className="py-3 pr-3"><a className="font-medium text-black/80 hover:underline" href={`/portal/clients/${row.clientId}?tab=finance`}>{row.name}</a></td>
                      <td className="py-3 text-right font-mono">{money(row.revenueCents, currency)}</td>
                      <td className="py-3 text-right font-mono text-black/55">{money(row.costCents, currency)}</td>
                      <td className={`py-3 text-right font-mono font-semibold ${row.profitCents < 0 ? "text-red-700" : "text-emerald-800"}`}>{money(row.profitCents, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mm-surface-card rounded-lg border p-4 sm:p-5">
          <div className="flex items-start gap-3"><span className="mm-area-icon grid size-9 shrink-0 place-items-center rounded-md"><Landmark size={16} /></span><div><h2 className="text-base font-semibold text-black/85">Tax record</h2>
          <p className="mt-1 text-sm text-black/45">Recorded tax only. Filing treatment depends on your registration and accountant.</p></div></div>
          <dl className="mt-4 divide-y divide-black/10 border-y border-black/10 text-sm">
            <Row label="Tax attributed to cash receipts" value={money(outputTaxCents, currency)} />
            <Row label="Recoverable tax on costs" value={money(inputTaxCents, currency)} />
            <Row label={tax.recordedLabel} value={money(tax.displayCents, currency)} strong />
          </dl>
          <a href="/portal/agency/agency-finance/reports" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-black/70 hover:text-black">
            Open tax and P&amp;L report <ArrowRight size={15} aria-hidden />
          </a>
        </section>
      </div>

      <section className="mm-surface-card overflow-hidden rounded-lg border">
        <div className="flex items-center gap-3 border-b border-black/10 px-4 py-4 sm:px-5"><span className="mm-area-icon grid size-9 shrink-0 place-items-center rounded-md"><PoundSterling size={16} /></span><h2 className="text-base font-semibold text-black/85">Recent money movement</h2></div>
        {recent.length === 0 ? <Empty text="No actual income or spending has been recorded." /> : (
          <div className="divide-y divide-black/10">
            {recent.map(item => (
              <div key={`${item.amountCents}-${item.id}`} className="mm-interactive-row flex items-center justify-between gap-4 px-4 py-3 text-sm sm:px-5">
                <div className="min-w-0"><p className="truncate font-medium text-black/80">{item.label}</p><p className="mt-0.5 text-xs text-black/45">{item.detail} · {formatUkDate(item.at, { day: "numeric", month: "short", year: "numeric" })}</p></div>
                <span className={`shrink-0 font-mono font-semibold ${item.amountCents < 0 ? "text-black/65" : "text-emerald-800"}`}>{item.amountCents < 0 ? "−" : "+"}{money(Math.abs(item.amountCents), currency)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs leading-5 text-black/40">
        This workspace supports bookkeeping and decision-making; it does not submit statutory accounts, VAT returns, payroll, or tax returns to HMRC.
      </p>
    </section>
  );
}

function Metric({ label, value, tone, icon: Icon }: { label: string; value: string; tone?: "good" | "bad" | "income" | "expense" | "outstanding" | "reserve"; icon: LucideIcon }) {
  return <div className="mm-finance-metric mm-surface-card mm-hover-lift min-w-0 rounded-lg border p-3 sm:p-4" data-finance-tone={tone ?? "income"}><div className="flex items-start justify-between gap-2"><dt className="text-xs font-medium leading-4 text-black/50">{label}</dt><span className="mm-finance-metric-icon grid size-8 shrink-0 place-items-center rounded-md"><Icon size={15} /></span></div><dd className={`mt-3 break-words text-base font-semibold sm:text-lg ${tone === "good" ? "text-emerald-800" : tone === "bad" ? "text-red-700" : "text-black/85"}`}>{value}</dd></div>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-3 py-3"><dt className="text-black/55">{label}</dt><dd className={`font-mono ${strong ? "font-semibold text-black/85" : "text-black/65"}`}>{value}</dd></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="mt-3 border-y border-dashed border-black/15 py-8 text-center text-sm text-black/45">{text}</div>;
}

function financeHealthLabel(score: number, hasData: boolean): { label: string; tone: "good" | "watch" | "bad" } {
  if (!hasData) return { label: "Add income and spending to establish your baseline", tone: "watch" };
  if (score >= 85) return { label: "Strong and controlled", tone: "good" };
  if (score >= 70) return { label: "Healthy with a few pressure points", tone: "good" };
  if (score >= 45) return { label: "Watch the balance and commitments", tone: "watch" };
  return { label: "Action needed before new commitments", tone: "bad" };
}

function paymentPositionClass(state: string): string {
  if (state === "missed-payment") return "bg-red-50 text-red-800";
  if (state === "paid-in-full") return "bg-emerald-50 text-emerald-800";
  if (state === "payment-due") return "bg-amber-50 text-amber-900";
  if (state === "payment-plan") return "bg-blue-50 text-blue-800";
  return "bg-black/5 text-black/50";
}

function humaniseId(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function duration(value: number): string {
  const hours = Math.max(0, Math.floor(value / 3_600_000));
  const days = Math.floor(hours / 24);
  return days ? `${days}d ${hours % 24}h` : `${hours}h`;
}
