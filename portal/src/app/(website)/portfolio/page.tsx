import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  Globe2,
  PackageSearch,
  ShieldCheck,
} from "lucide-react";
import { WebsiteShell } from "../WebsiteShell";
import { MILESYMEDIA_CONTACT_PATH } from "@/lib/public/milesymediaRoutes";

export const metadata = {
  title: "Portfolio | Milesymedia",
  description:
    "Explore connected websites, software and operational tools built by Milesymedia.",
};

const surfaces = [
  {
    title: "Public experience",
    text: "A bold visitor website that turns a real-world venue into something people can understand before they arrive.",
    icon: Globe2,
  },
  {
    title: "Point of sale",
    text: "A focused till experience for products, payments, operators and the decisions made across a working day.",
    icon: CreditCard,
  },
  {
    title: "Staff workspace",
    text: "Shifts, availability, time records and the practical information a team needs without chasing.",
    icon: CalendarDays,
  },
  {
    title: "Safety and operations",
    text: "Checks, incidents, maintenance, allergens and stock visibility brought into the same operational system.",
    icon: ShieldCheck,
  },
];

export default function PortfolioPage() {
  return (
    <WebsiteShell>
      <section className="bg-[#17211F] px-5 pb-20 pt-20 text-white sm:px-8 lg:px-12 lg:pb-28 lg:pt-28">
        <div className="mx-auto max-w-[1344px]">
          <p className="text-sm font-semibold text-[#8FC1B8]">Milesymedia portfolio</p>
          <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.98] sm:text-6xl lg:text-7xl">
            Work that goes beyond the homepage.
          </h1>
          <p className="mt-7 max-w-3xl text-xl leading-8 text-white/68">
            We connect what customers see with the software, people and
            processes that make the experience possible.
          </p>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <article className="mx-auto max-w-[1344px]">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold text-[#28736B]">
                Ocean Boulevard · visitor attraction
              </p>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.04] sm:text-5xl">
                One connected venue. Four digital surfaces.
              </h2>
              <p className="mt-5 leading-7 text-[#5D625D]">
                The project joins the public-facing experience to the tools
                that keep staff, sales and everyday operations moving.
              </p>
              <Link
                href="/portfolio/ocean-boulevard"
                className="mt-7 inline-flex h-11 items-center gap-2 rounded-md bg-[#205F59] px-5 font-semibold text-white transition hover:bg-[#174943]"
              >
                Explore the project
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>

            <Link
              href="/portfolio/ocean-boulevard"
              className="group overflow-hidden rounded-md border border-[#D3CFC5] bg-white shadow-[0_24px_70px_rgba(27,35,31,0.12)]"
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-[#0B86A6]">
                <Image
                  src="/portfolio/ocean-boulevard/website-preview.png"
                  alt="Ocean Boulevard website homepage"
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 760px"
                  className="object-cover object-top transition duration-500 group-hover:scale-[1.015]"
                />
              </div>
            </Link>
          </div>

          <div className="mt-14 grid border-y border-[#CFCBC1] sm:grid-cols-2 lg:grid-cols-4">
            {surfaces.map((surface) => {
              const Icon = surface.icon;
              return (
                <div
                  key={surface.title}
                  className="border-b border-[#CFCBC1] py-7 sm:px-6 sm:even:border-l lg:border-b-0 lg:border-l lg:first:border-l-0"
                >
                  <Icon aria-hidden="true" className="h-5 w-5 text-[#28736B]" />
                  <h3 className="mt-5 text-lg font-semibold">{surface.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5D625D]">{surface.text}</p>
                </div>
              );
            })}
          </div>
        </article>

        <article className="mx-auto mt-24 max-w-[1344px] border-t border-[#CFCBC1] pt-16 lg:mt-32 lg:pt-24">
          <div className="grid gap-10 lg:grid-cols-[1.28fr_0.72fr] lg:items-end">
            <Link
              href="/portfolio/beast-commerce"
              className="group overflow-hidden rounded-md border border-[#D3CFC5] bg-white shadow-[0_24px_70px_rgba(27,35,31,0.12)]"
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-[#11120F]">
                <Image
                  src="/portfolio/beast-commerce/storefront-preview.png"
                  alt="Beast multi-collection commerce storefront"
                  fill
                  sizes="(max-width: 1024px) 100vw, 760px"
                  className="object-cover object-top transition duration-500 group-hover:scale-[1.015]"
                />
              </div>
            </Link>
            <div>
              <p className="text-sm font-semibold text-[#28736B]">
                Beast · on-demand commerce
              </p>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.04] sm:text-5xl">
                From opening drop to delivered order.
              </h2>
              <p className="mt-5 leading-7 text-[#5D625D]">
                A multi-collection storefront connected to products, stock,
                fulfilment and the customer experience after checkout.
              </p>
              <Link
                href="/portfolio/beast-commerce"
                className="mt-7 inline-flex h-11 items-center gap-2 rounded-md bg-[#205F59] px-5 font-semibold text-white transition hover:bg-[#174943]"
              >
                Explore the commerce system
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-14 grid border-y border-[#CFCBC1] sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Storefront", "Collections, product discovery, basket and server-priced checkout.", Globe2],
              ["Order workflow", "A clear route from new order through supplier, tracking and delivery.", PackageSearch],
              ["Inventory", "Stock, reservations and low-stock attention without spreadsheet chasing.", ShieldCheck],
              ["Customer account", "Orders, invoices, delivery updates, rewards and support in one place.", CreditCard],
            ].map(([title, text, Icon]) => (
              <div
                key={String(title)}
                className="border-b border-[#CFCBC1] py-7 sm:px-6 sm:even:border-l lg:border-b-0 lg:border-l lg:first:border-l-0"
              >
                <Icon aria-hidden="true" className="h-5 w-5 text-[#28736B]" />
                <h3 className="mt-5 text-lg font-semibold">{String(title)}</h3>
                <p className="mt-2 text-sm leading-6 text-[#5D625D]">{String(text)}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="bg-[#D7A85D] px-5 py-14 text-[#201608] sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1344px] flex-col justify-between gap-7 lg:flex-row lg:items-center">
          <h2 className="max-w-4xl text-4xl font-semibold leading-[1.06] sm:text-5xl">
            Your website can be the front door to something much more useful.
          </h2>
          <Link
            href={MILESYMEDIA_CONTACT_PATH}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-[#171714] px-6 font-semibold text-white"
          >
            Talk through an idea
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </WebsiteShell>
  );
}
