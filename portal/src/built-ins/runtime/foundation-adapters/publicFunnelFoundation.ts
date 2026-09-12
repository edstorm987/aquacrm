import "server-only";
// Public-funnel plugin foundation registration. The anonymous Health Check
// writes only through `/api/public/health-check/complete`, whose managed
// challenge and fixed founder-tenant admission precede this adapter. The old
// query-scoped plugin capture routes were retired by ABUSE-002.
//
// Mirrors `leadsPipelineFoundation.ts` shape:
//   • shared ports (activity + events) from `_foundationPorts.ts`
//   • plugin-specific lead registration from
//     `./leadFunnelPorts.ts` (T1 R032 chapter #150)
//   • idempotent `registered` flag — boot side-effect import calls
//     `ensurePublicFunnelFoundationRegistered()` once

import {
  containerFor,
  FunnelInputError,
  registerFunnelFoundation,
} from "@aqua/plugin-public-funnel/server";
import {
  activityPort,
  eventBusPort,
  tenantPort,
} from "./_foundationPorts";
import {
  leadUserPort,
  pendingCaptureErasurePort,
  pendingCapturePromotionAuthorityPort,
  pendingCapturePromotionPort,
} from "./leadFunnelPorts";

let registered = false;

// Build containers through the same imported module instance that owns the
// registration. Some workspace runtimes give package exports and direct source
// imports separate module identities; centralising both sides prevents a split
// registry that silently drops otherwise-persisted funnel context.
export const publicFunnelContainerFor = containerFor;
export { FunnelInputError };

export function ensurePublicFunnelFoundationRegistered(): void {
  if (registered) return;
  registerFunnelFoundation({
    activity: activityPort,
    events: eventBusPort,
    leadUsers: leadUserPort,
    promotionAuthority: pendingCapturePromotionAuthorityPort,
    promotions: pendingCapturePromotionPort,
    promotionErasure: pendingCaptureErasurePort,
    tenant: tenantPort,
  } as unknown as Parameters<typeof registerFunnelFoundation>[0]);
  registered = true;
}

ensurePublicFunnelFoundationRegistered();
