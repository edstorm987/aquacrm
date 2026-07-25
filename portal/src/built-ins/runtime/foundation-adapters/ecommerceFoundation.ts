import "server-only";
// Ecommerce plugin foundation registration.
//
// T2's ecommerce manifest exposes routes / pages that depend on a
// register-once-at-boot foundation adapter (`registerEcommerceFoundation`)
// — see `@aqua/plugin-ecommerce/src/server/foundationAdapter.ts`. We
// wrap T1's modules into the ports the plugin expects, then call
// `registerEcommerceFoundation` exactly once.
//
// Module-level code runs on first import — the registry imports this
// module at boot, so the registration happens before any handler runs.

import { registerEcommerceFoundation } from "@aqua/plugin-ecommerce/server";
import {
  tenantPort, activityPort, eventBusPort, pluginInstallStorePort,
} from "./_foundationPorts";

let registered = false;

export function ensureEcommerceFoundationRegistered(): void {
  if (registered) return;
  // The plugin's `EcommerceFoundation` interface uses its own vendored
  // type aliases (ActivityEntry / ActivityCategory / Client / etc.).
  // Each foundation port we hand it is structurally compatible at
  // runtime; the cast bridges structural-vs-vendored TS drift that
  // grows whenever foundation's ActivityCategory adds a new union
  // member ahead of the plugin's vendored copy.
  registerEcommerceFoundation({
    tenant: tenantPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
  } as unknown as Parameters<typeof registerEcommerceFoundation>[0]);
  registered = true;
}

// Eager registration — module import = registration.
ensureEcommerceFoundationRegistered();
