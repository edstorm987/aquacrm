import "server-only";
// Affiliates plugin foundation registration.
//
// Cross-plugin port: `ecommerceOrders.getOrder(...)` reads from the
// ecommerce plugin's container and projects to AffiliateOrderProjection.
// See `_crossPluginPorts.ts` for the projection shape.

import { registerAffiliatesFoundation } from "@aqua/plugin-affiliates/server";
import {
  tenantPort, activityPort, eventBusPort, pluginInstallStorePort, userPort,
} from "./_foundationPorts";
import { ecommerceOrdersPortForAffiliates } from "./_crossPluginPorts";

let registered = false;

export function ensureAffiliatesFoundationRegistered(): void {
  if (registered) return;
  registerAffiliatesFoundation({
    tenant: tenantPort,
    user: userPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
    ecommerceOrders: ecommerceOrdersPortForAffiliates,
  } as unknown as Parameters<typeof registerAffiliatesFoundation>[0]);
  registered = true;
}

ensureAffiliatesFoundationRegistered();
