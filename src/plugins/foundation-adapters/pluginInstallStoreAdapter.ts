import "server-only";
import * as installs from "@/server/pluginInstalls";
import type {
  PluginInstallStorePort,
  PluginInstallPatch,
  UpsertPluginInstallInput,
} from "@/plugins/_types";

export const pluginInstallStoreAdapter: PluginInstallStorePort = {
  getInstall(scope, pluginId) { return installs.getInstall(scope, pluginId); },
  listInstalledFor(scope) { return installs.listInstalledFor(scope); },
  listInstalledForClientOnly(scope) { return installs.listInstalledForClientOnly(scope); },
  upsertInstall(input: UpsertPluginInstallInput) {
    return installs.upsertInstall({
      pluginId: input.pluginId,
      scope: input.scope,
      enabled: input.enabled,
      config: input.config,
      features: input.features,
      setupAnswers: input.setupAnswers,
      installedBy: input.installedBy,
    });
  },
  patchInstall(scope, pluginId, patch: PluginInstallPatch) {
    return installs.patchInstall(scope, pluginId, patch);
  },
  deleteInstall(scope, pluginId) { return installs.deleteInstall(scope, pluginId); },
};
