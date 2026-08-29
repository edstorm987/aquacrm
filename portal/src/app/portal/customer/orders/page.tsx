import Link from "next/link";
import { Download, PackageCheck, ShoppingBag, Truck } from "lucide-react";

import { ensureEcommerceFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/ecommerceFoundation";
import { formatPrice } from "@aqua/plugin-ecommerce/lib/admin/orders";
import { containerFor } from "@aqua/plugin-ecommerce/server";
import { requireRole } from "@/lib/server/auth/auth";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { ensureHydrated } from "@/server/storage";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import { CUSTOMER_PORTAL_ROLES } from "@/server/types";

export default async function OrdersPage() {
  await ensureHydrated();
  ensureEcommerceFoundationRegistered();
  const session = await requireRole([...CUSTOMER_PORTAL_ROLES]);
  if (!session.clientId) return <OrderNotice title="Account scope missing" detail="Your account is not tied to a client workspace." />;

  const install = getInstall({ agencyId: session.agencyId, clientId: session.clientId }, "ecommerce");
  if (!install?.enabled) return <OrderNotice title="Orders are not active" detail="This client workspace does not currently have commerce enabled." />;

  const orders = (await containerFor(makePluginStorage(install.id)).orders.listOrdersForClient(session.clientId))
    .filter(order => order.endCustomerUserId === session.userId || order.customerEmail?.toLowerCase() === session.email.toLowerCase());

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-12">
      <header className="border-b border-black/10 pb-5">
        <p className="text-xs font-semibold uppercase text-brand">Account activity</p>
        <h1 className="mt-2 text-3xl font-semibold text-black/90">Orders</h1>
        <p className="mt-2 text-sm text-black/55">Your purchases, fulfilment status, tracking, and available downloads.</p>
      </header>

      {orders.length ? (
        <div className="grid gap-3">
          {orders.map(order => (
            <article key={order.id} className="rounded-md border border-black/10 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-black/40">{order.id}</p>
                  <h2 className="mt-1 text-lg font-semibold text-black/85">{order.items.map(item => item.name).join(", ") || "Order"}</h2>
                  <p className="mt-1 text-sm text-black/50">{formatUkDate(order.createdAt, { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-black/90">{formatPrice(order.amountTotal, order.currency)}</p>
                  <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-black/[0.05] px-2.5 py-1 text-xs font-semibold capitalize text-black/60"><PackageCheck size={13} aria-hidden="true" />{order.status}</span>
                </div>
              </div>
              <div className="mt-4 grid gap-2 border-t border-black/8 pt-4 text-sm text-black/60">
                {order.items.map((item, index) => (
                  <div key={`${order.id}-${index}`} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{item.quantity} x {item.name}</span>
                    <span className="flex items-center gap-3">
                      <span>{formatPrice(item.unitAmount * item.quantity, item.currency)}</span>
                      {item.downloadUrl ? <a href={item.downloadUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"><Download size={14} aria-hidden="true" />Download</a> : null}
                    </span>
                  </div>
                ))}
                {order.trackingNumber ? <p className="mt-2 inline-flex items-center gap-2 text-black/70"><Truck size={15} aria-hidden="true" />{order.trackingCarrier ? `${order.trackingCarrier}: ` : "Tracking: "}{order.trackingNumber}</p> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-black/15 bg-white/60 p-8 text-center">
          <ShoppingBag className="mx-auto text-black/25" size={28} aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold text-black/85">No orders yet</h2>
          <p className="mt-1 text-sm text-black/50">Purchases made with this account will appear here automatically.</p>
        </div>
      )}
    </div>
  );
}

function OrderNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div role="status" className="rounded-md border border-dashed border-black/15 bg-white/60 p-6">
      <h1 className="text-lg font-semibold text-black/90">{title}</h1>
      <p className="mt-1 text-sm text-black/60">{detail}</p>
      <Link href="/portal/customer" className="mt-3 inline-flex text-sm font-semibold text-brand hover:underline">Back to home</Link>
    </div>
  );
}
