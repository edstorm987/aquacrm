import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  CrmPort,
  EmailSenderPort,
  EventBusPort,
  TenantPort,
  UserPort,
} from "./ports";
import type { BookingsContainer } from "./index";
import { buildBookingsContainer } from "./index";

export interface BookingsFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
  emailSender?: EmailSenderPort | null;
  crm?: CrmPort | null;
}

let registered: BookingsFoundation | null = null;

export function registerBookingsFoundation(deps: BookingsFoundation): void {
  registered = deps;
}

export function clearBookingsFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): BookingsFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-bookings: foundation not registered. Call registerBookingsFoundation({...}) at boot.",
    );
  }
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): BookingsContainer {
  const f = requireFoundation();
  return buildBookingsContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    emailSender: f.emailSender,
    crm: f.crm,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  emailSender?: EmailSenderPort | null;
  crm?: CrmPort | null;
}): BookingsContainer {
  return buildBookingsContainer(args);
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
}): BookingsContainer | null {
  if (!registered || !args.clientId) return null;
  return buildBookingsContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    emailSender: registered.emailSender,
    crm: registered.crm,
  });
}
