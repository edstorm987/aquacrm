// Server-side barrel — services + container builder + foundation adapter.

export { PlanService } from "./plans";
export { BenefitService } from "./benefits";
export { SubscriptionService } from "./subscriptions";
export { WebhookService } from "./webhook";
export type { WebhookHandleResult } from "./webhook";

export type {
  ActivityLogPort,
  EventBusPort,
  ListActivityFilter,
  LogActivityInput,
  MembershipEventName,
  PluginInstallStorePort,
  StoragePort,
  StripeBillingPortalInput,
  StripeBillingPortalSession,
  StripeCheckoutSession,
  StripeCheckoutSessionInput,
  StripeCustomer,
  StripeCustomerInput,
  StripePort,
  StripePrice,
  StripePriceInput,
  StripeSubscription,
  StripeSubscriptionInput,
  StripeWebhookEvent,
  TenantPort,
  UserPort,
} from "./ports";

export {
  registerMembershipsFoundation,
  clearMembershipsFoundation,
  isFoundationRegistered,
  isStripeAvailable,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { MembershipsFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  StoragePort,
  StripePort,
  TenantPort,
  UserPort,
} from "./ports";
import { PlanService } from "./plans";
import { BenefitService } from "./benefits";
import { SubscriptionService } from "./subscriptions";
import { WebhookService } from "./webhook";

// ─── Container ────────────────────────────────────────────────────────────

export interface MembershipsDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant: TenantPort;
  user: UserPort;
  pluginInstalls: PluginInstallStorePort;
  stripe: StripePort;
}

export interface MembershipsContainer {
  plans: PlanService;
  benefits: BenefitService;
  subscriptions: SubscriptionService;
  webhook: WebhookService;
}

export function buildMembershipsContainer(deps: MembershipsDeps): MembershipsContainer {
  const storage = deps.storage as StoragePort;
  const plans = new PlanService(
    deps.agencyId,
    deps.clientId,
    storage,
    deps.activity,
    deps.events,
    deps.stripe,
  );
  const subscriptions = new SubscriptionService(
    deps.agencyId,
    deps.clientId,
    storage,
    deps.activity,
    deps.events,
    deps.stripe,
    deps.user,
    plans,
  );
  const benefits = new BenefitService(
    deps.agencyId,
    deps.clientId,
    storage,
    deps.activity,
    deps.events,
    plans,
    subscriptions,
  );
  const webhook = new WebhookService(
    storage,
    deps.activity,
    deps.events,
    deps.stripe,
    subscriptions,
  );
  return { plans, benefits, subscriptions, webhook };
}
