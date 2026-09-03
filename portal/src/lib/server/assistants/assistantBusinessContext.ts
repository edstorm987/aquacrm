import "server-only";

import { getState } from "@/server/storage";
import type { AssistantContextScope, AssistantContextSection } from "@/lib/server/assistants/assistantContextScope";

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
  /**
   * Sections deliberately left out for this person.
   *
   * Named rather than silently omitted, so the model can say "I was not given
   * Finance" instead of answering confidently from the gap — and so a support
   * conversation can tell "there is no such client" from "you may not see it".
   */
  withheld: string[];
}

/**
 * The business context an assistant is given.
 *
 * `scope` decides what may be in it (2026-08-27, issue #182). It used to build
 * the same firehose for everybody — every user with their email, every client,
 * and up to 500 raw entries from EVERY installed module including finance and
 * HR pay — behind a role check. A manager whose element access had been narrowed
 * could not open Finance in the UI and could ask the assistant instead.
 *
 * The parameter is REQUIRED rather than defaulted to "everything": a default
 * here would mean any future caller that forgot it silently got the firehose
 * back, which is precisely how this happened the first time.
 */
export function buildAssistantBusinessContext(agencyId: string, scope: AssistantContextScope): {
  summary: AssistantContextSummary;
  serialized: string;
  truncated: boolean;
} {
  const state = getState();
  const agency = state.agencies[agencyId] ?? null;
  const clients = Object.values(state.clients)
    .filter(client => client.agencyId === agencyId)
    .filter(client => scope.allowsClient(client.id));
  const clientIds = new Set(clients.map(client => client.id));
  const installs = Object.values(state.pluginInstalls).filter(install => install.agencyId === agencyId);

  const businessModules: Record<string, unknown> = {};
  for (const install of installs) {
    // A module whose element this person does not hold contributes nothing —
    // and a module nobody has classified contributes nothing either, which is
    // the safe direction for raw plugin data.
    if (!scope.allowsModule(install.pluginId)) continue;
    const data = state.pluginData[install.id];
    if (!data) continue;
    const usefulEntries = Object.entries(data)
      .filter(([entryKey]) => !entryKey.includes("/seq/") && !entryKey.includes("/by-client/"))
      .slice(0, 500);
    businessModules[install.pluginId] = clean(Object.fromEntries(usefulEntries));
  }

  // Each section is included only if this person may see it. `included` is a
  // helper rather than a chain of ternaries so that adding a section without
  // scoping it is a compile error at the section map, not a silent leak here.
  const included = <T>(section: AssistantContextSection, value: T, empty: T): T =>
    (scope.sections.has(section) ? value : empty);

  const summary: AssistantContextSummary = {
    generatedAt: new Date().toISOString(),
    agency: included("agency", clean(agency), null),
    team: included("team", Object.values(state.users)
      .filter(user => user.agencyIds?.includes(agencyId) || user.agencyId === agencyId)
      .map(user => clean({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        clientId: user.clientId,
      })), []),
    clients: included("clients", clients.map(client => clean(client)), []),
    endCustomers: included("endCustomers", Object.values(state.endCustomers)
      .filter(customer => customer.agencyId === agencyId && scope.allowsClient(customer.clientId))
      .map(customer => clean(customer)), []),
    pipelines: included("pipelines", Object.values(state.pipelines)
      .filter(pipeline => pipeline.agencyId === agencyId)
      .map(pipeline => clean(pipeline)), []),
    pipelineCards: included("pipelineCards", Object.values(state.pipelineCards)
      .filter(card => {
        const pipeline = state.pipelines[card.pipelineId];
        if (pipeline?.agencyId !== agencyId) return false;
        return card.kind !== "client" || clientIds.has(card.clientId);
      })
      .map(card => clean(card)), []),
    recentActivity: included("recentActivity", state.activity
      .filter(entry => entry.agencyId === agencyId)
      .slice(-150)
      .reverse()
      .map(entry => clean(entry)), []),
    businessModules,
    // Said out loud rather than silently omitted: a model that is told nothing
    // about Finance should also be told THAT, or it will answer confidently
    // from the gap.
    withheld: scope.withheld,
  };

  const raw = JSON.stringify(summary);
  return {
    summary,
    serialized: raw.slice(0, MAX_CONTEXT_CHARS),
    truncated: raw.length > MAX_CONTEXT_CHARS,
  };
}
