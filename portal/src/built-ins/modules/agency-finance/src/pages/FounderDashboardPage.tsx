import { ArrowRight, CircleAlert } from "lucide-react";
import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { FinanceNav } from "../components/FinanceNav";

function money(cents: number, currency = "gbp"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default async function FounderDashboardPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const [invoices, expenses, payments, otherIncome, plans, clients] = await Promise.all([
    c.invoices.list(),
    c.expenses.list(),
    c.payments.list(),
    c.income.list(),
    c.plans.list(false),
    Promise.resolve(c.tenant.listClients?.(props.agencyId) ?? []),
  ]);

  const currency = invoices[0]?.currency ?? expenses[0]?.currency ?? plans[0]?.currency ?? "gbp";
  const paidExpenses = expenses.filter(expense => expense.status === "reimbursed" && expense.currency === currency);
  const paymentInvoiceIds = new Set(payments.map(payment => payment.invoiceId));
  const legacyPaidInvoices = invoices.filter(invoice =>
    invoice.currency === currency && invoice.status === "paid" && !paymentInvoiceIds.has(invoice.id),
  );
  const incomeCents = payments
    .filter(payment => payment.currency === currency)
    .reduce((sum, payment) => sum + payment.amountCents, 0)
    + legacyPaidInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0)
    + otherIncome.filter(entry => entry.currency === currency).reduce((sum, entry) => sum + entry.amountCents, 0);
  const expenseCents = paidExpenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const netCents = incomeCents - expenseCents;
  const outputTaxCents = invoices
    .filter(invoice => invoice.status === "paid" && invoice.currency === currency)
    .reduce((sum, invoice) => sum + invoice.taxCents, 0);
  const inputTaxCents = paidExpenses.reduce(
    (sum, expense) => sum + (expense.taxDeductible === false ? 0 : (expense.taxCents ?? 0)),
    0,
  );
  const taxReserveRate = Number(props.install.config.taxReserveRate ?? 20);
  const indicativeTaxReserveCents = Math.max(0, Math.round(netCents * taxReserveRate / 100));
  const outstandingCents = invoices
    .filter(invoice => invoice.currency === currency && ["sent", "overdue"].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const missingReceipts = paidExpenses.filter(expense => !expense.receiptUrl).length;

  const clientNameById = new Map(clients.map(client => [client.id, client.name]));
  const profitability = clients.map(client => {
    const revenueCents = invoices
      .filter(invoice => invoice.clientId === client.id && invoice.status === "paid" && invoice.currency === currency)
      .reduce((sum, invoice) => sum + invoice.totalCents, 0);
    const costCents = paidExpenses
      .filter(expense => expense.clientId === client.id)
      .reduce((sum, expense) => sum + expense.amountCents, 0);
    return {
      clientId: client.id,
      name: client.name,
      revenueCents,
      costCents,
      profitCents: revenueCents - costCents,
    };
  }).filter(row => row.revenueCents > 0 || row.costCents > 0)
    .sort((a, b) => b.profitCents - a.profitCents);

  const recent = [
    ...paidExpenses.map(expense => ({
      id: expense.id,
      at: expense.incurredAt,
      label: expense.vendor || expense.description || "Expense",
      detail: expense.clientId ? clientNameById.get(expense.clientId) ?? "Client cost" : "Business overhead",
      amountCents: -expense.amountCents,
    })),
    ...invoices.filter(invoice => invoice.status === "paid").map(invoice => ({
      id: invoice.id,
      at: invoice.paidAt ?? invoice.issuedAt,
      label: invoice.number,
      detail: clientNameById.get(invoice.clientId) ?? "Client payment",
      amountCents: invoice.totalCents,
    })),
    ...otherIncome.map(entry => ({
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
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Milesymedia books</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90">Finance overview</h1>
          <p className="mt-1 text-sm text-black/55">Actual recorded income, business spending, tax evidence, and client profitability.</p>
        </div>
        <div className="flex gap-2">
          <a href="/portal/agency/agency-finance/invoices" className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/[0.03]">Create invoice</a>
          <a href="/portal/agency/agency-finance/expenses" className="rounded-md bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-black/85">Add expense</a>
        </div>
      </header>

      <dl className="grid grid-cols-2 border-y border-black/10 lg:grid-cols-5">
        <Metric label="Income received" value={money(incomeCents, currency)} />
        <Metric label="Paid expenses" value={money(expenseCents, currency)} />
        <Metric label="Operating profit" value={money(netCents, currency)} tone={netCents < 0 ? "bad" : "good"} />
        <Metric label="Outstanding invoices" value={money(outstandingCents, currency)} />
        <Metric label={`Tax reserve (${taxReserveRate}%)`} value={money(indicativeTaxReserveCents, currency)} />
      </dl>

      {(missingReceipts > 0 || expenses.some(expense => expense.status === "pending")) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="inline-flex items-center gap-2">
            <CircleAlert size={17} aria-hidden />
            {missingReceipts > 0 ? `${missingReceipts} paid expense${missingReceipts === 1 ? "" : "s"} need receipt evidence.` : "Expenses are waiting for review."}
          </span>
          <a href="/portal/agency/agency-finance/expenses" className="font-semibold underline underline-offset-2">Review expenses</a>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
        <section>
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-black/85">Client profitability</h2>
              <p className="mt-1 text-sm text-black/45">Paid client revenue less costs allocated directly to that client.</p>
            </div>
          </header>
          {profitability.length === 0 ? (
            <Empty text="Client income and allocated costs will appear here." />
          ) : (
            <div className="overflow-x-auto">
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

        <section>
          <h2 className="text-base font-semibold text-black/85">Tax record</h2>
          <p className="mt-1 text-sm text-black/45">Recorded tax only. Filing treatment depends on your registration and accountant.</p>
          <dl className="mt-4 divide-y divide-black/10 border-y border-black/10 text-sm">
            <Row label="Tax charged on paid invoices" value={money(outputTaxCents, currency)} />
            <Row label="Recoverable tax on costs" value={money(inputTaxCents, currency)} />
            <Row label="Recorded balance" value={money(Math.max(0, outputTaxCents - inputTaxCents), currency)} strong />
          </dl>
          <a href="/portal/agency/agency-finance/reports" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-black/70 hover:text-black">
            Open tax and P&amp;L report <ArrowRight size={15} aria-hidden />
          </a>
        </section>
      </div>

      <section>
        <h2 className="text-base font-semibold text-black/85">Recent money movement</h2>
        {recent.length === 0 ? <Empty text="No actual income or spending has been recorded." /> : (
          <div className="mt-3 divide-y divide-black/10 border-y border-black/10">
            {recent.map(item => (
              <div key={`${item.amountCents}-${item.id}`} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div className="min-w-0"><p className="truncate font-medium text-black/80">{item.label}</p><p className="mt-0.5 text-xs text-black/45">{item.detail} · {new Date(item.at).toLocaleDateString("en-GB")}</p></div>
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

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return <div className="px-3 py-4 first:pl-0"><dt className="text-xs font-medium text-black/45">{label}</dt><dd className={`mt-1 text-lg font-semibold ${tone === "good" ? "text-emerald-800" : tone === "bad" ? "text-red-700" : "text-black/85"}`}>{value}</dd></div>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-3 py-3"><dt className="text-black/55">{label}</dt><dd className={`font-mono ${strong ? "font-semibold text-black/85" : "text-black/65"}`}>{value}</dd></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="mt-3 border-y border-dashed border-black/15 py-8 text-center text-sm text-black/45">{text}</div>;
}
