import {
  containerFor as leadsContainerFor,
} from "@aqua/plugin-leads-pipeline/server";

import { LeadsPipelineWorkspace, type SalesWorkspaceMode } from "@/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace";
import { toScoutingProspectView } from "@/app/portal/agency/pipelines/[slug]/_scoutingProspectView";
import { mayUseEnvironmentCredentials } from "@/lib/server/auth/founderAgency";
import { scoutingQuotaProgress } from "@/lib/server/intelligence/scoutingQuota";
import { isLeadJourneyEligible } from "@/lib/enquiries/enquiryClassification";
import { prospectVisibleInWorkspace } from "@/lib/sales/prospectWorkflow";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { getPipelineBySlug } from "@/server/pipelines";
import { getUserById } from "@/server/users";

/**
 * Read-only render path for Scouting. Module provisioning belongs to agency
 * bootstrap/settings; loading a page must not install or enable software.
 */
interface SalesProspectWorkspaceServerProps {
  workspaceMode: Exclude<SalesWorkspaceMode, "journey">;
  focusedProspectId?: string;
  focusedLeadId?: string;
  initialImportOpen?: boolean;
  initialOutreachView?: "power-dialler" | "email" | "pipeline";
  agencyId: string;
  userId: string;
  canManage: boolean;
  canQualify: boolean;
  calendarAvailable: boolean;
  calendarWritable: boolean;
}

export async function SalesProspectWorkspaceServer({
  workspaceMode,
  focusedProspectId,
  focusedLeadId,
  initialImportOpen = false,
  initialOutreachView,
  agencyId,
  userId,
  canManage,
  canQualify,
  calendarAvailable,
  calendarWritable,
}: SalesProspectWorkspaceServerProps) {
  const pipeline = getPipelineBySlug(agencyId, "leads");
  if (!pipeline || pipeline.kind !== "leads") {
    return <ScoutingUnavailable detail="The Sales pipeline has not been initialised for this workspace." />;
  }

  const install = getInstall({ agencyId }, "leads-pipeline");
  if (!install?.enabled) {
    return <ScoutingUnavailable detail="The Sales data module is not enabled. Enable it in workspace settings first." />;
  }

  const storage = makePluginStorage(install.id);
  const container = leadsContainerFor({ agencyId, storage: storage as never });
  const mayUseGoogleEnvironment = mayUseEnvironmentCredentials(agencyId);
  const googleMapsEmbedApiKey = mayUseGoogleEnvironment
    ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY?.trim() ?? ""
    : "";
  let resolvedFocusedProspectId = focusedProspectId;
  let repairLeadId: string | undefined;
  let activeLeadIds: Set<string> | undefined;
  if (workspaceMode !== "scouting") {
    const activeLeads = (await container.leads.list())
      .filter(isLeadJourneyEligible)
      .filter(lead => !lead.archivedAt && !lead.convertedAt);
    activeLeadIds = new Set(activeLeads.map(lead => lead.id));
    if (focusedLeadId) {
      const lead = activeLeads.find(candidate => candidate.id === focusedLeadId);
      // GET is deliberately read-only: resolve only a server-owned backlink.
      // Legacy Leads without one are repaired by an explicit POST in the UI.
      resolvedFocusedProspectId = lead?.prospectAcquisitions?.[0]?.prospectId;
      if (lead && !resolvedFocusedProspectId) repairLeadId = lead.id;
    }
  }
  const prospectList = await container.prospects.list();
  if (focusedLeadId && resolvedFocusedProspectId) {
    const linkedProspect = prospectList.find(prospect => prospect.id === resolvedFocusedProspectId);
    if (linkedProspect?.status !== "qualified" || linkedProspect.qualifiedLeadId !== focusedLeadId) {
      resolvedFocusedProspectId = undefined;
      repairLeadId = focusedLeadId;
    }
  }
  const actorLabelFor = (actorUserId?: string): string | undefined => {
    if (!actorUserId) return undefined;
    const actor = getUserById(actorUserId);
    if (!actor || !actor.agencyIds.includes(agencyId)) return "Former team member";
    return actor.name.trim() || actor.email;
  };

  return (
    <LeadsPipelineWorkspace
      workspaceMode={workspaceMode}
      initialFocusedProspectId={resolvedFocusedProspectId}
      initialDossierLeadId={repairLeadId}
      initialProspectImportOpen={initialImportOpen}
      initialOutreachView={initialOutreachView}
      scoutingCanManage={canManage}
      scoutingCanQualify={canQualify}
      scoutingQuotaWritable={calendarWritable}
      googleMapsEmbedApiKey={googleMapsEmbedApiKey}
      referenceNow={Date.now()}
      columns={pipeline.columns.map(column => ({ id: column.id, label: column.label, color: column.color }))}
      scoutingQuota={calendarAvailable ? scoutingQuotaProgress(agencyId, userId) : undefined}
      prospects={prospectList
        .filter(prospect => prospect.status === "scouting"
          ? prospectVisibleInWorkspace(prospect.qualificationState, workspaceMode)
          : prospect.status === "qualified"
            && workspaceMode !== "scouting"
            && Boolean(prospect.qualifiedLeadId && activeLeadIds?.has(prospect.qualifiedLeadId)))
        .map(prospect => toScoutingProspectView(prospect, actorLabelFor))}
      dismissedProspects={prospectList
        .filter(prospect => prospect.status === "dismissed")
        .map(prospect => toScoutingProspectView(prospect, actorLabelFor))}
      leads={[]}
      archivedLeads={[]}
      importHref="/portal/agency/leads-pipeline/contacts"
      campaignsHref="/portal/agency/marketing"
      boards={[]}
      brands={[]}
      products={[]}
      customFields={[]}
    />
  );
}

function ScoutingUnavailable({ detail }: { detail: string }) {
  return (
    <section className="border-y border-amber-200 bg-amber-50 px-4 py-5 text-amber-950">
      <h2 className="text-sm font-semibold">Scouting workspace needs attention</h2>
      <p className="mt-1 text-sm text-amber-900/70">{detail}</p>
    </section>
  );
}
