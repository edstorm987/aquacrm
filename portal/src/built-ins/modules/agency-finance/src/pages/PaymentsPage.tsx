import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { IncomeSheet } from "../components/IncomeSheet";

export default async function PaymentsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const [payments, income, invoices, clients] = await Promise.all([
    c.payments.list(),
    c.income.list(),
    c.invoices.list(),
    Promise.resolve(c.tenant.listClients?.(props.agencyId) ?? []),
  ]);
  return <IncomeSheet payments={payments} otherIncome={income} invoices={invoices} clients={clients} apiBase="/api/portal/agency-finance" />;
}
