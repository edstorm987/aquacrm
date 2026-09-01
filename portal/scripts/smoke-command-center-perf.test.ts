import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

import {
  commandScanLoadPlan,
  shouldRunHeavyPanels,
  buildPausedBusinessRadar,
  buildPausedIntelligenceSnapshot,
  reconcileBusinessRadarSnapshot,
  reconcileCommandIntelligenceSnapshot,
} from "../src/app/portal/agency/commandPerformance";
import {
  COMMAND_SCAN_RESULT_TTL_MS,
  commandScanResultStorageKey,
  createCommandScanResultRepository,
  createMemoryCommandScanResultStorage,
  normalizeCommandScanResultHandle,
  readCommandScanResultOutcome,
  type CommandScanPrincipal,
} from "../src/lib/server/commandScanResults";
import {
  requireCommandScanIssueAccess,
  requireCommandScanReadAccess,
} from "../src/lib/server/commandScanAccess";
import {
  devTeamStationAttention,
  radarStationAttention,
} from "../src/app/portal/agency/commandStationAttention";
import {
  resolveServerCommandStation,
  serverCommandStationHref,
} from "../src/app/portal/agency/commandStationRouting";
import {
  beginServerStationNavigation,
  pendingServerStationView,
  serverStationSettlementFallback,
} from "../src/app/portal/agency/serverStationNavigation";
import type { RadarPolicyConfiguration } from "../src/server/types";

const read = (path: string) => readFileSync(path, "utf8");

// The policy is only read for its operatingStage and stored verbatim on the
// placeholder radar, so a minimal cast is enough to exercise the builder.
const POLICY = { operatingStage: "setup" } as unknown as RadarPolicyConfiguration;

test("GET load planning never turns a result handle into a scan trigger", () => {
  assert.equal(shouldRunHeavyPanels(false), true, "Performance mode OFF keeps its ordinary eager landing");
  assert.equal(shouldRunHeavyPanels(true), false, "Performance mode ON keeps the ordinary landing paused");
  assert.equal(shouldRunHeavyPanels(false, true), false, "a completed result is reused rather than rebuilt");
  assert.equal(shouldRunHeavyPanels(false, false, true), false, "a missing handle may not fall through to an eager rebuild");
});

test("a preserved result clears the paused view without rerunning the heavy graph", () => {
  assert.deepEqual(commandScanLoadPlan(true, false, false), { runHeavyPanels: false, scanPaused: true });
  assert.deepEqual(
    commandScanLoadPlan(true, true, false),
    { runHeavyPanels: false, scanPaused: false },
    "continuing a completed result must not replay the scan",
  );
  assert.deepEqual(commandScanLoadPlan(false, false, false), { runHeavyPanels: true, scanPaused: false });
  assert.deepEqual(
    commandScanLoadPlan(false, false, true),
    { runHeavyPanels: false, scanPaused: true },
    "expiry/miss is internally paused even when Performance mode is disabled",
  );
});

const PRINCIPAL: CommandScanPrincipal = {
  realmId: "live",
  agencyId: "agency-one",
  userId: "user-one",
  sessionRev: 7,
  accessRev: 11,
};
const HANDLE_ONE = "10000000-0000-4000-8000-000000000001";
const HANDLE_TWO = "20000000-0000-4000-8000-000000000002";

test("an independently-created repository reads a completed result from the shared store", async () => {
  const shared = new Map();
  const writer = createCommandScanResultRepository(createMemoryCommandScanResultStorage(shared), () => HANDLE_ONE);
  const reader = createCommandScanResultRepository(createMemoryCommandScanResultStorage(shared));
  const now = 10_000;
  const radar = buildPausedBusinessRadar(POLICY, now);
  const intelligence = buildPausedIntelligenceSnapshot("GBP", now);
  const issued = await writer.issue({
    principal: PRINCIPAL,
    radar,
    intelligence,
    now,
  });

  assert.equal(normalizeCommandScanResultHandle(issued.handle), HANDLE_ONE);
  assert.equal(normalizeCommandScanResultHandle("scan=1"), null);
  const first = await reader.read({ handle: HANDLE_ONE, principal: PRINCIPAL, now: now + 1 });
  const stationChange = await reader.read({ handle: HANDLE_ONE, principal: PRINCIPAL, now: now + 2 });
  assert.deepEqual(first?.radar, radar);
  assert.deepEqual(stationChange, first, "one provider payload survives a station change without being rebuilt");
  assert.equal(shared.size, 1, "one identity gets one bounded provider row");

  const providerKey = commandScanResultStorageKey(PRINCIPAL);
  assert.match(providerKey, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(providerKey, /agency-one|user-one|@/, "provider-visible keys must not leak raw principal data");
});

test("the access-kernel seams require Use to issue and View to consume, and denial propagates", async () => {
  const calls: Array<[string, string | undefined]> = [];
  const actor = { user: { id: "user-one" } } as Awaited<ReturnType<typeof requireCommandScanIssueAccess>>;
  const allowingGate: NonNullable<Parameters<typeof requireCommandScanIssueAccess>[0]> = async (element, action) => {
    calls.push([element, action]);
    return actor;
  };

  assert.equal(await requireCommandScanIssueAccess(allowingGate), actor);
  assert.equal(await requireCommandScanReadAccess(allowingGate), actor);
  assert.deepEqual(calls, [
    ["workspace.overview", "use"],
    ["workspace.overview", "view"],
  ]);

  const denial = Object.assign(new Error("access_capability_required"), { status: 403 });
  await assert.rejects(
    requireCommandScanIssueAccess(async () => { throw denial; }),
    error => error === denial,
    "the route seam must not turn an access-kernel refusal into role-based access",
  );
  await assert.rejects(
    requireCommandScanReadAccess(async () => { throw denial; }),
    error => error === denial,
    "the RSC seam must not disclose result bytes after a view denial",
  );
});

test("a rejecting result provider is unavailable, while an empty provider is a distinct miss", async () => {
  const providerFailure = new Error("provider offline");
  const rejectingRepository = createCommandScanResultRepository({
    async load() { throw providerFailure; },
    async save() { throw providerFailure; },
  });
  let reported: unknown = null;
  const unavailable = await readCommandScanResultOutcome(
    { handle: HANDLE_ONE, principal: PRINCIPAL, now: 15_000 },
    { repository: rejectingRepository, onUnavailable: error => { reported = error; } },
  );
  assert.deepEqual(unavailable, { status: "unavailable", result: null });
  assert.equal(reported, providerFailure);

  const emptyRepository = createCommandScanResultRepository(createMemoryCommandScanResultStorage(new Map()));
  assert.deepEqual(
    await readCommandScanResultOutcome(
      { handle: HANDLE_ONE, principal: PRINCIPAL, now: 15_000 },
      { repository: emptyRepository },
    ),
    { status: "missing", result: null },
  );
});

test("the continuation TTL starts at persistence after a slow scan, not at scan start", async () => {
  const scanStartedAt = 50_000;
  const persistedAt = scanStartedAt + COMMAND_SCAN_RESULT_TTL_MS + 30_000;
  const repository = createCommandScanResultRepository(
    createMemoryCommandScanResultStorage(new Map()),
    () => HANDLE_ONE,
  );
  const result = await repository.issue({
    principal: PRINCIPAL,
    radar: buildPausedBusinessRadar(POLICY, scanStartedAt),
    intelligence: buildPausedIntelligenceSnapshot("GBP", scanStartedAt),
    now: persistedAt,
  });

  assert.equal(result.radar.generatedAt, scanStartedAt, "scan evidence keeps its common as-of time");
  assert.equal(result.intelligence.generatedAt, scanStartedAt);
  assert.equal(result.createdAt, persistedAt);
  assert.equal(result.expiresAt, persistedAt + COMMAND_SCAN_RESULT_TTL_MS);
  assert.ok(result.expiresAt > scanStartedAt + 2 * COMMAND_SCAN_RESULT_TTL_MS);
});

test("realm, agency, user, session revision, access revision, and expiry all fail closed", async () => {
  const shared = new Map();
  const repository = createCommandScanResultRepository(createMemoryCommandScanResultStorage(shared), () => HANDLE_ONE);
  const now = 20_000;
  await repository.issue({
    principal: PRINCIPAL,
    radar: buildPausedBusinessRadar(POLICY, now),
    intelligence: buildPausedIntelligenceSnapshot("GBP", now),
    now,
  });

  for (const changed of [
    { ...PRINCIPAL, realmId: "sandbox-one" },
    { ...PRINCIPAL, agencyId: "agency-two" },
    { ...PRINCIPAL, userId: "user-two" },
    { ...PRINCIPAL, sessionRev: PRINCIPAL.sessionRev + 1 },
    { ...PRINCIPAL, accessRev: PRINCIPAL.accessRev + 1 },
  ]) {
    assert.equal(await repository.read({ handle: HANDLE_ONE, principal: changed, now: now + 1 }), null);
  }
  assert.equal(
    await repository.read({ handle: HANDLE_ONE, principal: PRINCIPAL, now: now + COMMAND_SCAN_RESULT_TTL_MS }),
    null,
    "the continuation handle became a permanent bookmark",
  );
});

test("issuing a newer result invalidates the old handle without capacity eviction", async () => {
  const shared = new Map();
  const handles = [HANDLE_ONE, HANDLE_TWO];
  const repository = createCommandScanResultRepository(
    createMemoryCommandScanResultStorage(shared),
    () => handles.shift()!,
  );
  const radar = buildPausedBusinessRadar(POLICY, 30_000);
  const intelligence = buildPausedIntelligenceSnapshot("GBP", 30_000);
  await repository.issue({ principal: PRINCIPAL, radar, intelligence, now: 30_000 });
  await repository.issue({ principal: PRINCIPAL, radar, intelligence, now: 30_001 });

  assert.equal(await repository.read({ handle: HANDLE_ONE, principal: PRINCIPAL, now: 30_002 }), null);
  assert.equal((await repository.read({ handle: HANDLE_TWO, principal: PRINCIPAL, now: 30_002 }))?.handle, HANDLE_TWO);
  assert.equal(shared.size, 1, "new results overwrite rather than growing or evicting unrelated principals");
});

test("an unrelated principal is never evicted merely because more principals completed scans", async () => {
  const shared = new Map();
  let sequence = 0;
  const repository = createCommandScanResultRepository(
    createMemoryCommandScanResultStorage(shared),
    () => `30000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, "0")}`,
  );
  const radar = buildPausedBusinessRadar(POLICY, 40_000);
  const intelligence = buildPausedIntelligenceSnapshot("GBP", 40_000);
  let firstHandle = "";
  for (let index = 0; index < 80; index += 1) {
    const issued = await repository.issue({
      principal: { ...PRINCIPAL, userId: `user-${index}` },
      radar,
      intelligence,
      now: 40_000,
    });
    if (index === 0) firstHandle = issued.handle;
  }

  assert.equal(shared.size, 80);
  assert.equal(
    (await repository.read({
      handle: firstHandle,
      principal: { ...PRINCIPAL, userId: "user-0" },
      now: 40_001,
    }))?.handle,
    firstHandle,
    "a process-wide capacity cap prematurely evicted a still-live principal",
  );
});

test("a full RSC result reconciles by freshness, but an authoritative miss clears stale full Radar state", () => {
  const previousServer = buildPausedBusinessRadar(POLICY, 300);
  const fullServer = { ...buildPausedBusinessRadar(POLICY, 200), summary: { ...previousServer.summary, totalChecks: 42 } };
  assert.equal(
    reconcileBusinessRadarSnapshot(previousServer, previousServer, fullServer, true, false),
    fullServer,
    "object identity replaces an untouched placeholder even when a cached full scan has an older timestamp",
  );

  const newerLocal = { ...buildPausedBusinessRadar(POLICY, 400), summary: { ...previousServer.summary, totalChecks: 99 } };
  assert.equal(reconcileBusinessRadarSnapshot(newerLocal, previousServer, fullServer, true, false), newerLocal);
  const newestServer = { ...fullServer, generatedAt: 500 };
  assert.equal(reconcileBusinessRadarSnapshot(newerLocal, previousServer, newestServer, true, false), newestServer);

  const newerPausedServer = buildPausedBusinessRadar(POLICY, 600);
  assert.equal(
    reconcileBusinessRadarSnapshot(fullServer, fullServer, newerPausedServer, false, true),
    newerPausedServer,
    "an expired/missing handle must erase an older full server sweep",
  );
  assert.equal(
    reconcileBusinessRadarSnapshot(newerLocal, fullServer, newerPausedServer, false, true),
    newerPausedServer,
    "paused chrome may not retain contradictory local full data",
  );
});

test("a missing shared result clears completed KPI intelligence as one consistent paused state", () => {
  const previousPaused = buildPausedIntelligenceSnapshot("GBP", 300);
  const completed = { ...previousPaused, generatedAt: 200, currency: "USD" };
  assert.equal(
    reconcileCommandIntelligenceSnapshot(previousPaused, previousPaused, completed, true, false),
    completed,
    "the first completed server scan replaces the untouched placeholder even when its cached timestamp is older",
  );

  const laterPaused = buildPausedIntelligenceSnapshot("GBP", 600);
  assert.equal(
    reconcileCommandIntelligenceSnapshot(completed, completed, laterPaused, false, true),
    laterPaused,
    "expired continuation state must not leave stale KPI evidence on screen",
  );
});

test("deferred Dev Team and paused Radar attention are unknown, while completed zero results are clear", () => {
  const deferredDevTeam = devTeamStationAttention(false, 0, 0);
  assert.equal(deferredDevTeam.tone, "info");
  assert.match(deferredDevTeam.label, /loads with the Dev Team station/i);
  assert.notEqual(deferredDevTeam.label, "Nothing is blocked on the Dev Team board");

  const clearDevTeam = devTeamStationAttention(true, 0, 0);
  assert.equal(clearDevTeam.tone, "clear");
  assert.equal(clearDevTeam.label, "Nothing is blocked on the Dev Team board");

  const pausedRadar = radarStationAttention({ critical: 0, warning: 0 }, true);
  assert.equal(pausedRadar.tone, "info");
  assert.match(pausedRadar.label, /Radar paused · run scan/i);
  assert.notEqual(pausedRadar.label, "Radar has no critical or warning incidents");

  const clearRadar = radarStationAttention({ critical: 0, warning: 0 }, false);
  assert.equal(clearRadar.tone, "clear");
  assert.equal(clearRadar.label, "Radar has no critical or warning incidents");

  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const stationNav = read("src/app/portal/agency/_CommandStationNav.tsx");
  assert.match(dashboard, /radarStationAttention\(radarSnapshot\.summary, displayedRadarIsPaused\)/);
  assert.match(dashboard, /devTeamStationAttention\(devTeamAttentionLoaded, devTeamBlockedCount, devTeamLaunchBlockerCount\)/);
  assert.match(stationNav, /radarAttention\.tone === "info" \? "text-sky-200"/);
  assert.match(stationNav, /radarAttention\.tone === "info" \? radarAttention\.label : "Radar online"/);
});

test("the paused radar placeholder is a well-formed empty sweep, never a fabricated failure", () => {
  const radar = buildPausedBusinessRadar(POLICY, 1_000);
  assert.equal(radar.generatedAt, 1_000);
  assert.equal(radar.summary.critical, 0);
  assert.equal(radar.summary.warning, 0);
  assert.equal(radar.summary.totalChecks, 0);
  assert.deepEqual(radar.incidents, []);
  assert.deepEqual(radar.domains, []);
  assert.deepEqual(radar.checks, []);
  // The agency's real configured policy still flows through so the operating
  // stage reads truthfully rather than being invented.
  assert.equal(radar.adaptive.operatingStage, "setup");
  assert.equal(radar.adaptive.policy, POLICY);
});

test("the paused intelligence placeholder carries no KPIs and honest empty commercial intelligence", () => {
  const snapshot = buildPausedIntelligenceSnapshot("GBP", 2_000);
  assert.equal(snapshot.generatedAt, 2_000);
  assert.equal(snapshot.currency, "GBP");
  assert.deepEqual(snapshot.kpis, []);
  assert.equal(snapshot.scopes.length, 1);
  assert.equal(snapshot.scopes[0]?.kind, "ecosystem");
  assert.equal(snapshot.summary.connectedKpis, 0);
  assert.equal(snapshot.demandFlow.pageviews, null);
  assert.ok(snapshot.commercialIntelligence, "commercial intelligence must be present");
});

test("the Command Centre page gates radar + intelligence behind runHeavyPanels and keeps the OFF path intact", () => {
  const page = read("src/app/portal/agency/page.tsx");

  // The switch exists and drives a paused flag handed to the client.
  assert.match(page, /commandScanLoadPlan\([\s\S]*lightweightMode,[\s\S]*Boolean\(preservedScanResult\),[\s\S]*requestedScanResultMissing/);
  assert.match(page, /scanPaused=\{scanPaused\}/);
  assert.match(page, /await requireCommandScanReadAccess\(\)/);
  assert.match(page, /commandScanPrincipalForSession\(session, agency\.id, scanAuthorityUser\)/);
  assert.match(page, /await readCommandScanResultOutcome\([\s\S]*principal: scanPrincipal/);
  assert.match(page, /scanResultRead\?\.status === "unavailable"/);
  assert.match(page, /if \(preservedScanResult\) \{[\s\S]*businessRadar = preservedScanResult\.radar;[\s\S]*\} else if \(runHeavyPanels\)/);
  assert.match(page, /intelligenceSnapshot = preservedScanResult\.intelligence/);
  assert.doesNotMatch(page, /issueCommandScanResult|normalizeScanFlag|scanRequested/);
  assert.match(page, /scanResultHandle=\{activeScanResultHandle\}/);
  assert.match(page, /let devTeamAttentionLoaded = false/);
  assert.match(page, /devTeamAttentionLoaded = true/);
  assert.match(page, /devTeamAttentionLoaded=\{devTeamAttentionLoaded\}/);

  // The heavy sweep is no longer unconditional — it only runs under
  // runHeavyPanels, and the paused branch swaps in the lightweight placeholder.
  assert.match(page, /if \(runHeavyPanels\) \{[\s\S]*getCachedBusinessIssueRadar\(agency\.id\)/);
  assert.match(page, /buildPausedBusinessRadar\(workspaceSettings\.advisor\.radarPolicy/);
  assert.match(page, /runHeavyPanels[\s\S]*buildCommandIntelligenceSnapshot\([\s\S]*buildPausedIntelligenceSnapshot\(/);

  // The full path remains intact, but both large server graphs are dynamic so
  // the pristine paused landing does not compile them before Run scan.
  assert.match(page, /const radarPromise = import\("@\/engines\/data\/server\/radar\/businessIssueRadar"\)/);
  assert.match(page, /const operationalAlertsPromise = lightweightMode[\s\S]*import\("@\/lib\/server\/inbox\/operationalAlerts"\)/);
  assert.doesNotMatch(page, /^import \{ getCachedBusinessIssueRadar \}/m);
  assert.doesNotMatch(page, /^import \{ buildCommandIntelligenceSnapshot \}/m);
});

test("the Command Centre client executes POST-only and keeps missed results internally paused", () => {
  const client = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  assert.match(client, /scanPaused\?: boolean/);
  assert.match(client, /scanPaused = false/);
  assert.match(client, /data-testid="command-scan-paused"/);
  assert.match(client, /radarSnapshot = scanPaused \? businessRadar : radarSnapshotState/);
  assert.match(client, /intelligenceState = scanPaused \? intelligenceSnapshot : intelligenceSnapshotState/);
  assert.match(client, /displayedRadarIsPaused = scanPaused/);
  assert.match(client, /displayedIntelligenceIsPaused = scanPaused/);
  assert.match(client, /displayedScanIsPaused = displayedRadarIsPaused \|\| displayedIntelligenceIsPaused/);
  assert.match(client, /\{displayedScanIsPaused \? \(/, "a preserved complete scan must not be labelled paused after a lightweight RSC navigation");
  assert.match(client, /reconcileCommandIntelligenceSnapshot\(/);
  assert.match(client, /scanResultHandle\?: string \| null/);
  assert.match(client, /scanResultUnavailable\?: boolean/);
  assert.match(client, /scanResultAccessDenied\?: boolean/);
  assert.match(client, /serverCommandStationHref\(pathname, searchParams\.toString\(\), station, scanResultHandle\)/);
  assert.match(client, /<CommandCentreKpiTrajectory intelligence=\{intelligenceState\}/);
  assert.match(client, /<BattleTableWorkspace payload=\{battleTablePayload\} intelligence=\{intelligenceState\}/);
  assert.match(client, /snapshot=\{intelligenceState\}/);
  assert.match(client, /<DayKpiIntelligencePanel intelligence=\{intelligenceState\}/);
  assert.match(client, /<DayCommandSensorPanel radar=\{radarSnapshot\} intelligence=\{intelligenceState\}/);
  assert.doesNotMatch(client, /intelligence=\{intelligenceSnapshot\}/, "rendered stations must consume the reconciled intelligence evidence");
  assert.match(client, /Run scan/);
  assert.match(client, /fetch\("\/api\/auth\/csrf", \{ cache: "no-store" \}\)/);
  assert.match(client, /fetch\("\/api\/portal\/agency\/command-scan", \{[\s\S]*method: "POST"[\s\S]*"x-csrf-token": csrf\.token/);
  assert.match(client, /startScanNavigation\(\(\) => router\.replace\(href, \{ scroll: false \}\)\)/);
  assert.doesNotMatch(client, /runScanHref|params\.set\("scan", "1"\)|<Link[^>]+Run scan/);

  // The opaque result identity is the only state carried into station links.
  assert.match(client, /params\.delete\("scan"\)/);
  assert.match(client, /params\.set\("scanResult", result\.handle\)/);
  assert.match(client, /serverCommandStationHref\(pathname, searchParams\.toString\(\), station, scanResultHandle\)/);
  assert.doesNotMatch(client, /window\.history\.replaceState\(null,/, "URL rewrites must not erase Next router history state");
});

test("the scan execution route is authenticated POST-only and returns no snapshot body", () => {
  const route = read("src/app/api/portal/agency/command-scan/route.ts");
  const resultStore = read("src/lib/server/commandScanResults.ts");
  const resultAccess = read("src/lib/server/commandScanAccess.ts");
  const postgres = read("src/server/storagePostgres.ts");
  const supabase = read("src/server/storageSupabase.ts");

  assert.match(route, /export async function POST\(request: NextRequest\)/);
  assert.doesNotMatch(route, /export async function GET|export function GET/);
  assert.match(route, /requestIsSameOrigin\(request\)/);
  assert.match(route, /requireCsrf\(request\)/);
  assert.match(route, /getSessionFromRequest\(request\)/);
  assert.match(route, /resolveFreshSessionUser\(session\)/);
  assert.match(route, /isSessionFresh\(session, currentUser\)/);
  assert.match(route, /currentMemberships\.includes\(authorityAgencyId\)/);
  assert.match(route, /AGENCY_ROLES\.includes\(session\.role\)/);
  assert.match(route, /await requireCommandScanIssueAccess\(\)/);
  assert.match(route, /issueCommandScanResult\([\s\S]*commandScanPrincipalForSession\(session, agency\.id, accessActor\.user\)/);
  const issueInput = route.match(/issueCommandScanResult\(\{([\s\S]*?)\n    \}\);/)?.[1] ?? "";
  assert.ok(issueInput, "the route must persist the completed scan result");
  assert.doesNotMatch(issueInput, /\bnow\s*:/, "a pre-compute timestamp shortened the result TTL");
  assert.match(route, /\{ ok: true, handle: result\.handle, expiresAt: result\.expiresAt \}/);
  assert.doesNotMatch(route, /ok: true, radar|ok: true, intelligence|snapshot:/);

  assert.match(resultStore, /backend === "supabase"[\s\S]*loadSidecarBlob/);
  assert.match(resultStore, /backend === "postgres"[\s\S]*loadSidecarBlob/);
  assert.match(resultStore, /backend === "supabase"[\s\S]*saveSidecarBlob/);
  assert.match(resultStore, /backend === "postgres"[\s\S]*saveSidecarBlob/);
  assert.match(postgres, /export async function loadSidecarBlob/);
  assert.match(postgres, /export async function saveSidecarBlob/);
  assert.match(supabase, /export async function loadSidecarBlob/);
  assert.match(supabase, /export async function saveSidecarBlob/);
  assert.match(resultAccess, /gate\("workspace\.overview", "use"\)/);
  assert.match(resultAccess, /gate\("workspace\.overview", "view"\)/);
  assert.match(resultStore, /status: "unavailable"/);
});

test("only the server-backed stations resolve, Battle defers its payload, legacy Executive links survive, and Dev Team stays gated", () => {
  assert.equal(resolveServerCommandStation("executive"), "executive");
  assert.equal(resolveServerCommandStation("battle"), "battle");
  assert.equal(resolveServerCommandStation("omega"), "executive");
  assert.equal(resolveServerCommandStation("calendar"), "calendar");
  assert.equal(resolveServerCommandStation("actions"), "actions");
  assert.equal(resolveServerCommandStation(["advisor", "actions"]), "advisor");
  assert.equal(resolveServerCommandStation("devteam", false), null);
  assert.equal(resolveServerCommandStation("devteam", true), "devteam");
  for (const localStation of [undefined, null, "", "day", "radar", "intelligence"]) {
    assert.equal(resolveServerCommandStation(localStation), null);
  }
});

test("server-station navigation preserves unrelated query parameters", () => {
  const handle = "10000000-0000-4000-8000-000000000001";
  assert.equal(
    serverCommandStationHref("/portal/agency", "scan=1&scope=company%3Aalpha", "advisor"),
    "/portal/agency?scope=company%3Aalpha&station=advisor",
  );
  assert.equal(
    serverCommandStationHref("/portal/agency", "scan=1&station=calendar&scope=ecosystem", "actions"),
    "/portal/agency?station=actions&scope=ecosystem",
  );
  assert.equal(
    serverCommandStationHref("/portal/agency", "scan=1&station=devteam&scope=ecosystem", null),
    "/portal/agency?scope=ecosystem",
  );
  assert.equal(
    serverCommandStationHref("/portal/agency", "scope=company%3Aalpha", "battle", handle),
    `/portal/agency?scope=company%3Aalpha&scanResult=${handle}&station=battle`,
    "a completed result is continued by handle after its one-shot command was stripped",
  );
  assert.doesNotMatch(
    serverCommandStationHref("/portal/agency", "scan=1", "battle", handle),
    /(?:\?|&)scan=1(?:&|$)/,
    "station navigation replayed the heavy scan command",
  );
});

test("server-station transitions select a loading view immediately, coalesce duplicates, and recover on failure", () => {
  const previous = { activeStation: "intelligence" as const, dashboardMode: "intelligence" as const };
  assert.deepEqual(pendingServerStationView("executive"), { activeStation: "executive", dashboardMode: "radar" });
  assert.deepEqual(pendingServerStationView("battle"), { activeStation: "battle", dashboardMode: "battle" });
  assert.deepEqual(pendingServerStationView("devteam"), { activeStation: "devteam", dashboardMode: "radar" });
  assert.deepEqual(pendingServerStationView("calendar"), { activeStation: "day", dashboardMode: "calendar" });
  assert.deepEqual(pendingServerStationView("actions"), { activeStation: "day", dashboardMode: "actions" });
  assert.deepEqual(pendingServerStationView("advisor"), { activeStation: "radar", dashboardMode: "advisor" });

  const pending = beginServerStationNavigation(null, "executive", previous);
  assert.equal(beginServerStationNavigation(pending, "battle", { activeStation: "day", dashboardMode: "day" }), pending, "a second click is coalesced behind the in-flight navigation");
  assert.equal(serverStationSettlementFallback(pending, "executive"), null, "a committed target keeps its new view");
  assert.equal(serverStationSettlementFallback(pending, null), previous, "a failed or rejected navigation restores the previous local view");
});

test("Actions, Calendar, and Advisor use real client-side lazy boundaries", () => {
  const page = read("src/app/portal/agency/page.tsx");
  const actionsPage = read("src/app/portal/agency/actions/_ActionsPage.tsx");
  const actionsBoundary = read("src/app/portal/agency/actions/_LazyActionsWorkspace.tsx");
  const advisorBoundary = read("src/app/portal/agency/assistant/_LazyAssistantWorkspace.tsx");

  // Server code references only the small boundary components. The sizeable
  // clients must not become direct client references in the agency page RSC
  // manifest merely because their server loader was selected conditionally.
  assert.match(page, /import\("\.\/assistant\/_LazyAssistantWorkspace"\)/);
  assert.doesNotMatch(page, /import\("\.\/assistant\/AssistantWorkspace"\)/);
  assert.match(actionsPage, /import \{ LazyActionsWorkspace \} from "\.\/_LazyActionsWorkspace"/);
  assert.doesNotMatch(actionsPage, /import \{ ActionsWorkspace[^\n]*\} from "\.\/_ActionsWorkspace"/);

  assert.match(actionsBoundary, /^"use client";/);
  assert.match(actionsBoundary, /dynamic<ActionsWorkspaceProps>\(\s*\(\) => import\("\.\/_ActionsWorkspace"\)\.then\(module => module\.ActionsWorkspace\)/);
  assert.match(actionsBoundary, /loading: \(\) => <ActionsWorkspaceLoading \/>/);
  assert.equal(actionsBoundary.split("\n").some(line => /^import\s+(?!type\b)/.test(line) && line.includes("./_ActionsWorkspace")), false);

  assert.match(advisorBoundary, /^"use client";/);
  assert.match(advisorBoundary, /dynamic<AssistantWorkspaceProps>\(\s*\(\) => import\("\.\/AssistantWorkspace"\)\.then\(module => module\.AssistantWorkspace\)/);
  assert.match(advisorBoundary, /loading: \(\) => <AssistantWorkspaceLoading \/>/);
  assert.equal(advisorBoundary.split("\n").some(line => /^import\s+(?!type\b)/.test(line) && line.includes("./AssistantWorkspace")), false);
});

test("inactive server station modules and nodes stay off the default render", () => {
  const page = read("src/app/portal/agency/page.tsx");
  const client = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const executive = read("src/app/portal/agency/_ExecutiveCommandWorkspace.tsx");

  // Static imports would compile and initialise every station for the default
  // route even when its React node is null.
  assert.doesNotMatch(page, /^import .*AgencyActionsPage/m);
  assert.doesNotMatch(page, /^import .*AssistantWorkspace/m);
  assert.doesNotMatch(page, /^import .*DevTeamStation/m);
  assert.doesNotMatch(page, /^import .*ExecutiveCommandWorkspace/m);
  assert.doesNotMatch(page, /^import .*DynamicRadarConsole/m);
  assert.doesNotMatch(page, /^import .*NewClientButton/m);
  assert.match(page, /if \(requestedServerStation === "executive"\) \{\s*const \[\{ ExecutiveCommandWorkspace \}, serviceBrands\] = await Promise\.all\(\[\s*import\("\.\/_ExecutiveCommandWorkspace"\)/);
  assert.match(page, /if \(requestedServerStation === "calendar" \|\| requestedServerStation === "actions"\) \{\s*const \{ AgencyActionsPage \} = await import\("\.\/actions\/_ActionsPage"\)/);
  assert.match(page, /else if \(requestedServerStation === "advisor"\) \{[\s\S]*import\("\.\/assistant\/_LazyAssistantWorkspace"\)/);
  assert.match(page, /else if \(requestedServerStation === "devteam"\) \{\s*const \{ DevTeamStation \} = await import\("\.\/_DevTeamStation"\)/);
  for (const workspace of ["calendarWorkspace", "actionsWorkspace", "advisorWorkspace", "devTeamWorkspace", "executiveWorkspace"]) {
    assert.match(page, new RegExp(`let ${workspace}: ReactNode = null`));
    assert.match(page, new RegExp(`${workspace}=\\{${workspace}\\}`));
  }

  // Client state changes only after the query-driven RSC payload arrives. Any
  // action that opens Executive must navigate through that server boundary;
  // local stations can still clear it without fetching the whole page again.
  assert.match(client, /router\.replace\(href, \{ scroll: false \}\)/);
  assert.match(client, /if \(mode === "executive"\) \{\s*navigateServerStation\("executive"\)/);
  assert.match(client, /if \(mode === "battle"\) \{\s*navigateServerStation\("battle"\)/);
  assert.match(client, /<button type="button" onClick=\{\(\) => navigateServerStation\("executive"\)\} disabled=\{serverNavigationBusy\}[^>]*>[\s\S]*Back to Command Centre/, "Back uses the same pending-aware server navigation");
  assert.match(client, /DayCommandSensorPanel[^>]*onOpenRadar=\{\(\) => navigateServerStation\("executive"\)\}/);
  assert.match(client, /if \(mode === "calendar" \|\| mode === "actions" \|\| mode === "advisor"\) \{\s*navigateServerStation\(mode\)/);
  assert.match(client, /if \(mode === "devteam"\) \{\s*if \(devTeamVisible\) navigateServerStation\("devteam"\)/);
  assert.match(client, /window\.history\.replaceState\(window\.history\.state, "", href\)/);
  assert.match(client, /if \(requestedServerStation === "advisor"\) \{\s*setActiveStation\("radar"\);\s*setDashboardMode\("advisor"\)/);
  assert.match(client, /if \(requestedServerStation === "battle"\) \{\s*setActiveStation\("battle"\);\s*setDashboardMode\("battle"\)/);
  assert.match(client, /if \(requestedServerStation === "calendar" \|\| requestedServerStation === "actions"\) \{\s*setActiveStation\("day"\);\s*setDashboardMode\(requestedServerStation\)/);
  assert.match(client, /if \(!requestedServerStation\) \{[\s\S]*serverWorkspaceMissing[\s\S]*setActiveStation\("day"\);[\s\S]*setDashboardMode\("day"\)/, "removing the query cannot strand a preserved client station without its server workspace");
  assert.match(client, /devTeamWorkspace \?\? <StationLoading label="Dev Team" \/>/);
  assert.match(client, /executiveWorkspace \?\? <StationLoading label="Command Centre" \/>/);
  assert.match(client, /calendarWorkspace \?\? <StationLoading label="Command Calendar" \/>/);
  assert.match(client, /advisorWorkspace \?\? <StationLoading label="Aqua Advisor" \/>/);
  assert.match(client, /actionsWorkspace \?\? <StationLoading label="Command Centre Actions" \/>/);
  assert.match(client, /battleTablePayload \? <BattleTableWorkspace/);

  // Every server-backed station gets an immediate optimistic surface, one
  // coalesced transition, disabled controls, and a forced loading boundary.
  assert.match(client, /const \[serverStationTransitionPending, startServerStationTransition\] = useTransition\(\)/);
  assert.match(client, /if \(pendingServerNavigationRef\.current \|\| requestedServerStation === station\) return/);
  assert.match(client, /serverStationSettlementFallback\(pendingServerNavigation, requestedServerStation\)/);
  for (const station of ["executive", "battle", "devteam", "calendar", "actions", "advisor"]) {
    assert.match(client, new RegExp(`pendingServerStation === "${station}"`), `${station} needs an immediate pending surface`);
  }
  const stationNav = read("src/app/portal/agency/_CommandStationNav.tsx");
  assert.match(stationNav, /navigationPending= false|navigationPending = false/);
  assert.match(stationNav, /disabled=\{navigationPending\}/);
  assert.match(stationNav, /Loading station…/);

  // The extracted server station owns the interactive executive-only clients;
  // the default Day Command page no longer serialises or preloads them.
  assert.match(executive, /export function ExecutiveCommandWorkspace/);
  assert.match(executive, /<DynamicRadarConsole/);
  assert.match(executive, /<NewClientButton/);
});

test("the pristine Day server graph excludes Battle and full-scan providers until requested", () => {
  const page = read("src/app/portal/agency/page.tsx");
  const battlePayload = read("src/app/portal/agency/battleTablePayload.server.ts");

  assert.match(page, /const needsBattleData = requestedServerStation === "battle"/);
  assert.match(page, /if \(needsBattleData\) \{\s*const \{ buildBattleTablePayload \} = await import\("\.\/battleTablePayload\.server"\)/);
  assert.match(page, /let battleTablePayload: BattleTablePayload \| null = null/);
  for (const eagerImport of [
    "getRequestCompanyHealth",
    "buildBrandPortfolioSnapshot",
    "listTradingCompanies",
    "listLegalDocuments",
    "listPeopleEmployees",
    "buildHiringCapacitySignals",
  ]) {
    assert.doesNotMatch(page, new RegExp(`^import .*${eagerImport}`, "m"), `${eagerImport} must stay outside pristine Day's eager graph`);
    assert.match(battlePayload, new RegExp(eagerImport), `${eagerImport} remains available inside the requested Battle boundary`);
  }
  assert.match(page, /buildPausedIntelligenceSnapshot\([\s\S]*workspaceSettings\.defaultCurrency/);
});

test("optional client chunks stay behind explicit station or disclosure boundaries", () => {
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const battle = read("src/app/portal/agency/_BattleTableWorkspace.tsx");
  const intelligence = read("src/app/portal/agency/_CommandIntelligenceWorkspace.tsx");

  for (const moduleName of [
    "_ClockOutReviewDialog",
    "_CommandCentreKpiTrajectory",
    "_RadarPolicyPanel",
    "_InfraHealthPanel",
    "_FindingGroupBar",
    "_WeeklyReviewWorkspace",
  ]) {
    assert.doesNotMatch(dashboard, new RegExp(`^import \\{[^\\n]*\\} from "\\./${moduleName}"`, "m"));
    assert.match(dashboard, new RegExp(`import\\("\\./${moduleName}"\\)`));
  }

  for (const moduleName of ["_CommandIntelligenceWorkspace", "_CapitalOwnershipWorkspace", "_QuarterlyStrategyReview"]) {
    assert.doesNotMatch(battle, new RegExp(`^import \\{[^\\n]*\\} from "\\./${moduleName}"`, "m"));
    assert.match(battle, new RegExp(`import\\("\\./${moduleName}"\\)`));
  }
  assert.match(battle, /import \{ applyIntelligenceScope \} from "\.\/commandIntelligenceScope"/);
  assert.match(intelligence, /import\("\.\/_CommercialIntelligenceWorkspace"\)/);

  const defaultDeferredBytes = [
    "src/app/portal/agency/_ClockOutReviewDialog.tsx",
    "src/app/portal/agency/_CommandCentreKpiTrajectory.tsx",
    "src/app/portal/agency/_RadarPolicyPanel.tsx",
    "src/app/portal/agency/_InfraHealthPanel.tsx",
    "src/app/portal/agency/_FindingGroupBar.tsx",
    "src/app/portal/agency/_WeeklyReviewWorkspace.tsx",
  ].reduce((sum, file) => sum + statSync(file).size, 0);
  assert.ok(defaultDeferredBytes > 60_000, `expected a material default split; deferred ${defaultDeferredBytes} source bytes`);
  const dashboardInitialSourceBytes = statSync("src/app/portal/agency/_DashboardCommandCenter.tsx").size;
  assert.ok(dashboardInitialSourceBytes < 220_000, `Day Command source budget exceeded: ${dashboardInitialSourceBytes} bytes`);

  const battleDrillInBytes = [
    "src/app/portal/agency/_CommandIntelligenceWorkspace.tsx",
    "src/app/portal/agency/_CapitalOwnershipWorkspace.tsx",
    "src/app/portal/agency/_QuarterlyStrategyReview.tsx",
  ].reduce((sum, file) => sum + statSync(file).size, 0);
  assert.ok(battleDrillInBytes > 180_000, `expected a material Battle drill-in split; deferred ${battleDrillInBytes} source bytes`);

  const stationSourceBudgets = [
    ["Battle", "src/app/portal/agency/_BattleTableWorkspace.tsx", 110_000],
    ["Intelligence", "src/app/portal/agency/_CommandIntelligenceWorkspace.tsx", 140_000],
    ["Radar inspector", "src/app/portal/agency/radar/RadarInspectionWorkspace.tsx", 110_000],
  ] as const;
  for (const [label, file, budget] of stationSourceBudgets) {
    const bytes = statSync(file).size;
    assert.ok(bytes < budget, `${label} first-open source budget exceeded: ${bytes}/${budget} bytes`);
  }
});
