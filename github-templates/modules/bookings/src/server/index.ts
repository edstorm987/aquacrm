// Server-side barrel.

export {
  BookingsService,
  BookingConflictError,
  BookingNotFoundError,
} from "./bookings";
export { buildICS } from "./ics";
export {
  STATUS_TRANSITIONS,
  TERMINAL_STATUSES,
  emptyAvailability,
  parseHHMM,
  dayKeyUTC,
} from "../lib/domain";

export type {
  ActivityLogPort,
  BookingsEventName,
  CrmPort,
  EmailSenderPort,
  EventBusPort,
  LogActivityInput,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";

export {
  registerBookingsFoundation,
  clearBookingsFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { BookingsFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  CrmPort,
  EmailSenderPort,
  EventBusPort,
  StoragePort,
} from "./ports";
import { BookingsService } from "./bookings";

export interface BookingsDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  emailSender?: EmailSenderPort | null;
  crm?: CrmPort | null;
}

export interface BookingsContainer {
  bookings: BookingsService;
}

export function buildBookingsContainer(deps: BookingsDeps): BookingsContainer {
  const storage = deps.storage as StoragePort;
  const bookings = new BookingsService({
    agencyId: deps.agencyId,
    clientId: deps.clientId,
    storage,
    activity: deps.activity,
    events: deps.events,
    emailSender: deps.emailSender,
    crm: deps.crm,
  });
  return { bookings };
}
