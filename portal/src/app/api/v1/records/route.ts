import {
  authenticateExternalAssistant,
  externalApiErrorResponse,
  externalApiHeaders,
  filterAndPaginateRecords,
  isExternalAssistantModule,
  listExternalAssistantRecords,
  ExternalAssistantApiError,
} from "@/lib/server/externalAssistantApi";
import { ensureHydrated } from "@/server/storage";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const auth = authenticateExternalAssistant(request);
    const search = new URL(request.url).searchParams;
    const module = search.get("module") ?? "";
    if (!isExternalAssistantModule(module)) {
      throw new ExternalAssistantApiError(400, "invalid_module", "Choose a supported module.");
    }
    const limit = boundedLimit(search.get("limit"));
    const result = filterAndPaginateRecords(
      listExternalAssistantRecords(auth.agencyId, module),
      {
        status: search.get("status") || undefined,
        updatedAfter: search.get("updatedAfter") || undefined,
        cursor: search.get("cursor") || undefined,
        limit,
      },
    );
    return Response.json(
      {
        ok: true,
        module,
        ...result,
        generatedAt: new Date().toISOString(),
      },
      { headers: externalApiHeaders() },
    );
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}

function boundedLimit(value: string | null): number {
  if (!value) return 25;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new ExternalAssistantApiError(400, "invalid_limit", "limit must be between 1 and 100.");
  }
  return parsed;
}
