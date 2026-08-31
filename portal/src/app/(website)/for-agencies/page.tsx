import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ShieldAlert } from "lucide-react";

import {
  WEBSITE_DEMO_TERMS_VERSION,
  websiteDemoEnabled,
} from "@/server/websiteDemo";
import { DemoGateForm } from "../DemoGateForm";
import { WebsiteShell } from "../WebsiteShell";

export const metadata = {
  title: "AquaCRM for agencies",
  description:
    "AquaCRM is the operating system behind Zimante Group's agencies: journey, fulfilment, finance and the day itself in one place.",
};

/**
 * The public AquaCRM pitch — Stage 1 of the website demo.
 *
 * Two honesty constraints shape this page and are not decoration:
 *
 * 1. It does not exist while the demo flag is off. `notFound()` rather than a
 *    "coming soon" banner, because a page that renders is a page that can be
 *    linked, indexed and screenshotted.
 * 2. The pricing tiers are PLACEHOLDERS and say so on the page. Ed has not set
 *    plan names, numbers or Stripe products (ED-QUESTIONS Q6). Inventing a
 *    price and presenting it as the price would be the exact kind of claim this
 *    codebase does not make — so each tier shows "Price not set" instead of a
 *    number, and the section header says why.
 */

const capabilities = [
  {
    title: "One journey, not five tools",
    text: "Enquiries, people, meetings and conversion in the same place the work is delivered from.",
  },
  {
    title: "Fulfilment that knows the client",
    text: "Each client's services run their own stages, so nobody is stuck at one universal status.",
  },
  {
    title: "Money in the same picture",
    text: "Portfolio-wide and client-scoped finance sit beside the work that earned it.",
  },
  {
    title: "A command centre for the day",
    text: "Monitoring, decisions and the day plan, with alerts that name the evidence and where to act.",
  },
];

const placeholderTiers = [
  {
    name: "Placeholder tier A",
    audience: "Solo operator",
    included: ["Journey", "Fulfilment", "One workspace"],
  },
  {
    name: "Placeholder tier B",
    audience: "Small agency team",
    included: ["Everything in A", "Client portals", "Finance"],
  },
  {
    name: "Placeholder tier C",
    audience: "Multi-brand group",
    included: ["Everything in B", "Multiple agencies", "Command Centre"],
  },
];

export default function ForAgenciesPage() {
  // The flag is read on the server, per request. Off is the default, and off
  // means the surface is not there at all.
  if (!websiteDemoEnabled()) notFound();

  return (
    <WebsiteShell brand="aquacrm">
      <section className="bg-[#07141C] px-5 py-20 text-white sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto max-w-[1344px]">
          <p className="text-sm font-semibold text-[#6FD8E6]">AquaCRM for agencies</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.96] sm:text-6xl">
            The system an agency actually runs on.
          </h1>
          <p className="mt-7 max-w-3xl text-xl leading-8 text-white/68">
            AquaCRM was built to run Zimante Group&apos;s own agencies — the
            enquiries, the delivery, the money and the day. It is now being
            opened up to other agencies, starting with a demo.
          </p>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto grid max-w-[1344px] gap-6 sm:grid-cols-2">
          {capabilities.map((capability) => (
            <article key={capability.title} className="rounded-md border border-[#CBDBE2] bg-white p-7">
              <h2 className="text-2xl font-semibold text-[#0C1A22]">{capability.title}</h2>
              <p className="mt-3 text-base leading-7 text-[#41535C]">{capability.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="border-y border-[#CBDBE2] bg-white px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto max-w-[1344px]">
          <h2 className="text-3xl font-semibold text-[#0C1A22]">Plans</h2>
          <p
            data-testid="pricing-placeholder-notice"
            className="mt-4 flex max-w-3xl items-start gap-3 rounded-md border border-[#E6C77A] bg-[#FFF8E7] px-4 py-3 text-sm leading-6 text-[#5B4712]"
          >
            <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Placeholder tiers — no price has been set.</strong> These
              names and groupings are here so the page structure exists; they
              are not an offer, and nothing here can be bought yet.
            </span>
          </p>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {placeholderTiers.map((tier) => (
              <article key={tier.name} className="flex flex-col rounded-md border border-[#CBDBE2] p-7">
                <h3 className="text-xl font-semibold text-[#0C1A22]">{tier.name}</h3>
                <p className="mt-1 text-sm text-[#5C6F79]">{tier.audience}</p>
                <p className="mt-5 text-2xl font-semibold text-[#0F5F6D]">Price not set</p>
                <ul className="mt-5 grid gap-2 text-sm text-[#41535C]">
                  {tier.included.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check aria-hidden="true" className="h-4 w-4 text-[#0F5F6D]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto max-w-[840px]">
          <h2 className="text-3xl font-semibold text-[#0C1A22]">Ask for the demo</h2>
          <p className="mt-4 text-base leading-7 text-[#41535C]">
            There is no self-serve demo workspace yet. This form records your
            name, how to reach you, and the demo terms you agreed to — nothing
            more. We contact you when the demo opens.
          </p>
          <div className="mt-8">
            <DemoGateForm termsVersion={WEBSITE_DEMO_TERMS_VERSION} />
          </div>
          <p className="mt-6 text-sm leading-6 text-[#5C6F79]">
            Read the{" "}
            <Link href="/terms" className="font-semibold underline">
              demo terms
            </Link>{" "}
            and{" "}
            <Link href="/demo-privacy" className="font-semibold underline">
              privacy notice
            </Link>{" "}
            first — both are draft wording pending legal review.
          </p>
        </div>
      </section>
    </WebsiteShell>
  );
}
