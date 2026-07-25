// Foundation registration adapter — same pattern as forms +
// agency-marketing + client-CRM.

import type { AgencyId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ProviderKind } from "../lib/domain";
import type {
  ActivityLogPort,
  EmailDriver,
  EventBusPort,
  MarketingTemplatePort,
  PluginInstallStorePort,
  TenantPort,
} from "./ports";
import type { EmailSenderContainer } from "./index";
import { buildEmailSenderContainer } from "./index";

export interface EmailSenderFoundation {
  tenant: TenantPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  // Optional cross-plugin port — agency-marketing's EmailTemplate
  // store. Absent → enqueue with templateId throws cleanly.
  marketingTemplates?: MarketingTemplatePort;
  // Optional driver registry override (foundation can supply a custom
  // fetch impl for production observability). Absent → defaults from
  // drivers/index.ts.
  drivers?: Map<ProviderKind, EmailDriver>;
}

let registered: EmailSenderFoundation | null = null;

export function registerEmailSenderFoundation(deps: EmailSenderFoundation): void {
  registered = deps;
}

export function clearEmailSenderFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): EmailSenderFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-email-sender: foundation not registered. Call registerEmailSenderFoundation({...}) at boot.",
    );
  }
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): EmailSenderContainer {
  const f = requireFoundation();
  return buildEmailSenderContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    tenant: f.tenant,
    pluginInstalls: f.pluginInstalls,
    marketingTemplates: f.marketingTemplates,
    drivers: f.drivers,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
  tenant: TenantPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  marketingTemplates?: MarketingTemplatePort;
  drivers?: Map<ProviderKind, EmailDriver>;
}): EmailSenderContainer {
  return buildEmailSenderContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: args.activity,
    events: args.events,
    tenant: args.tenant,
    pluginInstalls: args.pluginInstalls,
    marketingTemplates: args.marketingTemplates,
    drivers: args.drivers,
  });
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
}): EmailSenderContainer | null {
  if (!registered) return null;
  return buildEmailSenderContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    tenant: registered.tenant,
    pluginInstalls: registered.pluginInstalls,
    marketingTemplates: registered.marketingTemplates,
    drivers: registered.drivers,
  });
}

// Cross-plugin event subscription declarations. Foundation's R6 router
// reads this list, looks up the matching method on the container's
// EmailService, and subscribes. Wiring is data-driven so adding a new
// subscriber is a one-line append here + one method on EmailService.
export const EVENT_SUBSCRIPTIONS = [
  {
    event: "forms.notification.requested" as const,
    handler: "onFormsNotificationRequested" as const,
    description: "Forms submission → email notify list per form's submitAction.notifyEmails.",
  },
  {
    event: "membership.subscription_changed" as const,
    handler: "onMembershipSubscriptionChanged" as const,
    description: "Membership → welcome email on activate; cancellation email on cancel.",
  },
  {
    event: "affiliate.payout_completed" as const,
    handler: "onAffiliatePayoutCompleted" as const,
    description: "Affiliate payout → payout-paid notification email.",
  },
  {
    event: "auth.bootstrap.signup" as const,
    handler: "onAuthBootstrapSignup" as const,
    description: "End-customer signup → welcome confirmation email.",
  },
] as const;
