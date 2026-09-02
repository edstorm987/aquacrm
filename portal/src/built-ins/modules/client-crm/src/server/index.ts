// Server-side barrel — services + container builder + foundation adapter.

export { ContactService } from "./contacts";
export { SegmentService, DEFAULT_SEGMENT_SEEDS } from "./segments";
export { ActivityService } from "./activity";
export { PipelineService } from "./pipelines";
export type { CardTransition } from "./pipelines";
export { AutomationService } from "./automations";

export type {
  ActivityLogPort,
  CrmEventName,
  EcommerceOrderProjection,
  EcommerceOrdersPort,
  EventBusPort,
  ListActivityFilter,
  LogActivityInput,
  MembershipBenefitsPort,
  MembershipSnapshot,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";

export {
  registerClientCrmFoundation,
  clearClientCrmFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { ClientCrmFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EcommerceOrdersPort,
  EventBusPort,
  MembershipBenefitsPort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
import { ContactService } from "./contacts";
import { SegmentService } from "./segments";
import { ActivityService } from "./activity";
import { PipelineService } from "./pipelines";
import { AutomationService } from "./automations";

// ─── Container ────────────────────────────────────────────────────────────

/**
 * The operator-facing manifest settings this module consumes, normalised from
 * `install.config` (issue #44). `defaultTags` is applied to a Contact created
 * without tags of its own; `autoCreateOnSignup` gates whether the customer
 * profile page creates a Contact for a signed-in customer who has none.
 */
export interface ClientCrmSettings {
  defaultTags: string[];
  autoCreateOnSignup: boolean;
}

export function readClientCrmSettings(config: unknown): ClientCrmSettings {
  const record = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  const raw = typeof record.defaultTags === "string" ? record.defaultTags : "";
  const seen = new Set<string>();
  const defaultTags: string[] = [];
  for (const tag of raw.split(",").map(value => value.trim().slice(0, 60)).filter(Boolean)) {
    const key = tag.toLocaleLowerCase("en-GB");
    if (seen.has(key)) continue;
    seen.add(key);
    defaultTags.push(tag);
  }
  return {
    defaultTags,
    autoCreateOnSignup: record.autoCreateOnSignup !== false,
  };
}

export interface ClientCrmDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant: TenantPort;
  user: UserPort;
  pluginInstalls: PluginInstallStorePort;
  membershipBenefits?: MembershipBenefitsPort;
  ecommerceOrders?: EcommerceOrdersPort;
  settings?: ClientCrmSettings;
}

export interface ClientCrmContainer {
  contacts: ContactService;
  segments: SegmentService;
  activity: ActivityService;
  /** Journey boards — the client's own kanban. Gated by the
   *  `journey-pipelines` feature; the service is always built, because a
   *  container whose shape depends on a flag makes every caller check. */
  pipelines: PipelineService;
  automations: AutomationService;
}

export function buildClientCrmContainer(deps: ClientCrmDeps): ClientCrmContainer {
  const storage = deps.storage as StoragePort;
  const contacts = new ContactService(
    deps.agencyId, deps.clientId, storage, deps.user, deps.activity, deps.events, deps.settings,
  );
  const segments = new SegmentService(
    deps.agencyId, deps.clientId, storage, deps.activity, deps.events,
    contacts, deps.membershipBenefits,
  );
  const activity = new ActivityService(
    deps.agencyId, deps.clientId, storage, deps.activity, deps.events,
    contacts, deps.ecommerceOrders,
  );
  const pipelines = new PipelineService(
    deps.agencyId, deps.clientId, storage, deps.activity, deps.events,
  );
  // Automations drive the board through PipelineService rather than touching
  // card storage, so "where a card is" has exactly one owner.
  const automations = new AutomationService(
    deps.agencyId, deps.clientId, storage, deps.activity, deps.events,
    pipelines, contacts, activity, deps.pluginInstalls,
  );
  return { contacts, segments, activity, pipelines, automations };
}
