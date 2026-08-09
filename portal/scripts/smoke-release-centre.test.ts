import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APP_VERSION, LATEST_RELEASE, PRODUCT_RELEASES } from "../src/lib/releases";

const settingsSource = readFileSync(new URL("../src/app/portal/agency/settings/SettingsTabs.tsx", import.meta.url), "utf8");
const bellSource = readFileSync(new URL("../src/components/chrome/NotificationCentreButton.tsx", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

test("release centre has one canonical current version", () => {
  assert.equal(APP_VERSION, packageJson.version);
  assert.equal(LATEST_RELEASE.version, APP_VERSION);
  assert.equal(PRODUCT_RELEASES[0], LATEST_RELEASE);
  assert.ok(PRODUCT_RELEASES.length >= 3);
});

test("settings exposes version and release history", () => {
  assert.match(settingsSource, /id: "updates", label: "What’s new"/);
  assert.match(settingsSource, /AquaCRM \{APP_VERSION\}/);
  assert.match(settingsSource, /PRODUCT_RELEASES\.map/);
  assert.match(settingsSource, /RELEASE_STORAGE_KEY/);
});

test("notification centre combines operational alerts and product updates", () => {
  assert.match(bellSource, /operationalCount \+ \(updateUnread \? 1 : 0\)/);
  assert.match(bellSource, /Explore what&apos;s new/);
  assert.match(bellSource, /RELEASE_SEEN_EVENT/);
});
