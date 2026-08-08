import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type { Currency } from "../lib/domain";
import { FinanceNav } from "../components/FinanceNav";

function money(cents: number, currency: Currency): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default async function ReportsPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const to = Date.now();
  const from = Date.UTC(new Date().getUTCFullYear(), 0, 1);
  const currency = (props.install.config.defaultCurrency as Currency | undefined) ?? "gbp";
  const [snapshot, invoices, expenses] = await Promise.all([
    c.reports.revenueSnapshot({ from, to, currency }),
    c.invoices.list(),
    c.expenses.list(),
  ]);
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

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8 pb-12">
      <FinanceNav active="reports" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Finance</p>
        <h1 className="mt-1 text-2xl font-semibold text-black/90">Tax and profit report</h1>
        <p className="mt-1 text-sm text-black/55">Calendar year to date · actual transactions recorded in AquaOasis-Web.</p>
      </header>

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
