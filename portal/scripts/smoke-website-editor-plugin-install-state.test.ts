import test from "node:test";
import assert from "node:assert/strict";

import { resolveEnabledPluginIds } from "../src/built-ins/modules/website-editor/src/server/pluginAvailability";

test("editor plugin availability comes from enabled installs in the exact tenant scope", async () => {
  const scopes: Array<{ agencyId: string; clientId?: string }> = [];
  const enabledPluginIds = await resolveEnabledPluginIds({
    listInstalledFor(scope) {
      scopes.push(scope);
      return [
        { id: "i3", pluginId: "memberships", agencyId: scope.agencyId, clientId: scope.clientId, enabled: false, config: {}, features: {}, installedAt: 3 },
        { id: "i2", pluginId: "ecommerce", agencyId: scope.agencyId, clientId: scope.clientId, enabled: true, config: {}, features: {}, installedAt: 2 },
        { id: "i1", pluginId: "website-editor", agencyId: scope.agencyId, clientId: scope.clientId, enabled: true, config: {}, features: {}, installedAt: 1 },
        { id: "i4", pluginId: "ecommerce", agencyId: scope.agencyId, enabled: true, config: {}, features: {}, installedAt: 4 },
      ];
    },
  }, { agencyId: "agency_plugin_gate", clientId: "client_plugin_gate" });

  assert.deepEqual(scopes, [{ agencyId: "agency_plugin_gate", clientId: "client_plugin_gate" }]);
  assert.deepEqual(enabledPluginIds, ["ecommerce", "website-editor"]);
});
