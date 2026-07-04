import "server-only";
// Agency-marketing plugin foundation registration.

import { registerAgencyMarketingFoundation } from "@aqua/plugin-agency-marketing/server";
import {
  tenantPort, activityPort, eventBusPort, pluginInstallStorePort, userPort,
} from "./_foundationPorts";

let registered = false;

export function ensureAgencyMarketingFoundationRegistered(): void {
  if (registered) return;
  registerAgencyMarketingFoundation({
    tenant: tenantPort,
    user: userPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
  } as unknown as Parameters<typeof registerAgencyMarketingFoundation>[0]);
  registered = true;
}

ensureAgencyMarketingFoundationRegistered();
