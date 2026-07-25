import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type { Currency } from "../lib/domain";

function fmt(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default async function ReportsPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  // Default window: trailing 12 months ending today.
  const to = Date.now();
  const from = to - 365 * 24 * 60 * 60 * 1000;
  const currency = (props.install.config.defaultCurrency as Currency | undefined) ?? "usd";
  const snapshot = await c.reports.revenueSnapshot({ from, to, currency });

  return (
    <section className="finance-reports">
      <header>
        <h1>Revenue snapshot</h1>
        <p>Trailing 12 months · {currency.toUpperCase()}</p>
      </header>

      <dl className="finance-stats">
        <div><dt>Invoices issued</dt><dd>{snapshot.invoicesIssued}</dd></div>
        <div><dt>Invoices paid</dt><dd>{snapshot.invoicesPaid}</dd></div>
        <div><dt>Total issued</dt><dd>{fmt(snapshot.totalIssuedCents)}</dd></div>
        <div><dt>Total paid</dt><dd>{fmt(snapshot.totalPaidCents)}</dd></div>
        <div><dt>Outstanding (overdue)</dt><dd>{fmt(snapshot.totalOverdueCents)}</dd></div>
        <div><dt>Expenses (reimbursed)</dt><dd>{fmt(snapshot.totalExpensesCents)}</dd></div>
        <div><dt>Net</dt><dd>{fmt(snapshot.netCents)}</dd></div>
      </dl>

      <h2>Expenses by category</h2>
      <table className="finance-reports-table">
        <thead><tr><th>Category</th><th>Count</th><th>Amount</th></tr></thead>
        <tbody>
          {snapshot.expensesByCategory.map(c => (
            <tr key={c.categoryId}>
              <td>{c.categoryName}</td>
              <td>{c.count}</td>
              <td>{fmt(c.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Monthly trend</h2>
      <table className="finance-reports-table">
        <thead><tr><th>Month</th><th>Paid</th><th>Expense</th></tr></thead>
        <tbody>
          {snapshot.monthly.map(m => (
            <tr key={`${m.year}-${m.month}`}>
              <td>{m.year}-{String(m.month).padStart(2, "0")}</td>
              <td>{fmt(m.paidCents)}</td>
              <td>{fmt(m.expenseCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
