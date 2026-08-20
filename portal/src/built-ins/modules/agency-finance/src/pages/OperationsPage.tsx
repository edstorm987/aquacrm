import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { FinanceOperationsWorkspace } from "../components/FinanceOperationsWorkspace";
import { listLegalDocuments } from "@/server/legalDocuments";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { listFinanceWorkforceOptions } from "@/lib/server/finance/financeWorkforce";
import { resolveFinanceDefaultCurrency } from "@/lib/server/finance/financeCurrency";

export const API_BASE = "/api/portal/agency-finance/operations";

export default async function OperationsPage(props: PluginPageProps) {
  const finance = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const [obligations, profiles, payments, budgetPots, workforce] = await Promise.all([
    finance.operations.listObligations(true),
    finance.operations.listCompensationProfiles(true),
    finance.operations.listCompensationPayments(true),
    finance.budgets.list(),
    listFinanceWorkforceOptions(props.agencyId),
  ]);
  const currency = resolveFinanceDefaultCurrency(props.agencyId, props.install.config.defaultCurrency);

  return <FinanceOperationsWorkspace
    apiBase={API_BASE}
    defaultCurrency={currency}
    initialObligations={obligations}
    initialProfiles={profiles}
    initialPayments={payments}
    legalDocuments={listLegalDocuments(props.agencyId)}
    budgetPots={budgetPots.filter(pot => pot.status === "active")}
    companies={listTradingCompanies(props.agencyId, true).filter(company => company.status !== "archived").map(company => ({ id: company.id, name: company.name }))}
    staff={workforce.staff}
    departments={workforce.departments}
    hrEnabled={workforce.hrEnabled}
  />;
}
