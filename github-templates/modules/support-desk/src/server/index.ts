export {
  TicketService,
  TicketNotFoundError,
  InvalidStatusTransitionError,
  HoneypotTriggeredError,
} from "./service";
export {
  HONEYPOT_FIELD,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  looksLikeBot,
  nextRef,
} from "../lib/domain";
export type {
  ActivityLogPort,
  EventBusPort,
  LogActivityInput,
  StoragePort,
  SupportDeskEventName,
  TenantPort,
  UserPort,
} from "./ports";
export {
  registerSupportDeskFoundation,
  clearSupportDeskFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { SupportDeskFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import type { AutoAssignRule } from "../lib/domain";
import { TicketService } from "./service";

export interface SupportDeskDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  autoAssignRules?: AutoAssignRule[];
}

export interface SupportDeskContainer {
  tickets: TicketService;
}

export function buildSupportDeskContainer(deps: SupportDeskDeps): SupportDeskContainer {
  const storage = deps.storage as StoragePort;
  const tickets = new TicketService({
    agencyId: deps.agencyId,
    clientId: deps.clientId,
    storage,
    activity: deps.activity,
    events: deps.events,
    autoAssignRules: deps.autoAssignRules,
  });
  // Wire ecommerce.order.shipped subscriber if the foundation event
  // bus supports it. Graceful no-op otherwise.
  if (typeof deps.events.on === "function") {
    deps.events.on("ecommerce.order.shipped", async (scope, payload: unknown) => {
      if (scope.agencyId !== deps.agencyId || scope.clientId !== deps.clientId) return;
      const p = payload as { customerEmail?: string; ref?: string };
      if (!p?.customerEmail || !p?.ref) return;
      await tickets.onOrderShipped(p.customerEmail, p.ref);
    });
  }
  return { tickets };
}
