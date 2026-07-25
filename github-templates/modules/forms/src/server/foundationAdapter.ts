// Foundation registration adapter — same pattern as memberships +
// affiliates + agency-finance + agency-marketing + client-crm.

import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EmailQueuePort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
  UserPort,
} from "./ports";
import type { FormsContainer } from "./index";
import { buildFormsContainer } from "./index";

export interface FormsFoundation {
  tenant: TenantPort;
  user: UserPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  // Optional cross-plugin port — agency-marketing's email queue.
  // Absent → notification requests still emit events but no email
  // is enqueued.
  emailQueue?: EmailQueuePort;
}

let registered: FormsFoundation | null = null;

export function registerFormsFoundation(deps: FormsFoundation): void {
  registered = deps;
}

export function clearFormsFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): FormsFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-forms: foundation not registered. Call registerFormsFoundation({...}) at boot.",
    );
  }
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): FormsContainer {
  const f = requireFoundation();
  return buildFormsContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    tenant: f.tenant,
    user: f.user,
    pluginInstalls: f.pluginInstalls,
    emailQueue: f.emailQueue,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
  tenant: TenantPort;
  user: UserPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  emailQueue?: EmailQueuePort;
}): FormsContainer {
  return buildFormsContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: args.activity,
    events: args.events,
    tenant: args.tenant,
    user: args.user,
    pluginInstalls: args.pluginInstalls,
    emailQueue: args.emailQueue,
  });
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
}): FormsContainer | null {
  if (!registered) return null;
  return buildFormsContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    tenant: registered.tenant,
    user: registered.user,
    pluginInstalls: registered.pluginInstalls,
    emailQueue: registered.emailQueue,
  });
}
