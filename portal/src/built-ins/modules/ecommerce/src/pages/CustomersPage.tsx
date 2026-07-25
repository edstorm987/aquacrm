// `/portal/clients/[clientId]/ecommerce/customers`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { summariseCustomers } from "../lib/admin/customers";
import { CustomersList } from "../components/admin/CustomersList";

export default async function CustomersPage(props: PluginPageProps) {
  if (!props.clientId) return <p>Pick a client to view customers.</p>;
  const c = containerFor(props.storage);
  const orders = await c.orders.listOrdersForClient(props.clientId, 1000);
  const customers = summariseCustomers(orders);
  return <CustomersList customers={customers} />;
}
