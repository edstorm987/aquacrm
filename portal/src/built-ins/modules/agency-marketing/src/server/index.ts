// Server-side barrel — services + container builder + foundation adapter.

export { CampaignService } from "./campaigns";
export { LeadService } from "./leads";
export { TemplateService, DEFAULT_TEMPLATES } from "./templates";
export { ReportService } from "./reports";
export { ContentCalendarService } from "./content";
export { TouchpointService, PerformanceService } from "./touchpoints";

export type {
  ActivityLogPort,
  EventBusPort,
  ListActivityFilter,
  LogActivityInput,
  MarketingEventName,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";

export {
  registerAgencyMarketingFoundation,
  clearAgencyMarketingFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { AgencyMarketingFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
import { CampaignService } from "./campaigns";
import { LeadService } from "./leads";
import { TemplateService } from "./templates";
import { ReportService } from "./reports";
import { ContentCalendarService } from "./content";
import { TouchpointService, PerformanceService } from "./touchpoints";

// ─── Container ────────────────────────────────────────────────────────────

export interface AgencyMarketingDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant: TenantPort;
  user: UserPort;
  pluginInstalls: PluginInstallStorePort;
}

export interface AgencyMarketingContainer {
  campaigns: CampaignService;
  leads: LeadService;
  templates: TemplateService;
  reports: ReportService;
  content: ContentCalendarService;
  touchpoints: TouchpointService;
  performance: PerformanceService;
}

export function buildAgencyMarketingContainer(deps: AgencyMarketingDeps): AgencyMarketingContainer {
  const storage = deps.storage as StoragePort;
  const campaigns = new CampaignService(deps.agencyId, storage, deps.activity, deps.events);
  const leads = new LeadService(deps.agencyId, storage, deps.activity, deps.events);
  const templates = new TemplateService(deps.agencyId, storage, deps.activity, deps.events);
  const reports = new ReportService(deps.agencyId, campaigns, leads);
  const content = new ContentCalendarService(deps.agencyId, storage, deps.activity, deps.events);
  const touchpoints = new TouchpointService(deps.agencyId, storage, deps.activity, deps.events);
  const performance = new PerformanceService(campaigns, content, touchpoints);
  return { campaigns, leads, templates, reports, content, touchpoints, performance };
}
