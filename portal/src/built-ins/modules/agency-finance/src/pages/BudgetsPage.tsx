import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { buildBudgetPotSnapshots } from "../lib/budgetHealth";
import { normaliseCurrency } from "../lib/currencies";
import { containerFor } from "../server/foundationAdapter";
import { BudgetPotsWorkspace } from "../components/BudgetPotsWorkspace";
import { listAgencyCampaignBudgetRecords } from "@/lib/server/finance/financeBudgetCampaigns";
import { resolveFinanceDefaultCurrency } from "@/lib/server/finance/financeCurrency";
import { listTradingCompanies } from "@/server/tradingCompanies";

export const API_BASE = "/api/portal/agency-finance";

export default async function BudgetsPage(props: PluginPageProps) {
  const finance = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const defaultCurrency = resolveFinanceDefaultCurrency(props.agencyId, props.install.config.defaultCurrency);
  const requestedCurrency = typeof props.searchParams.currency === "string" ? props.searchParams.currency : undefined;
  const currency = normaliseCurrency(requestedCurrency, defaultCurrency);
  const now = Date.now();
  const [pots, expenses, campaigns, accounting, pnl, workforcePayments] = await Promise.all([
    finance.budgets.list(true),
    finance.expenses.list(),
    listAgencyCampaignBudgetRecords(props.agencyId),
    finance.accounting.snapshot({ from: 0, to: now, currency }),
    finance.pnl.founderSnapshot(now, 30, currency),
    finance.operations.listCompensationPayments(),
  ]);
  const receivedCents = accounting.cashRevenueCents;
  const paidExpenseCents = accounting.cashExpenseCents;
  const recordedBalanceCents = accounting.cashNetCents;
  const taxReserveRate = Number(props.install.config.taxReserveRate ?? 20);
  const taxReserveCents = Math.max(0, Math.round(recordedBalanceCents * taxReserveRate / 100));
  const activePots = pots.filter(pot => pot.status !== "closed" && pot.currency === currency);
  const snapshots = buildBudgetPotSnapshots(pots, campaigns, expenses, workforcePayments);
  const fundedCents = activePots.reduce((sum, pot) => sum + pot.fundedCents, 0);
  const allocatedCents = activePots.reduce((sum, pot) => sum + pot.allocatedCents, 0);
  const spendableBalanceCents = recordedBalanceCents - taxReserveCents;
  const unallocatedCents = spendableBalanceCents - fundedCents;
  const averageMonthlyExpenseCents = pnl.trailingMonths.length
    ? Math.round(pnl.trailingMonths.reduce((sum, month) => sum + month.cashExpenseCents, 0) / pnl.trailingMonths.length)
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
    availableCurrencies={[...accounting.availableCurrencies, ...pnl.availableCurrencies, ...pots.map(pot => pot.currency)]}
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
