import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the install manifest is a static public asset with the original contract", () => {
  assert.equal(existsSync(new URL("../src/app/manifest.ts", import.meta.url)), false);
  const manifest = JSON.parse(read("public/manifest.webmanifest")) as {
    name?: string;
    start_url?: string;
    display?: string;
    icons?: Array<{ src?: string; sizes?: string; purpose?: string }>;
  };
  assert.equal(manifest.name, "Aqua — your client portal");
  assert.equal(manifest.start_url, "/portal/customer");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.icons?.length, 4);
  assert.ok(manifest.icons?.some(icon => icon.sizes === "192x192" && icon.purpose === "maskable"));
  assert.match(read("src/app/layout.tsx"), /manifest: "\/manifest\.webmanifest"/);
});

test("closed workspace search keeps its heavy module behind user intent", () => {
  const topbar = read("src/components/chrome/Topbar.tsx");
  const deferred = read("src/components/chrome/DeferredPortalSearch.tsx");
  const search = read("src/components/chrome/PortalSearch.tsx");

  assert.match(topbar, /import \{ DeferredPortalSearch \}/);
  assert.doesNotMatch(topbar, /import \{ PortalSearch \} from/);
  assert.match(deferred, /import\("@\/components\/chrome\/PortalSearch"\)/);
  assert.match(deferred, /onMouseEnter=\{preload\}/);
  assert.match(deferred, /onFocus=\{preload\}/);
  assert.match(deferred, /onClick=\{open\}/);
  assert.match(deferred, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(search, /initiallyOpen = false/);
  assert.match(search, /!recordsEnabled \|\| !open \|\| normalised\.length < 2/);
});

test("idle work-session chrome has no interaction listeners or minute timer", () => {
  const monitor = read("src/components/chrome/SmartWorkSessionMonitor.tsx");
  assert.match(monitor, /const monitoringActive = session !== null/);
  assert.match(monitor, /if \(!monitoringActive\) return;[\s\S]*events\.forEach\(event => window\.addEventListener/);
  assert.match(monitor, /if \(!monitoringActive\) return;[\s\S]*window\.setInterval/);
  assert.match(monitor, /window\.addEventListener\("aqua-work-session:updated", planningUpdated\)/);
  const teamWorkspace = read("src/app/portal/team/_TeamWorkspace.tsx");
  assert.match(teamWorkspace, /window\.dispatchEvent\(new CustomEvent\("aqua-work-session:updated", \{ detail: result\.planning! \}\)\)/, "Team clock-in/out wakes or clears the persistent monitor immediately");
});

test("notification and company freshness remain explicit and on demand", () => {
  const attention = read("src/components/chrome/NotificationAttentionProvider.tsx");
  const centre = read("src/components/chrome/NotificationCentreButton.tsx");
  const companies = read("src/components/chrome/CompanySwitcher.tsx");

  assert.match(attention, /window\.addEventListener\("focus", refreshWhenStaleAndActive\)/);
  assert.match(attention, /document\.addEventListener\("visibilitychange", refreshWhenStaleAndActive\)/);
  assert.match(centre, /if \(!open\) void attention\?\.refreshAlerts\(\)/);
  assert.match(companies, /fetch\("\/api\/auth\/switch-agency"/);
  assert.doesNotMatch(companies, /useEffect\([\s\S]{0,500}fetch\("\/api\/auth\/switch-agency"/);
});
