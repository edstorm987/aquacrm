import "server-only";
// Agency-HR plugin foundation registration.
//
// Same pattern as ecommerce: side-effect import binds the plugin's
// register-once API to T1's modules. Manifest pages + API routes resolve
// their container via `containerFor({ agencyId, storage })` after this
// runs.

import { registerAgencyHrFoundation } from "@aqua/plugin-agency-hr/server";
import {
  tenantPort, activityPort, eventBusPort, pluginInstallStorePort,
} from "./_foundationPorts";

let registered = false;

export function ensureAgencyHrFoundationRegistered(): void {
  if (registered) return;
  registerAgencyHrFoundation({
    tenant: tenantPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
  } as unknown as Parameters<typeof registerAgencyHrFoundation>[0]);
  registered = true;
}

ensureAgencyHrFoundationRegistered();
