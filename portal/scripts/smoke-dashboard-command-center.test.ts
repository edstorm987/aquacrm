import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Planning = typeof import("../src/server/dashboardPlanning");

let storage: Storage;
let tenants: Tenants;
let planning: Planning;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  planning = await import("../src/server/dashboardPlanning");
});

async function fresh() {
  await storage.ensureHydrated();
  await storage.reset();
  const agency = tenants.createAgency({ name: "Command Centre Test", slug: "command-centre-test" });
  return { agency, userId: "founder_test" };
}

function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("dashboard command centre persistence", () => {
  it("stores day and week direction with employee-scoped hours", async () => {
    const { agency, userId } = await fresh();
    const date = localDate();
    const initial = planning.dashboardPlanningSnapshot(agency.id, userId, date);

    const day = planning.upsertDashboardDayPlan({
      agencyId: agency.id,
      userId,
      date,
      focus: "Ship the daily operating cockpit",
      planNotes: "Finish data paths, then verify the interface.",
      doneNotes: "- Planning model complete",
      plannedHours: 7.5,
      targetRevenuePounds: 500,
    });
    const week = planning.upsertDashboardWeekPlan({
      agencyId: agency.id,
      userId,
      weekStart: initial.weekStart,
      outcome: "Run the business from one strict daily system",
      reviewNotes: "Keep the queue small and evidence specific.",
    });
    const manual = planning.logDashboardWorkSession({
      agencyId: agency.id,
      userId,
      date,
      hours: 1.25,
      focus: "Dashboard planning",
      notes: "Built weekly planning persistence.",
    });
    assert.ok(manual);

    const active = planning.clockInDashboard({ agencyId: agency.id, userId, date, focus: day.focus });
    assert.equal(planning.clockInDashboard({ agencyId: agency.id, userId, date }).id, active.id);
    assert.throws(
      () => planning.clockOutDashboard({ agencyId: agency.id, userId }),
      planning.DashboardClockOutReviewError,
    );
    assert.equal(planning.dashboardPlanningSnapshot(agency.id, userId, date).activeSession?.id, active.id);
    const complete = planning.clockOutDashboard({ agencyId: agency.id, userId, review: {
      outcome: "Verified the command centre.",
      openWork: "Prepare the next operating pass.",
      nothingOpen: false,
      nextPriority: "Run the next command review.",
      dayScore: 4,
      unconfirmedTimeAcknowledged: false,
    } });
    assert.ok(complete?.endedAt);
    assert.equal(complete?.clockOutReview?.dayScore, 4);
    assert.equal(complete?.clockOutReview?.nextPriority, "Run the next command review.");

    const snapshot = planning.dashboardPlanningSnapshot(agency.id, userId, date);
    assert.equal(snapshot.dayPlan?.plannedHours, 7.5);
    assert.equal(snapshot.dayPlan?.targetRevenuePounds, 500);
    assert.equal(snapshot.weekPlan?.id, week.id);
    assert.equal(snapshot.weekPlan?.outcome, "Run the business from one strict daily system");
    assert.equal(snapshot.sessions.length, 2);
    assert.equal(snapshot.activeSession, null);

    assert.equal(planning.deleteDashboardWorkSession(agency.id, "another_user", manual!.id), false);
    assert.equal(planning.deleteDashboardWorkSession(agency.id, userId, manual!.id), true);
    assert.equal(planning.dashboardPlanningSnapshot(agency.id, userId, date).sessions.length, 1);
    assert.equal(planning.dashboardPlanningSnapshot(agency.id, "another_user", date).weekPlan, null);
  });

  it("retains evidence-backed weekly review drafts and enforces a complete review", async () => {
    const { agency, userId } = await fresh();
    const initial = planning.dashboardPlanningSnapshot(agency.id, userId, localDate());
    const draft = planning.upsertDashboardWeekPlan({
      agencyId: agency.id,
      userId,
      weekStart: initial.weekStart,
      outcome: "Create a dependable weekly operating rhythm",
      wins: "Daily command was used consistently.",
      reviewStatus: "draft",
      evidenceSnapshot: {
        plannedHours: 35,
        confirmedHours: 31.5,
        unconfirmedHours: 1,
        completedTasks: 8,
        openTasks: 3,
        revenueTargetPounds: 2_500,
        dayReviewsCompleted: 4,
        capturedAt: 123_456,
      },
    });
    assert.equal(draft.reviewStatus, "draft");
    assert.equal(draft.evidenceSnapshot?.confirmedHours, 31.5);
    assert.equal(draft.reviewedAt, undefined);

    assert.throws(() => planning.upsertDashboardWeekPlan({
      agencyId: agency.id,
      userId,
      weekStart: initial.weekStart,
      reviewStatus: "complete",
      wins: "One result",
    }), planning.DashboardWeeklyReviewError);

    const complete = planning.upsertDashboardWeekPlan({
      agencyId: agency.id,
      userId,
      weekStart: initial.weekStart,
      outcome: draft.outcome,
      wins: "The daily system held.",
      misses: "Two priorities drifted.",
      lessons: "Planning fewer outcomes improves execution.",
      decisions: "Cap the daily queue at five.",
      risks: "Follow-up debt remains.",
      startDoing: "Review the queue before clock-in.",
      stopDoing: "Adding work without removing work.",
      continueDoing: "Mandatory clock-out reviews.",
      nextWeekPriorities: "1. Clear follow-up debt\n2. Protect delivery capacity",
      executionScore: 4,
      energyScore: 3,
      confidenceScore: 4,
      reviewStatus: "complete",
      evidenceSnapshot: draft.evidenceSnapshot,
    });
    assert.equal(complete.reviewStatus, "complete");
    assert.ok(complete.reviewedAt);
    assert.equal(complete.decisions, "Cap the daily queue at five.");
    const legacyPlanEdit = planning.upsertDashboardWeekPlan({ agencyId: agency.id, userId, weekStart: initial.weekStart, outcome: "Refined weekly outcome" });
    assert.equal(legacyPlanEdit.reviewStatus, "complete");
    assert.equal(legacyPlanEdit.decisions, "Cap the daily queue at five.");
  });

  it("rejects manually logged future hours", async () => {
    const { agency, userId } = await fresh();
    const future = new Date();
    future.setDate(future.getDate() + 1);
    assert.equal(planning.logDashboardWorkSession({ agencyId: agency.id, userId, date: localDate(future), hours: 2 }), null);
  });

  it("loads independently saved plans and week direction across planning weeks", async () => {
    const { agency, userId } = await fresh();
    const future = new Date();
    future.setDate(future.getDate() + 16);
    const date = localDate(future);
    planning.upsertDashboardDayPlan({ agencyId: agency.id, userId, date, focus: "Prepare the future launch", plannedHours: 6 });
    const futureSnapshot = planning.dashboardPlanningSnapshot(agency.id, userId, date);
    planning.upsertDashboardWeekPlan({ agencyId: agency.id, userId, weekStart: futureSnapshot.weekStart, outcome: "Launch week ready" });
    const loaded = planning.dashboardPlanningSnapshot(agency.id, userId, date);
    assert.equal(loaded.dayPlan?.focus, "Prepare the future launch");
    assert.equal(loaded.weekPlan?.outcome, "Launch week ready");
    assert.equal(loaded.weekPlans.length, 1);
  });

  it("keeps clocked-in time accountable across Aqua, external work, breaks, and idle uncertainty", async () => {
    const { agency, userId } = await fresh();
    const base = new Date(`${localDate()}T09:00:00`).getTime();
    const active = planning.clockInDashboard({ agencyId: agency.id, userId, focus: "Build the smart clock", now: base });
    assert.equal(active.currentMode, "aqua");
    assert.equal(active.needsActivityConfirmation, false);

    const aqua = planning.heartbeatDashboardWorkSession({
      agencyId: agency.id,
      userId,
      visible: true,
      lastInteractionAt: base + 9 * 60_000,
      now: base + 11 * 60_000,
    });
    assert.equal(aqua?.currentMode, "aqua");
    assert.equal(aqua?.needsActivityConfirmation, false);
    assert.equal(aqua?.aquaActiveMs, 11 * 60_000);

    const idle = planning.heartbeatDashboardWorkSession({
      agencyId: agency.id,
      userId,
      visible: true,
      lastInteractionAt: base + 9 * 60_000,
      now: base + 20 * 60_000,
    });
    assert.equal(idle?.currentMode, "unconfirmed");
    assert.equal(idle?.needsActivityConfirmation, true);
    assert.equal(idle?.aquaActiveMs, 19 * 60_000);
    assert.equal(idle?.unconfirmedIdleMs, 60_000);

    assert.equal(planning.resolveDashboardWorkActivity({ agencyId: agency.id, userId, mode: "external", now: base + 21 * 60_000 }), null);
    const external = planning.resolveDashboardWorkActivity({
      agencyId: agency.id,
      userId,
      mode: "external",
      focus: "Editing a client site in another app",
      nextCheckInMinutes: 30,
      now: base + 21 * 60_000,
    });
    assert.equal(external?.currentMode, "external");
    assert.equal(external?.needsActivityConfirmation, false);
    assert.equal(external?.nextCheckInAt, base + 51 * 60_000);

    const expired = planning.heartbeatDashboardWorkSession({ agencyId: agency.id, userId, visible: false, now: base + 56 * 60_000 });
    assert.equal(expired?.currentMode, "unconfirmed");
    assert.equal(expired?.externalWorkMs, 30 * 60_000);
    assert.equal(expired?.unconfirmedIdleMs, 7 * 60_000);

    const takingBreak = planning.resolveDashboardWorkActivity({ agencyId: agency.id, userId, mode: "break", nextCheckInMinutes: 15, now: base + 56 * 60_000 });
    assert.equal(takingBreak?.currentMode, "break");
    assert.throws(() => planning.clockOutDashboard({ agencyId: agency.id, userId, now: base + 61 * 60_000, review: {
      outcome: "Finished the block.",
      nothingOpen: true,
      nextPriority: "Review the completed smart clock.",
      dayScore: 5,
      unconfirmedTimeAcknowledged: false,
    } }), /acknowledge the unconfirmed time/i);
    const complete = planning.clockOutDashboard({ agencyId: agency.id, userId, now: base + 61 * 60_000, review: {
      outcome: "Finished the block.",
      nothingOpen: true,
      nextPriority: "Review the completed smart clock.",
      dayScore: 5,
      unconfirmedTimeAcknowledged: true,
    } });
    assert.equal(complete?.breakMs, 5 * 60_000);
    assert.equal(complete?.needsActivityConfirmation, false);
    assert.ok(complete?.activityBlocks?.some(block => block.mode === "external" && block.focus === "Editing a client site in another app"));

    const evidence = planning.dashboardWorkAccountabilitySnapshot(agency.id, base + 61 * 60_000);
    assert.equal(evidence.activeSessions, 0);
    assert.equal(evidence.sessionsNeedingCheckIn, 0);
    assert.equal(evidence.productiveMs, 49 * 60_000);
    assert.equal(evidence.breakMs, 5 * 60_000);
    assert.equal(evidence.unconfirmedIdleMs, 7 * 60_000);
    assert.equal(evidence.attentionState, "watch");
    assert.ok(evidence.evidenceConfidencePercent < 90);
  });
});

describe("dashboard command centre surface", () => {
  it("prioritises execution, timekeeping, reflection, week planning, and Advisor actions", async () => {
    const [page, dynamicRadar, trajectory, stationNav, popup, workspace, briefing, dayKpi, route, drawer, routeCanvas, smartClock, portalLayout, advisorContext, globalStyles] = await Promise.all([
      readFile(new URL("../src/app/portal/agency/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/_DynamicRadarConsole.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/_CommandCentreKpiTrajectory.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/_CommandStationNav.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/_CommandDeckPopup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/_DashboardCommandCenter.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/_DayBriefingPanel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/_DayKpiIntelligencePanel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/dashboard-planning/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/GlobalAdvisorDrawer.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/PortalRouteCanvas.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/SmartWorkSessionMonitor.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/server/advisorSkillContext.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    ]);
    const [clockOutReview, weeklyReview, daySensor] = await Promise.all([
      readFile(new URL("../src/app/portal/agency/_ClockOutReviewDialog.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/_WeeklyReviewWorkspace.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/_DayCommandSensorPanel.tsx", import.meta.url), "utf8"),
    ]);
    assert.match(page, /DashboardCommandCenter/);
    assert.match(workspace, /WeeklyReviewWorkspace/);
    for (const reviewLabel of ["Guided weekly deep dive", "Aqua review partner", "Complete review", "Decisions made", "Next week priorities"]) assert.match(weeklyReview, new RegExp(reviewLabel));
    assert.match(page, /AgencyActionsPage/);
    assert.match(page, /actionsWorkspace=/);
    assert.match(page, /Command Centre Actions/);
    assert.match(page, /Command Centre\s*<\/h1>/);
    assert.match(page, /Command deck/);
    for (const initialDeckLabel of ["Executive overview", "Health, evidence, priorities and controls", "Checks monitored", "Sources connected", "Officer watch summary", "Command Centre quick actions", "Captain&apos;s log"]) {
      assert.match(page, new RegExp(initialDeckLabel));
    }
    assert.doesNotMatch(page, /xl:h-\[calc\(100dvh-7\.5rem\)\]/);
    assert.doesNotMatch(page, /xl:max-w-\[68px\]/);
    assert.doesNotMatch(page, /xl:overflow-hidden/);
    assert.match(dynamicRadar, /max-w-\[520px\]/);
    assert.match(dynamicRadar, /max-w-\[112px\]/);
    for (const heroRadarLabel of ["Live hero radar", "Live command plot", "Business radar", "Sweep live", "contacts held", "Open detailed plot"]) {
      assert.match(`${page}\n${dynamicRadar}`, new RegExp(heroRadarLabel));
    }
    assert.match(page, /DynamicRadarConsole/);
    assert.match(dynamicRadar, /sectors\.map/);
    assert.match(dynamicRadar, /sector\.domains\.map/);
    assert.match(dynamicRadar, /PPI-01A–D · Linked sensor switcher/);
    assert.match(dynamicRadar, /aria-label="Four-sector radar switcher"/);
    assert.match(dynamicRadar, /SECTOR_RADAR_POSITIONS/);
    assert.match(dynamicRadar, /Integrated radar sector key/);
    assert.match(trajectory, /Executive KPI trajectory/);
    assert.match(trajectory, /COMMAND_PRIMARY_KPI_STATIONS/);
    assert.match(trajectory, /Open all five primary KPI stations in Intelligence/);
    assert.match(trajectory, /data-watch-state=\{watchState\}/);
    assert.match(trajectory, /Red alert/);
    assert.match(trajectory, /kpiStatusSurface/);
    assert.doesNotMatch(page, /aria-label="Live hero radar array"/);
    for (const radarSector of ["Commercial", "Client experience", "Stewardship", "Capability"]) assert.match(dynamicRadar, new RegExp(radarSector));
    for (const interaction of ["Promote a sector into the main plot", "Back one level", "All systems", "Domain plot", "Sector plot", "aqua-radar-inspector:open"]) assert.match(dynamicRadar, new RegExp(interaction));
    assert.match(dynamicRadar, /window\.history\.pushState/);
    assert.match(dynamicRadar, /popstate/);
    assert.match(dynamicRadar, /radarFocusParam/);
    assert.match(dynamicRadar, /Cash, revenue, invoices, budgets, tax, runway and profitability/);
    assert.match(globalStyles, /mm-radar-focus-transition/);
    assert.match(page, /CommandDeckPopup/);
    assert.match(dynamicRadar, /Open detailed plot/);
    assert.match(popup, /aqua-radar-inspector:open/);
    assert.match(popup, /role="dialog"/);
    assert.match(workspace, /aqua-radar-inspector:open/);
    assert.match(page, /commandDeck className=/);
    assert.doesNotMatch(page, /FounderDashboardKpis/);
    assert.doesNotMatch(page, /OperatingLoop/);
    for (const label of ["Strict work queue", "Timesheet", "Log what moved", "Week command"]) {
      assert.match(workspace, new RegExp(label));
    }
    assert.match(weeklyReview, /Weekly outcome/);
    for (const control of ["Generate briefing", "Generate tasks", "generateTasksFromRadar", "DayBriefingPanel"]) assert.match(workspace, new RegExp(control));
    for (const reviewControl of ["Mandatory clock-out review", "What moved today", "Open handover", "First move next session", "Day score", "Complete review & clock out"]) assert.match(clockOutReview, new RegExp(reviewControl));
    assert.match(workspace, /requestClockOut/);
    assert.match(workspace, /clockOutReview:/);
    assert.match(workspace, /Day score \{session\.clockOutReview\.dayScore\}\/5/);
    assert.match(workspace, /Handover:/);
    assert.match(route, /DashboardClockOutReviewError/);
    for (const briefingLabel of ["Daily executive briefing", "PRIMARY DIRECTIVE", "Evidence basis", "Task scan reconciled", "Open Advisor"]) assert.match(briefing, new RegExp(briefingLabel));
    assert.match(briefing, /Accept \$\{action\.title\} into tasks/);
    assert.match(briefing, /blind checks declared/);
    assert.match(workspace, /DayKpiIntelligencePanel/);
    for (const graphLabel of ["Five-station trajectory", "Oldest retained", "Current watch", "Open intelligence", "Directional retained movement"]) assert.match(dayKpi, new RegExp(graphLabel));
    assert.match(dayKpi, /<svg/);
    assert.match(dayKpi, /<polyline/);
    assert.match(dayKpi, /COMMAND_PRIMARY_KPI_STATIONS/);
    assert.match(dayKpi, /onOpen\(\[\.\.\.station\.openIds\]\)/);
    for (const planningControl of ["View previous day", "View next day", "Choose planning date", "Today", "loadDashboardPlanning", "offsetIsoDate", "weekExpanded", "aqua-command-week-expanded", "aria-controls=\"week-command-content\""]) assert.match(workspace, new RegExp(planningControl));
    assert.match(workspace, /fetch\(`\/api\/portal\/dashboard-planning\?date=/);
    assert.match(workspace, /setPlanningWeekStart\(next\.weekStart\)/);
    for (const wholeDayControl of ["selectedDayTasks", "completedOnSelectedDay", "dayStrictList", "selectedDaySchedule", "taskTouchesDate", "timestampFallsOnDate", "taskMomentForDate", "Historical review · complete day record", "Future plan · complete day workspace", "Daily review", "Planning brief", "Date-scoped record", "live Radar intentionally excluded from this archive"]) {
      assert.match(workspace, new RegExp(wholeDayControl));
    }
    assert.match(workspace, /isToday \? <DayBriefingPanel/);
    assert.match(workspace, /isToday \? <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">/);
    assert.doesNotMatch(workspace, /\.filter\(item => item\.at >= new Date\(`\$\{actualToday\}T00:00:00`\)/);
    for (const station of ["Radar workspace views", "Executive view", "Radar systems", "KPIs & evidence", "Aqua Advisor"]) {
      assert.match(workspace, new RegExp(station));
    }
    assert.doesNotMatch(workspace, /Day Command views/);
    assert.doesNotMatch(workspace, /label="My day & time"/);
    assert.doesNotMatch(workspace, /label="Actions"/);
    assert.match(workspace, /onClick=\{\(\) => selectWorkspaceMode\("actions"\)\} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">All actions/);
    assert.match(workspace, /async function returnToToday\(\)/);
    assert.match(workspace, /if \(!isToday\) await selectDay\(actualToday\)/);
    assert.match(workspace, /Return to today’s Day Command/);
    assert.match(workspace, />Back to today</);
    assert.match(workspace, /pathname === "\/portal\/agency\/command-center"/);
    assert.match(workspace, /Aqua command network · Integrated station/);
    assert.match(workspace, /Integrated Radar feed and priority queue/);
    assert.match(workspace, /dashboardMode === "actions"/);
    assert.match(workspace, /mm-omega-actions-workspace/);
    assert.match(workspace, /workspaceBodyRef\.current\?\.scrollTo/);
    for (const station of ["Executive command controls", "Command Centre", "Day command", "Battle Table", "Radar online"]) {
      assert.match(stationNav, new RegExp(station));
    }
    assert.doesNotMatch(stationNav, /KPI Intelligence/);
    assert.doesNotMatch(stationNav, /Radar workspace/);
    assert.doesNotMatch(stationNav, /Omega Dashboard/);
    assert.doesNotMatch(stationNav, /label="Calendar"/);
    // Three permanent stations, widening to four only when the founder-gated Dev
    // Team station is shown. Non-founders must keep the exact three-column nav.
    assert.match(stationNav, /showDevTeam \? "sm:grid-cols-4" : "sm:grid-cols-3"/);
    assert.match(stationNav, /\{showDevTeam \? <StationButton[^\n]*label="Dev Console"/);
    assert.match(stationNav, /activeMode: CommandStationMode/);
    assert.match(stationNav, /onSelect: \(mode: CommandStationMode\) => void/);
    assert.match(stationNav, /aria-pressed=\{active\}/);
    assert.match(stationNav, /CommandStationAttention/);
    assert.match(stationNav, /mm-command-station-notification/);
    assert.match(workspace, /battleTableAttention/);
    assert.match(daySensor, /data-watch-state=\{watchState\}/);
    assert.match(daySensor, /Red alert/);
    assert.match(daySensor, /active alerts/);
    assert.match(daySensor, /sensorTile/);
    assert.match(globalStyles, /mm-command-station-notification/);
    assert.match(globalStyles, /mm-command-alert-surface/);
    assert.doesNotMatch(page, /Order 01 · Schedule/);
    assert.doesNotMatch(stationNav, /href=/);
    assert.doesNotMatch(stationNav, /<Link/);
    assert.match(workspace, /<CommandStationNav/);
    assert.match(workspace, /<BattleTableWorkspace payload=\{battleTablePayload\}/);
    assert.match(page, /battleTablePayload=\{/);
    assert.match(page, /executiveWorkspace=\{executiveWorkspace\}/);
    assert.match(page, /calendarWorkspace=/);
    assert.match(workspace, /onClick=\{\(\) => selectWorkspaceMode\("calendar"\)\}/);
    assert.match(workspace, /dashboardMode === "calendar"/);
    assert.match(workspace, /if \(value === "calendar"\) return "day"/);
    assert.doesNotMatch(workspace, /<Link href="\/portal\/agency\/calendar"[^>]*>Calendar/);
    assert.match(page, /advisorWorkspace=/);
    assert.match(stationNav, /Command Centre · Business watch, personal command and Radar in one system/);
    assert.match(workspace, /data-testid="unified-command-centre"/);
    assert.match(workspace, /CommandInstrumentDock/);
    assert.match(workspace, /Open KPI Intelligence/);
    assert.match(workspace, /Open Radar Workspace/);
    assert.match(workspace, /Back to Command Centre/);
    assert.match(workspace, /<CommandCentreKpiTrajectory intelligence=\{intelligenceSnapshot\} onOpen=\{openIntelligence\}/);
    assert.match(workspace, /if \(value === "omega"\) return "executive"/);
    assert.match(workspace, /role="region"/);
    assert.match(workspace, /mm-command-workspace-inline/);
    assert.doesNotMatch(workspace, /aqua-command-station:select/);
    assert.doesNotMatch(workspace, /fixed inset-0/);
    assert.match(workspace, /data-testid="executive-radar"/);
    assert.match(workspace, /data-testid="radar-operations-workspace"/);
    assert.match(workspace, /Open workspace/);
    assert.match(workspace, /Executive view/);
    assert.match(workspace, /slice\(0, 3\)/);
    for (const bridgeLabel of ["Executive bridge radar", "Watch condition", "PPI-01", "Current watch", "Data inspector", "Primary plotting indicator", "Officer of the watch"]) {
      assert.match(workspace, new RegExp(bridgeLabel));
    }
    assert.match(workspace, /Scanner ledger/);
    assert.match(workspace, /Never-blind matrix/);
    assert.match(workspace, /action: "log-hours"/);
    assert.match(workspace, /action: "delete-session"/);
    assert.match(workspace, /status: "done"/);
    assert.match(workspace, /aqua-advisor:open/);
    assert.match(route, /save-week/);
    assert.match(route, /logDashboardWorkSession/);
    for (const smartAction of ["heartbeat", "resolve-activity", "activityMode", "lastInteractionAt"]) assert.match(route, new RegExp(smartAction));
    for (const smartSurface of ["What are you doing", "Working in Aqua", "Working elsewhere", "Taking a break", "Check back in", "Unconfirmed", "aqua-work-session:planning", "Review & clock out", "aqua-work-session:clock-out-review"]) assert.match(smartClock, new RegExp(smartSurface));
    assert.doesNotMatch(smartClock, /action: "clock-out"/);
    assert.match(portalLayout, /SmartWorkSessionMonitor/);
    assert.match(portalLayout, /AGENCY_ROLES\.includes/);
    assert.match(workspace, /Employee record · accountable time/);
    assert.match(workspace, /Evidence confidence/);
    assert.match(workspace, /aqua-work-session:check-in/);
    assert.match(advisorContext, /workAccountability/);
    assert.match(advisorContext, /Treat unconfirmed clock time as uncertainty/);
    assert.match(drawer, /aqua-advisor:open/);
    assert.match(routeCanvas, /isCommandCenterPath\(pathname\)/);
    assert.match(routeCanvas, /root\.dataset\.portalShell = shellTheme/);
    assert.match(routeCanvas, /delete root\.dataset\.portalShell/);
    assert.match(routeCanvas, /data-portal-shell=\{shellTheme\}/);
    assert.match(globalStyles, /html\[data-portal-shell="command"\] \.mm-private-sidebar/);
    assert.match(globalStyles, /html\[data-portal-shell="command"\] \.mm-portal-topbar/);
    assert.match(globalStyles, /html\[data-portal-shell="command"\] \.mm-private-surface/);
  });
});
