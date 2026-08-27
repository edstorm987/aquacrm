import Link from "next/link";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { WebsiteShell } from "../../WebsiteShell";

export const metadata = {
  title: "Contact Milesymedia",
  description: "Talk to Milesymedia about a website, visibility, photography or connected business system.",
};

export default function MilesymediaContactPage() {
  return (
    <WebsiteShell compact>
      <section className="min-h-[calc(100vh-72px)] bg-[#17211F] px-5 py-16 text-white sm:px-8 lg:px-12 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <Link href="/milesymedia" className="inline-flex items-center gap-2 text-sm font-semibold text-[#9CCAC1]">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to Milesymedia
          </Link>
          <p className="mt-14 text-sm font-semibold text-[#9CCAC1]">Contact Milesymedia</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[0.96] sm:text-6xl">
            Tell us what feels stuck.
          </h1>
          <p className="mt-6 max-w-2xl text-xl leading-8 text-white/68">
            Share the useful context and we will help you find the right next move—whether
            that is a website, visibility, photography or a connected business system.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <a href="mailto:hello@milesymedia.co?subject=Milesymedia%20enquiry" className="rounded-md bg-[#D7A85D] p-6 text-[#201608] transition hover:bg-[#E5BE7D]">
              <Mail aria-hidden="true" className="h-5 w-5" />
              <span className="mt-8 block text-2xl font-semibold">Email Milesymedia</span>
              <span className="mt-2 block text-sm">hello@milesymedia.co</span>
            </a>
            <a href="tel:+447707020250" className="rounded-md border border-white/20 p-6 transition hover:border-white/50">
              <Phone aria-hidden="true" className="h-5 w-5 text-[#9CCAC1]" />
              <span className="mt-8 block text-2xl font-semibold">Call Milesymedia</span>
              <span className="mt-2 block text-sm text-white/62">+44 7707 020250</span>
            </a>
          </div>
        </div>
      </section>
    </WebsiteShell>
  );
}
