import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { InvoicesList } from "../components/InvoicesList";

export const API_BASE = "/api/portal/agency-finance";

export default async function InvoicesPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const invoices = await c.invoices.list();
  return <InvoicesList invoices={invoices} apiBase={API_BASE} canMutate />;
}
