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

// Cross-plugin event subscription declarations.
//
// ⚠ **This list is a declaration of intent, not a wiring mechanism.** The
// comment here used to say "Foundation's R6 router reads this list … and
// subscribes". **No such router exists**, and that was found on 2026-08-28 by
// asking which manifest fields anything actually reads. Every entry below is
// wired — or not — by hand in
// `src/built-ins/runtime/foundation-adapters/_eventSubscribers.ts`.
//
// State of each, verified 2026-08-29 by searching for emitters across `src/`:
//
//   ✅ `crm.automation.email_requested` — wired. A client's journey-board
//      automation sends their own subject and body.
//   ✅ `membership.subscription_changed` — wired. The emitted payload carries no
//      email address (the handler's first line is `if (!payload.userEmail)
//      return null`), so the wire resolves it from `userId` before calling.
//   ⚠ `affiliate.payout_completed` — emitted, NOT wired. The payload carries
//      `affiliateId`, a record id, where the handler wants `affiliateUserId`
//      and `affiliateEmail`; resolving one to the other needs a cross-module
//      read into affiliates that does not exist. Wiring it as-is would call a
//      handler that returns `null` every time.
//   ❌ `forms.notification.requested` — **nothing emits this event.**
//   ❌ `auth.bootstrap.signup` — **nothing emits this event.**
//
// `scripts/smoke-email-subscriber-wiring.test.ts` pins all five, in both
// directions: an entry that gains an emitter or a wire fails, so the notes
// above cannot quietly go stale.
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
  {
    event: "crm.automation.email_requested" as const,
    handler: "onCrmAutomationEmailRequested" as const,
    description: "A client's journey automation reached a stage → send their email.",
  },
] as const;
