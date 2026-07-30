import { redirect } from "next/navigation";

import { AssistantWorkspace } from "./AssistantWorkspace";
import { buildAssistantBusinessContext } from "@/lib/server/assistantBusinessContext";
import { getAssistantWorkspace } from "@/lib/server/assistantStore";
import {
  assistantModel,
  isAssistantConfigured,
} from "@/lib/server/openaiAssistant";
import { requireRole } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { getUserById } from "@/server/users";

export default async function AssistantPage() {
  await ensureHydrated();
  const session = await requireRole(["agency-owner", "agency-manager"]);
  if (!session) redirect("/portal/agency");

  const context = buildAssistantBusinessContext(session.agencyId);
  const user = getUserById(session.userId);

  return (
    <AssistantWorkspace
      initialWorkspace={getAssistantWorkspace(session.agencyId, session.userId)}
      configured={isAssistantConfigured()}
      model={assistantModel()}
      userName={user?.name || session.email}
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

