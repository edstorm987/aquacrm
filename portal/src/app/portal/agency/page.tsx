// Ed's home — /portal/agency.
//
// T1 R034 — Pipelines hub. The single "Clients grid" retired; this page
// now lists every pipeline (fulfilment / leads / sales / custom) as a
// clickable card. Each card → /portal/agency/pipelines/<slug>. Default
// landing for the foundation team is fulfilment; the kanban plugin
// (T2 R+1) renders the actual board behind each pipeline.
//
// Why a hub instead of redirect: Ed wants the dashboard tiles + activity
// feed + KPIs visible above the pipelines so the agency owner gets a
// glance at status before diving into a board.

import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES, type ServerUser } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import { listPipelines, pipelineCardCounts, seedDefaultPipelines } from "@/server/pipelines";
import { getUser } from "@/server/users";
import { listAgencyTasks } from "@/server/tasks";
import { agencyProductsForRead, listAgencyProducts } from "@/server/agencyProducts";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { INTERNAL_WORKSPACE_NAME } from "@/lib/shared/internalWorkspace";
import { dashboardPlanningSnapshot, type DashboardPlanningSnapshot } from "@/server/dashboardPlanning";
import { assistantModel, isAssistantConfigured } from "@/lib/server/assistants/openaiAssistant";
import { DashboardCommandCenter, type DashboardSignal } from "./_DashboardCommandCenter";
import { inspectRadarEvidence } from "@/engines/data/server/radar/radarEvidenceVault";
import type { OperationalAlert } from "@/lib/server/inbox/operationalAlerts";
import { performanceModePreference } from "@/lib/server/performanceMode";
import { commandScanLoadPlan, buildPausedBusinessRadar, buildPausedIntelligenceSnapshot } from "./commandPerformance";
import { buildBusinessRecommendedActions } from "@/lib/intelligence/businessRecommendedActions";
import type { BusinessIssueRadar } from "@/engines/data/radar/businessRadar";
import type { BrandPortfolioSnapshot } from "@/lib/brands/brandPortfolio";
import type { CommandIntelligenceSnapshot } from "@/lib/intelligence/commandIntelligence";
import { listCommandCalendarEntries } from "@/server/commandCalendar";
import { getCommandCalendarIntegrationSnapshot } from "@/lib/server/integrations/googleCalendar";
import { listClientsNeedingAttention } from "@/lib/server/clients/clientAttention";
import type { BattleTablePayload } from "./_BattleTableWorkspace";
import { devTeamAccessible } from "@/lib/server/dev/devTeamAccess";
import { resolveServerCommandStation } from "./commandStationRouting";
import { PortalViewportLoading } from "@/components/ui/PortalViewportLoading";
import {
  assistantBusinessContextForActor,
  assistantWorkspaceForActor,
} from "@/lib/server/assistants/assistantContextScope";
import { PersonalRadarPanel } from "@/components/intelligence/PersonalRadarPanel";
import { readPersonalRadar } from "@/lib/server/intelligence/myRadar";
import { readPersonalRadarActions } from "@/lib/server/intelligence/personalRadarActions";
import {
  resolveBusinessRadarAccessForActor,
  resolveBusinessRadarCapabilityForActor,
  resolvePersonalCommandAccessForActor,
  resolvePersonalRadarAccessForActor,
} from "@/lib/server/intelligence/personalRadarAccess";
import { personalRadarHeadline } from "@/lib/intelligence/personalRadar";
import {
  resolveActorWorkspaceElementAccess,
  workspaceElementAtLeast,
  workspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";
import {
  actorHasActiveNonProjectAccessPolicy,
  requireCurrentAccessActor,
  resolveActorAccess,
} from "@/server/accessControl";
import { canReadClientAssociation } from "@/lib/server/access/clientAssociationElement";
import {
  commandScanPrincipalForSession,
  normalizeCommandScanResultHandle,
  readCommandScanResultOutcome,
} from "@/lib/server/commandScanResults";
import { requireCommandScanReadAccess } from "@/lib/server/commandScanAccess";

// Fallback for the requested secondary station. The server imports and builds
// only the workspace named by `?station=`; Suspense then lets the surrounding
// Command Centre stream while that one requested data pipeline resolves.
function StationStreaming({ label }: { label: string }) {
  return <PortalViewportLoading label={`Preparing ${label}…`} />;
}

function emptyDashboardPlanningSnapshot(now: number): DashboardPlanningSnapshot {
  const date = new Date(now);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  const today = local.toISOString().slice(0, 10);
  const monday = new Date(`${today}T12:00:00`);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekStart = new Date(monday.getTime() - monday.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return { today, weekStart, weekPlan: null, dayPlan: null, weekPlans: [], sessions: [], activeSession: null };
}

export default async function AgencyHome({ searchParams }: { searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const actor = await requireCurrentAccessActor();
  const agency = getAgency(actor.resourceAgencyId);
  if (!agency) redirect("/login");
  const agencyAccess = resolveActorAccess(actor, { kind: "agency", id: actor.resourceAgencyId });
  const businessOverviewAvailable = await resolveBusinessRadarAccessForActor(actor);
  // Command Centre and Business Radar are organisation surfaces. A manager
  // whose canonical role hides Business Overview keeps their personal Radar,
  // but the business payload never crosses this RSC boundary. Unmigrated
  // managers retain the app's documented legacy access.
  if (!businessOverviewAvailable) redirect("/portal/agency/my-radar");
  const staffAccess = resolveActorWorkspaceElementAccess(actor, "staff");
  const growthAccess = resolveActorWorkspaceElementAccess(actor, "growth");
  const fulfilmentAccess = resolveActorWorkspaceElementAccess(actor, "fulfilment");
  const fullyUnmigratedManager = session.role === "agency-manager"
    && !actorHasActiveNonProjectAccessPolicy(actor);
  const hasAgencyView = (element: string) => agencyAccess.ownerBaseline
    || agencyAccess.capabilities.includes(`element.${element}.view` as never)
    || fullyUnmigratedManager;
  const actionsLevel = workspaceElementLevel(staffAccess, "workspace.actions");
  const actionsAvailable = workspaceElementAtLeast(actionsLevel, "view");
  const actionsWritable = workspaceElementAtLeast(actionsLevel, "use");
  const personalCommandAccess = await resolvePersonalCommandAccessForActor(actor);
  const personalOverviewAvailable = personalCommandAccess.available;
  const leadsAvailable = workspaceElementAtLeast(workspaceElementLevel(growthAccess, "growth.leads"), "view");
  const fulfilmentAvailable = workspaceElementAtLeast(workspaceElementLevel(fulfilmentAccess, "fulfilment.projects"), "view")
    || workspaceElementAtLeast(workspaceElementLevel(fulfilmentAccess, "fulfilment.services"), "view");
  const inboxAvailable = hasAgencyView("workspace.inbox");
  const clientsAvailable = hasAgencyView("client.overview");
  const productsAvailable = hasAgencyView("client.commercial");
  const personalCalendarAccess = await resolvePersonalRadarAccessForActor(actor);
  const resolvedSearchParams = await searchParams;
  const devTeamVisible = devTeamAccessible(session);
  const requestedServerStation = resolveServerCommandStation(resolvedSearchParams?.station, devTeamVisible);
  // Performance mode (server-read cookie): keep the two heaviest *repeated*
  // costs off the landing critical path. The operational-alerts sweep (a live
  // Supabase fetch) is skipped, and the dev-team board disk scan that feeds the
  // station badge is not run here — the station still scans itself when opened.
  const perfMode = await performanceModePreference();
  const lightweightMode = perfMode || Boolean(session.publicShowcase);
  // The Command Centre skips the operational-alert sweep for its own speed. Warm
  // it in the background (fire-and-forget) so the next page that DOES need it
  // (inbox, clients, actions) hits a ready cache instead of computing inline.
  if (lightweightMode && !session.publicShowcase) {
    void import("@/lib/server/inbox/operationalAlerts")
      .then(({ prewarmOperationalAlerts }) => prewarmOperationalAlerts(agency.id))
      .catch(() => undefined);
  }
  const canManageWorkspace = workspaceElementAtLeast(workspaceElementLevel(staffAccess, "workspace.settings"), "manage");
  const canRunRadarScan = await resolveBusinessRadarCapabilityForActor(actor, "use");
  let canManageBusinessWorkload = false;
  if (canManageWorkspace) {
    canManageBusinessWorkload = businessOverviewAvailable;
  }
  const workspaceName = session.publicShowcase ? agency.name : INTERNAL_WORKSPACE_NAME;
  // GET renders may reuse a completed result but can never execute a scan.
  // The expensive graph is triggered only by the authenticated POST route.
  const canReuseScanResult = !session.publicShowcase;
  const rawScanResultHandle = resolvedSearchParams?.scanResult;
  const scanResultWasRequested = Array.isArray(rawScanResultHandle)
    ? rawScanResultHandle.some(value => value.trim().length > 0)
    : Boolean(rawScanResultHandle?.trim());
  const requestedScanResultHandle = normalizeCommandScanResultHandle(resolvedSearchParams?.scanResult);
  let scanAuthorityUser: ServerUser | null = null;
  let scanResultAccessDenied = false;
  if (canReuseScanResult && requestedScanResultHandle) {
    try {
      // A handle is continuation state, not an authority token. Resolve the
      // current access kernel before reading any snapshot bytes.
      scanAuthorityUser = (await requireCommandScanReadAccess()).user;
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status)
        : 0;
      if (status !== 403) throw error;
      scanResultAccessDenied = true;
    }
  }
  const scanPrincipal = scanAuthorityUser
    ? commandScanPrincipalForSession(session, agency.id, scanAuthorityUser)
    : null;
  // A result handle is continuation state, never permission to rerun. Any
  // invalid, expired, cross-realm, or revision-mismatched result produces the
  // honest paused view even when Performance mode is disabled.
  const scanResultRead = canReuseScanResult && requestedScanResultHandle && scanPrincipal
    ? await readCommandScanResultOutcome({
        handle: requestedScanResultHandle,
        principal: scanPrincipal,
      })
    : null;
  const preservedScanResult = scanResultRead?.status === "found"
    ? scanResultRead.result
    : null;
  const scanResultUnavailable = scanResultRead?.status === "unavailable";
  const requestedScanResultMissing = canReuseScanResult
    && scanResultWasRequested
    && !preservedScanResult;
  const { runHeavyPanels, scanPaused } = commandScanLoadPlan(
    lightweightMode,
    Boolean(preservedScanResult),
    requestedScanResultMissing,
  );
  const canReadClient = (clientId?: string) => session.role === "agency-owner"
    || canReadClientAssociation(actor, "agency-task", clientId);
  const clients = clientsAvailable
    ? listClients(agency.id).filter(client => canReadClient(client.id))
    : [];
  const tasks = actionsAvailable
    ? listAgencyTasks(agency.id).filter(task => canReadClient(task.clientId))
    : [];
  if (productsAvailable && !session.publicShowcase) agencyProductsForRead(agency.id);
  const products = productsAvailable ? listAgencyProducts(agency.id) : [];
  const needsExecutiveData = requestedServerStation === "executive";
  const needsBattleData = requestedServerStation === "battle";
  const serviceBrandsPromise = needsExecutiveData
    ? import("@/server/tradingCompanies").then(({ listTradingCompanies }) => listTradingCompanies(agency.id).filter(company => company.status !== "archived"))
    : Promise.resolve([]);
  const workspaceSettings = getAgencyWorkspaceSettings(agency.id);
  const recommendationTime = Date.now();
  const needsBrandPortfolio = runHeavyPanels || needsExecutiveData;
  const brandPortfolioPromise = needsBrandPortfolio
    ? import("@/lib/server/brandPortfolioService").then(({ buildBrandPortfolioSnapshot }) => buildBrandPortfolioSnapshot(agency.id, recommendationTime))
    : Promise.resolve(null);
  let businessRadar: BusinessIssueRadar;
  let operationalAlerts: OperationalAlert[];
  let brandPortfolio: BrandPortfolioSnapshot | null;
  let clientsNeedingAttention: Awaited<ReturnType<typeof listClientsNeedingAttention>>;
  if (preservedScanResult) {
    [operationalAlerts, brandPortfolio, clientsNeedingAttention] = await Promise.all([
      Promise.resolve<OperationalAlert[]>([]),
      brandPortfolioPromise,
      clientsAvailable ? listClientsNeedingAttention(agency.id, recommendationTime, { operationalAlerts: [] }) : Promise.resolve([]),
    ]);
    businessRadar = preservedScanResult.radar;
  } else if (runHeavyPanels) {
    const radarPromise = import("@/engines/data/server/radar/businessIssueRadar")
      .then(({ getCachedBusinessIssueRadar }) => getCachedBusinessIssueRadar(agency.id));
    const operationalAlertsPromise = lightweightMode || !inboxAvailable
      ? Promise.resolve<OperationalAlert[]>([])
      : import("@/lib/server/inbox/operationalAlerts")
          .then(({ getRequestOperationalAlerts }) => getRequestOperationalAlerts(agency.id));
    [businessRadar, operationalAlerts, brandPortfolio, clientsNeedingAttention] = await Promise.all([
      radarPromise,
      operationalAlertsPromise,
      brandPortfolioPromise,
      clientsAvailable ? listClientsNeedingAttention(agency.id, recommendationTime) : Promise.resolve([]),
    ]);
  } else {
    // Paused: skip the full business-issue sweep. The brand portfolio is only
    // loaded for a station that needs it; client attention remains because it
    // is visible on Day Command. The radar itself is an honest placeholder.
    [operationalAlerts, brandPortfolio, clientsNeedingAttention] = await Promise.all([
      Promise.resolve<OperationalAlert[]>([]),
      brandPortfolioPromise,
      clientsAvailable ? listClientsNeedingAttention(agency.id, recommendationTime, { operationalAlerts: [] }) : Promise.resolve([]),
    ]);
    businessRadar = buildPausedBusinessRadar(workspaceSettings.advisor.radarPolicy, recommendationTime);
  }
  const radarEvidence = inspectRadarEvidence(agency.id);
  let intelligenceSnapshot: CommandIntelligenceSnapshot;
  if (preservedScanResult) {
    intelligenceSnapshot = preservedScanResult.intelligence;
  } else if (runHeavyPanels) {
    intelligenceSnapshot = await import("@/lib/server/commandIntelligenceService")
      .then(({ buildCommandIntelligenceSnapshot }) => buildCommandIntelligenceSnapshot({
        agencyId: agency.id,
        radar: businessRadar,
        evidence: radarEvidence,
        now: recommendationTime,
        brandPortfolio: brandPortfolio!,
      }));
  } else {
    intelligenceSnapshot = buildPausedIntelligenceSnapshot(
      workspaceSettings.defaultCurrency,
      recommendationTime,
    );
  }
  const activeScanResultHandle = preservedScanResult?.handle ?? null;
  const calendarIntegration = personalCalendarAccess.goalsAvailable
    ? getCommandCalendarIntegrationSnapshot(agency.id, session.userId)
    : { configured: false, connections: [], sources: [], events: [], generatedAt: recommendationTime };

  // Idempotent self-heal for agencies that pre-date the R034 seed in
  // `bootstrapAgency` — now guarded by a pure READ so a fully-provisioned
  // agency's dashboard render never enters mutate(). The unguarded call wrote a
  // datastore patch (×3 default kinds) on every /portal/agency render, feeding
  // the single-row write convoy that made deployed pages time out.
  let pipelines = listPipelines(agency.id);
  if (!(["fulfilment", "leads", "sales"] as const).every(kind => pipelines.some(p => p.kind === kind))) {
    seedDefaultPipelines(agency.id);
    pipelines = listPipelines(agency.id);
  }
  const counts = pipelineCardCounts(agency.id);
  const leadsPipeline = pipelines.find(p => p.kind === "leads" || p.slug === "leads");
  const leadsCardCount = leadsAvailable && leadsPipeline ? counts[leadsPipeline.id] ?? 0 : 0;
  const fulfilmentPipeline = pipelines.find(p => p.kind === "fulfilment" || p.slug === "fulfilment");
  const fulfilmentCardCount = fulfilmentAvailable && fulfilmentPipeline ? counts[fulfilmentPipeline.id] ?? 0 : 0;
  const activeClients = clients.filter(c => c.stage !== "churned");
  const staleClients = clients.filter(c => {
    const m = (c.metadata ?? {}) as { lastContactedAt?: number };
    if (!m.lastContactedAt) return true;
    return Date.now() - m.lastContactedAt > 7 * 24 * 60 * 60 * 1000;
  });
  const dashboardSignals = buildDashboardSignals({
    clients,
    staleClients,
    leadsCardCount,
    fulfilmentCardCount,
    productCount: products.length,
  });

  const account = getUser(session.email);
  const firstName = account?.name?.trim().split(/\s+/)[0] ?? (session.email.split("@")[0] || "there").replace(/[^a-z]/gi, "");
  const greet = firstName ? firstName[0]!.toUpperCase() + firstName.slice(1) : "there";
  const openTaskCount = tasks.filter(task => task.status !== "done").length;
  const advisorConfigured = isAssistantConfigured(agency.id);
  // Founder-only Dev Team access. Decided server-side so the Dev Team station node is
  // never constructed — and never streamed — for anybody else.
  // The station's badge must tell the truth AND agree with the station itself,
  // so it is computed from the SAME model the station renders: `composeLanes`
  // over the live board. The badge counts the Blocked lane (what the station's
  // "Blocked" tile shows) and carries the open-launch-blocker subset with it so
  // the label can break the number down instead of asserting a bare count.
  // Only for a founder — nobody else sees the station.
  let devTeamBlockedCount = 0;
  let devTeamLaunchBlockerCount = 0;
  let devTeamAttentionLoaded = false;
  if (devTeamVisible && !lightweightMode) {
    const { composeLanes, scanDevTeamBoard } = await import("@/lib/server/dev/devTeamBoard");
    const devTeamLanes = composeLanes(await scanDevTeamBoard());
    devTeamBlockedCount = devTeamLanes.blocked.length;
    devTeamLaunchBlockerCount = devTeamLanes.blocked.filter(item => item.kind === "blocker").length;
    devTeamAttentionLoaded = true;
  }
  let calendarWorkspace: ReactNode = null;
  let actionsWorkspace: ReactNode = null;
  let advisorWorkspace: ReactNode = null;
  let devTeamWorkspace: ReactNode = null;
  let executiveWorkspace: ReactNode = null;

  // These workspaces each carry their own data pipeline. Import and construct
  // exactly the one named by the request; the canonical Day surface never
  // loads an inactive station module or executes its server work.
  if (requestedServerStation === "executive") {
    const [{ ExecutiveCommandWorkspace }, serviceBrands] = await Promise.all([
      import("./_ExecutiveCommandWorkspace"),
      serviceBrandsPromise,
    ]);
    executiveWorkspace = (
      <Suspense key="executive-workspace" fallback={<StationStreaming label="Command Centre" />}>
        <ExecutiveCommandWorkspace
          agencyId={agency.id}
          workspaceName={workspaceName}
          greet={greet}
          publicShowcase={Boolean(session.publicShowcase)}
          businessRadar={businessRadar}
          brandPortfolio={brandPortfolio!}
          openTaskCount={openTaskCount}
          activeClientCount={activeClients.length}
          workspaceSettings={workspaceSettings}
          serviceBrands={serviceBrands}
          products={products}
        />
      </Suspense>
    );
  } else if (requestedServerStation === "calendar" || requestedServerStation === "actions") {
    const { AgencyActionsPage } = await import("./actions/_ActionsPage");
    const calendar = requestedServerStation === "calendar";
    const workspace = (
      <Suspense key={`${requestedServerStation}-workspace-boundary`} fallback={<StationStreaming label={calendar ? "Command Calendar" : "Command Centre Actions"} />}>
        <AgencyActionsPage
          key={`${requestedServerStation}-workspace`}
          initialView={calendar ? "calendar" : "list"}
          heading={calendar ? "Command Calendar" : "Command Centre Actions"}
          description={calendar
            ? "Dated work, meetings, reminders and business deadlines in the same Command Centre viewport."
            : "Radar, Advisor, manual and CRM work in one controlled queue. Approve suggested work before it enters your committed list."}
        />
      </Suspense>
    );
    if (calendar) calendarWorkspace = workspace;
    else actionsWorkspace = workspace;
  } else if (requestedServerStation === "advisor") {
    const [
      { LazyAssistantWorkspace },
      { radarDigest },
    ] = await Promise.all([
      import("./assistant/_LazyAssistantWorkspace"),
      import("@/engines/data/radar/businessRadar"),
    ]);
    const [assistantContext, initialWorkspace] = await Promise.all([
      assistantBusinessContextForActor(actor),
      assistantWorkspaceForActor(actor),
    ]);
    advisorWorkspace = (
      <Suspense key="advisor-workspace-boundary" fallback={<StationStreaming label="Aqua Advisor" />}>
        <LazyAssistantWorkspace
          key="advisor-workspace"
          initialWorkspace={initialWorkspace}
          configured={advisorConfigured}
          model={assistantModel(agency.id)}
          userName={account?.name || session.email}
          coverage={{
            clients: assistantContext.summary.clients.length,
            team: assistantContext.summary.team.length,
            pipelines: assistantContext.summary.pipelines.length,
            recentActivity: assistantContext.summary.recentActivity.length,
            modules: Object.keys(assistantContext.summary.businessModules),
            radar: radarDigest(businessRadar),
          }}
        />
      </Suspense>
    );
  } else if (requestedServerStation === "devteam") {
    const { DevTeamStation } = await import("./_DevTeamStation");
    devTeamWorkspace = (
      <Suspense key="dev-team-workspace-boundary" fallback={<StationStreaming label="Dev Team" />}>
        <DevTeamStation key="dev-team-workspace" />
      </Suspense>
    );
  }
  let battleTablePayload: BattleTablePayload | null = null;
  if (needsBattleData) {
    const { buildBattleTablePayload } = await import("./battleTablePayload.server");
    battleTablePayload = await buildBattleTablePayload({
      agencyId: agency.id,
      companyName: workspaceName,
      tasks,
      productCount: products.length,
      businessRadar,
      canEdit: canManageWorkspace,
      now: recommendationTime,
    });
  }

  // Personal command sits above the company stations. It remains user-scoped
  // even for the agency owner; the Business Radar below is the organisation's
  // health system. Keeping the two projections separate prevents a role name
  // from silently changing what "My" means.
  const personalRadarNow = Date.now();
  const personalRadarBlock = personalOverviewAvailable ? await (async () => {
    const { goalsAvailable, goalsWritable } = personalCalendarAccess;
    const reading = await readPersonalRadar({
      agencyId: agency.id,
      userId: session.userId,
      now: personalRadarNow,
      includeGoals: goalsAvailable,
      goalsWritable,
    });
    const actions = await readPersonalRadarActions(session, personalRadarNow, actor);
    return { reading, ...actions };
  })() : null;
  const planning = personalOverviewAvailable
    ? dashboardPlanningSnapshot(agency.id, session.userId)
    : emptyDashboardPlanningSnapshot(personalRadarNow);

  return (
    <div className="mm-command-center-workspace mx-auto flex w-full max-w-[1600px] flex-col gap-5 pb-6" data-testid="agency-pipelines-hub">
      {personalRadarBlock ? <PersonalRadarPanel
        variant="dashboard"
        reading={personalRadarBlock.reading}
        actions={personalRadarBlock.actions}
        actionSummary={personalRadarBlock.actionSummary}
        actionsAvailable={personalRadarBlock.available}
        headline={personalRadarHeadline(personalRadarBlock.reading, personalRadarBlock.actions, personalRadarNow, personalRadarBlock.actionSummary)}
      /> : null}
      <DashboardCommandCenter
        canUsePersonalCommand={personalCommandAccess.writable}
        canRunRadarScan={canRunRadarScan}
        canManageRadarPolicy={canManageWorkspace}
        canCreateRadarActions={actionsWritable}
        canManageBusinessWorkload={canManageBusinessWorkload}
        scanPaused={scanPaused}
        scanResultHandle={activeScanResultHandle}
        scanResultUnavailable={scanResultUnavailable}
        scanResultAccessDenied={scanResultAccessDenied}
        planning={planning}
        tasks={tasks}
        calendarEntries={personalCalendarAccess.goalsAvailable ? listCommandCalendarEntries(agency.id, session.userId) : []}
        externalCalendarEvents={calendarIntegration.events.filter(event => calendarIntegration.sources.some(source => source.id === event.sourceId && source.selected))}
        externalCalendarSources={calendarIntegration.sources}
        signals={dashboardSignals}
        businessRadar={businessRadar}
        radarEvidence={radarEvidence}
        recommendedActions={buildBusinessRecommendedActions({
          radar: businessRadar,
          alerts: operationalAlerts,
          existingTaskTitles: tasks.filter(task => task.status !== "done").map(task => task.title),
          now: recommendationTime,
          limit: 5,
        })}
        advisorConfigured={advisorConfigured}
        counts={{
          activeClients: activeClients.length,
          leads: leadsCardCount,
          delivery: fulfilmentCardCount,
          products: products.length,
        }}
        intelligenceSnapshot={intelligenceSnapshot}
        clientsNeedingAttention={clientsNeedingAttention}
        battleTablePayload={battleTablePayload}
        executiveWorkspace={executiveWorkspace}
        calendarWorkspace={calendarWorkspace}
        actionsWorkspace={actionsWorkspace}
        advisorWorkspace={advisorWorkspace}
        devTeamVisible={devTeamVisible}
        devTeamBlockedCount={devTeamBlockedCount}
        devTeamLaunchBlockerCount={devTeamLaunchBlockerCount}
        devTeamAttentionLoaded={devTeamAttentionLoaded}
        devTeamWorkspace={devTeamWorkspace}
      />
    </div>
  );
}

function buildDashboardSignals({
  clients,
  staleClients,
  leadsCardCount,
  fulfilmentCardCount,
  productCount,
}: {
  clients: ReturnType<typeof listClients>;
  staleClients: ReturnType<typeof listClients>;
  leadsCardCount: number;
  fulfilmentCardCount: number;
  productCount: number;
}): DashboardSignal[] {
  const signals: DashboardSignal[] = [];
  if (leadsCardCount > 0) {
    signals.push({
      id: "sales:leads",
      title: "Clear the lead pipeline",
      detail: `${leadsCardCount} lead${leadsCardCount === 1 ? "" : "s"} need a next step, follow-up, quote, or meeting decision.`,
      href: "/portal/agency/pipelines/leads",
      kind: "Sales",
      priority: "high",
    });
  }
  if (fulfilmentCardCount > 0) {
    signals.push({
      id: "delivery:fulfilment",
      title: "Move fulfilment forward",
      detail: `${fulfilmentCardCount} delivery item${fulfilmentCardCount === 1 ? "" : "s"} are active. Pick the blocker and move it today.`,
      href: "/portal/agency/fulfilment",
      kind: "Delivery",
      priority: "high",
    });
  }
  for (const client of staleClients.slice(0, 3)) {
    signals.push({
      id: `client:${client.id}:health`,
      title: `Check in with ${client.name}`,
      detail: "Client health needs a touchpoint. Log the note, next decision, or risk after contact.",
      href: `/portal/clients/${client.id}`,
      kind: "Client health",
      priority: "urgent",
    });
  }
  if (clients.length > 0 && productCount === 0) {
    signals.push({
      id: "offers:products",
      title: "Define the sellable offers",
      detail: "Products are still empty, so projections and delivery planning have weak inputs.",
      href: "/portal/agency/fulfilment?view=services",
      kind: "Company",
      priority: "high",
    });
  }
  if (signals.length === 0) {
    signals.push({
      id: "growth:marketing",
      title: "Create one growth asset",
      detail: "Build a campaign step, social post, Google Business update, or funnel page that can create demand.",
      href: "/portal/agency/marketing",
      kind: "Growth",
      priority: "normal",
    });
  }
  return signals;
}
