// Server-side barrel — service + container + drivers + foundation adapter.

export { NotificationService } from "./notifications";
export {
  emailDriver,
  slackDriver,
  whatsappDriver,
  webhookDriver,
  defaultDrivers,
} from "./drivers";

export type {
  ActivityLogPort,
  ChannelDriver,
  EmailSenderPort,
  EventBusPort,
  LogActivityInput,
  NotificationEventName,
  StoragePort,
  UserPort,
} from "./ports";

export {
  CHANNEL_KEYS,
  CHANNEL_LABELS,
} from "../lib/domain";

export {
  registerNotificationsFoundation,
  clearNotificationsFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { NotificationsFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  ChannelDriver,
  EventBusPort,
  StoragePort,
} from "./ports";
import { NotificationService } from "./notifications";

export interface NotificationsDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  drivers: Record<string, ChannelDriver>;
}

export interface NotificationsContainer {
  notifications: NotificationService;
}

export function buildNotificationsContainer(deps: NotificationsDeps): NotificationsContainer {
  const storage = deps.storage as StoragePort;
  const notifications = new NotificationService({
    agencyId: deps.agencyId,
    storage,
    activity: deps.activity,
    events: deps.events,
    drivers: deps.drivers,
  });
  return { notifications };
}
