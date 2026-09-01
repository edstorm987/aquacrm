import "server-only";

import type { PluginInstallStorePort } from "./ports";
import type { PluginInstallScope } from "../lib/tenancy";

/**
 * Resolve the enabled plugin IDs that may back editor blocks for this exact
 * tenant scope. The install store is the authority; the browser never guesses
 * availability from registered manifests or local state.
 */
export async function resolveEnabledPluginIds(
  installs: Pick<PluginInstallStorePort, "listInstalledFor">,
  scope: PluginInstallScope,
): Promise<string[]> {
  const records = await installs.listInstalledFor(scope);
  return [
    ...new Set(records.filter(record => record.enabled).map(record => record.pluginId)),
  ].sort();
}
