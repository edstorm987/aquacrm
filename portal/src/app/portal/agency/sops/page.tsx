import Link from "next/link";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";

const SYSTEMS = [
  {
    title: "Lead to meeting",
    body: "Capture the lead, add source and tags, book the meeting, record notes, budget, problems, and possible solutions.",
  },
  {
    title: "Meeting to client",
    body: "Convert only good-fit buyers, create the portal, attach the call context, and make the next step obvious.",
  },
  {
    title: "Client build",
    body: "Store assets, inspiration, decisions, blockers, preview links, feedback, and the current delivery stage in one client record.",
  },
  {
    title: "Launch and support",
    body: "Record the production repo/site, monitoring tag, support roles, tickets, analytics links, and handover state.",
  },
];

export default async function SystemsPage() {
  await ensureHydrated();
  await requireRole([...AGENCY_ROLES]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Systems</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90">Operating playbook</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">
            The simple repeatable loop for running Milesymedia: sell, onboard, build, launch, support.
          </p>
        </div>
        <Link href="/portal/agency" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03]">
          Back to dashboard
        </Link>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        {SYSTEMS.map(system => (
          <article key={system.title} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-black/85">{system.title}</h2>
            <p className="mt-2 text-sm leading-6 text-black/60">{system.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
