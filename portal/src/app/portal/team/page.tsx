import { redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { TeamWorkspace } from "./_TeamWorkspace";
import { teamWorkspaceData } from "./_data";
import { PEOPLE_STATIONS } from "@/server/people";
import { requireCurrentAccessActor } from "@/server/accessControl";
import {
  resolveActorWorkspaceElementAccess,
  STAFF_STATION_ELEMENT_KEYS,
  staffStationAccessEntries,
  workspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";

export const dynamic = "force-dynamic";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await ensureHydrated();
  const session = await requireRole(["agency-staff"]);
  const actor = await requireCurrentAccessActor();
  const access = resolveActorWorkspaceElementAccess(actor, "staff");
  const stations = staffStationAccessEntries(actor, access);
  if (!stations.some(item => item.stationId === "my-day")) {
    const first = stations[0];
    const destination = first ? PEOPLE_STATIONS.find(station => station.id === first.stationId)?.href : undefined;
    redirect(destination ?? "/portal/account?notice=team-access-required");
  }
  const query = await searchParams;
  const data = teamWorkspaceData(actor.resourceAgencyId, session.userId, query.date, {
    workspaceAccess: stations,
    includePay: workspaceElementLevel(access, STAFF_STATION_ELEMENT_KEYS.pay) !== "hidden",
    includeActions: workspaceElementLevel(access, STAFF_STATION_ELEMENT_KEYS.actions) !== "hidden",
    includeSchedule: workspaceElementLevel(access, STAFF_STATION_ELEMENT_KEYS.calendar) !== "hidden",
  });
  if (!data) redirect("/portal/account?notice=employee-workspace-pending");
  return <TeamWorkspace section="my-day" initial={data} />;
}
