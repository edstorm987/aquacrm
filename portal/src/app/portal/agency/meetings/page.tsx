// /portal/agency/meetings — the standalone Meetings surface.
//
// Ed asked for the Sales focus to have "a meetings pipeline like something for
// sales only". Rather than bury the booked calls inside the leads board, this is
// their own address: every upcoming meeting, soonest first, with the join/call/
// email actions on each. The Sales focus home links straight to it, and it
// reuses the exact same `UpcomingMeetings` card the leads pipeline shows — one
// derivation (`loadUpcomingMeetings`), so the two surfaces can never disagree.

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { CalendarClock } from "lucide-react";

import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency } from "@/server/tenants";
import { currentWorkspaceElementAccess, workspaceElementAtLeast, workspaceElementLevel } from "@/lib/server/access/workspaceElementAccess";
import { loadUpcomingMeetings } from "@/lib/server/agency/meetingsFeed";
import { UpcomingMeetings } from "@/app/portal/agency/leads-pipeline/_UpcomingMeetings";

export default async function AgencyMeetingsPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");

  // Meetings are a growth/sales surface. If the actor cannot even see leads,
  // this address is not theirs — 404, matching the house tenancy-first convention.
  let leadsVisible = false;
  try {
    const { access } = await currentWorkspaceElementAccess("growth");
    leadsVisible = workspaceElementAtLeast(workspaceElementLevel(access, "growth.leads"), "view");
  } catch {
    leadsVisible = false;
  }
  if (!leadsVisible) notFound();

  const meetings = await loadUpcomingMeetings(agency.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-6" data-testid="agency-meetings">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand">
            <CalendarClock size={13} aria-hidden="true" /> Sales
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90">Meetings</h1>
          <p className="mt-1 max-w-xl text-sm text-black/55">
            Every booked call and meetup, soonest first. Confirm the unconfirmed, join on time, and follow up straight after.
          </p>
        </div>
        <Link
          href="/portal/agency/pipelines/leads"
          className="inline-flex min-h-10 items-center rounded-md border border-black/12 bg-white px-3 text-xs font-medium text-black/70 hover:bg-black/[0.03]"
        >
          Open the sales board
        </Link>
      </header>

      <UpcomingMeetings meetings={meetings} limit={100} />
    </div>
  );
}
