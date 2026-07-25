// Server-side barrel — services + container builder + foundation adapter.

export { FormService } from "./forms";
export { SubmissionService } from "./submissions";
export { NotificationService } from "./notifications";
export { TemplateService, DEFAULT_TEMPLATES } from "./templates";

export type {
  ActivityLogPort,
  EmailQueuePort,
  EmailQueueRequest,
  EventBusPort,
  FormsEventName,
  ListActivityFilter,
  LogActivityInput,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";

export {
  registerFormsFoundation,
  clearFormsFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { FormsFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EmailQueuePort,
  EventBusPort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
import { FormService } from "./forms";
import { SubmissionService } from "./submissions";
import { NotificationService } from "./notifications";
import { TemplateService } from "./templates";

// ─── Container ────────────────────────────────────────────────────────────

export interface FormsDeps {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant: TenantPort;
  user: UserPort;
  pluginInstalls: PluginInstallStorePort;
  emailQueue?: EmailQueuePort;
}

export interface FormsContainer {
  forms: FormService;
  submissions: SubmissionService;
  notifications: NotificationService;
  templates: TemplateService;
}

export function buildFormsContainer(deps: FormsDeps): FormsContainer {
  const storage = deps.storage as StoragePort;
  const forms = new FormService(deps.agencyId, deps.clientId, storage, deps.activity, deps.events);
  const submissions = new SubmissionService(deps.agencyId, deps.clientId, storage, deps.activity, deps.events, forms);
  const notifications = new NotificationService(deps.agencyId, deps.clientId, deps.activity, deps.events, deps.emailQueue);
  const templates = new TemplateService(deps.agencyId, deps.clientId, storage, deps.activity, deps.events);
  return { forms, submissions, notifications, templates };
}
