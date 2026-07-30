import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { ExpensesList } from "../components/ExpensesList";

export const API_BASE = "/api/portal/agency-finance";

export default async function ExpensesPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const [expenses, categories, clients] = await Promise.all([
    c.expenses.list(),
    c.categories.list(),
    Promise.resolve(c.tenant.listClients?.(props.agencyId) ?? []),
  ]);
  return <ExpensesList expenses={expenses} categories={categories} clients={clients} apiBase={API_BASE} canMutate />;
}
