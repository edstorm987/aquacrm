import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

test("CompanySwitcher consumes the authenticated layout snapshot without a mount GET", () => {
  const layout = source("src/app/portal/layout.tsx");
  const switcher = source("src/components/chrome/CompanySwitcher.tsx");
  const helper = source("src/lib/server/auth/companySwitcherState.ts");
  const route = source("src/app/api/auth/switch-agency/route.ts");

  assert.match(layout, /buildCompanySwitcherState\(session, currentUser\)/);
  assert.match(layout, /<CompanySwitcherStateProvider initialState=\{companySwitcherState\}>/);
  assert.match(switcher, /useContext\(CompanySwitcherStateContext\)/);

  // The only remaining browser request is the explicit switch mutation.
  assert.equal((switcher.match(/fetch\("\/api\/auth\/switch-agency"/g) ?? []).length, 1);
  assert.match(switcher, /fetch\("\/api\/auth\/switch-agency", \{\s*method: "POST"/);
  assert.doesNotMatch(switcher, /fetch\("\/api\/auth\/switch-agency", \{ credentials/);

  // Server rendering and the GET endpoint share the same signed-session ∩
  // live-user resolver, while the POST remains independently authoritative.
  assert.match(helper, /getSessionAgencyIds\(session\)\.filter\(id => live\.has\(id\)\)/);
  assert.match(route, /\.\.\.buildCompanySwitcherState\(session, user\)/);
  assert.match(route, /switchableCompanyAgencyIds\(session, liveCompanyAgencyIds\(user\)\)/);
  assert.match(switcher, /window\.location\.href/);
});

test("SmartWorkSessionMonitor hydrates from server state and reserves the API for mutations", () => {
  const layout = source("src/app/portal/layout.tsx");
  const monitor = source("src/components/chrome/SmartWorkSessionMonitor.tsx");

  assert.match(layout, /const workSessionNow = Date\.now\(\)/);
  assert.match(layout, /dashboardPlanningSnapshot\(session\.agencyId, session\.userId, undefined, workSessionNow\)\.activeSession/);
  assert.match(layout, /<SmartWorkSessionMonitor[\s\S]*initialSession=\{initialWorkSession\}[\s\S]*initialNow=\{workSessionNow\}/);

  assert.match(monitor, /useState<DashboardWorkSession \| null>\(initialSession\)/);
  assert.match(monitor, /useRef<DashboardWorkSession \| null>\(initialSession\)/);
  assert.match(monitor, /useState\(initialNow\)/);
  assert.doesNotMatch(monitor, /dashboard-planning\?date=/);
  assert.doesNotMatch(monitor, /void requestPlanning\(\)/);
  assert.match(monitor, /fetch\("\/api\/portal\/dashboard-planning", \{\s*method: "POST"/);

  // Freshness after hydration is preserved by mutation responses, the
  // dashboard event bridge, and the existing active-session heartbeat.
  assert.match(monitor, /aqua-work-session:updated/);
  assert.match(monitor, /window\.setInterval\([\s\S]*void heartbeat\(\)/);
  assert.match(monitor, /if \(!sessionRef\.current\) return/);
});
