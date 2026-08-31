"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  Check,
  CircleDollarSign,
  Clock3,
  Globe2,
  Headphones,
  Minus,
  PackageCheck,
  PackageSearch,
  Plus,
  RotateCcw,
  ShoppingBag,
  TriangleAlert,
  UserRound,
  Warehouse,
} from "lucide-react";

type Mode = "storefront" | "orders" | "inventory" | "customer";
type OrderStage = "Ordered" | "Supplier sent" | "Tracking" | "Delivered";

const modes = [
  { id: "storefront" as const, label: "Storefront", icon: Globe2 },
  { id: "orders" as const, label: "Order workflow", icon: PackageSearch },
  { id: "inventory" as const, label: "Inventory", icon: Warehouse },
  { id: "customer" as const, label: "Customer account", icon: UserRound },
];

const stageOrder: OrderStage[] = ["Ordered", "Supplier sent", "Tracking", "Delivered"];

const startingOrders = [
  { id: "BST-1048", customer: "Alex Morgan", item: "Adventure Hoodie", total: 64, stage: "Ordered" as OrderStage },
  { id: "BST-1047", customer: "Jamie Reed", item: "Street Deck", total: 78, stage: "Supplier sent" as OrderStage },
  { id: "BST-1046", customer: "Taylor James", item: "Fishing Cap", total: 24, stage: "Tracking" as OrderStage },
  { id: "BST-1045", customer: "Morgan Lee", item: "Trail Tee", total: 28, stage: "Delivered" as OrderStage },
];

const startingStock = [
  { id: "tee", name: "Essential Print Tee", sku: "BST-TEE-01", stock: 8, reserved: 3 },
  { id: "hoodie", name: "Adventure Hoodie", sku: "BST-HDY-02", stock: 4, reserved: 2 },
  { id: "deck", name: "Street Deck", sku: "BST-DCK-03", stock: 2, reserved: 1 },
  { id: "cap", name: "Fishing Cap", sku: "BST-CAP-04", stock: 12, reserved: 2 },
];

export function BeastCommerceDemo() {
  const [mode, setMode] = useState<Mode>("storefront");
  const [orders, setOrders] = useState(startingOrders);
  const [stock, setStock] = useState(startingStock);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [storeView, setStoreView] = useState<"public" | "operations">("public");

  const lowStock = useMemo(
    () => stock.filter((item) => item.stock - item.reserved <= 2).length,
    [stock],
  );

  function advanceOrder(id: string) {
    setOrders((current) =>
      current.map((order) => {
        if (order.id !== id) return order;
        const index = stageOrder.indexOf(order.stage);
        return { ...order, stage: stageOrder[Math.min(index + 1, stageOrder.length - 1)] };
      }),
    );
  }

  function adjustStock(id: string, amount: number) {
    setStock((current) =>
      current.map((item) =>
        item.id === id ? { ...item, stock: Math.max(0, item.stock + amount) } : item,
      ),
    );
  }

  return (
    <section className="bg-[#17211F] px-5 py-16 text-white sm:px-8 lg:px-12 lg:py-24">
      <div className="mx-auto max-w-[1344px]">
        <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold text-[#8FC1B8]">Interactive system tour</p>
            <h2 className="mt-4 text-4xl font-semibold leading-[1.04] sm:text-5xl">
              Follow the order through.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-white/68">
            Move from the public shop into fulfilment, inventory and the
            customer account that carries the experience forward.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-2 lg:grid-cols-4" role="group" aria-label="Beast commerce system surfaces">
          {modes.map((item) => {
            const Icon = item.icon;
            const selected = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => setMode(item.id)}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                  selected
                    ? "border-[#D7A85D] bg-[#D7A85D] text-[#201608]"
                    : "border-white/16 bg-white/[0.04] text-white/70 hover:border-white/32 hover:text-white"
                }`}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 min-h-[570px] overflow-hidden rounded-md border border-white/14 bg-[#F4F3EE] text-[#171714] shadow-2xl shadow-black/30">
          {mode === "storefront" ? (
            <div>
              <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-white px-4">
                <p className="text-sm font-semibold">Beast connected commerce</p>
                <div className="flex rounded border border-[#D6D3CB] p-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setStoreView("public")}
                    className={`rounded px-3 py-1.5 ${storeView === "public" ? "bg-[#171714] text-white" : "text-[#5D625D]"}`}
                  >
                    Storefront
                  </button>
                  <button
                    type="button"
                    onClick={() => setStoreView("operations")}
                    className={`rounded px-3 py-1.5 ${storeView === "operations" ? "bg-[#171714] text-white" : "text-[#5D625D]"}`}
                  >
                    Operations
                  </button>
                </div>
              </div>
              <div className="relative aspect-[16/9] min-h-[300px] overflow-hidden bg-[#11120F]">
                <Image
                  src={
                    storeView === "public"
                      ? "/portfolio/beast-commerce/storefront-preview.png"
                      : "/portfolio/beast-commerce/operations-preview.png"
                  }
                  alt={storeView === "public" ? "Beast storefront" : "Beast operations dashboard"}
                  fill
                  sizes="(max-width: 1344px) 100vw, 1344px"
                  className="object-cover object-top"
                />
              </div>
              <div className="grid divide-y divide-black/10 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {[
                  ["One shared basket", "Distinct collections sell through one customer journey."],
                  ["Made to order", "Products can trigger fulfilment rather than relying only on shelf stock."],
                  ["One operating view", "Orders, stock and customer communication stay connected."],
                ].map(([title, text]) => (
                  <div key={title} className="p-5">
                    <p className="font-semibold">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-[#5D625D]">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "orders" ? (
            <div className="p-5 sm:p-8">
              <div className="flex flex-col justify-between gap-4 border-b border-[#D6D3CB] pb-5 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#28736B]">Fulfilment</p>
                  <h3 className="mt-1 text-2xl font-semibold">Order workflow</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOrders(startingOrders)}
                  className="inline-flex h-9 items-center gap-2 rounded border border-[#D6D3CB] bg-white px-3 text-sm font-semibold"
                >
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />
                  Reset demo
                </button>
              </div>
              <div className="mt-6 grid gap-3">
                {orders.map((order) => {
                  const complete = order.stage === "Delivered";
                  return (
                    <div
                      key={order.id}
                      className="grid gap-4 rounded-md border border-[#D6D3CB] bg-white p-4 md:grid-cols-[0.8fr_1.2fr_0.6fr_0.9fr_auto] md:items-center"
                    >
                      <div>
                        <p className="text-xs text-[#6A706A]">{order.id}</p>
                        <p className="mt-1 font-semibold">{order.customer}</p>
                      </div>
                      <p className="text-sm text-[#454A45]">{order.item}</p>
                      <p className="font-semibold">£{order.total.toFixed(2)}</p>
                      <span className="w-fit rounded bg-[#E8EFEC] px-3 py-1.5 text-xs font-semibold text-[#205F59]">
                        {order.stage}
                      </span>
                      <button
                        type="button"
                        disabled={complete}
                        onClick={() => advanceOrder(order.id)}
                        className="h-9 rounded bg-[#205F59] px-3 text-xs font-semibold text-white disabled:bg-[#E5E3DD] disabled:text-[#8A8E89]"
                      >
                        {complete ? "Complete" : "Move next"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {mode === "inventory" ? (
            <div className="grid min-h-[570px] lg:grid-cols-[1fr_310px]">
              <div className="p-5 sm:p-8">
                <div className="border-b border-[#D6D3CB] pb-5">
                  <p className="text-xs font-semibold uppercase text-[#28736B]">Stock control</p>
                  <h3 className="mt-1 text-2xl font-semibold">Inventory</h3>
                </div>
                <div className="mt-6 divide-y divide-[#E1DED7] rounded-md border border-[#D6D3CB] bg-white">
                  {stock.map((item) => {
                    const available = item.stock - item.reserved;
                    return (
                      <div key={item.id} className="grid gap-4 p-4 sm:grid-cols-[1fr_90px_110px_auto] sm:items-center">
                        <div>
                          <p className="font-semibold">{item.name}</p>
                          <p className="mt-1 text-xs text-[#6A706A]">{item.sku}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#6A706A]">Available</p>
                          <p className={`mt-1 font-semibold ${available <= 2 ? "text-[#A4563B]" : ""}`}>{available}</p>
                        </div>
                        <p className="text-sm text-[#5D625D]">{item.reserved} reserved</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Reduce ${item.name} stock`}
                            onClick={() => adjustStock(item.id, -1)}
                            className="grid h-8 w-8 place-items-center rounded border border-[#D6D3CB]"
                          >
                            <Minus aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm">{item.stock}</span>
                          <button
                            type="button"
                            aria-label={`Increase ${item.name} stock`}
                            onClick={() => adjustStock(item.id, 1)}
                            className="grid h-8 w-8 place-items-center rounded border border-[#D6D3CB]"
                          >
                            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <aside className="border-t border-[#D6D3CB] bg-white p-6 lg:border-l lg:border-t-0">
                <TriangleAlert aria-hidden="true" className="h-5 w-5 text-[#A4563B]" />
                <p className="mt-4 font-semibold">Stock attention</p>
                <p className="mt-2 text-sm leading-6 text-[#5D625D]">
                  {lowStock} {lowStock === 1 ? "product has" : "products have"} two or fewer units available.
                </p>
                <div className="mt-6 border-t border-[#E1DED7] pt-5">
                  <p className="text-xs font-semibold uppercase text-[#6A706A]">Why it matters</p>
                  <p className="mt-3 text-sm leading-6 text-[#5D625D]">
                    Reservations remain visible, so stock promised to customers
                    is not accidentally sold twice.
                  </p>
                </div>
              </aside>
            </div>
          ) : null}

          {mode === "customer" ? (
            <div className="grid min-h-[570px] lg:grid-cols-[270px_1fr]">
              <aside className="bg-[#11120F] p-6 text-white">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-[#D7A85D] font-semibold text-[#201608]">AM</div>
                <p className="mt-4 text-lg font-semibold">Alex Morgan</p>
                <p className="mt-1 text-sm text-white/56">Beast member</p>
                <nav className="mt-8 grid gap-2 text-sm text-white/68">
                  {["Overview", "Orders", "Deliveries", "Invoices", "Rewards", "Support"].map((item, index) => (
                    <span key={item} className={`rounded px-3 py-2.5 ${index === 0 ? "bg-white/10 text-white" : ""}`}>{item}</span>
                  ))}
                </nav>
              </aside>
              <div className="p-5 sm:p-8">
                <div className="flex flex-col justify-between gap-4 border-b border-[#D6D3CB] pb-5 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-xs font-semibold uppercase text-[#28736B]">Order BST-1048</p>
                    <h3 className="mt-1 text-2xl font-semibold">Your order is in progress</h3>
                  </div>
                  <span className="rounded bg-[#FFF0D5] px-3 py-2 text-xs font-semibold text-[#765122]">Made to order</span>
                </div>
                <div className="mt-7 grid gap-3 sm:grid-cols-4">
                  {["Ordered", "Payment confirmed", "Being made", "On its way"].map((step, index) => (
                    <div key={step} className="relative border-t-2 border-[#28736B] pt-4">
                      <span className={`grid h-7 w-7 place-items-center rounded-full ${index < 2 ? "bg-[#28736B] text-white" : "bg-[#E5E3DD] text-[#8A8E89]"}`}>
                        {index < 2 ? <Check aria-hidden="true" className="h-4 w-4" /> : index + 1}
                      </span>
                      <p className="mt-3 text-sm font-semibold">{step}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  {[
                    ["£64.00", "Order total", CircleDollarSign],
                    ["3–5 days", "Estimated production", Clock3],
                    ["1 item", "Adventure Hoodie", ShoppingBag],
                  ].map(([value, label, Icon]) => (
                    <div key={String(label)} className="rounded-md border border-[#D6D3CB] bg-white p-5">
                      <Icon aria-hidden="true" className="h-5 w-5 text-[#28736B]" />
                      <p className="mt-5 text-xl font-semibold">{String(value)}</p>
                      <p className="mt-1 text-sm text-[#5D625D]">{String(label)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-col justify-between gap-4 rounded-md bg-[#CDE1DC] p-5 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-semibold text-[#173E39]">
                      {ticketOpen ? "Support request opened" : "Need help with this order?"}
                    </p>
                    <p className="mt-1 text-sm text-[#315E58]">
                      {ticketOpen ? "The team can now reply with the full order context attached." : "Start a request without repeating your order details."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTicketOpen((current) => !current)}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#173E39] px-4 text-sm font-semibold text-white"
                  >
                    {ticketOpen ? <PackageCheck aria-hidden="true" className="h-4 w-4" /> : <Headphones aria-hidden="true" className="h-4 w-4" />}
                    {ticketOpen ? "Request received" : "Contact support"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
