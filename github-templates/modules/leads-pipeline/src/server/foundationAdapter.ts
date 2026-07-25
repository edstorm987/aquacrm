// Foundation registration adapter — same pattern as agency-hr.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EmailEnqueuePort,
  EventBusPort,
  PipelinePort,
  PluginInstallStorePort,
  TenantPort,
} from "./ports";
import type { AgencyId, UserId } from "../lib/tenancy";
import type { LeadsPipelineContainer } from "./index";
import { buildLeadsPipelineContainer } from "./index";

export interface LeadsPipelineFoundation {
  tenant: TenantPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  // Optional in v1 — when absent, send() throws and the pipeline
  // integration is skipped (foundation-pending).
  emailEnqueue?: EmailEnqueuePort;
  pipeline?: PipelinePort;
}

let registered: LeadsPipelineFoundation | null = null;

export function registerLeadsPipelineFoundation(deps: LeadsPipelineFoundation): void {
  registered = deps;
}

export function clearLeadsPipelineFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): LeadsPipelineFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-leads-pipeline: foundation not registered. Call registerLeadsPipelineFoundation({...}) at boot.",
    );
  }
  return registered;
}

export function containerFor(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
}): LeadsPipelineContainer {
  const f = requireFoundation();
  return buildLeadsPipelineContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    tenant: f.tenant,
    pluginInstalls: f.pluginInstalls,
    emailEnqueue: f.emailEnqueue,
    pipeline: f.pipeline,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
  foundation: LeadsPipelineFoundation;
}): LeadsPipelineContainer {
  return buildLeadsPipelineContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: args.foundation.activity,
    events: args.foundation.events,
    tenant: args.foundation.tenant,
    pluginInstalls: args.foundation.pluginInstalls,
    emailEnqueue: args.foundation.emailEnqueue,
    pipeline: args.foundation.pipeline,
  });
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  actor: UserId;
  storage: PluginStorage;
}): LeadsPipelineContainer | null {
  if (!registered) return null;
  return buildLeadsPipelineContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    tenant: registered.tenant,
    pluginInstalls: registered.pluginInstalls,
    emailEnqueue: registered.emailEnqueue,
    pipeline: registered.pipeline,
  });
}
