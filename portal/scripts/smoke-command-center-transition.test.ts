import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { isCommandCenterPath } from "../src/lib/chrome/commandCenter";

describe("Command Center device transition", () => {
  it("covers entry and exit from the portal root without hijacking modified links", async () => {
    const [component, layout, styles, dashboard, popup, profile, cinematicMode] = await Promise.all([
      readFile(new URL("../src/components/chrome/CommandCenterTransition.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/_CommandDeckPopup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/ProfileMenu.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/chrome/cinematicMode.ts", import.meta.url), "utf8"),
    ]);

    assert.match(layout, /<CommandCenterTransition \/>/);
    assert.match(component, /"Entering command deck"/);
    assert.match(component, /"Returning to workspace"/);
    assert.match(component, /import \{ isCommandCenterPath \} from "@\/lib\/chrome\/commandCenter"/);
    assert.match(component, /document\.addEventListener\("click", handleNavigationIntent, true\)/);
    assert.match(component, /event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
    assert.match(component, /prefers-reduced-motion: reduce/);
    assert.match(styles, /\.mm-command-transition \{/);
    assert.match(styles, /\.mm-command-transition\[data-mode="exit"\]/);
    assert.match(styles, /@keyframes mm-command-transition-sweep/);
    assert.match(dashboard, /mm-command-center-workspace/);
    assert.match(popup, /mm-command-detail-dialog/);
    assert.match(styles, /data-color-mode="light"\]\[data-portal-shell="command"\]/);
    assert.match(styles, /data-color-mode="light"\] \.mm-command-transition/);
    assert.match(styles, /data-color-mode="dark"\] \.mm-command-transition/);
    // Cinematic mode is the user-facing name for whether transitions play.
    assert.match(profile, /Cinematic mode/);
    assert.match(profile, /role="menuitemcheckbox"/);
    assert.match(profile, /mm-cinematic-mode-toggle/);
    // The real Performance mode (server-readable) still has its own row.
    assert.match(profile, /Performance mode/);
    // Legacy performance-mode value is migrated so cutscene prefs carry over.
    assert.match(cinematicMode, /aqua-performance-mode/);
    assert.match(cinematicMode, /cinematicModeEnabled/);
    assert.match(component, /!cinematicModeEnabled\(\)/);
    assert.match(component, /CINEMATIC_MODE_EVENT/);
    assert.match(styles, /data-cinematic-mode="false"\] \.mm-command-transition/);
  });

  it("treats executive, day, and Radar stations as one Command Centre boundary", () => {
    assert.equal(isCommandCenterPath("/portal/agency"), true);
    assert.equal(isCommandCenterPath("/portal/agency/"), true);
    assert.equal(isCommandCenterPath("/portal/agency/command-center"), true);
    assert.equal(isCommandCenterPath("/portal/agency/command-center/day"), true);
    assert.equal(isCommandCenterPath("/portal/agency/radar"), true);
    assert.equal(isCommandCenterPath("/portal/agency/radar/inspection"), true);
    assert.equal(isCommandCenterPath("/portal/agency/calendar"), false);
    assert.equal(isCommandCenterPath("/portal/agency/actions"), false);
  });
});
