import "server-only";

import { GlobalAdvisorDrawer } from "@/components/chrome/GlobalAdvisorDrawer";
import { buildAssistantBusinessContext } from "@/lib/server/assistantBusinessContext";
import { getAssistantWorkspace } from "@/lib/server/assistantStore";
import { assistantModel, isAssistantConfigured } from "@/lib/server/openaiAssistant";

export function AdvisorDrawerControl({
  agencyId,
  userId,
  userName,
}: {
  agencyId: string;
  userId: string;
  userName: string;
}) {
  const context = buildAssistantBusinessContext(agencyId);
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
      }}
    />
  );
}
