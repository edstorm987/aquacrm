// `/portal/clients/[clientId]/ecommerce/customers/[email]`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { customerOrders, summariseCustomers } from "../lib/admin/customers";
import { formatPrice } from "../lib/admin/orders";

export default async function CustomerDetailPage(props: PluginPageProps) {
  const email = props.segments[0] ? decodeURIComponent(props.segments[0]) : null;
  if (!email) return <p>Missing email.</p>;
  if (!props.clientId) return <p>Pick a client.</p>;
  const c = containerFor(props.storage);
  const orders = await c.orders.listOrdersForClient(props.clientId, 1000);
  const list = customerOrders(orders, email);
  const summary = summariseCustomers(orders).find(s => s.email.toLowerCase() === email.toLowerCase());
  if (!summary) return <p>No orders for {email}.</p>;
  return (
    <article className="ecom-customer-detail">
      <header>
        <h1>{summary.name ?? summary.email}</h1>
        <p>{summary.email}</p>
        <p>{summary.totalOrders} order{summary.totalOrders === 1 ? "" : "s"} · {formatPrice(summary.totalSpent, "gbp")} spent</p>
      </header>
      <h2>Orders</h2>
      <ul>
        {list.map(o => (
          <li key={o.id}>
            <a href={`../orders/${o.id}`}>{o.id}</a>
            {" — "}
            {formatPrice(o.amountTotal, o.currency)}
            {" — "}
            <span className={`ecom-status ecom-status-${o.status}`}>{o.status}</span>
            {" — "}
            {new Date(o.createdAt).toLocaleDateString()}
          </li>
        ))}
      </ul>
    </article>
  );
}
