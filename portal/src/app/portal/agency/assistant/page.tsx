import { redirect } from "next/navigation";

import { AssistantWorkspace } from "./AssistantWorkspace";
import { buildAssistantBusinessContext } from "@/lib/server/assistants/assistantBusinessContext";
import { getAssistantWorkspace } from "@/lib/server/assistants/assistantStore";
import {
  assistantModel,
  isAssistantConfigured,
} from "@/lib/server/assistants/openaiAssistant";
import { requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { getUserById } from "@/server/users";
import { getCachedBusinessIssueRadar } from "@/lib/server/radar/businessIssueRadar";
import { radarDigest } from "@/lib/radar/businessRadar";

export default async function AssistantPage() {
  await ensureHydrated();
  const session = await requireRole(["agency-owner", "agency-manager"]);
  if (!session) redirect("/portal/agency");

  const context = buildAssistantBusinessContext(session.agencyId);
  const radar = await getCachedBusinessIssueRadar(session.agencyId);
  const user = getUserById(session.userId);

  return (
    <AssistantWorkspace
      initialWorkspace={getAssistantWorkspace(session.agencyId, session.userId)}
      configured={isAssistantConfigured(session.agencyId)}
      model={assistantModel(session.agencyId)}
      userName={user?.name || session.email}
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
