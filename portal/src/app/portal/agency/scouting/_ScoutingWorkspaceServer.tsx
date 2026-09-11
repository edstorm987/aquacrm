import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";

import { LeadsPipelineWorkspace } from "@/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace";
import { toScoutingProspectView } from "@/app/portal/agency/pipelines/[slug]/_scoutingProspectView";
import { mayUseEnvironmentCredentials } from "@/lib/server/auth/founderAgency";
import { scoutingQuotaProgress } from "@/lib/server/intelligence/scoutingQuota";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { getPipelineBySlug } from "@/server/pipelines";

/**
 * Read-only render path for Scouting. Module provisioning belongs to agency
 * bootstrap/settings; loading a page must not install or enable software.
 */
interface ScoutingWorkspaceServerProps {
  agencyId: string;
  userId: string;
  canManage: boolean;
  canQualify: boolean;
  calendarAvailable: boolean;
  calendarWritable: boolean;
}

export async function ScoutingWorkspaceServer({
  agencyId,
  userId,
  canManage,
  canQualify,
  calendarAvailable,
  calendarWritable,
}: ScoutingWorkspaceServerProps) {
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
  const googlePlacesApiKey = mayUseGoogleEnvironment
    ? process.env.GOOGLE_PLACES_API_KEY?.trim() ?? ""
    : "";
  const googleKeysCollide = Boolean(
    googleMapsEmbedApiKey && googlePlacesApiKey && googleMapsEmbedApiKey === googlePlacesApiKey,
  );
  const prospectList = await container.prospects.list();

  return (
    <LeadsPipelineWorkspace
      workspaceMode="scouting"
      scoutingCanManage={canManage}
      scoutingCanQualify={canQualify}
      scoutingQuotaWritable={calendarWritable}
      googleMapsEmbedApiKey={googleKeysCollide ? "" : googleMapsEmbedApiKey}
      googlePlacesConfigured={Boolean(googlePlacesApiKey) && !googleKeysCollide}
      referenceNow={Date.now()}
      columns={pipeline.columns.map(column => ({ id: column.id, label: column.label, color: column.color }))}
      scoutingQuota={calendarAvailable ? scoutingQuotaProgress(agencyId, userId) : undefined}
      prospects={prospectList.filter(prospect => prospect.status === "scouting").map(toScoutingProspectView)}
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
