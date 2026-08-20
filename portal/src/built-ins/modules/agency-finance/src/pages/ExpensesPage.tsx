import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { ExpensesList } from "../components/ExpensesList";
import { resolveFinanceDefaultCurrency } from "@/lib/server/finance/financeCurrency";

export const API_BASE = "/api/portal/agency-finance";

export default async function ExpensesPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const [expenses, categories, clients, budgetPots] = await Promise.all([
    c.expenses.list(),
    c.categories.list(),
    Promise.resolve(c.tenant.listClients?.(props.agencyId) ?? []),
    c.budgets.list(),
  ]);
  return <ExpensesList expenses={expenses} categories={categories} clients={clients} budgetPots={budgetPots} apiBase={API_BASE} canMutate defaultCurrency={resolveFinanceDefaultCurrency(props.agencyId, props.install.config.defaultCurrency)} />;
}
