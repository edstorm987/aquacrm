import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { WebsiteShell } from "../../WebsiteShell";
import { OceanBoulevardDemo } from "./OceanBoulevardDemo";

export const metadata = {
  title: "Ocean Boulevard case study | Milesymedia",
  description:
    "Explore the public website, point of sale, staff workspace and safety operations created for Ocean Boulevard.",
};

const principles = [
  "One recognisable experience across customer and staff touchpoints",
  "Fast access to the information each person actually needs",
  "Operational tools designed around a real working venue",
  "A foundation that can grow without replacing the whole system",
];

export default function OceanBoulevardPage() {
  return (
    <WebsiteShell>
      <section className="bg-[#0B7F9B] px-5 pb-16 pt-14 text-white sm:px-8 lg:px-12 lg:pb-24 lg:pt-20">
        <div className="mx-auto max-w-[1344px]">
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/72 transition hover:text-white"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Portfolio
          </Link>
          <div className="mt-14 grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold text-[#D5F2F4]">
                Ocean Boulevard · South Shields
              </p>
              <h1 className="mt-4 text-5xl font-semibold leading-[0.94] sm:text-6xl lg:text-7xl">
                A venue experience built on both sides of the counter.
              </h1>
            </div>
            <p className="text-lg leading-8 text-white/78">
              A public website, point of sale, staff workspace and operational
              toolkit designed as connected parts of one business.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#F6F4EE] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="mx-auto max-w-[1344px]">
          <div className="grid gap-10 border-b border-[#CFCBC1] pb-14 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
            <div>
              <p className="text-sm font-semibold text-[#28736B]">The project</p>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.05]">
                Not four disconnected products.
              </h2>
            </div>
            <div>
              <p className="max-w-3xl text-xl leading-8 text-[#454A45]">
                Ocean Boulevard shows what happens when the public website is
                treated as part of the business, rather than a page sitting
                outside it. Guests get clarity. Staff get practical tools.
                Managers get one joined-up view of the venue.
              </p>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {principles.map((principle) => (
                  <li key={principle} className="flex items-start gap-3 text-sm leading-6 text-[#5D625D]">
                    <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#28736B]" />
                    {principle}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <OceanBoulevardDemo />

      <section className="bg-[#D7A85D] px-5 py-14 text-[#201608] sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1344px] flex-col justify-between gap-8 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-semibold">Build beyond the website</p>
            <h2 className="mt-3 max-w-4xl text-4xl font-semibold leading-[1.06] sm:text-5xl">
              Let the public experience and the business behind it work together.
            </h2>
          </div>
          <Link
            href="/#contact"
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-[#171714] px-6 font-semibold text-white"
          >
            Discuss your project
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </WebsiteShell>
  );
}
