import "server-only";
// PluginRuntimePort wrapper around `@/plugins/_runtime` — re-exports the
// install / setEnabled / uninstall flow with the port's exact shape.

import {
  installPlugin as runtimeInstall,
  setPluginEnabled as runtimeSetEnabled,
  uninstallPlugin as runtimeUninstall,
} from "@/plugins/_runtime";
import type { PluginInstall } from "@/server/types";
import type { PluginRuntimePort } from "@/plugins/_types";

type RuntimeInstallOutcome =
  | { ok: true; install: PluginInstall }
  | { ok: false; error: string };
type RuntimeOk = { ok: true } | { ok: false; error: string };

export const pluginRuntimeAdapter: PluginRuntimePort = {
  async installPlugin({ pluginId, scope, installedBy, setupAnswers, featureOverrides, configOverrides }): Promise<RuntimeInstallOutcome> {
    return runtimeInstall(pluginId, {
      scope, installedBy, setupAnswers, featureOverrides, configOverrides,
    });
  },
  async setEnabled({ pluginId, scope, enabled }): Promise<RuntimeInstallOutcome> {
    const result: RuntimeOk = await runtimeSetEnabled(scope, pluginId, enabled);
    if (!result.ok) return result;
    // Fetch the freshly-patched install so the port-side shape matches.
    const { getInstall } = await import("@/server/pluginInstalls");
    const install = getInstall(scope, pluginId);
    if (!install) return { ok: false, error: "install vanished after setEnabled" };
    return { ok: true, install };
  },
  async uninstallPlugin({ pluginId, scope }) {
    return runtimeUninstall(scope, pluginId);
  },
};
