import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { buildBudgetPotSnapshots } from "../lib/budgetHealth";
import { normaliseCurrency } from "../lib/currencies";
import { containerFor } from "../server/foundationAdapter";
import { BudgetPotsWorkspace } from "../components/BudgetPotsWorkspace";
import { listAgencyCampaignBudgetRecords } from "@/lib/server/financeBudgetCampaigns";
import { resolveFinanceDefaultCurrency } from "@/lib/server/financeCurrency";
import { listTradingCompanies } from "@/server/tradingCompanies";

export const API_BASE = "/api/portal/agency-finance";

export default async function BudgetsPage(props: PluginPageProps) {
  const finance = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const defaultCurrency = resolveFinanceDefaultCurrency(props.agencyId, props.install.config.defaultCurrency);
  const [pots, expenses, campaigns, invoices, payments, otherIncome, pnl, workforcePayments] = await Promise.all([
    finance.budgets.list(true),
    finance.expenses.list(),
    listAgencyCampaignBudgetRecords(props.agencyId),
    finance.invoices.list(),
    finance.payments.list(),
    finance.income.list(),
    finance.pnl.founderSnapshot(Date.now()),
    finance.operations.listCompensationPayments(),
  ]);
  const currency = normaliseCurrency(
    pots.find(pot => pot.status === "active")?.currency ?? pnl.currency,
    defaultCurrency,
  );
  const paymentInvoiceIds = new Set(payments.map(payment => payment.invoiceId));
  const receivedCents = payments
    .filter(payment => payment.currency === currency)
    .reduce((sum, payment) => sum + payment.amountCents, 0)
    + invoices
      .filter(invoice => invoice.currency === currency && invoice.status === "paid" && !paymentInvoiceIds.has(invoice.id))
      .reduce((sum, invoice) => sum + invoice.totalCents, 0)
    + otherIncome
      .filter(entry => entry.currency === currency)
      .reduce((sum, entry) => sum + entry.amountCents, 0);
  const paidExpenseCents = expenses
    .filter(expense => expense.currency === currency && expense.status === "reimbursed")
    .reduce((sum, expense) => sum + expense.amountCents, 0);
  const recordedBalanceCents = receivedCents - paidExpenseCents;
  const taxReserveRate = Number(props.install.config.taxReserveRate ?? 20);
  const taxReserveCents = Math.max(0, Math.round(recordedBalanceCents * taxReserveRate / 100));
  const activePots = pots.filter(pot => pot.status !== "closed" && pot.currency === currency);
  const snapshots = buildBudgetPotSnapshots(pots, campaigns, expenses, workforcePayments);
  const fundedCents = activePots.reduce((sum, pot) => sum + pot.fundedCents, 0);
  const allocatedCents = activePots.reduce((sum, pot) => sum + pot.allocatedCents, 0);
  const spendableBalanceCents = recordedBalanceCents - taxReserveCents;
  const unallocatedCents = spendableBalanceCents - fundedCents;
  const averageMonthlyExpenseCents = pnl.trailingMonths.length
    ? Math.round(pnl.trailingMonths.reduce((sum, month) => sum + month.expensesCents, 0) / pnl.trailingMonths.length)
    : 0;
  const runwayMonths = averageMonthlyExpenseCents > 0 ? spendableBalanceCents / averageMonthlyExpenseCents : null;
  const overspentPots = snapshots.filter(pot => pot.status !== "closed" && pot.overspendCents > 0).length;
  const fundingCoverage = allocatedCents > 0 ? fundedCents / allocatedCents : 1;
  const hasFinancialBaseline = receivedCents > 0 || paidExpenseCents > 0 || pots.length > 0;
  const calculatedScore = Math.max(0, Math.min(100,
    100
    - (recordedBalanceCents < 0 ? 35 : 0)
    - (unallocatedCents < 0 ? 25 : 0)
    - Math.min(30, overspentPots * 12)
    - (fundingCoverage < 0.5 ? 15 : fundingCoverage < 0.8 ? 7 : 0)
    - (runwayMonths !== null && runwayMonths < 2 ? 15 : runwayMonths !== null && runwayMonths < 4 ? 7 : 0),
  ));
  const score = hasFinancialBaseline ? calculatedScore : 50;

  return <BudgetPotsWorkspace
    initialPots={snapshots}
    apiBase={API_BASE}
    companies={listTradingCompanies(props.agencyId, true).filter(company => company.status !== "archived").map(company => ({ id: company.id, name: company.name }))}
    position={{
      currency,
      score,
      hasFinancialBaseline,
      recordedBalanceCents,
      taxReserveCents,
      spendableBalanceCents,
      allocatedCents,
      fundedCents,
      unallocatedCents,
      averageMonthlyExpenseCents,
      runwayMonths,
      overspentPots,
    }}
  />;
}
