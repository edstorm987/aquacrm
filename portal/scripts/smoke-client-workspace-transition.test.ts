import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { clientWorkspaceRouteId } from "../src/lib/chrome/clientWorkspaceRoute";

const read = (path: string) => readFileSync(path, "utf8");

test("client workspace route detection excludes the Journey index and customer portal", () => {
  assert.equal(clientWorkspaceRouteId("/portal/clients/cli_123"), "cli_123");
  assert.equal(clientWorkspaceRouteId("/portal/clients/cli_123/settings"), "cli_123");
  assert.equal(clientWorkspaceRouteId("/portal/clients"), null);
  assert.equal(clientWorkspaceRouteId("/portal/customer"), null);
});

test("client operations has a short transition with Cinematic Mode bypass", () => {
  const transition = read("src/components/chrome/ClientWorkspaceTransition.tsx");
  const commandTransition = read("src/components/chrome/CommandCenterTransition.tsx");
  const layout = read("src/app/portal/layout.tsx");
  const styles = read("src/app/globals.css");

  assert.match(layout, /<ClientWorkspaceTransition \/>/);
  // Cinematic mode OFF (= !cinematicModeEnabled()) skips the transition.
  assert.match(transition, /!cinematicModeEnabled\(\)/);
  assert.match(transition, /CINEMATIC_MODE_EVENT/);
  assert.match(transition, /currentClientId === destinationClientId/);
  assert.match(transition, /minimumHold = reduced \? 50 : current\.mode === "enter" \? 760 : 520/);
  assert.match(commandTransition, /!destinationIsCommandCenter && clientWorkspaceRouteId\(destination\.pathname\)/);
  assert.match(styles, /data-cinematic-mode="false"\] \.mm-client-workspace-transition/);
  assert.match(styles, /@keyframes mm-client-transition-lock/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?\.mm-client-workspace-transition/);
});
