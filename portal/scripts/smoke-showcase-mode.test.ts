import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NextRequest } from "next/server";

import { proxy } from "../src/proxy";

const read = (path: string) => readFileSync(path, "utf8");

test("showcase mode uses a separate hardcoded tenant and never copies live records", () => {
  const seed = read("src/lib/server/auth/showcaseMode.ts");
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
  const auth = read("src/lib/server/auth/auth.ts");
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
  const publicControl = read("src/components/chrome/PublicShowcaseControl.tsx");
  const styles = read("src/app/globals.css");
  assert.match(settings, /label: "Showcase"/);
  assert.match(panel, /Enter Showcase Mode/);
  assert.match(panel, /Return to Live Mode/);
  assert.match(panel, /Reset sample data/);
  assert.match(topbar, /ShowcaseModeControl/);
  assert.match(control, /Exit Showcase Mode/);
  assert.match(control, /mm-showcase-control/);
  assert.match(publicControl, /mm-public-showcase-control/);
  assert.match(topbar, /mm-public-showcase-visitor/);
  assert.match(styles, /data-color-mode="light"\]\[data-portal-shell="command"\] \.mm-portal-topbar \.mm-showcase-control/);
  assert.match(styles, /data-color-mode="dark"\]\[data-portal-shell="command"\] \.mm-portal-topbar \.mm-showcase-control/);
  assert.match(styles, /data-color-mode="light"\]\[data-portal-shell="command"\] \.mm-portal-topbar \.mm-public-showcase-control/);
  assert.match(styles, /data-color-mode="dark"\]\[data-portal-shell="command"\] \.mm-portal-topbar \.mm-public-showcase-control/);
});

test("showcase reset removes every tenant-owned data collection", () => {
  const seed = read("src/lib/server/auth/showcaseMode.ts");
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

test("public showcase launches the real product with fictional read-only data", () => {
  const route = read("src/app/showcase/route.ts");
  const exit = read("src/app/showcase/exit/route.ts");
  const proxy = read("src/proxy.ts");
  const topbar = read("src/components/chrome/Topbar.tsx");
  const projects = read("../website/projects.js");

  assert.match(route, /ensureShowcaseWorkspace/);
  assert.match(route, /publicShowcase: true/);
  assert.match(route, /agencyIds: \[agency\.id\]/);
  assert.match(proxy, /payload\?\.publicShowcase/);
  assert.match(proxy, /This public showcase is read-only/);
  assert.match(topbar, /PublicShowcaseControl/);
  assert.match(exit, /AQUACRM_WEBSITE_URL/);
  assert.match(projects, /http:\/\/localhost:3032\/showcase/);
  assert.match(projects, /https:\/\/aqua-crm\.com\/showcase/);
});

test("public showcase stays read-only without trapping a real user at sign-in", () => {
  const token = `${Buffer.from(JSON.stringify({ publicShowcase: true })).toString("base64url")}.test-signature`;
  const request = (path: string) => new NextRequest(`http://localhost:3032${path}`, {
    method: "POST",
    headers: { cookie: `lk_session_v1=${token}` },
  });

  assert.equal(proxy(request("/api/auth/login")).status, 200);
  assert.equal(proxy(request("/api/auth/login/browser")).status, 200);
  assert.equal(proxy(request("/api/auth/logout")).status, 200);
  assert.equal(proxy(request("/api/portal/tasks")).status, 403);
});

test("live client login and public project showcase are separate entry paths", () => {
  const login = read("src/app/login/page.tsx");
  const liveBoundary = read("src/app/login/live/route.ts");
  const projects = read("public/aquacrm-site/projects.js");

  assert.match(login, /session\?\.publicShowcase/);
  assert.match(login, /redirect\(`\/login\/live\?/);
  assert.match(liveBoundary, /clearSessionCookie/);
  assert.match(liveBoundary, /session\?\.publicShowcase/);
  assert.match(liveBoundary, /NextResponse\.redirect\(destination, 303\)/);
  assert.match(projects, /\/login\/live\?brand=aquacrm&next=\/portal/);
  assert.match(projects, /http:\/\/localhost:3032\/showcase/);
  assert.match(projects, /https:\/\/aqua-crm\.com\/showcase/);
});
