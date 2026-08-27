import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { before, test } from "node:test";

import {
  AGENCY_SETTINGS_MANAGER_ROLES,
  getAgencySettingsCapabilities,
} from "../src/lib/agencySettingsCapabilities";
import type { Role } from "../src/server/types";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "agency-settings-role-smoke-secret-long-enough";

type ActivityRoute = typeof import("../src/app/api/portal/settings/activity-log/route");
type ExternalAiRoute = typeof import("../src/app/api/portal/settings/external-ai/route");
type AuthModule = typeof import("../src/lib/server/auth/auth");

let getActivityLog: ActivityRoute["GET"];
let getExternalAi: ExternalAiRoute["GET"];
let issueSession: AuthModule["issueSession"];
let sessionCookieName: string;

before(async () => {
  ({ GET: getActivityLog } = await import("../src/app/api/portal/settings/activity-log/route"));
  ({ GET: getExternalAi } = await import("../src/app/api/portal/settings/external-ai/route"));
  const auth = await import("../src/lib/server/auth/auth");
  issueSession = auth.issueSession;
  sessionCookieName = auth.SESSION_COOKIE_NAME;
});

test("one capability matrix admits owners/managers and keeps staff read-only", () => {
  assert.deepEqual([...AGENCY_SETTINGS_MANAGER_ROLES], ["agency-owner", "agency-manager"]);
  for (const role of ["agency-owner", "agency-manager"] satisfies Role[]) {
    assert.deepEqual(getAgencySettingsCapabilities(role), {
      manageSettings: true,
      manageTeam: true,
      viewActivityLog: true,
      manageExternalAi: true,
    });
  }
  assert.deepEqual(getAgencySettingsCapabilities("agency-staff"), {
    manageSettings: false,
    manageTeam: false,
    viewActivityLog: false,
    manageExternalAi: false,
  });
});

test("Team exposes controls only on the shared management branch", () => {
  const source = readFileSync("src/app/portal/agency/settings/TeamUsersPanel.tsx", "utf8");
  assert.match(source, /canManage \? <form/);
  assert.match(source, /canManage \? companies\.map\(company => <button/);
  assert.match(source, /Workspace membership is read-only for staff/);
  assert.match(source, /Only an owner or manager can create users or change service-brand access/);
});

test("staff APIs refuse the same capabilities the page hides", async () => {
  for (const [path, handler] of [
    ["/api/portal/settings/activity-log", getActivityLog],
    ["/api/portal/settings/external-ai", getExternalAi],
  ] as const) {
    assert.equal((await handler(requestFor("agency-staff", path))).status, 403);
    assert.equal((await handler(requestFor("agency-manager", path))).status, 200);
    assert.equal((await handler(requestFor("agency-owner", path))).status, 200);
  }
});

test("all three Settings surfaces and APIs consume the shared capability contract", () => {
  const tabs = readFileSync("src/app/portal/agency/settings/SettingsTabs.tsx", "utf8");
  const page = readFileSync("src/app/portal/agency/settings/page.tsx", "utf8");
  const usersRoute = readFileSync("src/app/api/portal/agency/users/route.ts", "utf8");
  const activityRoute = readFileSync("src/app/api/portal/settings/activity-log/route.ts", "utf8");
  const externalAiRoute = readFileSync("src/app/api/portal/settings/external-ai/route.ts", "utf8");

  assert.match(page, /getAgencySettingsCapabilities\(session\.role\)/);
  assert.match(tabs, /capabilities\.manageTeam/);
  assert.match(tabs, /capabilities\.viewActivityLog \? <ActivityLogPanel/);
  assert.match(tabs, /capabilities\.manageExternalAi/);
  assert.match(usersRoute, /AGENCY_SETTINGS_MANAGER_ROLES/);
  assert.match(activityRoute, /canUseAgencySettingsCapability\(session\.role, "viewActivityLog"\)/);
  assert.match(externalAiRoute, /canUseAgencySettingsCapability\(session\.role, "manageExternalAi"\)/);
});

test("staff account pages do not point back into owner and manager Settings", () => {
  const account = readFileSync("src/app/portal/account/page.tsx", "utf8");
  const permissions = readFileSync("src/app/portal/account/permissions/page.tsx", "utf8");

  assert.match(account, /isAgencyStaff \? "\/portal\/team" : "\/portal\/agency"/);
  assert.match(account, /An owner or manager manages your email and role/);
  assert.match(account, /isAgencyStaff[\s\S]*?Team settings/);
  assert.match(permissions, /isAgencyStaff \? \(/);
  assert.match(permissions, /An owner or manager manages your workspace access/);
});

function requestFor(role: "agency-owner" | "agency-manager" | "agency-staff", path: string): NextRequest {
  const token = issueSession({
    userId: `user_${role}`,
    email: `${role}@example.com`,
    role,
    agencyId: "settings-role-agency",
  });
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `${sessionCookieName}=${token}` },
  });
}
