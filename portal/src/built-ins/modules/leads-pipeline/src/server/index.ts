// Server-side barrel — services + container builder + foundation
// adapter exports. Same shape as agency-hr / public-funnel.

export { LeadService } from "./leads";
export { ContactService } from "./contacts";
export { CampaignService, PLUGIN_ID } from "./campaigns";
export { parseCsv, splitCsvLine, stripBom } from "./csv";
export type { ParsedRow, ParseCsvResult } from "./csv";

export {
  EVENT_SUBSCRIPTIONS,
  handleFunnelLeadCaptured,
  handlePipelineCardMoved,
} from "./subscribers";
export type {
  FunnelLeadCapturedPayload,
  PipelineCardMovedPayload,
} from "./subscribers";

export type {
  ActivityLogPort,
  EventBusPort,
  LeadsEventName,
  SubscribedEventName,
  ListActivityFilter,
  LogActivityInput,
  PluginInstallStorePort,
  TenantPort,
  EmailEnqueuePort,
  EmailEnqueueInput,
  EmailEnqueueResult,
  PipelinePort,
  PipelineCardRef,
  AddLeadCardInput,
} from "./ports";

export {
  registerLeadsPipelineFoundation,
  clearLeadsPipelineFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { LeadsPipelineFoundation } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EmailEnqueuePort,
  EventBusPort,
  PipelinePort,
  PluginInstallStorePort,
  TenantPort,
} from "./ports";
import { LeadService } from "./leads";
import { ContactService } from "./contacts";
import { CampaignService } from "./campaigns";

// ─── Container ────────────────────────────────────────────────────────────

export interface LeadsPipelineDeps {
  agencyId: AgencyId;
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant: TenantPort;
  pluginInstalls: PluginInstallStorePort;
  emailEnqueue?: EmailEnqueuePort;
  pipeline?: PipelinePort;
}

export interface LeadsPipelineContainer {
  leads: LeadService;
  contacts: ContactService;
  campaigns: CampaignService;
}

export function buildLeadsPipelineContainer(deps: LeadsPipelineDeps): LeadsPipelineContainer {
  const leads = new LeadService(
    deps.agencyId, deps.storage, deps.activity, deps.events, deps.pipeline,
  );
  const contacts = new ContactService(
    deps.agencyId, deps.storage, deps.activity, deps.events,
  );
  const campaigns = new CampaignService(
    deps.agencyId, deps.storage, deps.activity, deps.events, leads, deps.emailEnqueue,
  );
  return { leads, contacts, campaigns };
}
