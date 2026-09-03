import "server-only";

import { GlobalAdvisorDrawer } from "@/components/chrome/GlobalAdvisorDrawer";
import { assistantModel, isAssistantConfigured } from "@/lib/server/assistants/openaiAssistant";
import { radarDigest } from "@/engines/data/radar/businessRadar";
import { buildPausedBusinessRadar } from "@/app/portal/agency/commandPerformance";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import {
  assistantBusinessContextForActor,
  assistantWorkspaceForActor,
  requireAssistantElement,
} from "@/lib/server/assistants/assistantContextScope";

export async function AdvisorDrawerControl({
  userName,
  lightweight = false,
}: {
  agencyId: string;
  userId: string;
  userName: string;
  lightweight?: boolean;
}) {
  let actor;
  try {
    actor = await requireAssistantElement("workspace.overview");
  } catch (error) {
    const { AccessControlError } = await import("@/server/accessControl");
    if (error instanceof AccessControlError) return null;
    throw error;
  }
  if (actor.session.role !== "agency-owner" && actor.session.role !== "agency-manager") return null;
  const agencyId = actor.resourceAgencyId;
  const [context, initialWorkspace, radarAvailable] = await Promise.all([
    assistantBusinessContextForActor(actor),
    assistantWorkspaceForActor(actor),
    import("@/lib/server/intelligence/personalRadarAccess")
      .then(({ resolveBusinessRadarAccessForActor }) => resolveBusinessRadarAccessForActor(actor)),
  ]);
  const radar = radarAvailable
    ? lightweight
      ? buildPausedBusinessRadar(getAgencyWorkspaceSettings(agencyId).advisor.radarPolicy, Date.now())
      : await import("@/engines/data/server/radar/businessIssueRadar")
          .then(({ getCachedBusinessIssueRadar }) => getCachedBusinessIssueRadar(agencyId))
    : null;
  return (
    <GlobalAdvisorDrawer
      initialWorkspace={initialWorkspace}
      configured={isAssistantConfigured(agencyId)}
      model={assistantModel(agencyId)}
      userName={userName}
      coverage={{
        clients: context.summary.clients.length,
        team: context.summary.team.length,
        pipelines: context.summary.pipelines.length,
        recentActivity: context.summary.recentActivity.length,
        modules: Object.keys(context.summary.businessModules),
        radar: radar ? radarDigest(radar) : undefined,
        radarPaused: lightweight,
      }}
    />
  );
}
