// `/portal/clients/[clientId]/ecommerce/orders/[id]/receipt`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { formatPrice } from "../lib/admin/orders";

export default async function OrderReceiptPage(props: PluginPageProps) {
  const id = props.segments[0];
  if (!id) return <p>Missing order id.</p>;
  const c = containerFor(props.storage);
  const order = await c.orders.getOrder(id);
  if (!order) return <p>Order not found.</p>;
  if (props.clientId && order.clientId !== props.clientId) return <p>Order not found.</p>;

  const lineTotal = order.items.reduce((s, it) => s + it.unitAmount * it.quantity, 0);

  return (
    <article className="ecom-receipt">
      <header>
        <h1>Receipt — {order.id}</h1>
        <p>{new Date(order.paidAt ?? order.createdAt).toLocaleString()}</p>
      </header>
      <section>
        <h2>Customer</h2>
        <p>{order.customerName ?? "—"}</p>
        <p>{order.customerEmail ?? "—"}</p>
      </section>
      {order.shippingAddress && (
        <section>
          <h2>Shipping</h2>
          <address>
            {order.shippingAddress.line1}<br />
            {order.shippingAddress.line2 && <>{order.shippingAddress.line2}<br /></>}
            {order.shippingAddress.city} {order.shippingAddress.postalCode}<br />
            {order.shippingAddress.country}
          </address>
        </section>
      )}
      <section>
        <h2>Items</h2>
        <table>
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i}>
                <td>{it.name}</td>
                <td>{it.quantity}</td>
                <td>{formatPrice(it.unitAmount, it.currency)}</td>
                <td>{formatPrice(it.unitAmount * it.quantity, it.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3}>Subtotal</td><td>{formatPrice(lineTotal, order.currency)}</td></tr>
            <tr><td colSpan={3}>Total</td><td><strong>{formatPrice(order.amountTotal, order.currency)}</strong></td></tr>
          </tfoot>
        </table>
      </section>
    </article>
  );
}
