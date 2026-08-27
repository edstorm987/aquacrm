import Link from "next/link";
import { ArrowRight, CheckCircle2, Mail, Phone } from "lucide-react";
import { WebsiteShell } from "../WebsiteShell";

export const metadata = {
  title: "Milesymedia | Websites, visibility and business systems",
  description:
    "Milesymedia helps service businesses improve their website, visibility, customer journey and day-to-day systems.",
};

const services = [
  {
    title: "Websites that make the next step obvious",
    body: "Plan, design and build a clear customer journey around the real service, proof and enquiry route.",
  },
  {
    title: "Visibility built around useful evidence",
    body: "Find the search, content and trust gaps before spending money on activity that cannot be measured.",
  },
  {
    title: "Business systems that stay usable",
    body: "Connect enquiries, delivery, client communication and the work that otherwise disappears between tools.",
  },
];

export default function MilesymediaPage() {
  return (
    <WebsiteShell>
      <section className="bg-[#17211F] px-5 py-20 text-white sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto max-w-[1344px]">
          <p className="text-sm font-semibold text-[#9CCAC1]">Milesymedia studio</p>
          <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.94] sm:text-6xl lg:text-7xl">
            Make the business easier to find, trust and run.
          </h1>
          <p className="mt-7 max-w-3xl text-xl leading-8 text-white/68">
            Websites, visibility, photography and connected systems for service
            businesses that want practical progress rather than another layer of noise.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/health-check"
              className="inline-flex h-12 items-center gap-2 rounded-md bg-[#D7A85D] px-5 font-semibold text-[#201608] transition hover:bg-[#E5BE7D]"
            >
              Take the free Health Check
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href="/milesymedia/contact"
              className="inline-flex h-12 items-center rounded-md border border-white/22 px-5 font-semibold text-white transition hover:border-white/50"
            >
              Talk to Milesymedia
            </Link>
          </div>
        </div>
      </section>

      <section id="services" className="scroll-mt-24 px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="mx-auto max-w-[1344px]">
          <p className="text-sm font-semibold text-[#28736B]">What we do</p>
          <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight">
            Start with the gap that is actually holding the business back.
          </h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {services.map((service) => (
              <article key={service.title} className="rounded-md border border-[#D3CFC5] bg-white p-7">
                <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-[#28736B]" />
                <h3 className="mt-6 text-2xl font-semibold">{service.title}</h3>
                <p className="mt-4 leading-7 text-[#5D625D]">{service.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[#D3CFC5] bg-white px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto grid max-w-[1344px] gap-6 lg:grid-cols-2">
          <Link href="/tools" className="rounded-md bg-[#CDE1DC] p-8 text-[#173E39] transition hover:bg-[#BED8D2]">
            <p className="text-sm font-semibold">Free tools</p>
            <h2 className="mt-3 text-3xl font-semibold">Find the gap before you pay to fix it.</h2>
            <span className="mt-8 inline-flex items-center gap-2 font-semibold">
              Open the tools <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </span>
          </Link>
          <Link href="/portfolio" className="rounded-md bg-[#EEE4D2] p-8 text-[#3D2A13] transition hover:bg-[#E7D8BE]">
            <p className="text-sm font-semibold">Selected work</p>
            <h2 className="mt-3 text-3xl font-semibold">See how the pieces work together.</h2>
            <span className="mt-8 inline-flex items-center gap-2 font-semibold">
              View the portfolio <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </span>
          </Link>
        </div>
      </section>

      <section id="contact" className="scroll-mt-24 bg-[#D7A85D] px-5 py-16 text-[#201608] sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto grid max-w-[1344px] gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm font-semibold">Talk to Milesymedia</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight">
              Tell us what feels stuck. We will help you find the useful next move.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="mailto:hello@milesymedia.co?subject=Milesymedia%20enquiry" className="inline-flex h-12 items-center gap-2 rounded-md bg-[#171714] px-5 font-semibold text-white">
              <Mail aria-hidden="true" className="h-4 w-4" /> Email us
            </a>
            <a href="tel:+447707020250" className="inline-flex h-12 items-center gap-2 rounded-md border border-[#201608]/25 px-5 font-semibold">
              <Phone aria-hidden="true" className="h-4 w-4" /> Call us
            </a>
          </div>
        </div>
      </section>
    </WebsiteShell>
  );
}
