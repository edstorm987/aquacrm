// Server-side barrel + container builder.
//
// `buildEcommerceContainer(deps)` is the integration handshake — the
// foundation calls it per request (or once at boot) with concrete port
// implementations and gets back the bundle of services that pages + API
// handlers consume.
//
// Integration patch (T1 R3 cross-team): re-export
// `registerEcommerceFoundation` and friends from `./foundationAdapter`
// so foundation can register the boot-time adapter without piercing the
// package's `exports` map. Authored by T1 per the round-2-prompt's
// cross-team-patch authorisation; matched by a TASK note in
// `terminal-2/from-orchestrator.md`.

export {
  registerEcommerceFoundation,
  clearEcommerceFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
} from "./foundationAdapter";
export type { EcommerceFoundation } from "./foundationAdapter";

export { OrderService } from "./orders";
export type { ServerOrder, ServerOrderItem, OrderStatus } from "./orders";

export { BillingService, PLANS } from "./billing";
export type { Plan, PlanId, Subscription, SubscriptionStatus } from "./billing";

export { ProductService } from "./productsStore";
export type { ProductListOptions } from "./productsStore";

export { GiftCardService } from "./giftCards";
export type { GiftCard } from "./giftCards";

export { ReferralCodeService } from "./referralCodes";
export type { ReferralCode } from "./referralCodes";

export { DiscountService } from "./discounts";
export type {
  AppliedDiscount,
  CustomDiscountCode,
  DiscountType,
  PromoEntry,
} from "./discounts";

export type {
  ActivityPort,
  EcommerceEventName,
  EventBusPort,
  ListActivityFilter,
  LogActivityInput,
  MembershipBenefitsPort,
  MembershipDiscountSnapshot,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
} from "./ports";

import type {
  ActivityPort,
  EventBusPort,
  MembershipBenefitsPort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
} from "./ports";
import { OrderService } from "./orders";
import { BillingService } from "./billing";
import { ProductService } from "./productsStore";
import { GiftCardService } from "./giftCards";
import { ReferralCodeService } from "./referralCodes";
import { DiscountService } from "./discounts";

export interface EcommerceDeps {
  storage: StoragePort;
  tenant: TenantPort;
  activity: ActivityPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  // Optional R5 cross-plugin port. Foundation injects this when the
  // memberships plugin is also installed for the same client. When
  // absent, DiscountService.resolveForUser cleanly returns null.
  membershipBenefits?: MembershipBenefitsPort;
}

export interface EcommerceContainer {
  orders: OrderService;
  billing: BillingService;
  products: ProductService;
  giftCards: GiftCardService;
  referrals: ReferralCodeService;
  discounts: DiscountService;
  // Cross-cutting refs surfaced to handlers/pages so they don't reach
  // back into the deps bag separately.
  activity: ActivityPort;
  events: EventBusPort;
  tenant: TenantPort;
  pluginInstalls: PluginInstallStorePort;
}

export function buildEcommerceContainer(deps: EcommerceDeps): EcommerceContainer {
  const orders = new OrderService(deps.storage);
  const billing = new BillingService(deps.storage);
  const products = new ProductService(deps.storage);
  const giftCards = new GiftCardService(deps.storage);
  const referrals = new ReferralCodeService(deps.storage);
  const discounts = new DiscountService(deps.storage, giftCards, referrals, deps.membershipBenefits);
  return {
    orders,
    billing,
    products,
    giftCards,
    referrals,
    discounts,
    activity: deps.activity,
    events: deps.events,
    tenant: deps.tenant,
    pluginInstalls: deps.pluginInstalls,
  };
}
