import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APP_VERSION, LATEST_RELEASE, PRODUCT_RELEASES } from "../src/lib/projects/releases";

const settingsSource = readFileSync(new URL("../src/app/portal/agency/settings/SettingsTabs.tsx", import.meta.url), "utf8");
const bellSource = readFileSync(new URL("../src/components/chrome/NotificationCentreButton.tsx", import.meta.url), "utf8");
const advisorSource = readFileSync(new URL("../src/components/chrome/GlobalAdvisorDrawer.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
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
  assert.match(bellSource, /groups\.attention\.length \+ \(updateUnread \? 1 : 0\)/);
  assert.match(bellSource, /\/portal\/agency\/settings#updates/);
  assert.match(bellSource, /useNotificationAttention/);
  assert.match(bellSource, /RELEASE_SEEN_EVENT/);
});

test("topbar attention badges stay above neighbouring controls", () => {
  assert.match(bellSource, /mm-has-attention-badge/);
  assert.match(advisorSource, /mm-has-attention-badge/);
  assert.match(globalStyles, /\.mm-has-attention-badge\s*\{[^}]*z-index:\s*20/s);
  assert.match(globalStyles, /\.mm-attention-badge\s*\{[^}]*z-index:\s*30[^}]*pointer-events:\s*none/s);
});
