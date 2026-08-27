import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveCinematicPreference, CINEMATIC_MODE_STORAGE_KEY, LEGACY_PERFORMANCE_MODE_STORAGE_KEY } from "../src/lib/chrome/cinematicMode";
import { parsePerformanceModeCookie } from "../src/lib/server/performanceMode";
import { parseDevIconCookie } from "../src/lib/server/devIconPreference";
import { PERFORMANCE_MODE_COOKIE } from "../src/lib/chrome/performanceMode";
import { DEV_ICON_COOKIE } from "../src/lib/chrome/devIconPreference";

const read = (path: string) => readFileSync(path, "utf8");

describe("Profile menu toggles — Cinematic / Performance / Dev icon", () => {
  // === 1) CINEMATIC MODE: default ON, migrates the old performance-mode key ===
  describe("Cinematic mode", () => {
    it("defaults to OFF so a fresh workspace opens immediately", () => {
      assert.equal(resolveCinematicPreference(null, null), false);
    });

    it("honours an explicit cinematic preference over anything legacy", () => {
      assert.equal(resolveCinematicPreference("1", "1"), true);
      assert.equal(resolveCinematicPreference("0", "0"), false);
    });

    it("migrates the old performance-mode value (perfMode=1 → cinematic OFF)", () => {
      // Old "performance mode ON" meant SKIP cutscenes → cinematic OFF.
      assert.equal(resolveCinematicPreference(null, "1"), false);
      // Old "performance mode OFF" meant play → cinematic ON.
      assert.equal(resolveCinematicPreference(null, "0"), true);
    });

    it("uses a distinct storage key from the legacy one", () => {
      assert.equal(CINEMATIC_MODE_STORAGE_KEY, "aqua-cinematic-mode");
      assert.equal(LEGACY_PERFORMANCE_MODE_STORAGE_KEY, "aqua-performance-mode");
      assert.notEqual(CINEMATIC_MODE_STORAGE_KEY, LEGACY_PERFORMANCE_MODE_STORAGE_KEY);
    });

    it("the three transition consumers skip when cinematic is OFF", () => {
      for (const file of [
        "src/components/chrome/ClientWorkspaceTransition.tsx",
        "src/components/chrome/CommandCenterTransition.tsx",
        "src/components/chrome/DevModeLoadIn.tsx",
      ]) {
        const src = read(file);
        assert.match(src, /!cinematicModeEnabled\(\)/, `${file} must gate on !cinematicModeEnabled()`);
        assert.doesNotMatch(src, /performanceModeEnabled/, `${file} must not use the old performance-mode helper`);
      }
      // CSS belt-and-braces hide keys off the new attribute.
      const css = read("src/app/globals.css");
      assert.match(css, /data-cinematic-mode="false"\] \.mm-command-transition/);
      assert.match(css, /data-cinematic-mode="false"\] \.mm-client-workspace-transition/);
    });

    it("the profile menu renders a Cinematic mode row wired to setCinematicMode", () => {
      const menu = read("src/components/chrome/ProfileMenu.tsx");
      assert.match(menu, /mm-cinematic-mode-toggle/);
      assert.match(menu, /Cinematic mode/);
      assert.match(menu, /setCinematicMode\(next\)/);
    });
  });

  // === 2) PERFORMANCE MODE: real, server-readable cookie, default ON ===
  describe("Performance mode (server-readable)", () => {
    it("defaults ON and honours an explicit '0' opt-out", () => {
      assert.equal(parsePerformanceModeCookie("1"), true);
      assert.equal(parsePerformanceModeCookie("0"), false);
      assert.equal(parsePerformanceModeCookie(undefined), true);
      assert.equal(parsePerformanceModeCookie(null), true);
      assert.equal(parsePerformanceModeCookie(""), true);
    });

    it("names a non-httpOnly cookie the client can set", () => {
      assert.equal(PERFORMANCE_MODE_COOKIE, "aqua_perf_mode");
      const client = read("src/lib/chrome/performanceMode.ts");
      assert.match(client, /setPerformanceModeCookie/);
      assert.match(client, /path=\//);
      assert.match(client, /PERFORMANCE_MODE_COOKIE}=0/);
      assert.match(client, /window\.location\.reload\(\)/); // reload so the next server render reflects it
    });

    it("the profile Performance mode row sets the cookie (not localStorage)", () => {
      const menu = read("src/components/chrome/ProfileMenu.tsx");
      assert.match(menu, /Performance mode/);
      assert.match(menu, /setPerformanceModeCookie\(next\)/);
    });

    it("the agency layout SKIPS the operational-alerts sweep under perf mode", () => {
      const layout = read("src/app/portal/agency/layout.tsx");
      assert.match(layout, /performanceModePreference\(\)/);
      // The sweep and its large server graph are requested only after every
      // lightweight-shell condition has been ruled out.
      assert.match(layout, /if \(!perfMode && !session\.publicShowcase && !delegatedStaff\) \{\s*const \{ getRequestOperationalAlerts \} = await import\("@\/lib\/server\/inbox\/operationalAlerts"\)/);
      assert.doesNotMatch(layout, /^import \{ getRequestOperationalAlerts \}/m);
    });

    it("the Command Centre keeps the alerts sweep and the dev-team board scan off the critical path under perf mode", () => {
      const page = read("src/app/portal/agency/page.tsx");
      assert.match(page, /performanceModePreference\(\)/);
      assert.match(page, /const lightweightMode = perfMode \|\| Boolean\(session\.publicShowcase\)/);
      assert.match(page, /lightweightMode\s*\? Promise\.resolve<OperationalAlert\[\]>\(\[\]\)\s*:\s*import\("@\/lib\/server\/inbox\/operationalAlerts"\)/);
      // scanDevTeamBoard (a disk read feeding the station badge) is gated off.
      assert.match(page, /if \(devTeamVisible && !lightweightMode\) \{\s*const \{ composeLanes, scanDevTeamBoard \} = await import\("@\/lib\/server\/dev\/devTeamBoard"\)/);
    });
  });

  // === 3) DEV TOGGLE: shows/hides the topbar icon, never navigates ===
  describe("Dev toggle (topbar icon visibility)", () => {
    it("parses the dev-icon cookie: default shown, only '0' hides", () => {
      assert.equal(parseDevIconCookie(undefined), true);
      assert.equal(parseDevIconCookie(null), true);
      assert.equal(parseDevIconCookie("1"), true);
      assert.equal(parseDevIconCookie("0"), false);
      assert.equal(DEV_ICON_COOKIE, "aqua_dev_icon");
    });

    it("the profile Dev Mode toggle no longer navigates to the workspace", () => {
      const menu = read("src/components/chrome/ProfileMenu.tsx");
      // THE BUG: the old toggle teleported into the workspace.
      assert.doesNotMatch(menu, /window\.location\.assign\("\/portal\/dev-team"\)/);
      // It now flips the icon-visibility cookie instead.
      assert.match(menu, /setDevIconCookie/);
      // The demo-persona exit path is preserved.
      assert.match(menu, /\/api\/auth\/dev-mode/);
    });

    it("the topbar dev icon is gated on the founder gate AND the icon cookie", () => {
      const layout = read("src/app/portal/agency/layout.tsx");
      assert.match(layout, /devIconPreference\(\)/);
      assert.match(layout, /devConsole=\{devDocsAccessible\(session\) && devIconVisible\}/);
    });

    it("opening the workspace lives inside the dev icon's popover as a primary CTA", () => {
      const panel = read("src/components/chrome/DevConsolePanel.tsx");
      assert.match(panel, /Open Dev Team workspace/);
      assert.match(panel, /<a\s+href="\/portal\/dev-team"/);
    });
  });
});
