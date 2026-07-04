import "server-only";
// Agency-finance plugin foundation registration.

import { registerAgencyFinanceFoundation } from "@aqua/plugin-agency-finance/server";
import {
  tenantPort, activityPort, eventBusPort, pluginInstallStorePort, userPort,
} from "./_foundationPorts";

let registered = false;

export function ensureAgencyFinanceFoundationRegistered(): void {
  if (registered) return;
  registerAgencyFinanceFoundation({
    tenant: tenantPort,
    user: userPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
  } as unknown as Parameters<typeof registerAgencyFinanceFoundation>[0]);
  registered = true;
}

ensureAgencyFinanceFoundationRegistered();
