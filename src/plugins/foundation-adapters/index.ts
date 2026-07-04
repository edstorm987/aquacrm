import "server-only";
// Foundation adapters — concrete implementations of the foundation ports
// declared in `@/plugins/_types`. The plugin runtime + catch-all routes
// build a `PluginServices` container per request from these adapters and
// hand it to plugin lifecycle hooks, page components and API handlers.

export { clientStoreAdapter } from "./clientStoreAdapter";
export { pluginInstallStoreAdapter } from "./pluginInstallStoreAdapter";
export { pluginRegistryAdapter } from "./pluginRegistryAdapter";
export { pluginRuntimeAdapter } from "./pluginRuntimeAdapter";
export { phaseStoreAdapter } from "./phaseStoreAdapter";
export { activityLogAdapter } from "./activityLogAdapter";
export { eventBusAdapter } from "./eventBusAdapter";
export { portalVariantAdapter } from "./portalVariantAdapter";

import { clientStoreAdapter } from "./clientStoreAdapter";
import { pluginInstallStoreAdapter } from "./pluginInstallStoreAdapter";
import { pluginRegistryAdapter } from "./pluginRegistryAdapter";
import { pluginRuntimeAdapter } from "./pluginRuntimeAdapter";
import { phaseStoreAdapter } from "./phaseStoreAdapter";
import { activityLogAdapter } from "./activityLogAdapter";
import { eventBusAdapter } from "./eventBusAdapter";
import { portalVariantAdapter } from "./portalVariantAdapter";
import type { PluginServices } from "@/plugins/_types";

// Singleton — adapters are stateless wrappers around module-level
// foundation services, so one shared `PluginServices` is fine. Tests
// override individual adapters via the local module's mock-by-default.
export const FOUNDATION_SERVICES: PluginServices = {
  clients: clientStoreAdapter,
  pluginInstalls: pluginInstallStoreAdapter,
  pluginRuntime: pluginRuntimeAdapter,
  registry: pluginRegistryAdapter,
  phases: phaseStoreAdapter,
  activity: activityLogAdapter,
  events: eventBusAdapter,
  variants: portalVariantAdapter,
};
