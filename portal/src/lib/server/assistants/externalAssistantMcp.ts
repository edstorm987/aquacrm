import "server-only";

import {
  buildExternalAssistantContext,
  filterAndPaginateRecords,
  findExternalAssistantRecord,
  isExternalAssistantModule,
  listExternalAssistantRecords,
  requireExternalAssistantModule,
  requireExternalAssistantPermission,
  searchExternalAssistantRecords,
  ExternalAssistantApiError,
  type ExternalAssistantAuth,
  type ExternalAssistantModule,
} from "@/lib/server/assistants/externalAssistantApi";
import { buildExternalAdvisorContext } from "@/lib/server/assistants/externalAdvisorContext";
import { listProposalsForExternalAssistant, submitExternalAssistantActionProposal } from "@/lib/server/assistants/externalAssistantProposals";
import { flushPendingWrites } from "@/server/storage";
import { EXTERNAL_ASSISTANT_MODULE_ELEMENT } from "@/lib/server/assistants/externalAssistantDelegation";
import type { ExternalAssistantProposalCategory } from "@/server/types";

const LATEST_PROTOCOL_VERSION = "2025-11-25";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([LATEST_PROTOCOL_VERSION, "2025-06-18", "2025-03-26"]);

const PROPOSAL_CATEGORY_MODULES: Readonly<Record<ExternalAssistantProposalCategory, readonly ExternalAssistantModule[]>> = {
  company: ["company"],
  client: ["clients", "contacts"],
  sales: ["leads"],
  finance: ["finance"],
  delivery: ["pipelines", "sops", "products", "milestones"],
  support: ["client-care"],
  development: ["business-modules"],
  marketing: ["business-modules"],
  operations: ["tasks"],
};

type JsonRpcId = string | number;
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
};

class McpProtocolError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(message);
  }
}

export function listExternalAssistantMcpTools(auth: ExternalAssistantAuth): McpTool[] {
  const tools: McpTool[] = [];
  const readOnlyAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  } as const;
  const moduleSchema = {
    type: "string",
    enum: auth.modules,
    description: "A data module granted to this assistant key.",
  };

  if (auth.permissions.includes("advisor:read")) {
    tools.push({
      name: "aqua_advisor_context",
      title: "Aqua Advisor context",
      description: "Load scoped business health, Radar findings, alerts, recommendations, and accepted work. Recommendations never mutate AquaCRM and still require human approval.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: readOnlyAnnotations,
    });
  }
  if (auth.permissions.includes("actions:propose") && auth.modules.includes("tasks")) {
    tools.push({
      name: "aqua_propose_action",
      title: "Propose an AquaCRM action",
      description: "Submit an evidence-backed proposal for human approval. This writes only to the proposal inbox and cannot create, edit, complete, or delete a task.",
      inputSchema: {
        type: "object",
        required: ["title", "detail", "expectedOutcome"],
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 2, maxLength: 240 },
          detail: { type: "string", minLength: 2, maxLength: 2000 },
          expectedOutcome: { type: "string", minLength: 2, maxLength: 600 },
          evidence: { type: "array", items: { type: "string", maxLength: 500 }, maxItems: 20 },
          category: { type: "string", enum: ["company", "client", "sales", "finance", "delivery", "support", "development", "marketing", "operations"], default: "operations" },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"], default: "normal" },
          suggestedDueAt: { type: "string", format: "date-time" },
          sourceIds: { type: "array", items: { type: "string", maxLength: 240 }, maxItems: 30 },
          sourceHref: { type: "string", pattern: "^/" },
        },
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    });
    tools.push({
      name: "aqua_list_action_proposals",
      title: "List this assistant's proposals",
      description: "List proposal decisions and linked task IDs for proposals submitted by this assistant key.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: readOnlyAnnotations,
    });
  }
  if (auth.permissions.includes("context:read")) {
    tools.push({
      name: "aqua_workspace_context",
      title: "AquaCRM workspace context",
      description: "Load permitted modules, record counts, capabilities, and immediate attention items.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: readOnlyAnnotations,
    });
  }
  if (auth.permissions.includes("records:read")) {
    tools.push({
      name: "aqua_list_records",
      title: "List AquaCRM records",
      description: "List a page of sanitised live records from one permitted module.",
      inputSchema: {
        type: "object",
        required: ["module"],
        additionalProperties: false,
        properties: {
          module: moduleSchema,
          status: { type: "string" },
          updatedAfter: { type: "string", format: "date-time" },
          cursor: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        },
      },
      annotations: readOnlyAnnotations,
    });
    tools.push({
      name: "aqua_get_record",
      title: "Get an AquaCRM record",
      description: "Inspect one sanitised record by module and record ID.",
      inputSchema: {
        type: "object",
        required: ["module", "recordId"],
        additionalProperties: false,
        properties: {
          module: moduleSchema,
          recordId: { type: "string", minLength: 1, maxLength: 240 },
        },
      },
      annotations: readOnlyAnnotations,
    });
  }
  if (auth.permissions.includes("search:read")) {
    tools.push({
      name: "aqua_search",
      title: "Search AquaCRM",
      description: "Search names, messages, notes, references, and record content across permitted modules.",
      inputSchema: {
        type: "object",
        required: ["query"],
        additionalProperties: false,
        properties: {
          query: { type: "string", minLength: 2, maxLength: 200 },
          modules: { type: "array", items: moduleSchema, uniqueItems: true },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        },
      },
      annotations: readOnlyAnnotations,
    });
  }
  return tools;
}

export async function handleExternalAssistantMcpRequest(auth: ExternalAssistantAuth, message: unknown) {
  if (!isJsonRpcRequest(message)) {
    return rpcError(null, -32600, "Invalid JSON-RPC request.");
  }
  if (message.id === undefined) return null;

  try {
    if (message.method === "initialize") {
      const requested = typeof message.params?.protocolVersion === "string"
        ? message.params.protocolVersion
        : "";
      return rpcResult(message.id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : LATEST_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "aquacrm-business-assistant",
          title: "AquaCRM Business Assistant",
          version: "1.0.0",
        },
        instructions: "Tenant-scoped business access. Business records are read-only. When actions:propose is granted, proposals may be placed in the human approval inbox but cannot mutate tasks. Start with aqua_advisor_context when available and treat missing evidence as uncertainty.",
      });
    }
    if (message.method === "ping") return rpcResult(message.id, {});
    if (message.method === "tools/list") {
      return rpcResult(message.id, { tools: listExternalAssistantMcpTools(auth) });
    }
    if (message.method === "tools/call") {
      const name = stringValue(message.params?.name, "Tool name", 120);
      const args = objectValue(message.params?.arguments);
      const available = listExternalAssistantMcpTools(auth);
      if (!available.some(tool => tool.name === name)) {
        throw new McpProtocolError(-32602, `Unknown or unavailable tool: ${name}`);
      }
      return rpcResult(message.id, await callTool(auth, name, args));
    }
    throw new McpProtocolError(-32601, `Method not found: ${message.method}`);
  } catch (error) {
    if (error instanceof McpProtocolError) return rpcError(message.id, error.code, error.message, error.data);
    if (error instanceof ExternalAssistantApiError) {
      return rpcResult(message.id, toolResult({ ok: false, error: { code: error.code, message: error.message } }, true));
    }
    return rpcResult(message.id, toolResult({ ok: false, error: { code: "tool_failed", message: "The AquaCRM tool could not complete safely." } }, true));
  }
}

async function callTool(auth: ExternalAssistantAuth, name: string, args: Record<string, unknown>) {
  if (name === "aqua_advisor_context") {
    requireExternalAssistantPermission(auth, "advisor:read");
    return toolResult({ ok: true, advisor: await buildExternalAdvisorContext(auth) });
  }
  if (name === "aqua_workspace_context") {
    requireExternalAssistantPermission(auth, "context:read");
    return toolResult({ ok: true, context: buildExternalAssistantContext(auth.agencyId, auth.modules, auth.permissions) });
  }
  if (name === "aqua_propose_action") {
    requireExternalAssistantPermission(auth, "actions:propose");
    requireExternalAssistantModule(auth, "tasks");
    const category = enumValue(args.category, ["company", "client", "sales", "finance", "delivery", "support", "development", "marketing", "operations"], "operations");
    if (!PROPOSAL_CATEGORY_MODULES[category].some(module => auth.modules.includes(module))) {
      throw new ExternalAssistantApiError(403, "proposal_category_denied", "The assistant key has no module authority for this proposal category.");
    }
    const proposal = submitExternalAssistantActionProposal({
      agencyId: auth.agencyId,
      assistantKeyId: auth.keyId,
      assistantFingerprint: auth.tokenFingerprint,
      assistantName: auth.keyName,
      title: stringValue(args.title, "title", 240),
      detail: stringValue(args.detail, "detail", 2_000),
      expectedOutcome: stringValue(args.expectedOutcome, "expectedOutcome", 600),
      evidence: stringListValue(args.evidence, "evidence", 20, 500),
      category,
      requiredElements: [...new Set(auth.modules.map(module => EXTERNAL_ASSISTANT_MODULE_ELEMENT[module]))],
      priority: enumValue(args.priority, ["low", "normal", "high", "urgent"], "normal"),
      suggestedDueAt: dateTimeValue(args.suggestedDueAt),
      sourceIds: stringListValue(args.sourceIds, "sourceIds", 30, 240),
      sourceHref: optionalString(args.sourceHref, 1_000),
    });
    await flushPendingWrites();
    return toolResult({ ok: true, proposal, message: "Proposal submitted for human approval. No task was created." });
  }
  if (name === "aqua_list_action_proposals") {
    requireExternalAssistantPermission(auth, "actions:propose");
    requireExternalAssistantModule(auth, "tasks");
    return toolResult({ ok: true, proposals: listProposalsForExternalAssistant(auth.agencyId, auth.tokenFingerprint) });
  }
  if (name === "aqua_list_records") {
    requireExternalAssistantPermission(auth, "records:read");
    const module = moduleValue(args.module, auth.modules);
    requireExternalAssistantModule(auth, module);
    const limit = integerValue(args.limit, "limit", 25, 1, 100);
    const result = filterAndPaginateRecords(listExternalAssistantRecords(auth.agencyId, module), {
      status: optionalString(args.status, 120),
      updatedAfter: optionalString(args.updatedAfter, 120),
      cursor: optionalString(args.cursor, 500),
      limit,
    });
    return toolResult({ ok: true, module, ...result, generatedAt: new Date().toISOString() });
  }
  if (name === "aqua_get_record") {
    requireExternalAssistantPermission(auth, "records:read");
    const module = moduleValue(args.module, auth.modules);
    requireExternalAssistantModule(auth, module);
    const recordId = stringValue(args.recordId, "recordId", 240);
    const record = findExternalAssistantRecord(auth.agencyId, module, recordId);
    if (!record) throw new ExternalAssistantApiError(404, "record_not_found", "The record was not found.");
    return toolResult({ ok: true, module, record, generatedAt: new Date().toISOString() });
  }
  if (name === "aqua_search") {
    requireExternalAssistantPermission(auth, "search:read");
    const query = stringValue(args.query, "Search query", 200);
    if (query.length < 2) throw new ExternalAssistantApiError(400, "invalid_query", "Search query must contain at least 2 characters.");
    const modules = moduleListValue(args.modules, auth.modules);
    const limit = integerValue(args.limit, "limit", 25, 1, 100);
    return toolResult({
      ok: true,
      query,
      modules,
      results: searchExternalAssistantRecords(auth.agencyId, query, modules, limit),
      generatedAt: new Date().toISOString(),
    });
  }
  throw new McpProtocolError(-32602, `Unknown tool: ${name}`);
}

function toolResult(value: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    isError,
  };
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.jsonrpc === "2.0" && typeof candidate.method === "string"
    && (candidate.id === undefined || typeof candidate.id === "string" || typeof candidate.id === "number");
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, label: string, maxLength: number): string {
  const result = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  if (!result) throw new ExternalAssistantApiError(400, "invalid_argument", `${label} is required.`);
  return result;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function stringListValue(value: unknown, label: string, limit: number, itemLimit: number): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    throw new ExternalAssistantApiError(400, "invalid_argument", `${label} must be a list of strings.`);
  }
  return [...new Set(value.map(item => item.trim().slice(0, itemLimit)).filter(Boolean))].slice(0, limit);
}

function enumValue<const T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function dateTimeValue(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ExternalAssistantApiError(400, "invalid_argument", "suggestedDueAt must be an ISO date-time.");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ExternalAssistantApiError(400, "invalid_argument", "suggestedDueAt must be an ISO date-time.");
  return parsed;
}

function integerValue(value: unknown, label: string, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new ExternalAssistantApiError(400, "invalid_argument", `${label} must be between ${minimum} and ${maximum}.`);
  }
  return Number(value);
}

function moduleValue(value: unknown, allowed: ExternalAssistantModule[]): ExternalAssistantModule {
  const module = stringValue(value, "module", 80);
  if (!isExternalAssistantModule(module)) throw new ExternalAssistantApiError(400, "invalid_module", "Choose a supported module.");
  if (!allowed.includes(module)) throw new ExternalAssistantApiError(403, "module_denied", `This API key cannot access the ${module} module.`);
  return module;
}

function moduleListValue(value: unknown, allowed: ExternalAssistantModule[]): ExternalAssistantModule[] {
  if (value === undefined) return [...allowed];
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !isExternalAssistantModule(item))) {
    throw new ExternalAssistantApiError(400, "invalid_module", "One or more requested modules are unsupported.");
  }
  const modules = [...new Set(value)] as ExternalAssistantModule[];
  if (modules.some(module => !allowed.includes(module))) {
    throw new ExternalAssistantApiError(403, "module_denied", "This API key cannot search one or more requested modules.");
  }
  return modules.length ? modules : [...allowed];
}

function rpcResult(id: JsonRpcId, result: Record<string, unknown>) {
  return { jsonrpc: "2.0" as const, id, result };
}

function rpcError(id: JsonRpcId | null, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0" as const, id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}
