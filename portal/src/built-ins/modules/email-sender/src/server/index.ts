// Server-side barrel — services + container builder + foundation adapter.

export { EmailService } from "./emails";
export { DeliveryService } from "./delivery";
export { WebhookService } from "./webhook";
export type { WebhookHandleResult } from "./webhook";
export { IdentityService } from "./identities";
export { ProviderService } from "./provider";

export type {
  ActivityLogPort,
  DriverContext,
  EmailDriver,
  EmailEventName,
  EventBusPort,
  ListActivityFilter,
  LogActivityInput,
  MarketingTemplate,
  MarketingTemplatePort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
} from "./ports";

export {
  registerEmailSenderFoundation,
  clearEmailSenderFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
  EVENT_SUBSCRIPTIONS,
} from "./foundationAdapter";
export type { EmailSenderFoundation, ContainerForArgs } from "./foundationAdapter";

export { defaultDriverRegistry, NoopDriver, PostmarkDriver, SmtpDriver, StubDriver, buildSmtpDataBody, PLACEHOLDER_SMTP_TRANSPORT } from "./drivers";
export type { SmtpDialOptions, SmtpDialResult, SmtpDialFailure, SmtpTransport } from "./drivers";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ProviderKind } from "../lib/domain";
import type {
  ActivityLogPort,
  EmailDriver,
  EventBusPort,
  MarketingTemplatePort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
} from "./ports";
import { EmailService } from "./emails";
import { DeliveryService } from "./delivery";
import { WebhookService } from "./webhook";
import { IdentityService } from "./identities";
import { ProviderService } from "./provider";
import { defaultDriverRegistry } from "./drivers";

// ─── Container ────────────────────────────────────────────────────────────

export interface EmailSenderDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant: TenantPort;
  pluginInstalls: PluginInstallStorePort;
  marketingTemplates?: MarketingTemplatePort;
  drivers?: Map<ProviderKind, EmailDriver>;
}

export interface EmailSenderContainer {
  emails: EmailService;
  delivery: DeliveryService;
  webhook: WebhookService;
  identities: IdentityService;
  provider: ProviderService;
  drivers: Map<ProviderKind, EmailDriver>;
}

export function buildEmailSenderContainer(deps: EmailSenderDeps): EmailSenderContainer {
  const storage = deps.storage as StoragePort;
  const drivers = deps.drivers ?? defaultDriverRegistry();
  const provider = new ProviderService(deps.agencyId, storage, deps.activity, deps.events);
  const identities = new IdentityService(deps.agencyId, storage, deps.activity, deps.events);
  const emails = new EmailService(
    deps.agencyId, storage, deps.activity, deps.events,
    identities, deps.marketingTemplates,
  );
  const delivery = new DeliveryService(deps.agencyId, emails, provider, drivers);
  const webhook = new WebhookService(
    deps.agencyId, storage, deps.activity, deps.events,
    emails, provider, drivers as unknown as Map<string, EmailDriver>,
  );
  return { emails, delivery, webhook, identities, provider, drivers };
}
