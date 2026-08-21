import "server-only";

import { buildAssistantBusinessContext } from "@/lib/server/assistants/assistantBusinessContext";
import { getAssistantWorkspace } from "@/lib/server/assistants/assistantStore";
import { assistantModel, isAssistantConfigured } from "@/lib/server/assistants/openaiAssistant";
import { getCachedBusinessIssueRadar } from "@/engines/data/server/radar/businessIssueRadar";
import { radarDigest } from "@/engines/data/radar/businessRadar";
import type { AssistantWorkspaceState } from "@/server/types";
import type { AdvisorRadarDigest } from "@/engines/data/radar/businessRadar";

// ─── AQUA EDITOR AI — the server side ────────────────────────────────────────
//
// The editor's assistant is a RESKIN of the same engine behind the Aqua Advisor
// and the Dev Team Librarian, so this assembles the identical payload those two
// already use (`AdvisorDrawerControl` / `LibrarianDrawerControl`). One brain,
// three skins — nothing here is a second assistant.

export interface EditorAssistantProps {
  initialWorkspace: AssistantWorkspaceState;
  configured: boolean;
  model: string;
  coverage: {
    clients: number;
    team: number;
    pipelines: number;
    recentActivity: number;
    modules: string[];
    radar: AdvisorRadarDigest;
  };
}

/** Everything Aqua Editor AI needs to mount inside the studio. */
export async function loadEditorAssistant(agencyId: string, userId: string): Promise<EditorAssistantProps> {
  const context = buildAssistantBusinessContext(agencyId);
  const radar = await getCachedBusinessIssueRadar(agencyId);
  return {
    initialWorkspace: getAssistantWorkspace(agencyId, userId),
    configured: isAssistantConfigured(agencyId),
    model: assistantModel(agencyId),
    coverage: {
      clients: context.summary.clients.length,
      team: context.summary.team.length,
      pipelines: context.summary.pipelines.length,
      recentActivity: context.summary.recentActivity.length,
      modules: Object.keys(context.summary.businessModules),
      radar: radarDigest(radar),
    },
  };
}
