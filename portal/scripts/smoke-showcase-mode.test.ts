import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("showcase mode uses a separate hardcoded tenant and never copies live records", () => {
  const seed = read("src/lib/server/showcaseMode.ts");
  assert.match(seed, /SHOWCASE_AGENCY_SLUG = "milesymedia-showcase"/);
  assert.match(seed, /Northstar Studio/);
  assert.match(seed, /Harbour & Pine/);
  assert.match(seed, /Fieldnote Coffee/);
  assert.match(seed, /Evergreen Legal/);
  assert.match(seed, /Lumen Architecture/);
  assert.match(seed, /currentValue: 18600, targetValue: 15000/);
  assert.match(seed, /Client retention", metric: "Retained clients", currentValue: 98/);
  assert.match(seed, /showcaseTelemetry/);
  assert.match(seed, /showcaseInvoice/);
  assert.match(seed, /Homepage consultation CTA/);
  assert.match(seed, /status: "delivered"/);
  assert.match(seed, /\.example/);
  assert.doesNotMatch(seed, /listClients\(/);
  assert.doesNotMatch(seed, /session\.agencyId/);
});

test("entering and exiting showcase mode rotates the signed tenant session", () => {
  const route = read("src/app/api/auth/showcase-mode/route.ts");
  const auth = read("src/lib/server/auth.ts");
  const types = read("src/server/types.ts");
  assert.match(route, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
  assert.match(route, /invalid_origin/);
  assert.match(route, /resetAndSeedShowcaseWorkspace/);
  assert.match(route, /showcaseReturnAgencyId/);
  assert.match(route, /sessionCookie/);
  assert.match(auth, /showcaseReturnAgencyId/);
  assert.match(types, /showcaseReturnAgencyId/);
});

test("settings and top bar make showcase state and exit unmistakable", () => {
  const settings = read("src/app/portal/agency/settings/SettingsTabs.tsx");
  const panel = read("src/app/portal/agency/settings/ShowcaseModePanel.tsx");
  const topbar = read("src/components/chrome/Topbar.tsx");
  const control = read("src/components/chrome/ShowcaseModeControl.tsx");
  assert.match(settings, /label: "Showcase"/);
  assert.match(panel, /Enter Showcase Mode/);
  assert.match(panel, /Return to Live Mode/);
  assert.match(panel, /Reset sample data/);
  assert.match(topbar, /ShowcaseModeControl/);
  assert.match(control, /Exit Showcase Mode/);
});

test("showcase reset removes every tenant-owned data collection", () => {
  const seed = read("src/lib/server/showcaseMode.ts");
  for (const collection of [
    "clients",
    "pluginInstalls",
    "pluginData",
    "pipelines",
    "pipelineCards",
    "tasks",
    "sops",
    "agencyProducts",
    "clientMilestones",
    "performanceExperiments",
    "clientDelight",
    "companyProfiles",
    "legalDocuments",
    "developmentResources",
    "developmentWorkflows",
    "agencyWebsites",
    "activity",
    "agencies",
  ]) {
    assert.match(seed, new RegExp(`state\\.${collection}`), `missing showcase cleanup for ${collection}`);
  }
});
