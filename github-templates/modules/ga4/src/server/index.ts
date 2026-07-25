export { Ga4Service } from "./services";
export {
  DEFAULT_CACHE_TTL_MS, DEFAULT_DAYS, MIN_FETCH_GAP_MS,
  parseServiceAccountJson, isPlausibleServiceAccountJson,
} from "../lib/domain";
export type {
  ActivityLogPort, EventBusPort, Ga4EventName,
  Ga4Port, RunReportResult, VaultPort,
  LogActivityInput, StoragePort, TenantPort, UserPort,
} from "./ports";
export { Ga4ApiError } from "./ports";
export {
  registerGa4Foundation,
  clearGa4Foundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { Ga4Foundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort, EventBusPort, Ga4Port, StoragePort, VaultPort,
} from "./ports";
import { Ga4Service } from "./services";

export interface Ga4DepsInput {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  ga4: Ga4Port;
  vault?: VaultPort;
}

export interface Ga4Container {
  ga4: Ga4Service;
}

export function buildGa4Container(deps: Ga4DepsInput): Ga4Container {
  const storage = deps.storage as StoragePort;
  const ga4 = new Ga4Service({
    agencyId: deps.agencyId, storage,
    activity: deps.activity, events: deps.events,
    ga4: deps.ga4,
    ...(deps.vault !== undefined ? { vault: deps.vault } : {}),
  });
  return { ga4 };
}
