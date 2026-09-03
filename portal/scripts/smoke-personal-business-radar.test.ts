import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  goalProgressPercent,
  personalRadarAttentionCount,
  personalRadarHeadline,
  taskBelongsOnMyRadar,
  type PersonalRadarGoal,
  type PersonalRadarReading,
} from "../src/lib/intelligence/personalRadar";
import { isStaffWorkspacePagePath } from "../src/lib/staffWorkspacePolicy";

const NOW = 1_700_000_000_000;
const read = (path: string) => readFileSync(path, "utf8");
const goal = (overrides: Partial<PersonalRadarGoal> = {}): PersonalRadarGoal => ({
  id: "goal-1",
  title: "Protect two evenings",
  status: "planned",
  startsAt: NOW + 60_000,
  ...overrides,
});
const reading = (goals: PersonalRadarGoal[] = []): PersonalRadarReading => ({
  userId: "owner-user",
  from: NOW - 7 * 86_400_000,
  to: NOW,
  work: { daysWorked: 2, workedTodayHours: 1.5, workedWeekHours: 8 },
  wellbeing: { ratedDays: 0 },
  goalsAvailable: true,
  goalsWritable: true,
  goalCount: goals.length,
  reviewDueGoalCount: goals.filter(item => !item.recurrence && item.startsAt < NOW).length,
  goals,
});

describe("personal ownership", () => {
  it("shows assigned work only to the assignee and unassigned work to its creator", () => {
    assert.equal(taskBelongsOnMyRadar({ assigneeUserId: "owner-user", createdBy: "manager" }, "owner-user"), true);
    assert.equal(taskBelongsOnMyRadar({ createdBy: "owner-user" }, "owner-user"), true);
    assert.equal(taskBelongsOnMyRadar({ assigneeUserId: "staff-user", createdBy: "owner-user" }, "owner-user"), false,
      "delegated work must not remain on its creator's personal Radar");
  });

  it("computes stored goal progress without inventing a value", () => {
    assert.equal(goalProgressPercent(goal({ currentValue: 3, targetValue: 4 })), 75);
    assert.equal(goalProgressPercent(goal()), undefined);
    assert.equal(goalProgressPercent(goal({ currentValue: 12, targetValue: 4 })), 100);
  });

  it("does not turn recurring habits into permanently overdue alerts", () => {
    const recurring = goal({ startsAt: NOW - 86_400_000, recurrence: "daily" });
    const dated = goal({ id: "dated", startsAt: NOW - 86_400_000 });
    assert.equal(personalRadarAttentionCount([], reading([recurring]), NOW), 0);
    assert.equal(personalRadarAttentionCount([], reading([recurring, dated]), NOW), 1);
    assert.match(personalRadarHeadline(reading([dated]), [], NOW), /goal is due for review/);
  });

  it("derives recurring metric quota progress instead of trusting a stored counter", () => {
    const source = read("src/lib/server/intelligence/myRadar.ts");
    assert.match(source, /readScoutingQuotaProgress\(/,
      "My Radar must consume the canonical live quota calculation");
    assert.match(source, /quotaByEntryId\.set\(quota\.entryId, quota\.current\)/,
      "live quota values should be joined to calendar goals by entry id");
    assert.match(source, /currentValue:\s*entry\.metric\s*&&\s*entry\.recurrence\s*\?\s*quotaByEntryId\.get\(entry\.id\)\s*:\s*entry\.currentValue/,
      "a recurring metric goal must use derived evidence, never a stale hand-entered fallback");
    const quotaRead = source.slice(source.indexOf("const quotaByEntryId"), source.indexOf("const goals =", source.indexOf("const quotaByEntryId")));
    assert.doesNotMatch(quotaRead, /catch\s*(?:\([^)]*\))?\s*\{/,
      "unexpected quota-source failures must reach the My Radar error boundary rather than look like zero progress");
  });

  it("applies canonical action and client-association gates to restricted managers as well as staff", () => {
    const source = read("src/lib/server/intelligence/personalRadarActions.ts");
    const nonOwnerGate = /session\.role\s*!==\s*"agency-owner"/.test(source);
    const explicitDelegatedRoles = /agency-manager/.test(source) && /agency-staff/.test(source);
    assert.ok(nonOwnerGate || explicitDelegatedRoles,
      "the delegated access path must include managers; a staff-only branch bypasses canonical manager restrictions");
    assert.match(source, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.actions", "view"\)/);
    assert.match(source, /canReadClientAssociation\(actor, "agency-task", clientId\)/);
    assert.match(source, /\.filter\(task => !canReadAssociatedClient \|\| canReadAssociatedClient\(task\.clientId\)\)/,
      "client association filtering must be applied to the returned manager/staff task list");
  });
});

describe("the two Radar scopes", () => {
  it("builds personal work, wellbeing and goals with an exact user id", () => {
    const source = read("src/lib/server/intelligence/myRadar.ts");
    assert.match(source, /session\.userId === input\.userId/);
    assert.match(source, /listCommandCalendarEntries\(input\.agencyId, input\.userId\)/);
    assert.match(source, /dashboardPlanningSnapshot\(input\.agencyId, input\.userId/);
  });

  it("keeps department baselines out of personal pages", () => {
    const page = read("src/app/portal/agency/my-radar/page.tsx");
    const home = read("src/app/portal/agency/page.tsx");
    assert.match(page, /<PersonalRadarPanel/);
    assert.match(home, /<PersonalRadarPanel/);
    assert.doesNotMatch(page, /<DepartmentBaselines|<MyRadarPanel/);
    assert.match(page, /userId: session\.userId/);
  });

  it("houses aggregate department capacity under manager-only Business Radar", () => {
    const page = read("src/app/portal/agency/radar/workload/page.tsx");
    assert.match(page, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
    assert.match(page, /requireCurrentAccessActor\(\)[\s\S]*resolveBusinessRadarCapabilityForActor\(actor, "view"\)/,
      "a restricted manager must not bypass the canonical Business Radar view grant");
    assert.match(page, /assertWorkspaceElementAccess\(resolveActorWorkspaceElementAccess\(actor, "staff"\), "workspace\.settings", "manage"\)/,
      "editing workload baselines requires the canonical settings-manage grant");
    assert.match(page, /readMyRadar\(\{ agencyId: actor\.resourceAgencyId, from:/);
    assert.match(page, /getAgencyWorkspaceSettings\(actor\.resourceAgencyId\)/);
    assert.doesNotMatch(page, /readMyRadar\([^)]*userId:/s);
    assert.match(page, /<DepartmentBaselines/);
    assert.match(page, /Business Radar — department workload/);
    assert.match(page, /showWellbeing=\{false\}/,
      "personal wellbeing must stay in My Radar rather than the business capacity screen");
    assert.match(page, /actorHasGovernanceCapability\(actor, environment, "access\.template\.manage"\)[\s\S]*profileCapabilities\.every/,
      "creating role templates from workload must require authority to delegate every offered capability");
  });

  it("writes department baselines through a dedicated, narrowly parsed API", () => {
    const editor = read("src/components/intelligence/DepartmentBaselines.tsx");
    const route = read("src/app/api/portal/intelligence/business-radar/workload/route.ts");
    assert.match(editor, /fetch\("\/api\/portal\/intelligence\/business-radar\/workload"/);
    assert.doesNotMatch(editor, /fetch\("\/api\/portal\/settings"/,
      "Business Radar must not use the generic settings mutation");
    assert.match(route, /resolveBusinessRadarCapabilityForActor\(businessActor, "view"\)/,
      "the settings endpoint must still require Business Radar visibility");
    assert.match(route, /assertWorkspaceElementAccess\(resolveActorWorkspaceElementAccess\(actor, "staff"\), "workspace\.settings", "manage"\)/,
      "baseline mutation is configuration and therefore needs settings-manage independently");
    assert.match(route, /updateAgencyWorkspaceSettings\(\s*actor\.resourceAgencyId,/s,
      "a sandboxed manager must write the workspace resource, not the governing agency");
    assert.match(route, /departmentBaselines/);
    assert.match(route, /updateAgencyWorkspaceSettings\(\s*actor\.resourceAgencyId,\s*\{\s*departmentBaselines(?:\s*:\s*body\.departmentBaselines)?,?\s*\},\s*actor\.user\.id\s*\)/s,
      "the endpoint may patch only departmentBaselines");
    assert.doesNotMatch(route, /patchInstall|defaultCurrency|Partial<AgencyWorkspaceSettings>/,
      "the narrow baseline route must not inherit unrelated settings side effects");
  });

  it("rejects malformed and unknown department baseline rows rather than coercing them", () => {
    const route = read("src/app/api/portal/intelligence/business-radar/workload/route.ts");
    assert.match(route, /new Set\(DEPARTMENT_PROFILES\.map\(|DEPARTMENT_PROFILE_IDS|departmentProfiles|knownDepartments/,
      "baseline parsing must validate department ids against the known profile catalogue");
    assert.match(route, /Number\.isFinite\([^)]*weeklyHours[^)]*\)/,
      "NaN and infinite baseline hours must be rejected");
    assert.match(route, /weeklyHours\s*<=\s*0/);
    assert.match(route, /weeklyHours\s*>\s*168/,
      "baseline hours must stay within the weekly range");
    assert.match(route, /status:\s*400/,
      "malformed or unknown rows must produce an explicit client error");
  });

  it("keeps Business Radar view, scan and settings authority separate", () => {
    const dashboard = read("src/app/portal/agency/_BusinessRadarDashboard.tsx");
    const commandCentre = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
    const home = read("src/app/portal/agency/page.tsx");
    const radarRoute = read("src/app/api/portal/advisor/radar/route.ts");
    const radarButton = read("src/components/chrome/RadarQuickLookButton.tsx");

    assert.match(home, /businessOverviewAvailable\s*=\s*await resolveBusinessRadarAccessForActor\(actor\)/);
    assert.match(home, /canRunRadarScan\s*=\s*await resolveBusinessRadarCapabilityForActor\(actor, "use"\)/);
    assert.match(home, /canManageWorkspace\s*=\s*workspaceElementAtLeast\(workspaceElementLevel\(staffAccess, "workspace\.settings"\), "manage"\)/);
    assert.match(home, /if \(canManageWorkspace\) \{[\s\S]*canManageBusinessWorkload = businessOverviewAvailable/);
    assert.match(home, /canManageBusinessWorkload=\{canManageBusinessWorkload\}/);
    assert.match(home, /canRunRadarScan=\{canRunRadarScan\}/);
    assert.match(commandCentre, /canManageWorkload=\{canManageBusinessWorkload\}/);
    assert.match(commandCentre, /canRunScan=\{canRunRadarScan\}/);
    assert.match(dashboard, /\{canManageWorkload \? <Link href="\/portal\/agency\/radar\/workload"/);
    assert.match(dashboard, /\{canRunScan \? <button/);

    const scanBody = radarRoute.slice(radarRoute.indexOf("async function runFullRadarScan"), radarRoute.indexOf("export async function GET"));
    const getBody = radarRoute.slice(radarRoute.indexOf("export async function GET"), radarRoute.indexOf("export async function POST"));
    const patchBody = radarRoute.slice(radarRoute.indexOf("export async function PATCH"));
    assert.match(scanBody, /requireBusinessRadar\("use"\)/,
      "a scan writes evidence and must require overview-use");
    assert.match(getBody, /requireBusinessRadar\("view"\)/,
      "reading Business Radar requires only overview-view");
    assert.match(patchBody, /requireBusinessRadar\("view"\)[\s\S]*assertWorkspaceElementAccess\([\s\S]*"workspace\.settings", "manage"/,
      "editing Radar policy is separately settings-managed");
    assert.match(radarButton, /if \(!canRunScan\) return/);
    assert.match(radarButton, /\{canRunScan \? <button[\s\S]*Run full scan/,
      "view-only users may inspect Business Radar but must not be offered its scan mutation");
  });
});

describe("a complete personal destination for staff", () => {
  it("admits only the exact personal Radar and Command Calendar leaves", () => {
    assert.equal(isStaffWorkspacePagePath("/portal/agency/my-radar"), true);
    assert.equal(isStaffWorkspacePagePath("/portal/agency/my-radar/company"), false);
    assert.equal(isStaffWorkspacePagePath("/portal/agency/calendar"), true);
    assert.equal(isStaffWorkspacePagePath("/portal/agency/calendar/team"), false);
  });

  it("re-applies staff.overview at the page leaf", () => {
    const page = read("src/app/portal/agency/my-radar/page.tsx");
    assert.match(page, /session\.role !== "agency-owner"/,
      "both staff and canonically narrowed managers must pass the personal overview gate");
    assert.match(page, /requireCurrentWorkspaceElementAccess\("staff", "staff\.overview", "view"\)/);
    assert.match(page, /staff-overview-required/);
  });

  it("separates goal visibility from goal mutation authority", () => {
    const reader = read("src/lib/server/intelligence/myRadar.ts");
    const access = read("src/lib/server/intelligence/personalRadarAccess.ts");
    const model = read("src/lib/intelligence/personalRadar.ts");
    const panel = read("src/components/intelligence/PersonalRadarPanel.tsx");
    assert.match(reader, /includeGoals\?: boolean/);
    assert.match(reader, /goalsWritable\?: boolean/);
    assert.match(reader, /input\.includeGoals\s*!==\s*false[\s\S]*?\?\s*listCommandCalendarEntries[\s\S]*?:\s*\[\]/,
      "the reader must not load or return calendar goals when their element is hidden");
    assert.match(reader, /goalsWritable:\s*goalsAvailable\s*&&\s*input\.goalsWritable\s*!==\s*false/,
      "a readable goal slice must retain its independent write capability");
    assert.match(model, /goalsAvailable:\s*boolean[\s\S]*goalsWritable:\s*boolean/);
    assert.match(access, /goalsAvailable:\s*boolean[\s\S]*goalsWritable:\s*boolean/);
    assert.match(access, /actor\.session\.role === "agency-staff"[\s\S]*workspaceElementLevel\(access, "staff\.schedule"\)/,
      "staff goals may be governed by the legacy personal schedule element");
    assert.match(access, /element\.workspace\.calendar\.view/,
      "department templates may explicitly expose Command Calendar to staff or managers");
    assert.match(access, /element\.workspace\.calendar\.use/);
    assert.match(access, /goalsAvailable:\s*workspaceElementAtLeast\(scheduleLevel, "view"\) \|\| commandCalendarAvailable/);
    assert.match(access, /goalsWritable:[\s\S]*workspaceElementAtLeast\(scheduleLevel, "use"\) \|\| commandCalendarWritable/);
    assert.match(access, /actor\.session\.publicShowcase[\s\S]*actor\.session\.sandbox\?\.access !== "read-only"/,
      "view-only/showcase environments may never advertise goal mutation");
    assert.match(panel, /reading\.goalsWritable\s*\?\s*"Manage goals"\s*:\s*"View goals"/,
      "a view-only goal slice must be labelled as view-only rather than advertising mutation");

    for (const path of [
      "src/app/api/portal/intelligence/my-radar/route.ts",
      "src/app/portal/agency/my-radar/page.tsx",
    ]) {
      const source = read(path);
      assert.match(source, /resolvePersonalRadarAccessForActor\(actor\)/, `${path} must resolve the independent goal gate from the already-authorized actor`);
      assert.match(source, /readPersonalRadar\([\s\S]*includeGoals/, `${path} must pass the resolved goal visibility to the reader`);
      assert.match(source, /readPersonalRadar\([\s\S]*goalsWritable/, `${path} must pass use authority through to the visible UI model`);
    }
    assert.doesNotMatch(read("src/components/chrome/MyRadarControl.tsx"), /readPersonalRadar|resolvePersonalRadarAccess/,
      "the shared shell must stay lazy; the gated fresh-read API owns the snapshot");
  });

  it("does not send staff to the shifts-only Team calendar to manage personal goals", () => {
    const page = read("src/app/portal/agency/my-radar/page.tsx");
    const quicklook = read("src/components/chrome/MyRadarQuickLookPanel.tsx");
    const panel = read("src/components/intelligence/PersonalRadarPanel.tsx");
    assert.doesNotMatch(`${page}\n${quicklook}`, /goalsHref=\{staff[^\n]*\/portal\/team\/calendar/,
      "Team calendar contains shifts, not Command Calendar goals");
    assert.match(page, /goalsHref="\/portal\/agency\/calendar"/);
    assert.match(quicklook, /goalsHref="\/portal\/agency\/calendar"/);
    assert.match(panel, /goalsHref\?: string \| null/);
    assert.match(panel, /:\s*goalsHref\s*\?\s*\([\s\S]*Manage goals/,
      "a read-only staff goal slice must not advertise an editor that is not there");
  });

  it("uses actor-resolved Business Radar visibility rather than a coarse role check", () => {
    const source = read("src/components/chrome/MyRadarQuickLookPanel.tsx");
    const footer = source.slice(source.indexOf("<footer"));
    assert.match(source, /businessRadarHref=\{businessRadarAvailable \? "\/portal\/agency\/radar" : null\}/);
    assert.match(footer, /\{businessRadarAvailable \? \([\s\S]*href="\/portal\/agency\/radar"/,
      "staff and narrowed managers must receive the server's exact Business Radar decision");
  });

  it("rethrows unexpected staff-overview failures instead of disguising them as permission denials", () => {
    const page = read("src/app/portal/agency/my-radar/page.tsx");
    assert.doesNotMatch(page, /catch\s*\{\s*redirect\("\/portal\/account\/permissions\?notice=staff-overview-required"\)/,
      "a blanket catch turns infrastructure and data faults into a misleading permission redirect");
    assert.match(page, /catch\s*\(error\)\s*\{[\s\S]*403[\s\S]*redirect\("\/portal\/account\/permissions\?notice=staff-overview-required"\)[\s\S]*throw error/,
      "only a known 403 may redirect; every unexpected page failure must escape to the error boundary");
  });
});

describe("personal Radar data truth", () => {
  it("reports the full active-goal count even when the rendered preview is capped", () => {
    const model = read("src/lib/intelligence/personalRadar.ts");
    const reader = read("src/lib/server/intelligence/myRadar.ts");
    const panel = read("src/components/intelligence/PersonalRadarPanel.tsx");
    assert.match(model, /goalCount:\s*number/);
    assert.match(reader, /goalCount:\s*goalEntries\.length/);
    assert.match(reader, /const goals = goalEntries\s*\n\s*\.slice\(0,\s*12\)/,
      "the preview may be capped, but only after recording the total");
    assert.match(panel, /value=\{reading\.goalsAvailable \? String\(reading\.goalCount\) : "Hidden"\}/);
  });

  it("uses the shared business calendar date rather than the server's local timezone", () => {
    const source = read("src/lib/server/intelligence/myRadar.ts");
    assert.match(source, /import\s*\{[^}]*businessCalendarDate[^}]*\}\s*from\s*"@\/lib\/shared\/formatDateTime"/s);
    assert.match(source, /const today = businessCalendarDate\(now\)/);
    assert.doesNotMatch(source, /function localIsoDate|\.getFullYear\(\)|\.getMonth\(\)|\.getDate\(\)/);
  });

  it("counts wellbeing once per business calendar day rather than once per work session", () => {
    const source = read("src/lib/server/intelligence/myRadar.ts");
    assert.match(source, /const latestReviewByDay = new Map<string, DashboardWorkSession>\(\)/,
      "session scores need a per-day aggregation before the mean is calculated");
    assert.match(source, /latestReviewByDay\.set\(session\.date,\s*session\)/,
      "multiple clock-outs on one date must replace that day's reading, not increase ratedDays");
    assert.match(source, /\[\.\.\.latestReviewByDay\.values\(\)\][\s\S]*const scores = reviewed\.map/,
      "wellbeing scores must be derived from the de-duplicated daily reviews");
    assert.match(source, /ratedDays:\s*scores\.length/);
  });

  it("keeps shared search and Radar-source discovery on the current actor projection", () => {
    const route = read("src/app/api/portal/search/route.ts");
    const access = read("src/lib/server/access/searchCandidateAccess.ts");
    assert.match(route, /const actor = await requireCurrentAccessActor\(\)[\s\S]*const agencyId = actor\.resourceAgencyId/,
      "search must follow the sandbox resource tenant, not the governing session tenant");
    assert.match(route, /const access = searchCandidateAccess\(actor\)/);
    assert.match(route, /candidates\.filter\(candidate => access\.visible\(candidate\)\)/,
      "every result must cross the actor-resolved destination element filter");
    assert.match(route, /if \(!access\.taskVisible\(task\)\) continue/,
      "task titles need personal assignment and client-association filtering before indexing");
    assert.match(route, /listRadarSourceSearchDatasetsForActor\(actor\)/,
      "source names must use the actor-scoped projection rather than an agency-wide source read");
    assert.doesNotMatch(route, /\blistRadarSourceSearchDatasets\(/);
    assert.match(access, /actor\.session\.role === "agency-manager"[\s\S]*agency\.grantIds\.length === 0[\s\S]*return FULL_ACCESS/,
      "only a fully unmigrated manager may retain the documented legacy search index");
    assert.match(access, /actor\.session\.role === "agency-staff"[\s\S]*task\.assigneeUserId !== actor\.session\.userId[\s\S]*task\.createdBy !== actor\.session\.userId/);
    assert.match(access, /return canReadClientAssociation\(actor, "agency-task", task\.clientId\)/);
    assert.match(route, /access\.staffPayVisible \? \[employee\.currency, employee\.payBasis\] : \[\]/,
      "pay and commission search terms must not be built when staff.pay is hidden");
  });
});

describe("direct personal-data route authority", () => {
  it("gates calendar reads and mutations at the staff and manager element boundaries", () => {
    const route = read("src/app/api/portal/calendar/route.ts");
    const access = read("src/lib/server/intelligence/personalRadarAccess.ts");
    const sessionHelper = route.slice(route.indexOf("async function agencySession"), route.indexOf("export async function GET"));
    const getStart = route.indexOf("export async function GET");
    const getHandler = route.slice(getStart, route.indexOf("export async function POST", getStart));
    assert.match(sessionHelper, /requirePersonalCalendarAccess\(session,\s*action\)/,
      "the direct calendar API must use the canonical personal-calendar gate");
    assert.match(getHandler, /agencySession\(request\)(?!,)/,
      "calendar reads must request view access");
    assert.doesNotMatch(getHandler, /agencySession\(request,\s*"use"\)/);
    for (const verb of ["POST", "PATCH", "DELETE"]) {
      const start = route.indexOf(`export async function ${verb}`);
      const next = route.indexOf("export async function", start + 1);
      const handler = route.slice(start, next < 0 ? undefined : next);
      assert.match(handler, /agencySession\(request,\s*"use"\)/,
        `${verb} calendar mutations must request use access`);
    }
    assert.match(access, /const actor = await requireCurrentAccessActor\(\)[\s\S]*const access = await resolvePersonalRadarAccessForActor\(actor\)/,
      "the direct API must consume the same actor projection as My Radar");
    assert.match(sessionHelper, /const actor = await requirePersonalCalendarAccess\(session,\s*action\)[\s\S]*agencyId: actor\.resourceAgencyId/,
      "calendar storage must use the actor's active resource tenant rather than the session's legacy agency field");
    assert.doesNotMatch(route, /(?:list|create|update|delete)CommandCalendarEntry\(session\.agencyId/,
      "no calendar read or mutation may fall back to the legacy session tenant");
    assert.match(access, /action === "view" \? !access\.goalsAvailable : !access\.goalsWritable/,
      "view and use must remain distinct at the leaf");
    assert.match(access, /resolveActorWorkspaceElementAccess\(actor, "staff"\)/,
      "staff.schedule and workspace.calendar grants must resolve in the Staff workspace");
    const page = read("src/app/portal/agency/calendar/page.tsx");
    assert.match(page, /requirePersonalCalendarAccess\(session, "view"\)/,
      "proxy admission is not authority; the direct calendar page must repeat the leaf gate");
  });

  it("gates the direct tasks API for narrowed managers as well as staff", () => {
    const source = read("src/app/api/portal/tasks/route.ts");
    const sessionHelper = source.slice(source.indexOf("async function agencySession"), source.indexOf("export async function GET"));
    assert.match(sessionHelper, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.actions", request\.method === "GET" \? "view" : "use"\)/);
    assert.ok(sessionHelper.indexOf("requireCurrentWorkspaceElementAccess") < sessionHelper.indexOf("return session"),
      "owners, managers and staff must all reach the element resolver before the route returns a session");
  });

  it("gates every direct calendar integration read and mutation", () => {
    const contracts = [
      ["src/app/api/portal/calendar/connections/route.ts", "GET", "view"],
      ["src/app/api/portal/calendar/connections/route.ts", "PATCH", "use"],
      ["src/app/api/portal/calendar/connections/route.ts", "DELETE", "use"],
      ["src/app/api/portal/calendar/sync/route.ts", "POST", "use"],
      ["src/app/api/portal/calendar/google/events/route.ts", "POST", "use"],
      ["src/app/api/portal/calendar/google/start/route.ts", "GET", "use"],
      ["src/app/api/portal/calendar/google/callback/route.ts", "GET", "use"],
    ] as const;

    for (const [path, verb, action] of contracts) {
      const source = read(path);
      const start = source.indexOf(`export async function ${verb}`);
      assert.ok(start >= 0, `${path} is missing ${verb}`);
      const next = source.indexOf("export async function", start + 1);
      const handler = source.slice(start, next < 0 ? undefined : next);
      const directGate = new RegExp(`requirePersonalCalendarAccess\\(session,\\s*"${action}"\\)`).test(handler);
      const delegatedGate = new RegExp(`agencySession\\(request,\\s*"${action}"\\)`).test(handler)
        && /async function agencySession\([^)]*action:\s*"view"\s*\|\s*"use"[^)]*\)[\s\S]*requirePersonalCalendarAccess\(session,\s*action\)/.test(source);
      assert.ok(directGate || delegatedGate,
        `${verb} ${path} must require calendar ${action} authority, directly or through its typed session helper`);
      assert.doesNotMatch(handler, /agencyId:\s*session\.agencyId|\w+\(session\.agencyId,\s*session\.userId/,
        `${verb} ${path} must bind integrations to the actor's active resource tenant`);
    }
    const oauthStart = read("src/app/api/portal/calendar/google/start/route.ts");
    const oauthCallback = read("src/app/api/portal/calendar/google/callback/route.ts");
    assert.match(oauthStart, /const actor = await requirePersonalCalendarAccess\(session, "use"\)[\s\S]*agencyId: actor\.resourceAgencyId/,
      "OAuth state must bind the exact active resource realm");
    assert.match(oauthCallback, /actor\.resourceAgencyId !== state\.value\.agencyId[\s\S]*agencyId: actor\.resourceAgencyId/,
      "OAuth callback validation and persistence must remain in the state-bound resource realm");
  });
});

describe("the visible contract", () => {
  it("names personal actions, goals, wellbeing and workload explicitly", () => {
    const panel = read("src/components/intelligence/PersonalRadarPanel.tsx");
    for (const label of ["My Radar", "Personal", "Actions & to-dos", "Personal goals", "Wellbeing", "Personal workload"]) {
      assert.match(panel, new RegExp(label), label);
    }
    assert.match(panel, /being the owner does not turn it into company reporting/);
    assert.match(panel, /Company health is in Business Radar/);
  });
});
