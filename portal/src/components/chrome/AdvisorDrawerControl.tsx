import "server-only";

import { GlobalAdvisorDrawer } from "@/components/chrome/GlobalAdvisorDrawer";
import { buildAssistantBusinessContext } from "@/lib/server/assistants/assistantBusinessContext";
import { getAssistantWorkspace } from "@/lib/server/assistants/assistantStore";
import { assistantModel, isAssistantConfigured } from "@/lib/server/assistants/openaiAssistant";
import { getCachedBusinessIssueRadar } from "@/engines/data/server/radar/businessIssueRadar";
import { radarDigest } from "@/engines/data/radar/businessRadar";

export async function AdvisorDrawerControl({
  agencyId,
  userId,
  userName,
}: {
  agencyId: string;
  userId: string;
  userName: string;
}) {
  const context = buildAssistantBusinessContext(agencyId);
  const radar = await getCachedBusinessIssueRadar(agencyId);
  return (
    <GlobalAdvisorDrawer
      initialWorkspace={getAssistantWorkspace(agencyId, userId)}
      configured={isAssistantConfigured(agencyId)}
      model={assistantModel(agencyId)}
      userName={userName}
      coverage={{
        clients: context.summary.clients.length,
        team: context.summary.team.length,
        pipelines: context.summary.pipelines.length,
        recentActivity: context.summary.recentActivity.length,
        modules: Object.keys(context.summary.businessModules),
        radar: radarDigest(radar),
      }}
    />
  );
}
