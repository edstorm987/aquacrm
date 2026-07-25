import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  ChannelDriver,
  EmailSenderPort,
  EventBusPort,
  UserPort,
} from "./ports";
import type { NotificationsContainer } from "./index";
import { buildNotificationsContainer } from "./index";
import { defaultDrivers } from "./drivers";

export interface NotificationsFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  emailSender?: EmailSenderPort | null;
  // Per-channel driver overrides; merged on top of the bundled
  // defaults at containerFor() time.
  drivers?: Partial<Record<string, ChannelDriver>>;
}

let registered: NotificationsFoundation | null = null;

export function registerNotificationsFoundation(deps: NotificationsFoundation): void {
  registered = deps;
}

export function clearNotificationsFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): NotificationsFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-notifications: foundation not registered. Call registerNotificationsFoundation({...}) at boot.",
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

function mergeDrivers(
  agencyId: AgencyId,
  base: NotificationsFoundation,
): Record<string, ChannelDriver> {
  const driverDeps = {
    agencyId,
    user: base.user ?? null,
    emailSender: base.emailSender ?? null,
  };
  const merged: Record<string, ChannelDriver> = { ...defaultDrivers(driverDeps) };
  for (const [k, v] of Object.entries(base.drivers ?? {})) {
    if (v) merged[k] = v;
  }
  return merged;
}

export function containerFor(args: ContainerForArgs): NotificationsContainer {
  const f = requireFoundation();
  return buildNotificationsContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    drivers: mergeDrivers(args.agencyId, f),
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  drivers: Record<string, ChannelDriver>;
}): NotificationsContainer {
  return buildNotificationsContainer(args);
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
}): NotificationsContainer | null {
  if (!registered) return null;
  return buildNotificationsContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    drivers: mergeDrivers(args.agencyId, registered),
  });
}
