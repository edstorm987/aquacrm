import {
  authenticateExternalAssistant,
  buildExternalAssistantContext,
  externalApiErrorResponse,
  externalApiHeaders,
} from "@/lib/server/externalAssistantApi";
import { ensureHydrated } from "@/server/storage";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const auth = authenticateExternalAssistant(request);
    return Response.json(
      { ok: true, context: buildExternalAssistantContext(auth.agencyId) },
      { headers: externalApiHeaders() },
    );
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}
