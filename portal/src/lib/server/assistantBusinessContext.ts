import "server-only";

import { getState } from "@/server/storage";

const SECRET_KEY = /(password|secret|token|api[-_]?key|cookie|authorization|credential)/i;
const LARGE_VALUE = /(avatar|base64|fileContent|contentBase64|dataUrl)/i;
const MAX_CONTEXT_CHARS = 70_000;

function clean(value: unknown, depth = 0, key = ""): unknown {
  if (SECRET_KEY.test(key)) return "[redacted]";
  if (LARGE_VALUE.test(key)) return "[stored media]";
  if (depth > 7) return "[nested data]";
  if (typeof value === "string") return value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => clean(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = clean(childValue, depth + 1, childKey);
    }
    return out;
  }
  return String(value);
}

export interface AssistantContextSummary {
  generatedAt: string;
  agency: unknown;
  team: unknown[];
  clients: unknown[];
  endCustomers: unknown[];
  pipelines: unknown[];
  pipelineCards: unknown[];
  recentActivity: unknown[];
  businessModules: Record<string, unknown>;
}

export function buildAssistantBusinessContext(agencyId: string): {
  summary: AssistantContextSummary;
  serialized: string;
  truncated: boolean;
} {
  const state = getState();
  const agency = state.agencies[agencyId] ?? null;
  const clients = Object.values(state.clients).filter(client => client.agencyId === agencyId);
  const clientIds = new Set(clients.map(client => client.id));
  const installs = Object.values(state.pluginInstalls).filter(install => install.agencyId === agencyId);

  const businessModules: Record<string, unknown> = {};
  for (const install of installs) {
    const data = state.pluginData[install.id];
    if (!data) continue;
    const usefulEntries = Object.entries(data)
      .filter(([entryKey]) => !entryKey.includes("/seq/") && !entryKey.includes("/by-client/"))
      .slice(0, 500);
    businessModules[install.pluginId] = clean(Object.fromEntries(usefulEntries));
  }

  const summary: AssistantContextSummary = {
    generatedAt: new Date().toISOString(),
    agency: clean(agency),
    team: Object.values(state.users)
      .filter(user => user.agencyIds?.includes(agencyId) || user.agencyId === agencyId)
      .map(user => clean({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        clientId: user.clientId,
      })),
    clients: clients.map(client => clean(client)),
    endCustomers: Object.values(state.endCustomers)
      .filter(customer => customer.agencyId === agencyId)
      .map(customer => clean(customer)),
    pipelines: Object.values(state.pipelines)
      .filter(pipeline => pipeline.agencyId === agencyId)
      .map(pipeline => clean(pipeline)),
    pipelineCards: Object.values(state.pipelineCards)
      .filter(card => {
        const pipeline = state.pipelines[card.pipelineId];
        return pipeline?.agencyId === agencyId
          || (card.kind === "client" && clientIds.has(card.clientId));
      })
      .map(card => clean(card)),
    recentActivity: state.activity
      .filter(entry => entry.agencyId === agencyId)
      .slice(-150)
      .reverse()
      .map(entry => clean(entry)),
    businessModules,
  };

  const raw = JSON.stringify(summary);
  return {
    summary,
    serialized: raw.slice(0, MAX_CONTEXT_CHARS),
    truncated: raw.length > MAX_CONTEXT_CHARS,
  };
}
