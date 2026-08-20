import {
  authenticateExternalAssistant,
  EXTERNAL_ASSISTANT_MODULES,
  externalApiErrorResponse,
  externalApiHeaders,
  isExternalAssistantModule,
  requireExternalAssistantPermission,
  searchExternalAssistantRecords,
  ExternalAssistantApiError,
  type ExternalAssistantModule,
} from "@/lib/server/assistants/externalAssistantApi";
import { ensureHydrated } from "@/server/storage";

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const auth = await authenticateExternalAssistant(request);
    requireExternalAssistantPermission(auth, "search:read");
    const body = await request.json().catch(() => null) as {
      query?: string;
      modules?: string[];
      limit?: number;
    } | null;
    const query = body?.query?.trim().slice(0, 200) ?? "";
    if (query.length < 2) {
      throw new ExternalAssistantApiError(400, "invalid_query", "Search query must contain at least 2 characters.");
    }
    const modules = selectedModules(body?.modules, auth.modules);
    const limit = body?.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ExternalAssistantApiError(400, "invalid_limit", "limit must be between 1 and 100.");
    }
    const results = searchExternalAssistantRecords(auth.agencyId, query, modules, limit);
    return Response.json(
      {
        ok: true,
        query,
        modules,
        results,
        generatedAt: new Date().toISOString(),
      },
      { headers: externalApiHeaders() },
    );
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}

function selectedModules(
  values: string[] | undefined,
  allowedModules: ExternalAssistantModule[],
): ExternalAssistantModule[] {
  if (!values?.length) return [...allowedModules];
  if (values.some(value => !isExternalAssistantModule(value))) {
    throw new ExternalAssistantApiError(400, "invalid_module", "One or more requested modules are unsupported.");
  }
  if (values.some(value => !allowedModules.includes(value as ExternalAssistantModule))) {
    throw new ExternalAssistantApiError(403, "module_denied", "This API key cannot search one or more requested modules.");
  }
  return [...new Set(values)] as ExternalAssistantModule[];
}
