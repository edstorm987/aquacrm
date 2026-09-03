import { redirect } from "next/navigation";

import { AssistantWorkspace } from "./AssistantWorkspace";
import {
  assistantModel,
  isAssistantConfigured,
} from "@/lib/server/assistants/openaiAssistant";
import { getUserById } from "@/server/users";
import { getCachedBusinessIssueRadar } from "@/engines/data/server/radar/businessIssueRadar";
import { radarDigest } from "@/engines/data/radar/businessRadar";
import {
  assistantBusinessContextForActor,
  assistantWorkspaceForActor,
  requireAssistantElement,
} from "@/lib/server/assistants/assistantContextScope";
import { resolveBusinessRadarAccessForActor } from "@/lib/server/intelligence/personalRadarAccess";
import type { CurrentAccessActor } from "@/server/accessControl";

export default async function AssistantPage() {
  let actor: CurrentAccessActor;
  try {
    actor = await requireAssistantElement("workspace.overview");
  } catch {
    redirect("/portal/agency");
  }
  const session = actor.session;
  if (session.role !== "agency-owner" && session.role !== "agency-manager") redirect("/portal/agency");
  const agencyId = actor.resourceAgencyId;

  const [context, initialWorkspace, radarAvailable] = await Promise.all([
    assistantBusinessContextForActor(actor),
    assistantWorkspaceForActor(actor),
    resolveBusinessRadarAccessForActor(actor),
  ]);
  const radar = radarAvailable ? await getCachedBusinessIssueRadar(agencyId) : null;
  const user = getUserById(session.userId);

  return (
    <AssistantWorkspace
      initialWorkspace={initialWorkspace}
      configured={isAssistantConfigured(agencyId)}
      model={assistantModel(agencyId)}
      userName={user?.name || session.email}
      coverage={{
        clients: context.summary.clients.length,
        team: context.summary.team.length,
        pipelines: context.summary.pipelines.length,
        recentActivity: context.summary.recentActivity.length,
        modules: Object.keys(context.summary.businessModules),
        radar: radar ? radarDigest(radar) : undefined,
      }}
    />
  );
}
