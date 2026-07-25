import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, KanbanPort, TenantPort, UserPort } from "./ports";
import type { ChecklistContainer } from "./index";
import { buildChecklistContainer } from "./index";

export interface OnboardingFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
  kanban?: KanbanPort;
}

let registered: OnboardingFoundation | null = null;
export function registerOnboardingFoundation(deps: OnboardingFoundation): void { registered = deps; }
export function clearOnboardingFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): OnboardingFoundation {
  if (!registered) throw new Error("@aqua/plugin-onboarding-checklist: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId; clientId: ClientId;
  storage: PluginStorage; install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): ChecklistContainer {
  const f = requireFoundation();
  return buildChecklistContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: f.activity, events: f.events, kanban: f.kanban,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; clientId: ClientId; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort; kanban?: KanbanPort;
}): ChecklistContainer {
  return buildChecklistContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; clientId?: ClientId; storage: PluginStorage }): ChecklistContainer | null {
  if (!registered) return null;
  if (!args.clientId) return null;
  return buildChecklistContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: registered.activity, events: registered.events, kanban: registered.kanban,
  });
}
