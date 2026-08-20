import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type { Currency } from "../lib/domain";
import { normaliseCurrency, SUPPORTED_CURRENCIES } from "../lib/currencies";
import { summariseAging, type AgingSummary } from "../lib/aging";
import { FinanceNav } from "../components/FinanceNav";
import { resolveFinanceDefaultCurrency } from "@/lib/server/financeCurrency";
import Link from "next/link";

function money(cents: number, currency: Currency): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default async function ReportsPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const defaultCurrency = resolveFinanceDefaultCurrency(props.agencyId, props.install.config.defaultCurrency);
  const to = Date.now();
  const from = Date.UTC(new Date().getUTCFullYear(), 0, 1);
  const [invoices, expenses, income] = await Promise.all([c.invoices.list(), c.expenses.list(), c.income.list()]);
  const availableCurrencies = Array.from(new Set([
    defaultCurrency,
    ...invoices.map(row => row.currency),
    ...expenses.map(row => row.currency),
    ...income.map(row => row.currency),
  ])).sort((a, b) => a.localeCompare(b));
  const requestedCurrency = typeof props.searchParams.currency === "string" ? props.searchParams.currency : undefined;
  const currency = normaliseCurrency(requestedCurrency, defaultCurrency);
  const snapshot = await c.reports.revenueSnapshot({ from, to, currency });
  const paidExpenses = expenses.filter(expense => expense.status === "reimbursed" && expense.currency === currency);
  const outputTax = invoices
    .filter(invoice => invoice.status === "paid" && invoice.currency === currency && invoice.paidAt && invoice.paidAt >= from)
    .reduce((sum, invoice) => sum + invoice.taxCents, 0);
  const inputTax = paidExpenses
    .filter(expense => expense.incurredAt >= from && expense.taxDeductible !== false)
    .reduce((sum, expense) => sum + (expense.taxCents ?? 0), 0);
  const deductibleCosts = paidExpenses
    .filter(expense => expense.incurredAt >= from)
    .reduce((sum, expense) => sum + Math.round(expense.amountCents * (expense.businessUsePercent ?? 100) / 100), 0);

  // AR/AP aging — outstanding invoices (owed to you) + approved-unreimbursed
  // costs (you owe), in the selected currency, bucketed by how overdue.
  const now = Date.now();
  const receivables = summariseAging(
    invoices
      .filter(invoice => (invoice.status === "sent" || invoice.status === "overdue") && invoice.currency === currency)
      .map(invoice => ({ amountCents: invoice.totalCents, dueAt: invoice.dueAt })),
    now,
  );
  const payables = summariseAging(
    expenses
      .filter(expense => expense.status === "approved" && expense.currency === currency)
      .map(expense => ({ amountCents: expense.amountCents, dueAt: expense.incurredAt })),
    now,
  );

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8 pb-12">
      <FinanceNav active="reports" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Finance</p>
        <h1 className="mt-1 text-2xl font-semibold text-black/90">Tax and profit report</h1>
        <p className="mt-1 text-sm text-black/55">Calendar year to date · actual transactions recorded in AquaOasis-Web.</p>
      </header>

      <nav aria-label="Report currency" className="flex flex-wrap items-center gap-2 rounded-md border border-black/10 bg-black/[0.018] p-3">
        <span className="mr-1 text-xs font-semibold text-black/50">Currency</span>
        {availableCurrencies.map(code => {
          const active = code === currency;
          const label = SUPPORTED_CURRENCIES.find(item => item.code === code)?.code.toUpperCase() ?? code.toUpperCase();
          return <Link key={code} href={`/portal/agency/agency-finance/reports?currency=${code}`} aria-current={active ? "page" : undefined} className={`min-h-9 rounded-md border px-3 py-2 text-xs font-semibold ${active ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/60 hover:bg-black/[0.03]"}`}>{label}</Link>;
        })}
      </nav>

      <dl className="grid grid-cols-2 border-y border-black/10 lg:grid-cols-5">
        <Metric label="Income received" value={money(snapshot.totalPaidCents, currency)} />
        <Metric label="Deductible costs" value={money(deductibleCosts, currency)} />
        <Metric label="Cash profit" value={money(snapshot.totalPaidCents - snapshot.totalExpensesCents, currency)} />
        <Metric label="Tax charged" value={money(outputTax, currency)} />
        <Metric label="Tax balance" value={money(Math.max(0, outputTax - inputTax), currency)} />
      </dl>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-base font-semibold text-black/85">Costs by category</h2>
          <div className="mt-3 divide-y divide-black/10 border-y border-black/10 text-sm">
            {snapshot.expensesByCategory.length === 0 ? <p className="py-8 text-center text-black/45">No costs recorded this year.</p> : snapshot.expensesByCategory.map(category => (
              <div key={category.categoryId} className="flex items-center justify-between gap-4 py-3">
                <div><p className="font-medium text-black/75">{category.categoryName}</p><p className="text-xs text-black/40">{category.count} transaction{category.count === 1 ? "" : "s"}</p></div>
                <span className="font-mono font-semibold text-black/75">{money(category.amountCents, currency)}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-black/85">Tax evidence</h2>
          <dl className="mt-3 divide-y divide-black/10 border-y border-black/10 text-sm">
            <Row label="Tax charged on paid invoices" value={money(outputTax, currency)} />
            <Row label="Recoverable tax recorded" value={money(inputTax, currency)} />
            <Row label="Recorded tax balance" value={money(Math.max(0, outputTax - inputTax), currency)} strong />
            <Row label="Expenses missing receipts" value={String(paidExpenses.filter(expense => !expense.receiptUrl && !expense.attachments?.length).length)} />
          </dl>
        </section>
      </div>

      <section>
        <h2 className="text-base font-semibold text-black/85">Aging — who owes you, what you owe</h2>
        <p className="mt-1 text-xs text-black/45">Outstanding invoices (receivables) and approved-unpaid costs (payables), by how overdue they are · {currency.toUpperCase()}.</p>
        <div className="mt-3 grid gap-8 lg:grid-cols-2">
          <AgingTable title="Receivables — owed to you" summary={receivables} currency={currency} emptyText="No outstanding invoices." />
          <AgingTable title="Payables — you owe" summary={payables} currency={currency} emptyText="No approved costs awaiting payment." />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-black/85">Monthly cash movement</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-black/10 text-left text-[11px] uppercase tracking-wide text-black/45"><tr><th className="py-2">Month</th><th className="py-2 text-right">Income</th><th className="py-2 text-right">Costs</th><th className="py-2 text-right">Net</th></tr></thead>
            <tbody>
              {snapshot.monthly.map(month => (
                <tr key={`${month.year}-${month.month}`} className="border-b border-black/[0.07]">
                  <td className="py-3">{new Date(Date.UTC(month.year, month.month - 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</td>
                  <td className="py-3 text-right font-mono">{money(month.paidCents, currency)}</td>
                  <td className="py-3 text-right font-mono text-black/55">{money(month.expenseCents, currency)}</td>
                  <td className="py-3 text-right font-mono font-semibold">{money(month.paidCents - month.expenseCents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs leading-5 text-black/40">
        This report is an internal bookkeeping view, not a submitted tax return. Confirm VAT, allowable expenses, accounting period, and filing figures with a qualified accountant.
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="px-3 py-4 first:pl-0"><dt className="text-xs font-medium text-black/45">{label}</dt><dd className="mt-1 text-lg font-semibold text-black/85">{value}</dd></div>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-4 py-3"><dt className="text-black/55">{label}</dt><dd className={`font-mono ${strong ? "font-semibold text-black/85" : "text-black/65"}`}>{value}</dd></div>;
}

function AgingTable({ title, summary, currency, emptyText }: { title: string; summary: AgingSummary; currency: Currency; emptyText: string }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-black/80">{title}</h3>
        <span className="font-mono text-sm font-semibold text-black/85">{money(summary.totalCents, currency)}</span>
      </div>
      {summary.count === 0 ? (
        <p className="mt-3 border-y border-black/10 py-8 text-center text-sm text-black/45">{emptyText}</p>
      ) : (
        <>
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-black/10 border-y border-black/10">
              {summary.buckets.map(bucket => (
                <tr key={bucket.key} className={bucket.key !== "current" && bucket.totalCents > 0 ? "text-red-800" : ""}>
                  <td className="py-2.5 text-black/60">{bucket.label}</td>
                  <td className="py-2.5 text-right text-xs text-black/40">{bucket.count}</td>
                  <td className="py-2.5 text-right font-mono font-medium">{money(bucket.totalCents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-black/45"><strong className="text-black/70">{money(summary.overdueCents, currency)}</strong> overdue of {money(summary.totalCents, currency)}.</p>
        </>
      )}
    </section>
  );
}
