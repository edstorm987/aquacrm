import "server-only";

import crypto from "crypto";

import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import {
  EXTERNAL_ASSISTANT_PERMISSIONS,
  findExternalAssistantApiKey,
  touchExternalAssistantApiKey,
} from "@/lib/server/assistants/externalAssistantKeys";
import { logActivity } from "@/server/activity";
import { flushPendingWrites, getState } from "@/server/storage";
import type { ExternalAssistantApiPermission, PortalState } from "@/server/types";
import { isoDateTimeValue } from "@/lib/shared/formatDateTime";
import { clientWorkspaceDisplayName } from "@/lib/clients/clientWorkspace";

const SECRET_KEY = /(password|secret|token|api[-_]?key|cookie|authorization|credential|hash|nonce)/i;
const STORED_FILE_KEY = /(avatar|base64|fileContent|contentBase64|dataUrl)/i;
const MAX_STRING_LENGTH = 10_000;
const MAX_DEPTH = 10;

export const EXTERNAL_ASSISTANT_MODULES = [
  "clients",
  "contacts",
  "staff",
  "leads",
  "pipelines",
  "tasks",
  "sops",
  "products",
  "milestones",
  "client-care",
  "company",
  "legal",
  "finance",
  "activity",
  "business-modules",
] as const;

export type ExternalAssistantModule = (typeof EXTERNAL_ASSISTANT_MODULES)[number];

export interface ExternalAssistantRecord {
  id: string;
  module: ExternalAssistantModule;
  title: string;
  status?: string;
  createdAt?: number;
  updatedAt?: number;
  data: Record<string, unknown>;
}

export interface ExternalAssistantAuth {
  agencyId: string;
  tokenFingerprint: string;
  keyId?: string;
  keyName: string;
  modules: ExternalAssistantModule[];
  permissions: ExternalAssistantApiPermission[];
  managed: boolean;
}

const LEGACY_ENV_PERMISSIONS: ExternalAssistantApiPermission[] = EXTERNAL_ASSISTANT_PERMISSIONS
  .filter(permission => permission !== "actions:propose");

export class ExternalAssistantApiError extends Error {
  status: number;
  code: string;
  retryAfter?: number;

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = "ExternalAssistantApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export async function authenticateExternalAssistant(request: Request): Promise<ExternalAssistantAuth> {
  const configuredToken = process.env.AQUACRM_ASSISTANT_API_TOKEN?.trim()
    || process.env.MILESYMEDIA_ASSISTANT_API_TOKEN?.trim();
  const hasManagedKeys = Object.values(getState().externalAssistantApiKeys)
    .some(key => !key.revokedAt && (!key.expiresAt || key.expiresAt > Date.now()));
  if (!configuredToken && !hasManagedKeys) {
    throw new ExternalAssistantApiError(
      503,
      "assistant_api_not_configured",
      "The external assistant API is not configured.",
    );
  }
  if (configuredToken && process.env.NODE_ENV === "production" && configuredToken.length < 32 && !hasManagedKeys) {
    throw new ExternalAssistantApiError(
      503,
      "assistant_api_token_too_short",
      "The external assistant API token must contain at least 32 characters in production.",
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const suppliedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const managedKey = suppliedToken ? findExternalAssistantApiKey(suppliedToken) : null;
  const legacyMatches = Boolean(
    suppliedToken
    && configuredToken
    && constantTimeEqual(suppliedToken, configuredToken),
  );
  if (!managedKey && !legacyMatches) {
    throw new ExternalAssistantApiError(401, "unauthorized", "A valid bearer token is required.");
  }

  const agencyId = managedKey?.agencyId
    || process.env.AQUACRM_ASSISTANT_AGENCY_ID?.trim()
    || process.env.MILESYMEDIA_ASSISTANT_AGENCY_ID?.trim()
    || "milesymedia";
  const state = getState();
  if (!state.agencies[agencyId]) {
    throw new ExternalAssistantApiError(
      503,
      "assistant_agency_not_found",
      `The configured assistant agency "${agencyId}" does not exist.`,
    );
  }

  const tokenFingerprint = managedKey?.fingerprint
    || crypto.createHash("sha256").update(configuredToken ?? "").digest("hex").slice(0, 16);
  const limit = rateLimit({
    key: `external-assistant:${tokenFingerprint}:${clientIpFromHeaders(request.headers)}`,
    max: 120,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    throw new ExternalAssistantApiError(
      429,
      "rate_limited",
      "Too many assistant API requests.",
      limit.retryAfterSec,
    );
  }

  const url = new URL(request.url);
  if (managedKey) touchExternalAssistantApiKey(managedKey.id);
  logActivity({
    agencyId,
    category: "integrations",
    action: "external_ai.data_accessed",
    message: "An external AI assistant accessed AquaCRM data.",
    metadata: {
      method: request.method,
      path: url.pathname,
      tokenFingerprint,
      keyId: managedKey?.id,
      keyName: managedKey?.name || "Legacy environment key",
    },
  });

  await flushPendingWrites();

  return {
    agencyId,
    tokenFingerprint,
    keyId: managedKey?.id,
    keyName: managedKey?.name || "Legacy environment key",
    modules: managedKey
      ? managedKey.modules.filter(isExternalAssistantModule)
      : [...EXTERNAL_ASSISTANT_MODULES],
    permissions: managedKey?.permissions ?? [...LEGACY_ENV_PERMISSIONS],
    managed: Boolean(managedKey),
  };
}

export function externalApiErrorResponse(error: unknown): Response {
  if (!(error instanceof ExternalAssistantApiError)) throw error;
  const headers = externalApiHeaders();
  if (error.status === 401) headers.set("www-authenticate", 'Bearer realm="AquaCRM External Assistant"');
  if (error.retryAfter) headers.set("retry-after", String(error.retryAfter));
  return Response.json(
    { ok: false, error: { code: error.code, message: error.message } },
    { status: error.status, headers },
  );
}

export function externalApiHeaders(): Headers {
  return new Headers({
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
}

export function isExternalAssistantModule(value: string): value is ExternalAssistantModule {
  return EXTERNAL_ASSISTANT_MODULES.includes(value as ExternalAssistantModule);
}

export function requireExternalAssistantPermission(
  auth: ExternalAssistantAuth,
  permission: ExternalAssistantApiPermission,
): void {
  if (!auth.permissions.includes(permission)) {
    throw new ExternalAssistantApiError(403, "permission_denied", `This API key does not allow ${permission}.`);
  }
}

export function requireExternalAssistantModule(
  auth: ExternalAssistantAuth,
  module: ExternalAssistantModule,
): void {
  if (!auth.modules.includes(module)) {
    throw new ExternalAssistantApiError(403, "module_denied", `This API key cannot access the ${module} module.`);
  }
}

export function listExternalAssistantRecords(
  agencyId: string,
  module: ExternalAssistantModule,
): ExternalAssistantRecord[] {
  const state = getState();
  const clients = Object.values(state.clients).filter(client => client.agencyId === agencyId);
  const clientIds = new Set(clients.map(client => client.id));
  const pipelines = Object.values(state.pipelines).filter(pipeline => pipeline.agencyId === agencyId);
  const pipelineIds = new Set(pipelines.map(pipeline => pipeline.id));

  switch (module) {
    case "clients":
      return clients.map(client => record(module, client.id, clientWorkspaceDisplayName(client), client));
    case "contacts":
      return clientContacts(clients);
    case "staff":
      return Object.values(state.users)
        .filter(user => user.agencyId === agencyId || user.agencyIds?.includes(agencyId))
        .map(user => record(module, user.id, user.name || user.email, {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
          clientId: user.clientId,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }));
    case "leads":
      return Object.values(state.pipelineCards)
        .flatMap(card => {
          if (!pipelineIds.has(card.pipelineId)) return [];
          if (card.kind === "lead") {
            return [record(module, card.id, card.lead.name || card.lead.email, card)];
          }
          if (card.kind === "deal") {
            return [record(module, card.id, card.deal.title, card)];
          }
          return [];
        });
    case "pipelines":
      return pipelines.map(pipeline => record(module, pipeline.id, pipeline.name, pipeline));
    case "tasks":
      return Object.values(state.tasks)
        .filter(item => item.agencyId === agencyId)
        .map(item => record(module, item.id, item.title, item));
    case "sops":
      return Object.values(state.sops)
        .filter(item => item.agencyId === agencyId)
        .map(item => record(module, item.id, item.title, item));
    case "products":
      return Object.values(state.agencyProducts)
        .filter(item => item.agencyId === agencyId)
        .map(item => record(module, item.id, item.name, item));
    case "milestones":
      return Object.values(state.clientMilestones)
        .filter(item => item.agencyId === agencyId && clientIds.has(item.clientId))
        .map(item => record(module, item.id, item.title, item));
    case "client-care":
      return Object.values(state.clientDelight)
        .filter(item => item.agencyId === agencyId)
        .map(item => record(module, item.id, item.title, item));
    case "company": {
      const company = state.companyProfiles[agencyId];
      return company ? [record(module, agencyId, "Milesymedia company profile", company)] : [];
    }
    case "legal":
      return Object.values(state.legalDocuments)
        .filter(item => item.agencyId === agencyId)
        .map(item => record(module, item.id, item.title, item));
    case "finance":
      return pluginRecords(state, agencyId, module, pluginId => pluginId.includes("finance"));
    case "activity":
      return state.activity
        .filter(item => item.agencyId === agencyId)
        .map((item, index) => record(
          module,
          String(item.id || `activity-${index}`),
          String(item.action || item.category || "Activity"),
          item,
        ));
    case "business-modules":
      return pluginRecords(state, agencyId, module, pluginId => !pluginId.includes("finance"));
  }
}

export function buildExternalAssistantContext(
  agencyId: string,
  allowedModules: ExternalAssistantModule[] = [...EXTERNAL_ASSISTANT_MODULES],
  permissions: ExternalAssistantApiPermission[] = [...EXTERNAL_ASSISTANT_PERMISSIONS],
) {
  const state = getState();
  const agency = state.agencies[agencyId];
  const modules = allowedModules.map(module => {
    const records = listExternalAssistantRecords(agencyId, module);
    return {
      id: module,
      recordCount: records.length,
      description: moduleDescription(module),
    };
  });
  const urgentTasks = (allowedModules.includes("tasks") ? listExternalAssistantRecords(agencyId, "tasks") : [])
    .filter(item => item.status !== "done" && ["urgent", "high"].includes(String(item.data.priority)))
    .slice(0, 20);
  const openLegalItems = (allowedModules.includes("legal") ? listExternalAssistantRecords(agencyId, "legal") : [])
    .filter(item => ["action-required", "expired"].includes(item.status ?? ""))
    .slice(0, 20);

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    agency: sanitizeExternalData(agency),
    modules,
    attention: {
      urgentTasks,
      legalItems: openLegalItems,
    },
    capabilities: {
      listRecords: permissions.includes("records:read"),
      getRecord: permissions.includes("records:read"),
      search: permissions.includes("search:read"),
      export: permissions.includes("export:read") ? ["json", "csv"] : [],
      writeRecords: false,
    },
  };
}

export function findExternalAssistantRecord(
  agencyId: string,
  module: ExternalAssistantModule,
  recordId: string,
): ExternalAssistantRecord | null {
  return listExternalAssistantRecords(agencyId, module)
    .find(item => item.id === recordId) ?? null;
}

export function searchExternalAssistantRecords(
  agencyId: string,
  query: string,
  modules: ExternalAssistantModule[],
  limit: number,
): Array<ExternalAssistantRecord & { score: number }> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return modules
    .flatMap(module => listExternalAssistantRecords(agencyId, module))
    .map(item => {
      const title = item.title.toLowerCase();
      const haystack = `${title} ${JSON.stringify(item.data).toLowerCase()}`;
      const score = terms.reduce((total, term) => {
        if (title === term) return total + 20;
        if (title.includes(term)) return total + 8;
        if (haystack.includes(term)) return total + 2;
        return total;
      }, 0);
      return { ...item, score };
    })
    .filter(item => item.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || (right.updatedAt ?? right.createdAt ?? 0) - (left.updatedAt ?? left.createdAt ?? 0)
    ))
    .slice(0, limit);
}

export function filterAndPaginateRecords(
  records: ExternalAssistantRecord[],
  options: {
    status?: string;
    updatedAfter?: string;
    cursor?: string;
    limit: number;
  },
) {
  const updatedAfter = options.updatedAfter ? Date.parse(options.updatedAfter) : Number.NaN;
  if (options.updatedAfter && Number.isNaN(updatedAfter)) {
    throw new ExternalAssistantApiError(400, "invalid_updated_after", "updatedAfter must be an ISO date-time.");
  }
  const start = decodeCursor(options.cursor);
  const filtered = records
    .filter(item => !options.status || item.status === options.status)
    .filter(item => !options.updatedAfter || (item.updatedAt ?? item.createdAt ?? 0) > updatedAfter)
    .sort((left, right) => (right.updatedAt ?? right.createdAt ?? 0) - (left.updatedAt ?? left.createdAt ?? 0));
  const page = filtered.slice(start, start + options.limit);
  const nextIndex = start + page.length;
  return {
    records: page,
    total: filtered.length,
    nextCursor: nextIndex < filtered.length ? encodeCursor(nextIndex) : null,
  };
}

export function recordsToCsv(records: ExternalAssistantRecord[]): string {
  const headings = ["module", "id", "title", "status", "created_at", "updated_at", "record_json"];
  const rows = records.map(item => [
    item.module,
    item.id,
    item.title,
    item.status ?? "",
    item.createdAt ? isoDateTimeValue(item.createdAt) ?? "" : "",
    item.updatedAt ? isoDateTimeValue(item.updatedAt) ?? "" : "",
    JSON.stringify(item.data),
  ]);
  return [headings, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
}

export function sanitizeExternalData(value: unknown, depth = 0, key = ""): unknown {
  if (SECRET_KEY.test(key)) return "[redacted]";
  if (STORED_FILE_KEY.test(key)) return "[stored file]";
  if (depth > MAX_DEPTH) return "[nested data]";
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.map(item => sanitizeExternalData(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      output[childKey] = sanitizeExternalData(childValue, depth + 1, childKey);
    }
    return output;
  }
  return String(value);
}

function clientContacts(clients: PortalState["clients"][string][]): ExternalAssistantRecord[] {
  return clients.flatMap(client => {
    const clientLabel = clientWorkspaceDisplayName(client);
    const metadata = client.metadata ?? {};
    const linked = Array.isArray(metadata.linkedContacts) ? metadata.linkedContacts : [];
    const contacts = linked
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
      .map((contact, index) => record(
        "contacts",
        String(contact.id || `${client.id}-contact-${index + 1}`),
        String(contact.name || contact.email || `Contact ${index + 1}`),
        { ...contact, clientId: client.id, clientName: clientLabel },
      ));
    const contactName = typeof metadata.contactName === "string" ? metadata.contactName : "";
    const primaryTitle = contactName || client.ownerEmail || "";
    if (primaryTitle && !contacts.some(item => (
      item.title === contactName
      || item.data.email === client.ownerEmail
    ))) {
      contacts.unshift(record("contacts", `${client.id}-primary`, primaryTitle, {
        clientId: client.id,
        clientName: clientLabel,
        name: contactName,
        email: client.ownerEmail,
        primary: true,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      }));
    }
    return contacts;
  });
}

function pluginRecords(
  state: PortalState,
  agencyId: string,
  module: "finance" | "business-modules",
  includePlugin: (pluginId: string) => boolean,
): ExternalAssistantRecord[] {
  return Object.values(state.pluginInstalls)
    .filter(install => install.agencyId === agencyId && includePlugin(install.pluginId))
    .flatMap(install => Object.entries(state.pluginData[install.id] ?? {})
      .filter(([key]) => !key.includes("/seq/") && !key.includes("/by-client/"))
      .map(([key, value]) => {
        const object = value && typeof value === "object"
          ? value as Record<string, unknown>
          : { value };
        const id = String(object.id || `${install.pluginId}:${key}`);
        const title = String(
          object.title
          || object.name
          || object.number
          || object.vendor
          || object.description
          || key,
        );
        return record(module, id, title, {
          pluginId: install.pluginId,
          storageKey: key,
          ...object,
        });
      }));
}

function record(
  module: ExternalAssistantModule,
  id: string,
  title: string,
  value: unknown,
): ExternalAssistantRecord {
  const data = sanitizeExternalData(value) as Record<string, unknown>;
  return {
    id,
    module,
    title,
    status: typeof data.status === "string" ? data.status : undefined,
    createdAt: timestamp(data.createdAt),
    updatedAt: timestamp(data.updatedAt),
    data,
  };
}

function timestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash("sha256").update(left).digest();
  const rightHash = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function encodeCursor(index: number): string {
  return Buffer.from(String(index), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const parsed = Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("invalid");
    return parsed;
  } catch {
    throw new ExternalAssistantApiError(400, "invalid_cursor", "The pagination cursor is invalid.");
  }
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function moduleDescription(module: ExternalAssistantModule): string {
  const descriptions: Record<ExternalAssistantModule, string> = {
    clients: "Client accounts, lifecycle stages, portal settings, and client metadata.",
    contacts: "People linked to client accounts.",
    staff: "Milesymedia team members and their roles.",
    leads: "Prospects and deals from the sales and scouting pipelines.",
    pipelines: "Sales, scouting, and fulfilment boards.",
    tasks: "Actions, assignments, recurrence, reminders, and linked SOPs.",
    sops: "Milesymedia standard operating procedures.",
    products: "Products, packages, pricing, contracts, and delivery configuration.",
    milestones: "Custom client milestones and progress.",
    "client-care": "Welcome packs, gifts, occasions, and client-care activity.",
  company: "Company mission, objectives, plans, projections, reviews, ownership, investments, distributions, and governance.",
    legal: "Contracts, policies, insurance, HMRC, letters, and compliance reminders.",
    finance: "Invoices, income, expenses, and other finance records.",
    activity: "Recent tenant-scoped audit and business activity.",
    "business-modules": "All remaining installed Milesymedia business-module records.",
  };
  return descriptions[module];
}
