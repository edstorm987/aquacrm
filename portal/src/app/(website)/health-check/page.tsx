import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WebsiteShell } from "../WebsiteShell";

export const metadata = {
  title: "Free Business Health Check | Milesymedia",
  description:
    "Take the free Milesymedia Business Health Check and find the gaps in your visibility, website, customer journey and retention.",
};

export default function HealthCheckPage() {
  return (
    <WebsiteShell compact>
      <div className="border-b border-[#D3CFC5] bg-[#F6F4EE] px-5 py-3 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1344px] items-center justify-between gap-4 text-sm">
          <Link href="/tools" className="inline-flex items-center gap-2 font-semibold text-[#205F59]">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            All free tools
          </Link>
          <span className="hidden text-[#666B66] sm:inline">Your answers stay in this browser.</span>
        </div>
      </div>
      <iframe
        src="/health-check/index.html"
        title="Milesymedia Business Health Check"
        className="block h-[calc(100vh-118px)] min-h-[680px] w-full border-0 bg-[#14110d]"
      />
    </WebsiteShell>
  );
}
