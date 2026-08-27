import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { WebsiteShell } from "../../WebsiteShell";
import { BeastCommerceDemo } from "./BeastCommerceDemo";
import { MILESYMEDIA_CONTACT_PATH } from "@/lib/public/milesymediaRoutes";

export const metadata = {
  title: "Beast commerce case study | Milesymedia",
  description:
    "Explore a connected on-demand commerce experience spanning storefront, orders, inventory and customer self-service.",
};

const capabilities = [
  "Multiple collections sharing one basket, account and checkout",
  "Server-priced orders with promotions, tax and delivery rules",
  "Stock reservations, supplier handoff and delivery tracking",
  "Customer invoices, support, rewards and affiliate access",
];

export default function BeastCommercePage() {
  return (
    <WebsiteShell>
      <section className="relative overflow-hidden bg-[#11120F] px-5 pb-16 pt-14 text-white sm:px-8 lg:px-12 lg:pb-24 lg:pt-20">
        <Image
          src="/portfolio/beast-commerce/street.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-25"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,11,9,0.98)_0%,rgba(10,11,9,0.82)_54%,rgba(10,11,9,0.34)_100%)]" />
        <div className="relative mx-auto max-w-[1344px]">
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/70 transition hover:text-white"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Portfolio
          </Link>
          <div className="mt-14 grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold text-[#D7A85D]">
                Beast · on-demand commerce
              </p>
              <h1 className="mt-4 max-w-5xl text-5xl font-semibold leading-[0.94] sm:text-6xl lg:text-7xl">
                Commerce that keeps working after checkout.
              </h1>
            </div>
            <p className="text-lg leading-8 text-white/72">
              One system for selling across distinct collections, managing
              made-to-order fulfilment and keeping customers informed.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#F6F4EE] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="mx-auto grid max-w-[1344px] gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
          <div>
            <p className="text-sm font-semibold text-[#28736B]">The system</p>
            <h2 className="mt-4 text-4xl font-semibold leading-[1.05]">
              A storefront and an operating engine.
            </h2>
          </div>
          <div>
            <p className="max-w-3xl text-xl leading-8 text-[#454A45]">
              Beast combines a customer-facing brand world with the less
              glamorous work that makes ecommerce dependable: pricing,
              inventory, fulfilment, deliveries, communication and support.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {capabilities.map((capability) => (
                <li key={capability} className="flex items-start gap-3 text-sm leading-6 text-[#5D625D]">
                  <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#28736B]" />
                  {capability}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <BeastCommerceDemo />

      <section className="bg-[#D7A85D] px-5 py-14 text-[#201608] sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1344px] flex-col justify-between gap-8 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-semibold">Sell without losing the thread</p>
            <h2 className="mt-3 max-w-4xl text-4xl font-semibold leading-[1.06] sm:text-5xl">
              Connect the purchase to everything needed to deliver it well.
            </h2>
          </div>
          <Link
            href={MILESYMEDIA_CONTACT_PATH}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-[#171714] px-6 font-semibold text-white"
          >
            Discuss a commerce project
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </WebsiteShell>
  );
}
