import "server-only";
// Client-CRM plugin foundation registration.
//
// Two optional cross-plugin ports — the foundation supplies them when
// the matching plugin is also installed for the same client. Absent →
// the CRM degrades gracefully (no membership tag on contacts, no
// recent-orders timeline).

import { registerClientCrmFoundation } from "@aqua/plugin-client-crm/server";
import {
  tenantPort, activityPort, eventBusPort, pluginInstallStorePort, userPort,
} from "./_foundationPorts";
import {
  ecommerceOrdersPortForCrm,
  membershipBenefitsPort,
} from "./_crossPluginPorts";

let registered = false;

export function ensureClientCrmFoundationRegistered(): void {
  if (registered) return;
  registerClientCrmFoundation({
    tenant: tenantPort,
    user: userPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
    membershipBenefits: membershipBenefitsPort,
    ecommerceOrders: ecommerceOrdersPortForCrm,
  } as unknown as Parameters<typeof registerClientCrmFoundation>[0]);
  registered = true;
}

ensureClientCrmFoundationRegistered();
