// `/portal/clients/[clientId]/ecommerce/orders/[id]`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { OrderDetail } from "../components/admin/OrderDetail";
import { API_BASE } from "./ProductsPage";

export default async function OrderDetailPage(props: PluginPageProps) {
  const id = props.segments[0];
  if (!id) return <p>Missing order id.</p>;
  const c = containerFor(props.storage);
  const order = await c.orders.getOrder(id);
  if (!order) return <p>Order not found.</p>;
  if (props.clientId && order.clientId !== props.clientId) return <p>Order not found.</p>;
  return <OrderDetail order={order} apiBase={API_BASE} />;
}
