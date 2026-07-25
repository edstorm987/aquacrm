// Server-side barrel — services + container + foundation adapter.

export { BoardService } from "./boards";
export { CardService } from "./cards";
export { TEMPLATES, getTemplate, listTemplates, listTemplatesForRoles } from "./templates";

export type {
  ActivityLogPort,
  EventBusPort,
  KanbanEventName,
  ListActivityFilter,
  LogActivityInput,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";

export {
  registerKanbanFoundation,
  clearKanbanFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { KanbanFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
import { BoardService } from "./boards";
import { CardService } from "./cards";

export interface KanbanDeps {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant?: TenantPort;
  user?: UserPort;
}

export interface KanbanContainer {
  boards: BoardService;
  cards: CardService;
}

export function buildKanbanContainer(deps: KanbanDeps): KanbanContainer {
  const storage = deps.storage as StoragePort;
  const boards = new BoardService(
    deps.agencyId, deps.clientId, storage, deps.activity, deps.events,
  );
  const cards = new CardService(
    deps.agencyId, deps.clientId, storage, deps.activity, deps.events,
  );
  return { boards, cards };
}
