import { notFound, redirect } from "next/navigation";

import { AuthError, requireRole } from "@/lib/server/auth/auth";
import {
  requireCurrentWorkspaceElementAccess,
  workspaceElementAtLeast,
  workspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";
import { resolvePersonalRadarAccess } from "@/lib/server/intelligence/personalRadarAccess";
import { ensureHydrated } from "@/server/storage";
import { getAgency } from "@/server/tenants";

import { ScoutingWorkspaceServer } from "./_ScoutingWorkspaceServer";

export const dynamic = "force-dynamic";

/**
 * Scouting is the pre-lead Sales workspace. It deliberately reuses the same
 * ProspectService and qualification path as Journey: this route is a clearer
 * front door, not a second CRM or another source of truth.
 */
export default async function AgencyScoutingPage() {
  await ensureHydrated();
  const session = await requireRole(["agency-owner", "agency-manager"]);
  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");

  let canManage = false;
  let canQualify = false;
  try {
    // This is an operational command surface: every visible control writes.
    // View-only users retain the read API but do not receive a misleading page
    // full of actions that the dispatcher will correctly refuse.
    const { access } = await requireCurrentWorkspaceElementAccess("growth", "growth.outreach", "use");
    canManage = workspaceElementAtLeast(workspaceElementLevel(access, "growth.outreach"), "manage");
    canQualify = workspaceElementAtLeast(workspaceElementLevel(access, "growth.leads"), "use");
  } catch (error) {
    if (error instanceof AuthError && error.status === 403) notFound();
    throw error;
  }

  const calendarAccess = await resolvePersonalRadarAccess(session);

  return (
    <ScoutingWorkspaceServer
      agencyId={agency.id}
      userId={session.userId}
      canManage={canManage}
      canQualify={canQualify}
      calendarAvailable={calendarAccess.goalsAvailable}
      calendarWritable={calendarAccess.goalsWritable}
    />
  );
}
