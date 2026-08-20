import {
  authenticateExternalAssistant,
  buildExternalAssistantContext,
  externalApiErrorResponse,
  externalApiHeaders,
  requireExternalAssistantPermission,
} from "@/lib/server/assistants/externalAssistantApi";
import { buildExternalAdvisorContext } from "@/lib/server/assistants/externalAdvisorContext";
import { ensureHydrated } from "@/server/storage";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const auth = await authenticateExternalAssistant(request);
    requireExternalAssistantPermission(auth, "context:read");
    const advisor = auth.permissions.includes("advisor:read")
      ? await buildExternalAdvisorContext(auth)
      : undefined;
    return Response.json(
      {
        ok: true,
        context: buildExternalAssistantContext(auth.agencyId, auth.modules, auth.permissions),
        advisor,
      },
      { headers: externalApiHeaders() },
    );
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}
