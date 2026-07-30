import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  ClipboardCheck,
  Gauge,
  Search,
  Sparkles,
} from "lucide-react";
import { WebsiteShell } from "../WebsiteShell";

export const metadata = {
  title: "Free business tools | Milesymedia",
  description:
    "Use Milesymedia's free Health Check and Business OS to find the gaps, choose the right next move and keep improving your business.",
};

const supportingTools = [
  {
    title: "Search visibility",
    text: "Understand whether customers can find you and what is missing from your local search presence.",
    icon: Search,
  },
  {
    title: "Website experience",
    text: "Pressure-test the first impression, trust signals and next step on your website.",
    icon: Gauge,
  },
  {
    title: "Customer journey",
    text: "Find the hand-offs, delays and repeated admin costing you opportunities or time.",
    icon: BarChart3,
  },
];

export default function ToolsPage() {
  return (
    <WebsiteShell>
      <section className="bg-[#17211F] px-5 py-20 text-white sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto max-w-[1344px]">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#9CCAC1]">
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            Free tools from Milesymedia
          </p>
          <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.94] sm:text-6xl lg:text-7xl">
            Find the gap before you spend money fixing it.
          </h1>
          <p className="mt-7 max-w-3xl text-xl leading-8 text-white/68">
            Start with an honest view of where the business is today. No sales
            call required, no made-up benchmark and no need to know the jargon.
          </p>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="mx-auto grid max-w-[1344px] gap-6 lg:grid-cols-2">
          <article className="flex min-h-[430px] flex-col justify-between rounded-md bg-[#D7A85D] p-7 text-[#201608] sm:p-10">
            <div>
              <span className="grid h-12 w-12 place-items-center rounded-md bg-[#201608] text-white">
                <ClipboardCheck aria-hidden="true" className="h-5 w-5" />
              </span>
              <p className="mt-8 text-sm font-semibold">12-minute diagnostic</p>
              <h2 className="mt-3 text-4xl font-semibold">Business Health Check</h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-[#4D3718]">
                Work through visibility, your website, where customers come
                from, the business itself and retention. Leave with your
                strongest area, biggest gap and useful next moves.
              </p>
            </div>
            <Link
              href="/health-check"
              className="mt-10 inline-flex h-12 w-fit items-center gap-2 rounded-md bg-[#171714] px-5 font-semibold text-white transition hover:bg-[#2B2B27]"
            >
              Take the free Health Check
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </article>

          <article className="flex min-h-[430px] flex-col justify-between rounded-md bg-[#CDE1DC] p-7 text-[#173E39] sm:p-10">
            <div>
              <span className="grid h-12 w-12 place-items-center rounded-md bg-[#205F59] text-white">
                <BarChart3 aria-hidden="true" className="h-5 w-5" />
              </span>
              <p className="mt-8 text-sm font-semibold">Your free operating layer</p>
              <h2 className="mt-3 text-4xl font-semibold">Business OS</h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-[#315E58]">
                Turn what you learn into a simple place to track priorities,
                quick wins, health-check history and the tools relevant to
                your business.
              </p>
            </div>
            <Link
              href="/business-os"
              className="mt-10 inline-flex h-12 w-fit items-center gap-2 rounded-md bg-[#205F59] px-5 font-semibold text-white transition hover:bg-[#184D48]"
            >
              Open Business OS
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </article>
        </div>
      </section>

      <section className="border-y border-[#D3CFC5] bg-white px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto max-w-[1344px]">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <p className="text-sm font-semibold text-[#28736B]">What they look at</p>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.08]">
                One honest picture, not another vanity score.
              </h2>
            </div>
            <div className="divide-y divide-[#D8D4CA] border-y border-[#D8D4CA]">
              {supportingTools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <div key={tool.title} className="grid gap-4 py-6 sm:grid-cols-[44px_0.55fr_1fr] sm:items-start">
                    <Icon aria-hidden="true" className="mt-1 h-5 w-5 text-[#28736B]" />
                    <h3 className="font-semibold">{tool.title}</h3>
                    <p className="leading-7 text-[#5D625D]">{tool.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto grid max-w-[1344px] gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-[#28736B]">How the pieces connect</p>
            <h2 className="mt-4 text-4xl font-semibold">Diagnose, decide, then do.</h2>
          </div>
          <ul className="grid gap-4">
            {[
              "The Health Check gives you the evidence.",
              "Business OS keeps the next moves visible.",
              "Milesymedia can help when you want it designed, built or managed.",
            ].map((item) => (
              <li key={item} className="flex gap-3 border-b border-[#D8D4CA] pb-4 leading-7">
                <Check aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[#28736B]" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </WebsiteShell>
  );
}
