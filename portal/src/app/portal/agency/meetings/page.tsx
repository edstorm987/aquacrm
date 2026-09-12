// /portal/agency/meetings — the standalone Meetings surface.
//
// The focused Sales address for the same Lead and Contact meeting records Owner
// Journey edits. It intentionally reuses JourneyMeetingsWorkspace rather than
// maintaining a second, future-only meeting model.

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { CalendarClock } from "lucide-react";

import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { getAgency } from "@/server/tenants";
import { currentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { canOperateJourneyMeetings, loadJourneyMeetingPeople } from "@/lib/server/agency/meetingsFeed";
import { JourneyMeetingsWorkspace } from "@/app/portal/clients/_JourneyMeetingsWorkspace";
import { SalesAcquisitionTabs } from "@/components/sales/SalesAcquisitionTabs";

export default async function AgencyMeetingsPage() {
  await ensureHydrated();
  // The shared editor writes both Lead and Contact meeting records. Its plugin
  // mutations are intentionally admin-only, so a staff/view-only actor must not
  // be shown controls that their authenticated write path will reject.
  const session = await requireRole(["agency-owner", "agency-manager"]);
  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");

  // This workbench includes customer/account Contacts as well as Leads and all
  // controls are writable. Requiring `use` for both leaves no partial-data or
  // false-affordance state; a narrower actor receives the tenancy-first 404.
  let meetingWorkspaceAllowed = false;
  try {
    const { access } = await currentWorkspaceElementAccess("growth");
    meetingWorkspaceAllowed = canOperateJourneyMeetings(access);
  } catch {
    meetingWorkspaceAllowed = false;
  }
  if (!meetingWorkspaceAllowed) notFound();

  const referenceNow = Date.now();
  const people = await loadJourneyMeetingPeople(agency.id);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-6" data-testid="agency-meetings">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand">
            <CalendarClock size={13} aria-hidden="true" /> Sales
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90">Meetings</h1>
          <p className="mt-1 max-w-xl text-sm text-black/65">
            Book, prepare, reschedule, and close Lead or Contact meetings. Active work and interaction history stay on the same Journey records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/portal/agency/pipelines/leads"
            className="inline-flex min-h-11 items-center rounded-md border border-black/12 bg-white px-3 text-xs font-medium text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
          >
            Open the sales board
          </Link>
          <Link
            href="/portal/clients?view=journey"
            className="inline-flex min-h-11 items-center rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
          >
            Open Journey
          </Link>
        </div>
      </header>

      <SalesAcquisitionTabs active="meetings" />

      <JourneyMeetingsWorkspace people={people} referenceNow={referenceNow} />
    </div>
  );
}
