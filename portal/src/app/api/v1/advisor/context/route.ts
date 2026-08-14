import {
  authenticateExternalAssistant,
  externalApiErrorResponse,
  externalApiHeaders,
  requireExternalAssistantPermission,
} from "@/lib/server/externalAssistantApi";
import { buildExternalAdvisorContext } from "@/lib/server/externalAdvisorContext";
import { ensureHydrated } from "@/server/storage";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const auth = await authenticateExternalAssistant(request);
    requireExternalAssistantPermission(auth, "advisor:read");
    return Response.json(
      { ok: true, advisor: await buildExternalAdvisorContext(auth) },
      { headers: externalApiHeaders() },
    );
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}
