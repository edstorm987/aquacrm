import Link from "next/link";
import { ensureHydrated } from "@/server/storage";
import { listActivity } from "@/server/activity";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export default async function ActivityInboxPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const entries = listActivity({ agencyId: session.agencyId, limit: 100 });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">System history</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90">Activity log</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">
            A clear history of client, portal, sales, billing, support, and project updates.
          </p>
        </div>
        <Link href="/portal/agency/inbox" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03]">
          Open inbox
        </Link>
      </header>

      <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
        {entries.length === 0 ? (
          <p className="text-sm text-black/55">No activity yet. Create a client or convert a lead and it will appear here.</p>
        ) : (
          <ul className="divide-y divide-black/10">
            {entries.map(entry => (
              <li key={entry.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-black/85">{activityMessage(entry.message)}</p>
                    <p className="mt-1 text-xs text-black/45">
                      {activityCategory(entry.category)} · {activityAction(entry.action)}{entry.actorEmail ? ` · ${entry.actorEmail}` : ""}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-black/45" dateTime={new Date(entry.ts).toISOString()}>
                    {formatTime(entry.ts)}
                  </time>
                </div>
                {entry.clientId && (
                  <Link href={`/portal/clients/${entry.clientId}`} className="mt-2 inline-flex text-xs font-medium text-brand hover:underline">
                    Open client →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function activityMessage(message: string): string {
  return message
    .replace(/\bcore plugin install\(s\)/gi, "core systems")
    .replace(/\bFulfillment plugin installed; phase defaults seeded\./gi, "Project pipeline ready; stages seeded.")
    .replace(/\bplugin installed\b/gi, "system activated")
    .replace(/\bplugins installed\b/gi, "systems activated")
    .replace(/\bWill install\b/gi, "Will activate")
    .replace(/\binstall\b/gi, "activate")
    .replace(/\bplugin\b/gi, "system");
}

function activityCategory(category: string): string {
  if (category === "plugin") return "systems";
  if (category === "fulfillment") return "project work";
  if (category === "tenant") return "client";
  if (category === "telemetry") return "monitoring";
  return category.replace(/-/g, " ");
}

function activityAction(action: string): string {
  return action
    .replace(/[._-]/g, " ")
    .replace(/\bplugin\b/gi, "system")
    .replace(/\bfulfillment\b/gi, "project work")
    .replace(/\btelemetry\b/gi, "monitoring")
    .replace(/\btenant\b/gi, "client")
    .replace(/\binstalled\b/gi, "activated")
    .replace(/\buninstalled\b/gi, "removed")
    .replace(/\bdisabled\b/gi, "turned off")
    .replace(/\benabled\b/gi, "turned on");
}
