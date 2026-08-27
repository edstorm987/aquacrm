import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { InvoicesList } from "../components/InvoicesList";
import { resolveFinanceDefaultCurrency } from "@/lib/server/finance/financeCurrency";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";

export const API_BASE = "/api/portal/agency-finance";

export default async function InvoicesPage(props: PluginPageProps) {
  const workspace = getAgencyWorkspaceSettings(props.agencyId);
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const [invoices, clients, template] = await Promise.all([
    c.invoices.list(),
    Promise.resolve(c.tenant.listClients?.(props.agencyId) ?? []),
    c.invoices.getTemplate(),
  ]);
  return <InvoicesList invoices={invoices} clients={clients} apiBase={API_BASE} canMutate template={template} defaultCurrency={resolveFinanceDefaultCurrency(props.agencyId, props.install.config.defaultCurrency)} defaultPaymentTermsDays={workspace.defaultPaymentTermsDays} defaultTaxRatePercent={workspace.defaultTaxRatePercent} />;
}
