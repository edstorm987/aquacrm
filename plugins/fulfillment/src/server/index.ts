// Server-side barrel — convenient single entry point for the foundation
// to import the fulfillment plugin's services + types.

export { ChecklistService } from "./checklist";
export type { ChecklistView, ChecklistViewItem, ChecklistProgress, ChecklistItemState } from "./checklist";

export { ClientLifecycleService } from "./clients";
export type {
  CreateClientWithPhaseInput,
  CreateClientWithPhaseResult,
} from "./clients";

export { MarketplaceService } from "./marketplace";
export type { MarketplaceCard, MarketplaceFilter, MarketplaceListResult } from "./marketplace";

export { PhaseService } from "./phases";
export type { PhaseUpsertInput } from "./phases";

export { TransitionService } from "./transitions";
export type { AdvancePhaseArgs, AdvancePhaseResult, AdvancePhaseFailure } from "./transitions";

export { StarterVariantService, NOOP_PORTAL_VARIANT_PORT } from "./starterVariant";
export type { ApplyVariantArgs } from "./starterVariant";

export { DEFAULT_PHASE_PRESETS, buildDefaultPhases } from "./presets";
export type { PhasePresetSeed } from "./presets";

export type {
  ActivityLogPort,
  ClientStorePort,
  EventBusPort,
  EventName,
  ListActivityFilter,
  LogActivityInput,
  PhaseStorePort,
  PluginInstallPatch,
  PluginInstallStorePort,
  PluginRegistryEntry,
  PluginRegistryPort,
  PluginRuntimePort,
  PortalVariantPort,
  UpsertPluginInstallInput,
  CreateClientInput,
  UpdateClientPatch,
} from "./ports";

// Container — the fulfillment plugin's services bundled together. The
// foundation creates one of these per request (or once at boot if state
// is process-singleton) using its concrete adapters and passes the
// container into the plugin manifest's pages and api handlers.
import type {
  ActivityLogPort,
  ClientStorePort,
  EventBusPort,
  PhaseStorePort,
  PluginInstallStorePort,
  PluginRegistryPort,
  PluginRuntimePort,
  PortalVariantPort,
} from "./ports";
import { ChecklistService } from "./checklist";
import { ClientLifecycleService } from "./clients";
import { MarketplaceService } from "./marketplace";
import { PhaseService } from "./phases";
import { TransitionService } from "./transitions";
import { StarterVariantService } from "./starterVariant";
import type { PluginStorage } from "../lib/aquaPluginTypes";

export interface FulfillmentDeps {
  clients: ClientStorePort;
  pluginInstalls: PluginInstallStorePort;
  pluginRuntime: PluginRuntimePort;
  registry: PluginRegistryPort;
  phases: PhaseStorePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  variants: PortalVariantPort;
  storage: PluginStorage;
}

export interface FulfillmentContainer {
  phaseService: PhaseService;
  checklistService: ChecklistService;
  starterVariantService: StarterVariantService;
  transitionService: TransitionService;
  clientLifecycleService: ClientLifecycleService;
  marketplaceService: MarketplaceService;
}

export function buildFulfillmentContainer(deps: FulfillmentDeps): FulfillmentContainer {
  const phaseService = new PhaseService(deps.phases);
  const checklistService = new ChecklistService(deps.storage, deps.events);
  const starterVariantService = new StarterVariantService(deps.variants);
  const transitionService = new TransitionService(
    deps.clients,
    deps.pluginInstalls,
    deps.pluginRuntime,
    deps.activity,
    deps.events,
    checklistService,
    starterVariantService,
  );
  const clientLifecycleService = new ClientLifecycleService(
    deps.clients,
    deps.pluginRuntime,
    deps.activity,
    deps.events,
    phaseService,
    checklistService,
    starterVariantService,
  );
  const marketplaceService = new MarketplaceService(
    deps.registry,
    deps.pluginInstalls,
    deps.pluginRuntime,
    deps.activity,
  );
  return {
    phaseService,
    checklistService,
    starterVariantService,
    transitionService,
    clientLifecycleService,
    marketplaceService,
  };
}
