// `/portal/clients/[clientId]/ecommerce/orders`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { OrdersList } from "../components/admin/OrdersList";
import { API_BASE } from "./ProductsPage";

export default async function OrdersPage(props: PluginPageProps) {
  if (!props.clientId) return <p>Pick a client to view orders.</p>;
  const c = containerFor(props.storage);
  const orders = await c.orders.listOrdersForClient(props.clientId, 500);
  return <OrdersList orders={orders} apiBase={API_BASE} />;
}
