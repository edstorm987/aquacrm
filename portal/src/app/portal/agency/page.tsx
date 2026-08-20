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

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Activity, AlertTriangle, Anchor, Compass, Database, Gauge, NotebookPen, RadioTower, ShieldCheck, Target } from "lucide-react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import { listPipelines, pipelineCardCounts, seedDefaultPipelines } from "@/server/pipelines";
import { NewClientButton } from "./_NewClientButton";
import { getUser } from "@/server/users";
import { listAgencyTasks } from "@/server/tasks";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { INTERNAL_WORKSPACE_NAME } from "@/lib/shared/internalWorkspace";
import { dashboardPlanningSnapshot } from "@/server/dashboardPlanning";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import { assistantModel, isAssistantConfigured } from "@/lib/server/assistants/openaiAssistant";
import { DashboardCommandCenter, type DashboardSignal } from "./_DashboardCommandCenter";
import { CommandDeckPopup, type CommandDeckInspectorTarget, type CommandDeckPopupRow } from "./_CommandDeckPopup";
import { DynamicRadarConsole, type DynamicRadarStatus } from "./_DynamicRadarConsole";
import { getCachedBusinessIssueRadar } from "@/lib/server/radar/businessIssueRadar";
import { inspectRadarEvidence } from "@/lib/server/radar/radarEvidenceVault";
import { getRequestOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import type { OperationalAlert } from "@/lib/server/inbox/operationalAlerts";
import { performanceModePreference } from "@/lib/server/performanceMode";
import { shouldRunHeavyPanels, normalizeScanFlag, buildPausedBusinessRadar, buildPausedIntelligenceSnapshot } from "./commandPerformance";
import { buildBusinessRecommendedActions } from "@/lib/intelligence/businessRecommendedActions";
import { AgencyActionsPage } from "./actions/_ActionsPage";
import { AssistantWorkspace } from "./assistant/AssistantWorkspace";
import { buildAssistantBusinessContext } from "@/lib/server/assistants/assistantBusinessContext";
import { getAssistantWorkspace } from "@/lib/server/assistants/assistantStore";
import { radarDigest } from "@/lib/radar/businessRadar";
import type { BusinessIssueRadar } from "@/lib/radar/businessRadar";
import { buildCommandIntelligenceSnapshot } from "@/lib/server/commandIntelligenceService";
import { getRequestCompanyHealth } from "@/lib/server/kpi/companyHealthSnapshot";
import { listLegalDocuments } from "@/server/legalDocuments";
import { listUsersForAgency } from "@/server/users";
import { listCommandCalendarEntries } from "@/server/commandCalendar";
import { getCommandCalendarIntegrationSnapshot } from "@/lib/server/integrations/googleCalendar";
import { buildBrandPortfolioSnapshot } from "@/lib/server/brandPortfolioService";
import { listClientsNeedingAttention } from "@/lib/server/clients/clientAttention";
import { getCompanyProfile } from "@/server/company";
import { calculateCompanyHealth } from "@/lib/performance/companyHealth";
import type { CompanyHealthActuals } from "@/lib/server/kpi/companyHealthSnapshot";
import type { BrandPortfolioRow } from "@/lib/brands/brandPortfolio";
import type { BattleTableScopePayload } from "./_BattleTableWorkspace";
import { BrandPortfolioInstrument } from "./_BrandPortfolioInstrument";
import { buildHiringCapacitySignals } from "@/lib/performance/hiringCapacity";
import { listPeopleEmployees } from "@/server/people";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { composeLanes, scanDevTeamBoard } from "@/lib/server/dev/devTeamBoard";
import { DevTeamStation } from "./_DevTeamStation";

// Fallback for the streamed secondary stations. Each of those workspaces
// renders only after an explicit station click, but as bare awaited children
// they blocked the whole page's first paint — the Day Command board (the
// default landing) had to wait on two full AgencyActionsPage data pipelines
// plus the advisor context. Wrapping them in <Suspense> lets the shell + Day
// board flush immediately while these resolve behind. Identical output; they
// are simply no longer on the critical path.
function StationStreaming({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid min-h-[24rem] place-items-center text-sm text-[#62e8ff]/60"
    >
      Loading {label}…
    </div>
  );
}

export default async function AgencyHome({ searchParams }: { searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");
  // Performance mode (server-read cookie): keep the two heaviest *repeated*
  // costs off the landing critical path. The operational-alerts sweep (a live
  // Supabase fetch) is skipped, and the dev-team board disk scan that feeds the
  // station badge is not run here — the station still scans itself when opened.
  const perfMode = await performanceModePreference();
  // One automatic build at launch OR on a button: under Performance mode the
  // two heaviest panels (radar + KPI intelligence) are paused and served on
  // demand via a one-shot `?scan=1` render ("Run scan"). With Performance mode
  // OFF (default) `runHeavyPanels` is always true and the code path below is
  // byte-for-byte unchanged.
  const scanRequested = normalizeScanFlag((await searchParams)?.scan);
  const runHeavyPanels = shouldRunHeavyPanels(perfMode, scanRequested);
  const scanPaused = !runHeavyPanels;
  const clients = listClients(agency.id);
  const tasks = listAgencyTasks(agency.id);
  ensureDefaultAgencyProducts(agency.id);
  const products = listAgencyProducts(agency.id);
  const serviceBrands = listTradingCompanies(agency.id).filter(company => company.status !== "archived");
  const workspaceSettings = getAgencyWorkspaceSettings(agency.id);
  const recommendationTime = Date.now();
  let businessRadar: BusinessIssueRadar;
  let operationalAlerts: OperationalAlert[];
  let companyHealth: Awaited<ReturnType<typeof getRequestCompanyHealth>>;
  let brandPortfolio: Awaited<ReturnType<typeof buildBrandPortfolioSnapshot>>;
  let clientsNeedingAttention: Awaited<ReturnType<typeof listClientsNeedingAttention>>;
  if (runHeavyPanels) {
    [businessRadar, operationalAlerts, companyHealth, brandPortfolio, clientsNeedingAttention] = await Promise.all([
      getCachedBusinessIssueRadar(agency.id),
      perfMode ? Promise.resolve<OperationalAlert[]>([]) : getRequestOperationalAlerts(agency.id),
      getRequestCompanyHealth(agency.id),
      buildBrandPortfolioSnapshot(agency.id, recommendationTime),
      listClientsNeedingAttention(agency.id, recommendationTime),
    ]);
  } else {
    // Paused: skip the full business-issue sweep. Company health, brand
    // portfolio and client-attention are kept (they feed the Battle table and
    // are comparatively cheap); the radar itself is a lightweight placeholder.
    [operationalAlerts, companyHealth, brandPortfolio, clientsNeedingAttention] = await Promise.all([
      Promise.resolve<OperationalAlert[]>([]),
      getRequestCompanyHealth(agency.id),
      buildBrandPortfolioSnapshot(agency.id, recommendationTime),
      listClientsNeedingAttention(agency.id, recommendationTime),
    ]);
    businessRadar = buildPausedBusinessRadar(workspaceSettings.advisor.radarPolicy, recommendationTime);
  }
  const radarEvidence = inspectRadarEvidence(agency.id);
  const intelligenceSnapshot = runHeavyPanels
    ? await buildCommandIntelligenceSnapshot({
        agencyId: agency.id,
        radar: businessRadar,
        evidence: radarEvidence,
        now: recommendationTime,
        brandPortfolio,
      })
    : buildPausedIntelligenceSnapshot(companyHealth.actuals.currency, recommendationTime);
  const calendarIntegration = getCommandCalendarIntegrationSnapshot(agency.id, session.userId);

  // Idempotent — guarantees a fresh agency lands on default pipelines
  // even if it pre-dates the R034 seed in `bootstrapAgency`.
  seedDefaultPipelines(agency.id);

  const pipelines = listPipelines(agency.id);
  const counts = pipelineCardCounts(agency.id);
  const leadsPipeline = pipelines.find(p => p.kind === "leads" || p.slug === "leads");
  const leadsCardCount = leadsPipeline ? counts[leadsPipeline.id] ?? 0 : 0;
  const fulfilmentPipeline = pipelines.find(p => p.kind === "fulfilment" || p.slug === "fulfilment");
  const fulfilmentCardCount = fulfilmentPipeline ? counts[fulfilmentPipeline.id] ?? 0 : 0;
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
  const radarContactCount = businessRadar.summary.critical + businessRadar.summary.warning;
  const heroCoveragePercent = businessRadar.summary.applicableChecks
    ? Math.round((businessRadar.summary.applicableChecks - businessRadar.summary.blindChecks) / businessRadar.summary.applicableChecks * 100)
    : 0;
  const heroRadarDomains = businessRadar.domains.slice(0, 12).map(domain => {
    const incidents = businessRadar.incidents.filter(incident => incident.domain === domain.domain);
    const criticalSignals = incidents.filter(incident => incident.severity === "critical").length;
    const warningSignals = incidents.filter(incident => incident.severity === "warning").length;
    const watchSignals = incidents.length - criticalSignals - warningSignals;
    const status: DynamicRadarStatus = criticalSignals
      ? "critical"
      : warningSignals || domain.firingChecks
        ? "warning"
        : domain.blindChecks
          ? "blind"
          : incidents.length
            ? "watch"
            : "clear";
    return { domain: domain.domain, label: radarDomainLabel(domain.domain), signals: incidents.length, criticalSignals, warningSignals, watchSignals, status, summary: domain };
  });
  const heroIncidents = [...businessRadar.incidents]
    .sort((left, right) => heroIncidentRank(left.severity) - heroIncidentRank(right.severity) || right.findingCount - left.findingCount)
    .slice(0, 4);
  const primaryRadarCritical = businessRadar.summary.critical > 0;
  const advisorConfigured = isAssistantConfigured(agency.id);
  const assistantContext = buildAssistantBusinessContext(agency.id);
  const staffUsers = listUsersForAgency(agency.id).filter(user => user.role.startsWith("agency-"));
  const peopleEmployees = listPeopleEmployees(agency.id);
  const aggregateCapacitySignals = buildHiringCapacitySignals({ tasks, people: peopleEmployees, now: recommendationTime });
  const legalDocuments = listLegalDocuments(agency.id);
  // Founder + Dev Mode only. Decided server-side so the Dev Team station node is
  // never constructed — and never streamed — for anybody else.
  const devTeamVisible = devDocsAccessible(session);
  // The station's badge must tell the truth AND agree with the station itself,
  // so it is computed from the SAME model the station renders: `composeLanes`
  // over the live board. The badge counts the Blocked lane (what the station's
  // "Blocked" tile shows) and carries the open-launch-blocker subset with it so
  // the label can break the number down instead of asserting a bare count.
  // Only for a founder — nobody else sees the station.
  const devTeamLanes = devTeamVisible && !perfMode ? composeLanes(await scanDevTeamBoard()) : null;
  const devTeamBlockedCount = devTeamLanes?.blocked.length ?? 0;
  const devTeamLaunchBlockerCount = devTeamLanes?.blocked.filter(item => item.kind === "blocker").length ?? 0;
  const battleTableScopes = buildBattleTableScopes({
    aggregate: {
      companyName: INTERNAL_WORKSPACE_NAME,
      initial: companyHealth.profile,
      actuals: companyHealth.actuals,
      healthScore: companyHealth.health.overall,
      staffCount: staffUsers.length,
      productCount: products.length,
      legalCount: legalDocuments.length,
      capacitySignals: aggregateCapacitySignals,
    },
    rows: brandPortfolio.rows,
    staffUsers,
    peopleEmployees,
    financeConnected: brandPortfolio.financeConnected,
    legalDocuments,
    now: recommendationTime,
  });

  const executiveWorkspace = (
    <section key="executive-workspace" className="aqua-command-hud relative overflow-hidden rounded-t-md border border-[#62e8ff]/35 text-white" aria-labelledby="command-centre-heading">
        <div className="pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" style={{ backgroundImage: "linear-gradient(rgba(98,232,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(98,232,255,.035) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <header className="mm-command-titlebar relative flex min-h-[76px] items-center justify-between gap-4 border-b border-[#62e8ff]/25 bg-[#020b11]/90 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative grid size-10 shrink-0 place-items-center border border-[#62e8ff]/45 bg-[#62e8ff]/[0.06] text-[#62e8ff] shadow-[inset_0_0_18px_rgba(98,232,255,.08),0_0_14px_rgba(98,232,255,.08)]" aria-hidden="true">
              <Anchor size={18} />
              <span className="absolute -right-1 -top-1 size-2 border border-[#020b11] bg-[#68f5d0] shadow-[0_0_8px_#68f5d0]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[9px] font-semibold uppercase text-[#76dff1]/58">{INTERNAL_WORKSPACE_NAME} · Executive overview</p>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h1 id="command-centre-heading" className="text-base font-semibold text-white sm:text-lg">Command Centre</h1>
                <span className="text-[9px] font-semibold uppercase text-[#68f5d0]/75">Health, evidence, priorities and controls</span>
              </div>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-5 text-[8px] font-semibold uppercase text-[#8ec9d5]/55 md:flex">
            <span><strong className="block text-right text-[10px] text-[#62e8ff]">{businessRadar.summary.totalChecks.toLocaleString()}</strong>Checks monitored</span>
            <span><strong className="block text-right text-[10px] text-[#62e8ff]">{businessRadar.summary.connectedSources}/{businessRadar.summary.totalSources}</strong>Sources connected</span>
            <span className="inline-flex items-center gap-2 border border-[#68f5d0]/25 bg-[#68f5d0]/[0.05] px-3 py-2 text-[#68f5d0]"><span className="size-1.5 animate-pulse bg-[#68f5d0] shadow-[0_0_8px_#68f5d0]" /> Live business data</span>
          </div>
        </header>

        <div className="relative grid xl:grid-cols-[minmax(260px,.72fr)_minmax(320px,.9fr)_minmax(480px,1.35fr)] xl:grid-rows-[auto_auto]">
          <div className="mm-command-telemetry relative grid grid-cols-2 border-b border-[#62e8ff]/20 bg-[#031018]/94 sm:grid-cols-3 xl:col-span-2 xl:col-start-1 xl:row-start-1" aria-label="Executive telemetry">
            <TelemetryCard icon={<Gauge size={14} />} label="Health" value={`${businessRadar.adaptive.healthScore}/100`} basis="weighted business-health points" tone={businessRadar.adaptive.healthScore < 40 ? "critical" : businessRadar.adaptive.healthScore < 70 ? "warning" : "clear"} detail="Business health measures performance against your approved commercial, service, operational, and safety targets. Adaptive baselines can identify anomalies but cannot redefine success." rows={[{ label: "Critical", value: String(businessRadar.summary.critical), tone: businessRadar.summary.critical ? "critical" : "clear" }, { label: "Warnings", value: String(businessRadar.summary.warning), tone: businessRadar.summary.warning ? "warning" : "clear" }, { label: "Live checks", value: businessRadar.adaptive.liveChecks.toLocaleString() }, { label: "Operating stage", value: businessRadar.adaptive.operatingStage }]} target={{ tab: "kpis" }} />
            <TelemetryCard icon={<ShieldCheck size={14} />} label="Confidence" value={`${businessRadar.adaptive.confidencePercent}%`} basis="checks with trustworthy evidence" tone={businessRadar.adaptive.confidencePercent < 40 ? "critical" : businessRadar.adaptive.confidencePercent < 70 ? "warning" : "clear"} detail="Confidence reports whether Radar has enough connected, fresh, trustworthy evidence to stand behind the health assessment. Missing evidence remains visible rather than being counted as a pass." rows={[{ label: "Evidence assured", value: `${businessRadar.summary.assurancePercent}%` }, { label: "Assured checks", value: businessRadar.summary.assuredChecks.toLocaleString() }, { label: "Evidence samples", value: businessRadar.summary.evidenceSamples.toLocaleString() }, { label: "Connected sources", value: `${businessRadar.summary.connectedSources}/${businessRadar.summary.totalSources}` }]} target={{ tab: "sources" }} />
            <TelemetryCard icon={<Target size={14} />} label="Readiness" value={`${businessRadar.adaptive.readinessPercent}%`} basis="applicable policy checks configured" tone={businessRadar.adaptive.readinessPercent < 40 ? "critical" : businessRadar.adaptive.readinessPercent < 70 ? "warning" : "clear"} detail="Readiness shows how much of the Radar policy is configured and operational at your current business stage. Learning checks are active but still gathering the history required for a verdict." rows={[{ label: "Checks live", value: businessRadar.adaptive.liveChecks.toLocaleString() }, { label: "Learning", value: businessRadar.adaptive.learningChecks.toLocaleString(), tone: "warning" }, { label: "Always on", value: businessRadar.adaptive.alwaysOnChecks.toLocaleString() }, { label: "Inactive", value: businessRadar.adaptive.inactiveChecks.toLocaleString() }]} target={{ tab: "checks", status: "applicable" }} />
            <TelemetryCard icon={<AlertTriangle size={14} />} label="Critical" value={String(businessRadar.summary.critical)} basis="grouped critical incidents" tone={businessRadar.summary.critical ? "critical" : "clear"} detail="Critical contacts are grouped incidents that have crossed an authoritative guardrail or represent an immediate safety, payment, compliance, delivery, or systems risk." rows={[{ label: "Grouped incidents", value: String(businessRadar.summary.critical), tone: businessRadar.summary.critical ? "critical" : "clear" }, { label: "Firing checks", value: businessRadar.summary.firingChecks.toLocaleString() }, { label: "Compound risks", value: businessRadar.summary.correlatedRisks.toLocaleString() }, { label: "Domains watched", value: businessRadar.domains.filter(domain => domain.firingChecks > 0).length.toLocaleString() }]} target={{ tab: "incidents", status: "critical" }} />
            <TelemetryCard icon={<Activity size={14} />} label="Warnings" value={String(businessRadar.summary.warning)} basis="grouped warning incidents" tone={businessRadar.summary.warning ? "warning" : "clear"} detail="Warnings are material deviations that need attention before they become critical. Radar groups related findings so the bridge shows causes and actions rather than a wall of duplicate alarms." rows={[{ label: "Grouped warnings", value: String(businessRadar.summary.warning), tone: businessRadar.summary.warning ? "warning" : "clear" }, { label: "Watch findings", value: businessRadar.summary.watch.toLocaleString() }, { label: "Watch checks", value: businessRadar.summary.watchChecks.toLocaleString() }, { label: "Historical breaks", value: businessRadar.summary.historicalAnomalies.toLocaleString() }]} target={{ tab: "incidents", status: "warning" }} />
            <TelemetryCard icon={<Database size={14} />} label="Blind" value={businessRadar.summary.blindChecks.toLocaleString()} basis="checks unable to prove health" tone={businessRadar.summary.blindChecks ? "warning" : "clear"} detail="Blind checks cannot currently prove health because a source, record, baseline, or required field is unavailable. They never count as healthy and remain on the plot until evidence is restored." rows={[{ label: "Blind checks", value: businessRadar.summary.blindChecks.toLocaleString(), tone: businessRadar.summary.blindChecks ? "warning" : "clear" }, { label: "Observable", value: `${heroCoveragePercent}%` }, { label: "Baseline coverage", value: `${businessRadar.summary.baselineCoveragePercent}%` }, { label: "Blind spots", value: businessRadar.summary.blindSpots.toLocaleString() }]} target={{ tab: "checks", status: "blind" }} />
          </div>

          <aside className="mm-command-watch aqua-hud-panel flex min-w-0 flex-col justify-between gap-5 px-4 py-5 sm:px-6 sm:py-6 xl:col-start-1 xl:row-start-2 xl:px-5" aria-label="Officer watch summary">
            <div>
              <div className="flex items-center justify-between gap-3 border-b border-[#62e8ff]/20 pb-3">
                <div>
                  <p className="text-[9px] font-semibold uppercase text-[#76dff1]/58">Owner overview · Current business watch</p>
                  <p className="mt-1 text-sm font-semibold text-[#68f5d0]">{greet} · Live priorities</p>
                </div>
                <span className="inline-flex items-center gap-2 border border-[#68f5d0]/25 bg-[#68f5d0]/[0.05] px-2.5 py-1.5 text-[8px] font-semibold uppercase text-[#68f5d0]">
                  <span className="size-1.5 animate-pulse bg-[#68f5d0] shadow-[0_0_8px_#68f5d0]" /> Watch live
                </span>
              </div>
              <p className="mt-5 text-[10px] font-semibold uppercase text-[#76dff1]/44">Command picture</p>
              <p className="mt-1 max-w-md text-2xl font-semibold leading-tight text-white sm:text-3xl xl:text-2xl">
                {radarContactCount} contact{radarContactCount === 1 ? "" : "s"} held on the plot
              </p>
              <p className="mt-2 max-w-md text-xs leading-5 text-[#a6cad0]/52">Grouped incidents that currently need investigation. Open a point to inspect its checks, records and evidence.</p>
            </div>

            <div className="grid grid-cols-2 gap-3 border-y border-[#62e8ff]/16 py-4" aria-label="Watch instruments">
              <HudDial label="Business health" value={businessRadar.adaptive.healthScore} unit="pts" tone={businessRadar.adaptive.healthScore < 40 ? "critical" : businessRadar.adaptive.healthScore < 70 ? "warning" : "clear"} />
              <HudDial label="Confidence" value={businessRadar.adaptive.confidencePercent} unit="%" tone={businessRadar.adaptive.confidencePercent < 40 ? "critical" : businessRadar.adaptive.confidencePercent < 70 ? "warning" : "clear"} />
              <div className="col-span-2 grid gap-3 pt-1">
              <CommandGauge label="System readiness" value={businessRadar.adaptive.readinessPercent} tone={businessRadar.adaptive.readinessPercent < 40 ? "critical" : businessRadar.adaptive.readinessPercent < 70 ? "warning" : "clear"} />
              <CommandGauge label="Observable coverage" value={heroCoveragePercent} tone={heroCoveragePercent < 70 ? "warning" : "clear"} />
              </div>
            </div>

            <div className="grid grid-cols-2 border border-[#62e8ff]/18 bg-[#020c12]/90">
              <div className="border-b border-r border-white/10 px-3 py-3.5"><p className="text-[8px] font-semibold uppercase text-white/38">Contacts</p><p className="mt-1 text-xl font-semibold tabular-nums text-red-300">{radarContactCount}</p></div>
              <div className="border-b border-white/10 px-3 py-3.5"><p className="text-[8px] font-semibold uppercase text-white/38">Open tasks</p><p className="mt-1 text-xl font-semibold tabular-nums text-[#e4ca93]">{openTaskCount}</p></div>
              <div className="border-r border-white/10 px-3 py-3.5"><p className="text-[8px] font-semibold uppercase text-white/38">Clients</p><p className="mt-1 text-xl font-semibold tabular-nums text-[#7dd3c4]">{activeClients.length}</p></div>
              <div className="px-3 py-3.5"><p className="text-[8px] font-semibold uppercase text-white/38">Coverage</p><p className="mt-1 text-xl font-semibold tabular-nums text-[#7dd3c4]">{heroCoveragePercent}%</p></div>
            </div>
          </aside>

          <section
            data-radar-state={primaryRadarCritical ? "critical" : "live"}
            className={`mm-command-radar-screen aqua-hud-panel relative border-b border-t border-[#62e8ff]/18 px-4 py-5 sm:px-6 xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:border-b-0 xl:border-l xl:border-t-0 xl:px-6 ${primaryRadarCritical ? "aqua-hud-radar--critical" : ""}`}
            aria-label="Live hero radar"
          >
            <DynamicRadarConsole
              domains={heroRadarDomains}
              summary={{
                critical: businessRadar.summary.critical,
                warning: businessRadar.summary.warning,
                totalChecks: businessRadar.summary.totalChecks,
              }}
              initialLastRunAt={businessRadar.memory.lastSweepAt}
            />
            <BrandPortfolioInstrument snapshot={brandPortfolio} />
          </section>

          <aside className="mm-command-sigint aqua-hud-panel flex min-w-0 flex-col border-t border-[#62e8ff]/18 xl:col-start-2 xl:row-start-2 xl:border-l xl:border-t-0" aria-label="Signal intelligence">
            <div className="border-b border-[#62e8ff]/16 px-4 py-4">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase text-[#76dff1]/58">SIGINT · Priority feed</p><h2 className="mt-1 text-sm font-semibold text-[#62e8ff]">Signal intelligence</h2></div><span className="inline-flex items-center gap-1.5 text-[8px] font-semibold uppercase text-[#68f5d0]"><span className="size-1.5 bg-[#68f5d0] shadow-[0_0_7px_#68f5d0]" /> Live</span></div>
              <div className="mt-3"><HudSignalTrace strength={businessRadar.summary.totalChecks} compact /></div>
            </div>
            <div className="divide-y divide-[#62e8ff]/10">
              {heroIncidents.map((incident, index) => <CommandDeckPopup key={incident.id} triggerLabel={`Open incident ${incident.title}`} triggerClassName="group grid grid-cols-[28px_minmax(0,1fr)] gap-3 px-4 py-3 text-left hover:bg-[#62e8ff]/[0.045]" eyebrow={`${incident.severity} · ${radarDomainLabel(incident.domain)}`} title={incident.title} value={`${incident.findingCount} finding${incident.findingCount === 1 ? "" : "s"}`} tone={incident.severity === "critical" ? "critical" : incident.severity === "warning" ? "warning" : "neutral"} detail={incident.detail} rows={[{ label: "Related issues", value: incident.issueIds.length.toLocaleString() }, { label: "Exact checks", value: incident.checkIds.length.toLocaleString() }, { label: "Evidence items", value: incident.evidence.length.toLocaleString() }, { label: "Detected", value: formatHudTimestamp(incident.detectedAt) }]} target={{ tab: "incidents", query: incident.id, domain: incident.domain }}>
                <span className={`grid size-7 place-items-center border text-[9px] font-bold ${heroIncidentTone(incident.severity)}`}>{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0"><span className="flex items-center justify-between gap-2"><span className={`text-[8px] font-semibold uppercase ${heroRadarSectorTone(incident.severity === "critical" ? "critical" : incident.severity === "warning" ? "warning" : "watch")}`}>{incident.severity} · {radarDomainLabel(incident.domain)}</span><span className="text-[8px] tabular-nums text-white/25">{incident.findingCount}</span></span><strong className="mt-1 line-clamp-2 block text-xs leading-4 text-white/70 group-hover:text-white">{incident.title}</strong></span>
              </CommandDeckPopup>)}
              {!heroIncidents.length ? <div className="px-4 py-8 text-center"><ShieldCheck className="mx-auto text-[#7dd3c4]" size={20} /><p className="mt-2 text-xs font-semibold text-white/65">No active command contacts</p></div> : null}
            </div>
            <div className="mt-auto border-t border-[#62e8ff]/16 px-4 py-4">
              <p className="text-[9px] font-semibold uppercase text-[#76dff1]/58">System state</p>
              <dl className="mt-3 grid gap-2 text-[9px] uppercase">
                <SystemReadout label="Evidence assured" value={`${businessRadar.summary.assurancePercent}%`} />
                <SystemReadout label="Baseline coverage" value={`${businessRadar.summary.baselineCoveragePercent}%`} />
                <SystemReadout label="Evidence samples" value={businessRadar.summary.evidenceSamples.toLocaleString()} />
                <SystemReadout label="Failed probes" value={businessRadar.summary.failedSyntheticProbes.toLocaleString()} tone={businessRadar.summary.failedSyntheticProbes ? "critical" : "clear"} />
              </dl>
            </div>
          </aside>
        </div>

        <nav className="mm-command-quick-orders relative grid shrink-0 border-t border-[#62e8ff]/16 bg-[#020b11]/94 sm:grid-cols-3" aria-label="Command Centre quick actions">
          <Link
            href="/portal/agency/notepad"
            className="group flex min-h-[72px] items-center gap-3 border-b border-r border-[#62e8ff]/10 px-4 text-left hover:bg-[#62e8ff]/[0.06] sm:border-b-0 sm:px-5"
          >
            <span className="grid size-8 shrink-0 place-items-center border border-[#62e8ff]/25 bg-[#62e8ff]/[0.06] text-[#62e8ff]"><NotebookPen size={15} /></span><span><span className="block text-[8px] font-semibold uppercase text-[#76dff1]/52">Order 02 · Captain&apos;s log</span><span className="mt-1 block text-sm font-semibold text-white">Notepad</span></span>
          </Link>
          <Link
            href="/portal/agency/pipelines/leads#new-lead"
            className="group flex min-h-[72px] items-center gap-3 border-b border-r border-[#62e8ff]/10 px-4 text-left hover:bg-[#62e8ff]/[0.06] sm:border-b-0 sm:px-5"
          >
            <span className="grid size-8 shrink-0 place-items-center border border-[#e5c479]/25 bg-[#e5c479]/[0.06] text-[#e5c479]"><RadioTower size={15} /></span><span><span className="block text-[8px] font-semibold uppercase text-[#e5c479]/58">Order 03 · New contact</span><span className="mt-1 block text-sm font-semibold text-white">Add lead</span></span>
          </Link>
          <NewClientButton commandDeck className="group flex min-h-[72px] w-full items-center gap-3 bg-[#68f5d0]/[0.08] px-4 text-left text-white hover:bg-[#68f5d0]/[0.14] sm:px-5" defaults={workspaceSettings} brands={serviceBrands.map(company => ({
            id: company.id,
            name: company.name,
            primaryColor: company.brand.primaryColor,
          }))} products={products.map(product => ({
            id: product.id, kind: product.kind, name: product.name, category: product.category,
            description: product.description ?? "", deliverables: product.deliverables,
            buyerHeadline: product.buyerHeadline, coverImageUrl: product.coverImageUrl,
            accentColor: product.accentColor, portalRequirement: product.portalRequirement,
            portalHeadline: product.portalHeadline, portalWelcomeNote: product.portalWelcomeNote,
            includedProductIds: product.includedProductIds, welcomePackItems: product.welcomePackItems,
            welcomePackNotes: product.welcomePackNotes, pricing: product.pricing,
            priceCents: product.priceCents, billingInterval: product.billingInterval,
            depositPercent: product.depositPercent, taxRatePercent: product.taxRatePercent,
            paymentTermsDays: product.paymentTermsDays, billingNotes: product.billingNotes,
            internalInfo: product.internalInfo, contractTitle: product.contractTitle,
            contractBody: product.contractBody, sopIds: product.sopIds,
            sopCategories: product.sopCategories, companyIds: product.companyIds,
          }))} />
        </nav>

        <div className="relative flex items-center gap-3 border-t border-[#62e8ff]/18 bg-[#020b11]/96 px-4 py-3 sm:px-6 xl:hidden">
          <span className="relative grid size-11 shrink-0 place-items-center rounded-full border border-[#62e8ff]/40 bg-[#03141c] text-[#62e8ff] shadow-[inset_0_0_0_4px_rgba(98,232,255,.04),0_0_14px_rgba(98,232,255,.08)]" aria-hidden="true">
            <Compass size={18} />
            <span className="absolute -right-0.5 -top-0.5 size-2 border-2 border-[#020b11] bg-[#68f5d0] shadow-[0_0_7px_#68f5d0]" />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase text-[#76dff1]/58">{INTERNAL_WORKSPACE_NAME} · Command deck</p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-sm font-semibold text-white">Watch synchronised</h2>
              <p className="text-xs leading-5 text-[#a6cad0]/52">Welcome aboard, {greet}. Your watch, business signals, and next moves are gathered here.</p>
            </div>
          </div>
          <div className="ml-auto hidden shrink-0 items-center gap-3 text-[8px] font-semibold uppercase text-[#8ec9d5]/38 xl:flex">
            <span>North-up</span><span>PPI linked</span><span>All sectors</span><span>Automatic watch</span>
          </div>
        </div>
    </section>
  );

  return (
    <div className="mm-command-center-workspace mx-auto flex w-full max-w-[1600px] flex-col gap-5 pb-6" data-testid="agency-pipelines-hub">
      <DashboardCommandCenter
        scanPaused={scanPaused}
        planning={dashboardPlanningSnapshot(agency.id, session.userId)}
        tasks={tasks}
        calendarEntries={listCommandCalendarEntries(agency.id, session.userId)}
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
        battleTablePayload={{
          companyName: INTERNAL_WORKSPACE_NAME,
          initial: companyHealth.profile,
          actuals: companyHealth.actuals,
          healthScore: companyHealth.health.overall,
          staffCount: staffUsers.length,
          brandCount: serviceBrands.length,
          productCount: products.length,
          legalCount: legalDocuments.length,
          connectedSources: businessRadar.summary.connectedSources,
          totalSources: businessRadar.summary.totalSources,
          canEdit: session.role === "agency-owner" || session.role === "agency-manager",
          capacitySignals: aggregateCapacitySignals,
          scopes: battleTableScopes,
        }}
        executiveWorkspace={executiveWorkspace}
        calendarWorkspace={(
          <Suspense fallback={<StationStreaming label="Command Calendar" />}>
            <AgencyActionsPage
              key="calendar-workspace"
              initialView="calendar"
              heading="Command Calendar"
              description="Dated work, meetings, reminders and business deadlines in the same Command Centre viewport."
            />
          </Suspense>
        )}
        actionsWorkspace={(
          <Suspense fallback={<StationStreaming label="Command Centre Actions" />}>
            <AgencyActionsPage
              key="actions-workspace"
              heading="Command Centre Actions"
              description="Radar, Advisor, manual and CRM work in one controlled queue. Approve suggested work before it enters your committed list."
            />
          </Suspense>
        )}
        advisorWorkspace={(
          <Suspense fallback={<StationStreaming label="Aqua Advisor" />}>
            <AssistantWorkspace
              key="advisor-workspace"
              initialWorkspace={getAssistantWorkspace(agency.id, session.userId)}
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
        )}
        devTeamVisible={devTeamVisible}
        devTeamBlockedCount={devTeamBlockedCount}
        devTeamLaunchBlockerCount={devTeamLaunchBlockerCount}
        devTeamWorkspace={devTeamVisible ? (
          <Suspense fallback={<StationStreaming label="Dev Team" />}>
            <DevTeamStation key="dev-team-workspace" />
          </Suspense>
        ) : null}
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

function radarDomainLabel(domain: string): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function heroRadarSectorTone(status: DynamicRadarStatus): string {
  if (status === "critical") return "text-red-300";
  if (status === "warning") return "text-amber-300";
  if (status === "watch") return "text-sky-300";
  if (status === "blind") return "text-white/42";
  return "text-[#62e8ff]";
}

function formatHudTimestamp(timestamp: number): string {
  return formatUkDate(timestamp, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

type InstrumentTone = "critical" | "warning" | "clear";

function TelemetryCard({ icon, label, value, basis, tone, detail, rows, target }: { icon: ReactNode; label: string; value: string; basis: string; tone: InstrumentTone; detail: string; rows: CommandDeckPopupRow[]; target: CommandDeckInspectorTarget }) {
  const numericValue = Number.parseInt(value, 10) || value.length;
  return <CommandDeckPopup triggerLabel={`Open ${label} command detail`} triggerClassName="group relative min-h-[88px] min-w-0 border-r border-[#62e8ff]/14 px-3 py-3 text-left hover:bg-[#62e8ff]/[0.045] sm:px-4" eyebrow="Executive telemetry" title={label} value={value} tone={tone} detail={detail} rows={rows} target={target}>
    <span className={`flex items-center gap-2 text-[8px] font-semibold uppercase ${instrumentToneClass(tone)}`}>{icon}<span className="truncate">{label}</span><span className="ml-auto text-[7px] text-[#8ec9d5]/32">SYS</span></span>
    <span className="mt-1 flex items-end justify-between gap-3"><span className="min-w-0"><strong className="block text-lg font-semibold tabular-nums text-white/88 group-hover:text-white">{value}</strong><span className="mt-0.5 block truncate text-[7px] uppercase text-white/27">{basis}</span></span><span className="flex h-4 items-end gap-px" aria-hidden="true">{HUD_TINY_TRACE.map((height, index) => <span key={index} className={instrumentBarClass(tone)} style={{ width: 2, height: `${Math.max(2, (height + numericValue + index * 3) % 15)}px`, opacity: 0.35 + index * 0.07 }} />)}</span></span>
  </CommandDeckPopup>;
}

function HudDial({ label, value, unit, tone }: { label: string; value: number; unit: "%" | "pts"; tone: InstrumentTone }) {
  const safeValue = Math.max(0, Math.min(100, value));
  const dialStyle = { "--hud-value": `${safeValue}%`, "--hud-cyan": instrumentHex(tone) } as CSSProperties;
  return <div className="border border-[#62e8ff]/12 bg-[#020b11]/78 px-2 py-3 text-center">
    <div className="aqua-hud-dial relative mx-auto size-16" style={dialStyle}><span className={`relative z-[1] text-base font-semibold tabular-nums ${instrumentToneClass(tone)}`}>{Math.round(safeValue)}<small className="text-[7px]">{unit}</small></span></div>
    <p className="mt-2 text-[7px] font-semibold uppercase text-[#8ec9d5]/46">{label}</p>
  </div>;
}

function HudSignalTrace({ strength, compact = false }: { strength: number; compact?: boolean }) {
  const count = compact ? 26 : 42;
  return <div className={compact ? "" : "border-y border-[#62e8ff]/10 py-2"} aria-hidden="true">
    <div className="aqua-hud-signal-trace">{Array.from({ length: count }, (_, index) => {
      const height = 3 + ((index * 11 + strength * 7 + (index % 5) * strength) % (compact ? 16 : 20));
      return <span key={index} style={{ height }} />;
    })}</div>
    {!compact ? <div className="mt-1 flex justify-between text-[6px] font-semibold uppercase text-[#8ec9d5]/30"><span>0.00</span><span>Signal response spectrum</span><span>6.00s</span></div> : null}
  </div>;
}

function CommandGauge({ label, value, tone }: { label: string; value: number; tone: InstrumentTone }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return <div>
    <div className="flex items-center justify-between gap-3 text-[8px] font-semibold uppercase"><span className="text-white/38">{label}</span><span className={`tabular-nums ${instrumentToneClass(tone)}`}>{Math.round(safeValue)}%</span></div>
    <div className="mt-1.5 h-1.5 border border-[#62e8ff]/15 bg-black/30"><div className={`h-full shadow-[0_0_6px_currentColor] ${instrumentBarClass(tone)}`} style={{ width: `${safeValue}%` }} /></div>
  </div>;
}

function SystemReadout({ label, value, tone = "clear" }: { label: string; value: string; tone?: InstrumentTone }) {
  return <div className="flex items-center justify-between gap-3 border-b border-[#62e8ff]/[0.08] pb-2"><dt className="text-[#8ec9d5]/42">{label}</dt><dd className={`font-semibold tabular-nums ${instrumentToneClass(tone)}`}>{value}</dd></div>;
}

function instrumentToneClass(tone: InstrumentTone): string {
  if (tone === "critical") return "text-red-300";
  if (tone === "warning") return "text-amber-300";
  return "text-[#62e8ff]";
}

function instrumentBarClass(tone: InstrumentTone): string {
  if (tone === "critical") return "bg-red-400";
  if (tone === "warning") return "bg-amber-300";
  return "bg-[#62e8ff]";
}

function instrumentHex(tone: InstrumentTone): string {
  if (tone === "critical") return "#f87171";
  if (tone === "warning") return "#fcd34d";
  return "#62e8ff";
}

const HUD_TINY_TRACE = [4, 9, 6, 13, 7, 15, 10, 5] as const;

function heroIncidentRank(severity: "critical" | "warning" | "watch"): number {
  return severity === "critical" ? 0 : severity === "warning" ? 1 : 2;
}

function heroIncidentTone(severity: "critical" | "warning" | "watch"): string {
  if (severity === "critical") return "border-red-300/35 bg-red-400/10 text-red-200";
  if (severity === "warning") return "border-amber-300/35 bg-amber-400/10 text-amber-200";
  return "border-sky-300/30 bg-sky-400/10 text-sky-200";
}

function buildBattleTableScopes(input: {
  aggregate: { companyName: string; initial: ReturnType<typeof getCompanyProfile>; actuals: CompanyHealthActuals; healthScore: number; staffCount: number; productCount: number; legalCount: number; capacitySignals: ReturnType<typeof buildHiringCapacitySignals> };
  rows: BrandPortfolioRow[];
  staffUsers: ReturnType<typeof listUsersForAgency>;
  peopleEmployees: ReturnType<typeof listPeopleEmployees>;
  financeConnected: boolean;
  legalDocuments: ReturnType<typeof listLegalDocuments>;
  now: number;
}): BattleTableScopePayload[] {
  const aggregate: BattleTableScopePayload = {
    id: "ecosystem",
    companyId: null,
    label: input.aggregate.companyName,
    kind: "aggregate",
    detail: "All connected companies plus shared records combined. This view is an explicit Aqua-wide aggregate; switch scope to edit a brand's own targets and projections.",
    initial: input.aggregate.initial,
    actuals: input.aggregate.actuals,
    healthScore: input.aggregate.healthScore,
    staffCount: input.aggregate.staffCount,
    productCount: input.aggregate.productCount,
    legalCount: input.aggregate.legalCount,
    capacitySignals: input.aggregate.capacitySignals,
    coverage: ["all finance", "all clients", "all leads", "all tasks", "all people", "all offers"],
  };
  const date = new Date(input.now);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const scopes = input.rows.filter(row => !row.unallocated).map(row => {
    const profile = getCompanyProfile(input.aggregate.initial.agencyId, row.id);
    const actuals: CompanyHealthActuals = {
      monthRevenueCents: row.monthRevenueCents,
      previousMonthRevenueCents: row.previousMonthRevenueCents,
      monthlyRevenueGrowthPercent: row.monthlyRevenueGrowthPercent,
      mrrCents: row.mrrCents,
      currency: row.currency,
      financeConnected: input.financeConnected,
      activeClients: row.activeClients,
      clientsNeedingAttention: row.clientsNeedingAttention,
      leadCount: row.leadCount,
      meetingsThisMonth: row.meetingsThisMonth,
      completedSalesCalls: row.completedSalesCalls,
      openTasks: 0,
      overdueTasks: 0,
    };
    const revenueGapCents = Math.max(0, profile.monthlyRevenueTargetCents - actuals.monthRevenueCents);
    const dealsNeeded = revenueGapCents ? Math.ceil(revenueGapCents / Math.max(1, profile.averageDealValueCents)) : 0;
    const callsNeeded = dealsNeeded ? Math.ceil(dealsNeeded / Math.max(0.01, profile.salesCallCloseRatePercent / 100)) : 0;
    const health = calculateCompanyHealth({
      monthRevenueCents: actuals.monthRevenueCents,
      monthlyRevenueTargetCents: profile.monthlyRevenueTargetCents,
      dayOfMonth: date.getDate(),
      daysInMonth,
      activeClients: actuals.activeClients,
      clientsNeedingAttention: actuals.clientsNeedingAttention,
      revenueGapCents,
      estimatedCallsNeeded: callsNeeded,
      meetingsThisMonth: actuals.meetingsThisMonth,
      openTasks: 0,
      overdueTasks: 0,
    });
    const companyUserIds = new Set(input.staffUsers.filter(user => user.companyIds?.includes(row.id)).map(user => user.id));
    const scopedPeople = input.peopleEmployees.filter(employee => Boolean(employee.userId && companyUserIds.has(employee.userId)));
    return {
      id: `company:${row.id}`,
      companyId: row.id,
      label: row.label,
      kind: "company" as const,
      detail: `Exact ${row.label} records only. Revenue, clients, leads, offers and assigned people are scoped; shared tasks stay outside this brand calculation until task-level company allocation exists.`,
      initial: profile,
      actuals,
      healthScore: health.overall,
      staffCount: row.staffCount,
      productCount: row.productCount,
      legalCount: input.legalDocuments.filter(document => document.companyIds?.includes(row.id)).length,
      capacitySignals: buildHiringCapacitySignals({ people: scopedPeople, now: input.now }),
      coverage: ["allocated finance", "allocated clients", "allocated leads", "allocated people", "allocated offers", "shared tasks excluded"],
    };
  });
  return [aggregate, ...scopes];
}
