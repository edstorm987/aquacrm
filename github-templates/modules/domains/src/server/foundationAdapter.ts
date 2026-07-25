// Foundation registration adapter — same pattern as agency-hr.
//
// The plugin's manifest can't reach into the foundation directly (it
// must tsc-clean standalone). The foundation imports this module at
// boot, calls `registerDomainsFoundation({...})` once with its real
// port adapters, and from then on every page + handler resolves its
// services via `containerFor({...})`.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
} from "./ports";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import { DomainService } from "./domainService";

export interface DomainsFoundation {
  tenant: TenantPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
}

export interface DomainsContainer {
  domains: DomainService;
}

let registered: DomainsFoundation | null = null;

export function registerDomainsFoundation(deps: DomainsFoundation): void {
  registered = deps;
}

export function clearDomainsFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): DomainsFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-domains: foundation not registered. Call registerDomainsFoundation({...}) at boot.",
    );
  }
  return registered;
}

export function containerFor(args: {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
}): DomainsContainer {
  const f = requireFoundation();
  return {
    domains: new DomainService({
      agencyId: args.agencyId,
      ...(args.clientId !== undefined ? { clientId: args.clientId } : {}),
      storage: args.storage,
      activity: f.activity,
      events: f.events,
      tenant: f.tenant,
      pluginInstalls: f.pluginInstalls,
    }),
  };
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
  foundation: DomainsFoundation;
}): DomainsContainer {
  return {
    domains: new DomainService({
      agencyId: args.agencyId,
      ...(args.clientId !== undefined ? { clientId: args.clientId } : {}),
      storage: args.storage,
      activity: args.foundation.activity,
      events: args.foundation.events,
      tenant: args.foundation.tenant,
      pluginInstalls: args.foundation.pluginInstalls,
    }),
  };
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  clientId?: ClientId;
  actor: UserId;
  storage: PluginStorage;
}): DomainsContainer | null {
  if (!registered) return null;
  return containerWithDeps({
    agencyId: args.agencyId,
    ...(args.clientId !== undefined ? { clientId: args.clientId } : {}),
    storage: args.storage,
    foundation: registered,
  });
}
