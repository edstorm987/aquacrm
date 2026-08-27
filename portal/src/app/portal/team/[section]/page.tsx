import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth/auth";
import { PEOPLE_STATIONS } from "@/server/people";
import { ensureHydrated } from "@/server/storage";
import type { PeopleWorkspaceStationId } from "@/server/types";
import { TeamWorkspace } from "../_TeamWorkspace";
import { teamWorkspaceData } from "../_data";
import { requireCurrentAccessActor } from "@/server/accessControl";
import {
  resolveActorWorkspaceElementAccess,
  STAFF_STATION_ELEMENT_KEYS,
  staffStationAccessEntries,
  workspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";

export const dynamic = "force-dynamic";

export default async function TeamSectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ date?: string }> }) {
  await ensureHydrated();
  const session = await requireRole(["agency-staff"]);
  const [{ section }, query] = await Promise.all([params, searchParams]);
  if (!PEOPLE_STATIONS.some(station => station.id === section)) notFound();
  const actor = await requireCurrentAccessActor();
  const access = resolveActorWorkspaceElementAccess(actor, "staff");
  const stations = staffStationAccessEntries(actor, access);
  const stationId = section as PeopleWorkspaceStationId;
  if (!stations.some(item => item.stationId === stationId)) {
    const first = stations[0];
    const destination = first ? PEOPLE_STATIONS.find(station => station.id === first.stationId)?.href : undefined;
    redirect(destination ?? "/portal/account?notice=team-access-required");
  }
  const data = teamWorkspaceData(actor.resourceAgencyId, session.userId, query.date, {
    workspaceAccess: stations,
    includePay: workspaceElementLevel(access, STAFF_STATION_ELEMENT_KEYS.pay) !== "hidden",
    includeActions: workspaceElementLevel(access, STAFF_STATION_ELEMENT_KEYS.actions) !== "hidden",
    includeSchedule: workspaceElementLevel(access, STAFF_STATION_ELEMENT_KEYS.calendar) !== "hidden",
  });
  if (!data) redirect("/portal/account?notice=employee-workspace-pending");
  return <TeamWorkspace section={stationId} initial={data} />;
}
