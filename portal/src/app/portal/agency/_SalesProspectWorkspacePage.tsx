import { notFound, redirect } from "next/navigation";

import type { SalesWorkspaceMode } from "@/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace";
import { SalesProspectWorkspaceServer } from "@/app/portal/agency/scouting/_ScoutingWorkspaceServer";
import { AuthError, requireRole } from "@/lib/server/auth/auth";
import {
  requireCurrentWorkspaceElementAccess,
  workspaceElementAtLeast,
  workspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";
import { resolvePersonalRadarAccess } from "@/lib/server/intelligence/personalRadarAccess";
import { ensureHydrated } from "@/server/storage";
import { getAgency } from "@/server/tenants";

interface SalesProspectWorkspacePageProps {
  workspaceMode: Exclude<SalesWorkspaceMode, "journey">;
  focusedProspectId?: string;
  focusedLeadId?: string;
  initialImportOpen?: boolean;
  initialOutreachView?: "power-dialler" | "email" | "pipeline";
}

/**
 * One authority and data-loading boundary for the three pre-Journey Sales
 * desks. Routes differ only in presentation; records never move between
 * stores or bypass the existing prospect API and its access checks.
 */
export async function SalesProspectWorkspacePage({
  workspaceMode,
  focusedProspectId,
  focusedLeadId,
  initialImportOpen = false,
  initialOutreachView,
}: SalesProspectWorkspacePageProps) {
  await ensureHydrated();
  const session = await requireRole(["agency-owner", "agency-manager"]);
  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");

  let canManage = false;
  let canQualify = false;
  try {
    const { access } = await requireCurrentWorkspaceElementAccess("growth", "growth.outreach", "use");
    canManage = workspaceElementAtLeast(workspaceElementLevel(access, "growth.outreach"), "manage");
    canQualify = workspaceElementAtLeast(workspaceElementLevel(access, "growth.leads"), "use");
  } catch (error) {
    if (error instanceof AuthError && error.status === 403) notFound();
    throw error;
  }

  const calendarAccess = await resolvePersonalRadarAccess(session);

  return (
    <SalesProspectWorkspaceServer
      workspaceMode={workspaceMode}
      focusedProspectId={focusedProspectId}
      focusedLeadId={focusedLeadId}
      initialImportOpen={initialImportOpen}
      initialOutreachView={initialOutreachView}
      agencyId={agency.id}
      userId={session.userId}
      canManage={canManage}
      canQualify={canQualify}
      calendarAvailable={calendarAccess.goalsAvailable}
      calendarWritable={calendarAccess.goalsWritable}
    />
  );
}
