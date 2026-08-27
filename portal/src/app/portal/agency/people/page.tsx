import { redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth/auth";
import { peopleSnapshot } from "@/server/people";
import { staffCapacitySnapshot } from "@/server/staffCapacity";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentAccessActor } from "@/server/accessControl";
import {
  resolveActorWorkspaceElementAccess,
  STAFF_COMMAND_ELEMENT_KEYS,
  workspaceElementLevel,
  type WorkspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";
import { projectPeopleWorkspaceSnapshot } from "@/lib/server/access/peopleWorkspaceProjection";
import { PeopleCommand, type PeopleCommandTab } from "./_PeopleCommand";

export const dynamic = "force-dynamic";

const PEOPLE_TABS = Object.keys(STAFF_COMMAND_ELEMENT_KEYS) as PeopleCommandTab[];

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ view?: string; application?: string; employee?: string }> }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal/agency");
  }
  const actor = await requireCurrentAccessActor();
  const agencyId = actor.resourceAgencyId;
  const access = resolveActorWorkspaceElementAccess(actor, "staff");
  const accessLevels = Object.fromEntries(PEOPLE_TABS.map(tab => [
    tab,
    workspaceElementLevel(access, STAFF_COMMAND_ELEMENT_KEYS[tab]),
  ])) as Record<PeopleCommandTab, WorkspaceElementLevel>;
  const query = await searchParams;
  const requestedTab = query.application ? "candidates" : query.employee ? "team" : PEOPLE_TABS.includes(query.view as PeopleCommandTab) ? query.view as PeopleCommandTab : "overview";
  if (accessLevels[requestedTab] === "hidden") {
    const first = PEOPLE_TABS.find(tab => accessLevels[tab] !== "hidden");
    redirect(first ? `/portal/agency/people?view=${first}` : "/portal/agency");
  }
  const snapshot = peopleSnapshot(agencyId);
  const capacity = accessLevels.capacity !== "hidden" ? await staffCapacitySnapshot(agencyId) : null;
  return <PeopleCommand
    initial={projectPeopleWorkspaceSnapshot(snapshot, access, capacity)}
    accessLevels={accessLevels}
    canManageAccess={accessLevels.access === "manage"}
    accessEnvironment={session.sandbox ? "sandbox" : "live"}
  />;
}
