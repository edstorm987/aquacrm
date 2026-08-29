import Link from "next/link";
import { getSession } from "@/lib/server/auth/auth";
import { readPrimaryAgencyWebsite, websitePageIsUpdating } from "@/server/agencyWebsite";
import { ensureHydrated } from "@/server/storage";
import { WebsitePageUpdating } from "../WebsitePageUpdating";
import { MILESYMEDIA_HOME_PATH } from "@/lib/public/milesymediaRoutes";

export const metadata = {
  title: "Client Centre — Milesymedia",
  description:
    "Milesymedia client centre for portal sign in, support, account recovery, websites, custom portals, software, files, and updates.",
};

const supportRoutes = [
  {
    label: "Phone",
    text: "Best for urgent access, launch, or live website issues.",
    href: "tel:+447707020250",
    icon: "phone",
  },
  {
    label: "Email",
    text: "Send context, links, files, screenshots, or notes.",
    href: "mailto:hello@milesymedia.co?subject=Client%20support",
    icon: "email",
  },
  {
    label: "Form ticket",
    text: "Log a website, portal, software, or content request.",
    href: "mailto:hello@milesymedia.co?subject=Client%20support%20ticket",
    icon: "ticket",
  },
];

const portalItems = [
  "Manage website requests and updates",
  "Track custom portals and software work",
  "Access files, notes, and project updates",
  "Reach support without hunting for the right contact",
];

function SupportIcon({ type }: { type: string }) {
  const paths: Record<string, string> = {
    phone:
      "M7.6 4.2c.4-.3.9-.3 1.3 0l2.3 2.3c.4.4.4 1 .1 1.4L10 9.6c.7 1.5 1.9 2.7 3.4 3.4l1.7-1.3c.4-.3 1-.3 1.4.1l2.3 2.3c.3.4.3.9 0 1.3l-1.1 1.7c-.5.8-1.4 1.2-2.3 1.1-5.1-.5-9.1-4.5-9.6-9.6-.1-.9.3-1.8 1.1-2.3l.7-2.1Z",
    email:
      "M4.8 6h14.4c1 0 1.8.8 1.8 1.8v8.4c0 1-.8 1.8-1.8 1.8H4.8c-1 0-1.8-.8-1.8-1.8V7.8C3 6.8 3.8 6 4.8 6Zm.8 2 6.4 4.5L18.4 8H5.6Zm13.4 1.8-6.5 4.5a.9.9 0 0 1-1 0L5 9.8v6.4h14V9.8Z",
    ticket:
      "M5.5 4h13c1.1 0 2 .9 2 2v3.1a3 3 0 0 0 0 5.8V18c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2v-3.1a3 3 0 0 0 0-5.8V6c0-1.1.9-2 2-2Zm2 4.8h6.8V7H7.5v1.8Zm0 4h9v-1.8h-9v1.8Zm0 4h6.8V15H7.5v1.8Z",
  };

  return (
    <span className="grid h-10 w-10 place-items-center rounded bg-[#D4B888] text-[#14120E]" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path fill="currentColor" d={paths[type]} />
      </svg>
    </span>
  );
}

export default async function ClientCentrePage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  await ensureHydrated();
  const website = readPrimaryAgencyWebsite();
  const session = await getSession();
  const preview = (await searchParams).preview === "portal" && Boolean(session?.role.startsWith("agency-"));
  const updating = websitePageIsUpdating(website, "/client-centre");
  if (updating && !preview) return <WebsitePageUpdating label={updating.label} message={updating.message} />;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_35%_8%,#3a2a14_0%,#1a1208_38%,#050402_78%)] px-5 py-6 text-[#14120E] sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-[#D4B888]/22 pb-5 text-[#F7EFE2]">
          <Link href={MILESYMEDIA_HOME_PATH} className="flex items-center gap-3" aria-label="Milesymedia home">
            <span className="grid h-10 w-10 place-items-center rounded bg-[#D4B888] text-sm font-black text-[#171009]">
              M
            </span>
            <span className="text-sm font-semibold tracking-[0.18em] text-[#D4B888]">
              MILESYMEDIA
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded bg-[#F7EFE2] px-3 py-2 text-sm font-semibold text-[#171009] transition hover:bg-white"
            >
              Sign in
            </Link>
            <Link
              href={MILESYMEDIA_HOME_PATH}
              className="rounded border border-[#D4B888]/28 px-3 py-2 text-sm font-medium text-[#E9D9B9] transition hover:border-[#D4B888]/70 hover:text-white"
            >
              Back to site
            </Link>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-6 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:py-14">
          <div className="text-[#F7EFE2]">
            <p className="mb-4 inline-flex rounded-full border border-[#D4B888]/30 bg-[#D4B888]/10 px-3 py-1 text-sm font-semibold text-[#D4B888]">
              Client centre
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[0.95] tracking-normal sm:text-7xl">
              One place for your Milesymedia work.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#D8C6A8]">
              Access support, portal sign in, recovery, project updates, website
              requests, custom portals, software, files, and client help while
              the new Milesymedia website is being redesigned.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link
                href="/login"
                className="rounded bg-[#D4B888] px-4 py-2 text-sm font-semibold text-[#14120E] transition hover:bg-[#F0D8A8]"
              >
                Client portal sign in
              </Link>
              <a
                href="#support"
                className="rounded border border-[#D4B888]/35 px-4 py-2 text-sm font-semibold text-[#F7EFE2] transition hover:border-[#D4B888]/80 hover:bg-[#D4B888]/10"
              >
                Get support
              </a>
            </div>
          </div>

          <div className="rounded bg-[#FFFDF8] p-5 shadow-2xl shadow-black/40 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#765A2C]">
              What you can manage
            </p>
            <h2 className="mt-3 text-3xl font-semibold">Client portal, simplified.</h2>
            <div className="mt-5 grid gap-3">
              {portalItems.map((item) => (
                <div key={item} className="flex gap-3 rounded border border-[#E7DDC9] bg-[#FAF7EE] p-4">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#C9A76A]" aria-hidden />
                  <p className="text-sm leading-6 text-[#5F5548]">{item}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-2 border-t border-[#E7DDC9] pt-5 sm:grid-cols-2">
              <Link
                href="/login"
                className="rounded bg-[#14120E] px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#2A2520]"
              >
                Sign in
              </Link>
              <Link
                href="/login/forgot"
                className="rounded border border-[#C9A76A]/50 px-4 py-3 text-center text-sm font-semibold text-[#765A2C] transition hover:border-[#8E7340] hover:text-[#14120E]"
              >
                Recover access
              </Link>
            </div>
          </div>
        </section>

        <section id="support" className="scroll-mt-6 pb-10">
          <div className="rounded bg-[#14120E] p-5 text-[#F7EFE2] shadow-2xl shadow-black/40 sm:p-7">
            <div className="flex flex-col gap-3 border-b border-[#D4B888]/18 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#D4B888]">
                  Support routes
                </p>
                <h2 className="mt-2 text-3xl font-semibold">Choose the route that fits.</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-[#D8C6A8]">
                We will point website changes, portal/software requests, files,
                updates, and access issues to the right place.
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {supportRoutes.map((route) => (
                <a
                  key={route.label}
                  href={route.href}
                  className="rounded border border-[#D4B888]/18 bg-white/5 p-4 transition hover:border-[#D4B888]/60 hover:bg-white/10"
                >
                  <SupportIcon type={route.icon} />
                  <span className="mt-4 block text-sm font-semibold text-white">{route.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-[#D8C6A8]">{route.text}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
