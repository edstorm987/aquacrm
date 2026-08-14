import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth";
import { PEOPLE_STATIONS } from "@/server/people";
import { ensureHydrated } from "@/server/storage";
import type { PeopleWorkspaceStationId } from "@/server/types";
import { TeamWorkspace } from "../_TeamWorkspace";
import { teamWorkspaceData } from "../_data";

export const dynamic = "force-dynamic";

export default async function TeamSectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ date?: string }> }) {
  await ensureHydrated();
  const session = await requireRole(["agency-staff"]);
  const [{ section }, query] = await Promise.all([params, searchParams]);
  if (!PEOPLE_STATIONS.some(station => station.id === section)) notFound();
  const data = teamWorkspaceData(session.agencyId, session.userId, query.date);
  if (!data) redirect("/portal/account?notice=employee-workspace-pending");
  if (!data.people.employee.workspaceAccess.some(item => item.stationId === section)) redirect("/portal/team");
  return <TeamWorkspace section={section as PeopleWorkspaceStationId} initial={data} />;
}
