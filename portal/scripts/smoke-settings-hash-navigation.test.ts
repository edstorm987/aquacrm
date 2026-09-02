import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveSettingsTabHash } from "../src/app/portal/agency/settings/settingsTabHash";

const SETTINGS_TABS_PATH = "src/app/portal/agency/settings/SettingsTabs.tsx";
const source = readFileSync(SETTINGS_TABS_PATH, "utf8");
const tabIds = new Set(
  [...source.matchAll(/\{ id: "([a-z]+)", label:/g)].map(match => match[1]!),
);

describe("Settings hash navigation", () => {
  it("selects Environment on a direct #environment entry", () => {
    assert.ok(tabIds.has("environment"), "Environment is missing from the Settings tab registry");
    assert.equal(resolveSettingsTabHash("#environment", tabIds, {}), "environment");
  });

  it("keeps legacy hashes and refuses unknown fragments", () => {
    assert.equal(
      resolveSettingsTabHash("#showcase", tabIds, { showcase: "environment" }),
      "environment",
    );
    assert.equal(resolveSettingsTabHash("#not-a-settings-tab", tabIds, {}), null);
  });

  it("synchronises the browser fragment before paint and keeps hash changes live", () => {
    const navigation = source.slice(
      source.indexOf("useLayoutEffect(() =>"),
      source.indexOf("}, []);", source.indexOf("useLayoutEffect(() =>")) + "}, []);".length,
    );

    assert.match(navigation, /resolveSettingsTabHash\(window\.location\.hash, TAB_IDS, LEGACY_TAB_ALIASES\)/);
    assert.match(navigation, /syncHash\(\)/, "direct entry no longer runs the fragment synchroniser on mount");
    assert.match(navigation, /window\.addEventListener\("hashchange", syncHash\)/);
    assert.match(navigation, /window\.removeEventListener\("hashchange", syncHash\)/);
  });
});
