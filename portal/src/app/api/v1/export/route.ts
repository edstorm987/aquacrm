import {
  authenticateExternalAssistant,
  EXTERNAL_ASSISTANT_MODULES,
  externalApiErrorResponse,
  externalApiHeaders,
  isExternalAssistantModule,
  listExternalAssistantRecords,
  recordsToCsv,
  requireExternalAssistantModule,
  requireExternalAssistantPermission,
  ExternalAssistantApiError,
} from "@/lib/server/externalAssistantApi";
import { ensureHydrated } from "@/server/storage";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const auth = await authenticateExternalAssistant(request);
    requireExternalAssistantPermission(auth, "export:read");
    const search = new URL(request.url).searchParams;
    const module = search.get("module");
    if (module && !isExternalAssistantModule(module)) {
      throw new ExternalAssistantApiError(400, "invalid_module", "Choose a supported module.");
    }
    const selectedModule = module && isExternalAssistantModule(module) ? module : null;
    if (selectedModule) requireExternalAssistantModule(auth, selectedModule);
    const format = search.get("format") || "json";
    if (format !== "json" && format !== "csv") {
      throw new ExternalAssistantApiError(400, "invalid_format", "format must be json or csv.");
    }
    const modules = selectedModule ? [selectedModule] : auth.modules;
    const records = modules.flatMap(item => listExternalAssistantRecords(auth.agencyId, item));
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `milesymedia-${module || "all-data"}-${stamp}.${format}`;
    const headers = externalApiHeaders();
    headers.set("content-disposition", `attachment; filename="${filename}"`);

    if (format === "csv") {
      headers.set("content-type", "text/csv; charset=utf-8");
      return new Response(recordsToCsv(records), { headers });
    }
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({
      exportedAt: new Date().toISOString(),
      agencyId: auth.agencyId,
      modules,
      recordCount: records.length,
      records,
    }, null, 2), { headers });
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}
