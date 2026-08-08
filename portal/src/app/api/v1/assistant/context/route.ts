import {
  authenticateExternalAssistant,
  buildExternalAssistantContext,
  externalApiErrorResponse,
  externalApiHeaders,
  requireExternalAssistantPermission,
} from "@/lib/server/externalAssistantApi";
import { ensureHydrated } from "@/server/storage";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const auth = await authenticateExternalAssistant(request);
    requireExternalAssistantPermission(auth, "context:read");
    return Response.json(
      { ok: true, context: buildExternalAssistantContext(auth.agencyId, auth.modules, auth.permissions) },
      { headers: externalApiHeaders() },
    );
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}
