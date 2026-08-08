import {
  authenticateExternalAssistant,
  externalApiErrorResponse,
  externalApiHeaders,
  findExternalAssistantRecord,
  isExternalAssistantModule,
  requireExternalAssistantModule,
  requireExternalAssistantPermission,
  ExternalAssistantApiError,
} from "@/lib/server/externalAssistantApi";
import { ensureHydrated } from "@/server/storage";

export async function GET(
  request: Request,
  context: { params: Promise<{ recordId: string }> },
) {
  try {
    await ensureHydrated();
    const auth = await authenticateExternalAssistant(request);
    requireExternalAssistantPermission(auth, "records:read");
    const module = new URL(request.url).searchParams.get("module") ?? "";
    if (!isExternalAssistantModule(module)) {
      throw new ExternalAssistantApiError(400, "invalid_module", "Choose a supported module.");
    }
    requireExternalAssistantModule(auth, module);
    const { recordId } = await context.params;
    const item = findExternalAssistantRecord(auth.agencyId, module, recordId);
    if (!item) {
      throw new ExternalAssistantApiError(404, "record_not_found", "The record was not found.");
    }
    return Response.json(
      { ok: true, record: item, generatedAt: new Date().toISOString() },
      { headers: externalApiHeaders() },
    );
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}
