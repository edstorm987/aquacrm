"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Globe2,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  TriangleAlert,
} from "lucide-react";

type DemoMode = "website" | "pos" | "staff" | "safety";

const modes = [
  { id: "website" as const, label: "Public website", icon: Globe2 },
  { id: "pos" as const, label: "Point of sale", icon: CreditCard },
  { id: "staff" as const, label: "Staff workspace", icon: CalendarDays },
  { id: "safety" as const, label: "Safety & operations", icon: ShieldCheck },
];

const products = [
  { id: "tokens", name: "Ride tokens", price: 5 },
  { id: "ice-cream", name: "Mövenpick ice cream", price: 4.5 },
  { id: "coffee", name: "Fresh coffee", price: 3.2 },
  { id: "slush", name: "Ocean slush", price: 3.75 },
];

const safetyItems = [
  "Opening walkaround complete",
  "Allergen station checked",
  "Emergency exits clear",
  "Temperature log recorded",
];

export function OceanBoulevardDemo() {
  const [mode, setMode] = useState<DemoMode>("website");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [lastDemoPayment, setLastDemoPayment] = useState<{
    amount: number;
    itemCount: number;
  } | null>(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [tasks, setTasks] = useState([false, false, true]);
  const [checks, setChecks] = useState([true, false, false, true]);

  const total = useMemo(
    () =>
      products.reduce(
        (sum, product) => sum + product.price * (cart[product.id] ?? 0),
        0,
      ),
    [cart],
  );

  const itemCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);

  function addProduct(productId: string) {
    setLastDemoPayment(null);
    setCart((current) => ({
      ...current,
      [productId]: (current[productId] ?? 0) + 1,
    }));
  }

  function removeProduct(productId: string) {
    setCart((current) => ({
      ...current,
      [productId]: Math.max(0, (current[productId] ?? 0) - 1),
    }));
  }

  function takeDemoPayment() {
    if (itemCount === 0) return;
    setLastDemoPayment({ amount: total, itemCount });
    setCart({});
  }

  return (
    <section className="bg-[#17211F] px-5 py-16 text-white sm:px-8 lg:px-12 lg:py-24">
      <div className="mx-auto max-w-[1344px]">
        <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold text-[#8FC1B8]">Interactive project tour</p>
            <h2 className="mt-4 text-4xl font-semibold leading-[1.04] sm:text-5xl">
              See the different sides working.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-white/68">
            Switch between the visitor experience and compact demonstrations
            of the venue tools behind it.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-2 lg:grid-cols-4" role="group" aria-label="Ocean Boulevard project surfaces">
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
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-white/14 bg-[#F4F3EE] text-[#171714] shadow-2xl shadow-black/30">
          {mode === "website" ? (
            <div>
              <div className="flex h-11 items-center gap-2 border-b border-black/10 bg-white px-4">
                <span className="h-2.5 w-2.5 rounded-full bg-[#E07167]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#E5B552]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#6DB88C]" />
                <span className="mx-auto rounded bg-[#F1F0EC] px-8 py-1 text-[10px] text-[#6A706A]">
                  oceanboulevard.co.uk
                </span>
              </div>
              <div className="relative aspect-[16/9] min-h-[280px] overflow-hidden bg-[#0B86A6]">
                <Image
                  src="/portfolio/ocean-boulevard/website-preview.png"
                  alt="Ocean Boulevard public website"
                  fill
                  sizes="(max-width: 1344px) 100vw, 1344px"
                  className="object-cover object-top"
                />
              </div>
              <div className="grid divide-y divide-black/10 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {[
                  ["Clear before arrival", "Opening times, experiences and venue information are easy to find."],
                  ["Built for mobile", "The public journey remains useful while visitors are already out and about."],
                  ["Connected by design", "The customer-facing brand carries through into staff and operational tools."],
                ].map(([title, text]) => (
                  <div key={title} className="p-5 sm:p-6">
                    <p className="font-semibold">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-[#5D625D]">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "pos" ? (
            <div className="grid min-h-[560px] lg:grid-cols-[1fr_360px]">
              <div className="p-5 sm:p-8">
                <div className="flex items-center justify-between border-b border-[#D6D3CB] pb-5">
                  <div>
                    <p className="text-xs font-semibold uppercase text-[#28736B]">Counter one</p>
                    <h3 className="mt-1 text-2xl font-semibold">Point of sale</h3>
                  </div>
                  <span className="rounded bg-[#CDE1DC] px-3 py-2 text-xs font-semibold text-[#173E39]">
                    Till open
                  </span>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {products.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addProduct(product.id)}
                      className="flex min-h-28 flex-col justify-between rounded-md border border-[#D6D3CB] bg-white p-4 text-left transition hover:border-[#28736B]"
                    >
                      <ShoppingBag aria-hidden="true" className="h-5 w-5 text-[#28736B]" />
                      <span>
                        <span className="block font-semibold">{product.name}</span>
                        <span className="mt-1 block text-sm text-[#5D625D]">
                          £{product.price.toFixed(2)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <aside className="border-t border-[#D6D3CB] bg-white p-5 lg:border-l lg:border-t-0 sm:p-7">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Current order</h3>
                  <span className="text-sm text-[#6A706A]">{itemCount} items</span>
                </div>
                <div className="mt-5 min-h-64 divide-y divide-[#E1DED7]">
                  {itemCount === 0 ? (
                    <div className="grid min-h-52 place-items-center text-center">
                      <div>
                        <ShoppingBag aria-hidden="true" className="mx-auto h-6 w-6 text-[#8A8E89]" />
                        <p className="mt-3 text-sm text-[#6A706A]">Choose a product to begin.</p>
                      </div>
                    </div>
                  ) : (
                    products
                      .filter((product) => (cart[product.id] ?? 0) > 0)
                      .map((product) => (
                        <div key={product.id} className="flex items-center justify-between gap-3 py-4">
                          <div>
                            <p className="text-sm font-semibold">{product.name}</p>
                            <p className="mt-1 text-xs text-[#6A706A]">
                              £{(product.price * (cart[product.id] ?? 0)).toFixed(2)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Remove ${product.name}`}
                              onClick={() => removeProduct(product.id)}
                              className="grid h-8 w-8 place-items-center rounded border border-[#D6D3CB]"
                            >
                              <Minus aria-hidden="true" className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-5 text-center text-sm">{cart[product.id]}</span>
                            <button
                              type="button"
                              aria-label={`Add ${product.name}`}
                              onClick={() => addProduct(product.id)}
                              className="grid h-8 w-8 place-items-center rounded border border-[#D6D3CB]"
                            >
                              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
                <div className="border-t border-[#D6D3CB] pt-5">
                  <div className="flex items-center justify-between text-lg font-semibold">
                    <span>Total</span>
                    <span>£{total.toFixed(2)}</span>
                  </div>
                  <button
                    type="button"
                    disabled={itemCount === 0}
                    onClick={takeDemoPayment}
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#0B7F9B] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CreditCard aria-hidden="true" className="h-4 w-4" />
                    Take payment
                  </button>
                  <div className="mt-4 min-h-20" aria-live="polite">
                    {lastDemoPayment ? (
                      <div role="status" className="rounded-md border border-[#8CBEB5] bg-[#E4F1EE] p-4 text-sm text-[#173E39]">
                        <p className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                          Demo payment approved · £{lastDemoPayment.amount.toFixed(2)}
                        </p>
                        <p className="mt-1 leading-5">
                          {lastDemoPayment.itemCount} {lastDemoPayment.itemCount === 1 ? "item" : "items"} cleared from the basket. This is an interactive demonstration; no card was charged.
                        </p>
                        <button
                          type="button"
                          onClick={() => setLastDemoPayment(null)}
                          className="mt-3 font-semibold underline underline-offset-4"
                        >
                          Start another demo sale
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs leading-5 text-[#6A706A]">
                        Interactive demo only. No real payment details are collected or charged.
                      </p>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          ) : null}

          {mode === "staff" ? (
            <div className="grid min-h-[560px] lg:grid-cols-[280px_1fr]">
              <aside className="bg-[#132C29] p-6 text-white">
                <p className="text-sm font-semibold text-[#9CCAC1]">Staff workspace</p>
                <div className="mt-8 grid h-16 w-16 place-items-center rounded-full bg-[#D7A85D] text-xl font-semibold text-[#201608]">
                  EH
                </div>
                <p className="mt-4 text-lg font-semibold">Morning, Ed</p>
                <p className="mt-1 text-sm text-white/58">Front of house</p>
                <button
                  type="button"
                  onClick={() => setClockedIn((current) => !current)}
                  className={`mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-md font-semibold ${
                    clockedIn ? "bg-white/10 text-white" : "bg-[#D7A85D] text-[#201608]"
                  }`}
                >
                  <Clock3 aria-hidden="true" className="h-4 w-4" />
                  {clockedIn ? "Clock out" : "Clock in"}
                </button>
              </aside>
              <div className="p-5 sm:p-8">
                <div className="flex flex-col justify-between gap-4 border-b border-[#D6D3CB] pb-5 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-xs font-semibold uppercase text-[#28736B]">Today</p>
                    <h3 className="mt-1 text-2xl font-semibold">Your shift</h3>
                  </div>
                  <p className="text-sm text-[#5D625D]">10:00–18:00 · Main floor</p>
                </div>
                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  <div className="rounded-md border border-[#D6D3CB] bg-white p-5">
                    <CalendarDays aria-hidden="true" className="h-5 w-5 text-[#28736B]" />
                    <p className="mt-5 font-semibold">Coming up</p>
                    <div className="mt-4 divide-y divide-[#E1DED7] text-sm">
                      <div className="flex justify-between gap-4 py-3">
                        <span>Tuesday</span><span className="text-[#5D625D]">10:00–18:00</span>
                      </div>
                      <div className="flex justify-between gap-4 py-3">
                        <span>Friday</span><span className="text-[#5D625D]">12:00–20:00</span>
                      </div>
                      <div className="flex justify-between gap-4 py-3">
                        <span>Saturday</span><span className="text-[#5D625D]">09:00–17:00</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border border-[#D6D3CB] bg-white p-5">
                    <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-[#28736B]" />
                    <p className="mt-5 font-semibold">Shift tasks</p>
                    <div className="mt-4 grid gap-2">
                      {["Check counter float", "Review allergen sheet", "Complete handover"].map(
                        (task, index) => (
                          <button
                            key={task}
                            type="button"
                            onClick={() =>
                              setTasks((current) =>
                                current.map((value, taskIndex) =>
                                  taskIndex === index ? !value : value,
                                ),
                              )
                            }
                            className="flex items-center gap-3 rounded border border-[#E1DED7] px-3 py-3 text-left text-sm"
                          >
                            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${tasks[index] ? "border-[#28736B] bg-[#28736B] text-white" : "border-[#B7B4AD]"}`}>
                              {tasks[index] ? <Check aria-hidden="true" className="h-3 w-3" /> : null}
                            </span>
                            <span className={tasks[index] ? "text-[#737873] line-through" : ""}>{task}</span>
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {mode === "safety" ? (
            <div className="grid min-h-[560px] lg:grid-cols-[1fr_340px]">
              <div className="p-5 sm:p-8">
                <div className="border-b border-[#D6D3CB] pb-5">
                  <p className="text-xs font-semibold uppercase text-[#28736B]">Venue operations</p>
                  <h3 className="mt-1 text-2xl font-semibold">Opening checks</h3>
                </div>
                <div className="mt-6 grid gap-3">
                  {safetyItems.map((item, index) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() =>
                        setChecks((current) =>
                          current.map((value, checkIndex) =>
                            checkIndex === index ? !value : value,
                          ),
                        )
                      }
                      className="flex min-h-16 items-center justify-between gap-4 rounded-md border border-[#D6D3CB] bg-white px-4 text-left"
                    >
                      <span className="font-medium">{item}</span>
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${checks[index] ? "bg-[#28736B] text-white" : "bg-[#EFEEE9] text-[#8A8E89]"}`}>
                        {checks[index] ? <Check aria-hidden="true" className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <aside className="border-t border-[#D6D3CB] bg-white p-5 lg:border-l lg:border-t-0 sm:p-7">
                <p className="font-semibold">Needs attention</p>
                <div className="mt-5 grid gap-3">
                  <div className="rounded-md border border-[#E8C68C] bg-[#FFF4DF] p-4">
                    <TriangleAlert aria-hidden="true" className="h-5 w-5 text-[#9A6417]" />
                    <p className="mt-3 text-sm font-semibold">Stock check due</p>
                    <p className="mt-1 text-xs leading-5 text-[#765122]">Freezer two needs its weekly count.</p>
                  </div>
                  <div className="rounded-md border border-[#D6D3CB] p-4">
                    <ShieldCheck aria-hidden="true" className="h-5 w-5 text-[#28736B]" />
                    <p className="mt-3 text-sm font-semibold">No open incidents</p>
                    <p className="mt-1 text-xs leading-5 text-[#5D625D]">Recent reports are resolved and recorded.</p>
                  </div>
                  <div className="rounded-md border border-[#D6D3CB] p-4">
                    <p className="text-xs font-semibold uppercase text-[#6A706A]">Progress</p>
                    <p className="mt-2 text-3xl font-semibold">
                      {checks.filter(Boolean).length}/{checks.length}
                    </p>
                    <p className="mt-1 text-xs text-[#5D625D]">opening checks complete</p>
                  </div>
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
