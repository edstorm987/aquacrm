// Foundation adapter — bridges T1's foundation services into the plugin.
//
// The canonical `PluginCtx` is `{ agencyId, clientId?, install, storage }`.
// It deliberately doesn't carry the full foundation surface (T1's design
// keeps the plugin contract minimal). For handlers + pages to reach
// foundation services (tenants, activity log, event bus, plugin installs)
// the foundation **registers** an adapter once at boot:
//
//   registerEcommerceFoundation({ tenant, activity, events, pluginInstalls })
//
// API handlers + pages call `requireFoundation()` to retrieve the
// registered adapter and combine it with the per-request `storage` from
// PluginCtx into an `EcommerceContainer`.
//
// This module is tsc-clean standalone — no foundation imports here.

import type {
  ActivityPort,
  EventBusPort,
  MembershipBenefitsPort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
} from "./ports";
import { buildEcommerceContainer, type EcommerceContainer } from "./index";

export interface EcommerceFoundation {
  tenant: TenantPort;
  activity: ActivityPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  // Optional R5 cross-plugin port. Foundation supplies this when the
  // memberships plugin is also installed for the same client. The
  // adapter reads `containerFor({...}).benefits.getBenefitsForUser(...)`
  // from `@aqua/plugin-memberships/server` and projects the largest
  // discount-category benefit into a `MembershipDiscountSnapshot`.
  // Foundation-side wiring lives in
  // `portal/src/plugins/foundation-adapters/membershipBenefits.ts`
  // (T1 adds in their next round — see chapter §"Foundation pending").
  membershipBenefits?: MembershipBenefitsPort;
}

let registered: EcommerceFoundation | null = null;

export function registerEcommerceFoundation(foundation: EcommerceFoundation): void {
  registered = foundation;
}

export function clearEcommerceFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): EcommerceFoundation {
  if (!registered) {
    throw new Error(
      "Ecommerce plugin foundation not registered. " +
      "T1's runtime must call `registerEcommerceFoundation({ tenant, activity, events, pluginInstalls })` " +
      "once at boot before any ecommerce route runs.",
    );
  }
  return registered;
}

// Per-request container assembler. Combines the registered foundation
// (singleton across requests) with the per-install storage (per request).
export function containerFor(storage: StoragePort): EcommerceContainer {
  const f = requireFoundation();
  return buildEcommerceContainer({
    storage,
    tenant: f.tenant,
    activity: f.activity,
    events: f.events,
    pluginInstalls: f.pluginInstalls,
    membershipBenefits: f.membershipBenefits,
  });
}
