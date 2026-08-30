"use client";

// The Business Radar dashboard — lifted out of `_DashboardCommandCenter`.
//
// Ed, 2026-08-29, on the dev server: *"this app is very very very heavy."*
// Measured that day: dev memory grows ~per compiled route, and the Command
// Centre was the single largest route graph in the app at 2,787 lines.
//
// ── Why THIS is the seam ─────────────────────────────────────────────────
//
// The file already `dynamic()`-loads nine heavy workspaces, so the obvious cuts
// were taken. What remained inline was a contiguous 648-line radar cluster —
// `BusinessRadarDashboard` plus eight helpers (`RadarMetric`, `RadarDetail`,
// `RadarMemoryTimeline`, `RadarMemoryStat`, `RadarEvidenceVault`,
// `CommercialLifecycleStrip`, `RadarCheckRow`, `CoverageRow`) used by nothing
// else in the file. One entry point, eight private helpers, zero outside
// callers: a seam rather than a chainsaw.
//
// It renders only when `dashboardMode === "workspace"`, so the parent now loads
// it dynamically — the same treatment its nine siblings already get. On every
// other station this code is no longer compiled into the first paint at all.

"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlarmClock,
  Activity,
  AlertTriangle,
  Anchor,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Compass,
  Crosshair,
  Database,
  EyeOff,
  Gauge,
  History,
  Info,
  LoaderCircle,
  NotebookPen,
  Play,
  Plus,
  Radar,
  RadioTower,
  RefreshCw,
  Save,
  ScanSearch,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Target,
  TimerReset,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";

import type { AdvisorActionSuggestion } from "@/lib/advisor/advisorActions";
import {
  ATTENTION_PROTECTION_EVENT,
  ATTENTION_PROTECTION_STORAGE_KEY,
  attentionProtectionEnabled,
  buildProtectedAttentionWindow,
  setAttentionProtectionEnabled,
} from "@/lib/intelligence/attentionProtection";
import { buildBusinessRecommendedActions } from "@/lib/intelligence/businessRecommendedActions";
import type { AdvisorCoverageSource, AdvisorDomain, BusinessIssueRadar, BusinessRadarCheck, BusinessRadarIssue, RadarCheckScope, RadarCheckStatus, RadarEvidenceInspectionIndex, RadarRuleLens } from "@/engines/data/radar/businessRadar";
import type { CommandIntelligenceSnapshot } from "@/lib/intelligence/commandIntelligence";
import { formatUkDate, isoDateTimeValue, timestampFromValue } from "@/lib/shared/formatDateTime";
import type { AgencyTask, AgencyTaskOrigin, AgencyTaskPriority, CommandCalendarEntry, CommandCalendarExternalEvent, CommandCalendarSource, CompanyProfile, DashboardDayPlan, DashboardWeekPlan, DashboardWeeklyEvidenceSnapshot, DashboardWorkSession } from "@/server/types";
import type { ClockOutReviewDraft } from "./_ClockOutReviewDialog";
import type { BattleTablePayload, BattleTableSection } from "./_BattleTableWorkspace";
import type { WarRoomIncident } from "./_battleWarRoom";
import type { IntelligenceView } from "./_CommandIntelligenceWorkspace";
import { ClientsNeedingAttention } from "./_ClientsNeedingAttention";
import type { ClientAttentionItem } from "@/lib/server/clients/clientAttention";
import type { RadarInspectionTab } from "./radar/RadarInspectionWorkspace";
import { CommandStationNav, type CommandStationAttention, type CommandStationMode } from "./_CommandStationNav";
import { DayCommandSensorPanel } from "./_DayCommandSensorPanel";
import { DayBriefingPanel, type DayTaskGenerationSummary } from "./_DayBriefingPanel";
import { DayKpiIntelligencePanel } from "./_DayKpiIntelligencePanel";
import { weeklyReviewDraftFromPlan } from "./weeklyReviewDraft";
import { resolveServerCommandStation, serverCommandStationHref, type ServerCommandStation } from "./commandStationRouting";
import { reconcileBusinessRadarSnapshot, reconcileCommandIntelligenceSnapshot } from "./commandPerformance";
import {
  beginServerStationNavigation,
  pendingServerStationView,
  serverStationSettlementFallback,
  type PendingServerStationNavigation,
} from "./serverStationNavigation";
import { devTeamStationAttention, radarStationAttention } from "./commandStationAttention";
import { PortalViewportLoading } from "@/components/ui/PortalViewportLoading";
import {
  coverageStatusLabel, domainLabel, formatRadarAge, formatRadarDuration,
  radarCheckIconClass, radarCheckStatusClass, radarCheckStatusLabel,
  radarNodeClass, radarSeverityClass, radarSeverityRank,
  signedDecimal, signedInteger,
  type OpenRadarInspector, type RadarMetricHelp,
} from "./_radarShared";

// Its own lazy handle on the policy editor. The parent has one too — same
// component, two dynamic call sites, which is what `dynamic()` is for. Sharing
// one would mean importing it back from the parent, and the whole point of this
// file is not to depend on that.
const RadarPolicyPanel = dynamic(
  () => import("./_RadarPolicyPanel").then(mod => mod.RadarPolicyPanel),
  { loading: () => <p className="text-xs text-white/45">Loading policy…</p> },
);

const RADAR_DOMAINS: AdvisorDomain[] = [
  "company",
  "sales",
  "inbox",
  "clients",
  "finance",
  "delivery",
  "marketing",
  "operations",
  "compliance",
  "development",
  "team",
  "systems",
];

const RADAR_NODE_POSITIONS = [
  { top: "7%", left: "50%" },
  { top: "13%", left: "70%" },
  { top: "30%", left: "87%" },
  { top: "50%", left: "93%" },
  { top: "70%", left: "87%" },
  { top: "87%", left: "70%" },
  { top: "93%", left: "50%" },
  { top: "87%", left: "30%" },
  { top: "70%", left: "13%" },
  { top: "50%", left: "7%" },
  { top: "30%", left: "13%" },
  { top: "13%", left: "30%" },
];

export function BusinessRadarDashboard({
  variant,
  radar,
  onRadarChange,
  onCreateTask,
  taskBusyId,
  advisorConfigured,
  onOpenInspector,
  onOpenExecutive,
  commandRail,
}: {
  variant: "executive" | "workspace";
  radar: BusinessIssueRadar;
  onRadarChange: (radar: BusinessIssueRadar) => void;
  onCreateTask: (issue: BusinessRadarIssue) => Promise<void>;
  taskBusyId: string | null;
  advisorConfigured: boolean;
  onOpenInspector: OpenRadarInspector;
  onOpenExecutive?: () => void;
  commandRail?: React.ReactNode;
}) {
  const [activeDomain, setActiveDomain] = useState<AdvisorDomain | "all">("all");
  const [feedMode, setFeedMode] = useState<"signals" | "checks">("signals");
  const [checkFilter, setCheckFilter] = useState<"all" | "attention" | "blind" | "learning" | "inactive" | "pass">("attention");
  const [checkScope, setCheckScope] = useState<"all" | RadarCheckScope>("all");
  const [checkQuery, setCheckQuery] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState("");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [metricHelp, setMetricHelp] = useState<RadarMetricHelp | null>(null);
  const attentionCount = radar.summary.critical + radar.summary.warning;
  const coveragePercent = radar.summary.applicableChecks
    ? Math.round((radar.summary.applicableChecks - radar.summary.blindChecks) / radar.summary.applicableChecks * 100)
    : 0;
  const visibleIssues = radar.incidents.filter(issue => activeDomain === "all" || issue.domain === activeDomain);
  const normalizedCheckQuery = checkQuery.trim().toLowerCase();
  const matchingChecks = radar.checks.filter(check => {
    if (activeDomain !== "all" && check.domain !== activeDomain) return false;
    if (checkFilter === "attention" && !["critical", "warning", "watch", "learning"].includes(check.status)) return false;
    if (checkFilter === "blind" && check.status !== "blind") return false;
    if (checkFilter === "learning" && check.status !== "learning") return false;
    if (checkFilter === "inactive" && check.status !== "inactive") return false;
    if (checkFilter === "pass" && check.status !== "pass") return false;
    if (checkScope !== "all" && check.scope !== checkScope) return false;
    if (!normalizedCheckQuery) return true;
    return `${check.title} ${check.detail} ${check.domain} ${check.lensLabel} ${check.scope} ${check.sourceId}`.toLowerCase().includes(normalizedCheckQuery);
  });
  const displayedChecks = matchingChecks.slice(0, 240);
  const domainSummaries = RADAR_DOMAINS.map((domain, index) => {
    const issues = radar.incidents.filter(issue => issue.domain === domain);
    const sources = radar.coverage.filter(source => source.domain === domain);
    const rollup = radar.domains.find(item => item.domain === domain);
    const unavailable = sources.some(source => source.status === "disconnected" || source.status === "unavailable");
    const status: "critical" | "warning" | "watch" | "blind" | "inactive" | "healthy" = rollup?.applicableChecks === 0
      ? "inactive"
      : issues.some(issue => issue.severity === "critical")
      ? "critical"
      : issues.some(issue => issue.severity === "warning")
        ? "warning"
        : unavailable
          ? "blind"
          : issues.length
            ? "watch"
            : "healthy";
    return { domain, issues: issues.length, sources: sources.length, checks: rollup?.totalChecks ?? 0, firing: rollup?.firingChecks ?? 0, blind: rollup?.blindChecks ?? 0, coverage: rollup?.coveragePercent ?? 0, status, position: RADAR_NODE_POSITIONS[index]! };
  });

  const refreshRadar = useCallback(async (showBusy = true) => {
    if (showBusy) setScanBusy(true);
    setScanError("");
    try {
      const response = await fetch("/api/portal/advisor/radar", {
        method: showBusy ? "POST" : "GET",
        cache: "no-store",
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; radar?: BusinessIssueRadar; error?: string } | null;
      if (!response.ok || !result?.ok || !result.radar) throw new Error(result?.error || "The radar sweep could not complete.");
      onRadarChange(result.radar);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "The radar sweep could not complete.");
    } finally {
      if (showBusy) setScanBusy(false);
    }
  }, [onRadarChange]);

  useEffect(() => {
    const timer = window.setInterval(() => void refreshRadar(false), 60_000);
    return () => window.clearInterval(timer);
  }, [refreshRadar]);

  if (variant === "executive") {
    const executiveIssues = [...visibleIssues].sort((a, b) => radarSeverityRank(a.severity) - radarSeverityRank(b.severity)).slice(0, 3);
    const selectedSummary = activeDomain === "all" ? null : domainSummaries.find(item => item.domain === activeDomain);

    return (
      <div id="executive-radar" className="mm-executive-command-system grid scroll-mt-24 gap-4" data-testid="executive-radar">
        <section className="relative overflow-hidden rounded-lg border border-[#46645a] bg-[#0d1716] text-white shadow-[0_16px_38px_rgba(0,0,0,0.14)]" aria-labelledby="executive-radar-heading">
          <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" style={{ backgroundImage: "linear-gradient(rgba(125,211,196,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,196,.055) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative flex min-h-7 items-center justify-between gap-3 border-b border-[#b89a63]/25 bg-[#111d1b] px-4 text-[9px] font-semibold uppercase text-[#d8bd83]/80 sm:px-6" aria-label="Bridge status">
            <span className="inline-flex items-center gap-2"><Anchor size={11} /> Aqua command vessel · bridge online</span>
            <span className="hidden tabular-nums sm:inline">Bearing 000° · Watch condition {radar.summary.critical ? "Red" : radar.summary.warning ? "Amber" : "Green"}</span>
          </div>
          <header id="executive-operations" className="relative flex scroll-mt-20 flex-wrap items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-stretch gap-3">
              <span className="relative grid size-14 shrink-0 place-items-center rounded-full border border-[#d8bd83]/45 bg-[#091210] text-[#e4ca93] shadow-[inset_0_0_0_4px_rgba(216,189,131,.06)]" aria-hidden="true">
                <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[7px] font-bold text-[#d8bd83]/75">N</span>
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] font-bold text-[#d8bd83]/45">S</span>
                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[7px] font-bold text-[#d8bd83]/45">W</span>
                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[7px] font-bold text-[#d8bd83]/45">E</span>
                <Compass size={20} />
                <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full border-2 border-[#0d1716] bg-[#74d7c4]" />
              </span>
              <div className="min-w-0 border-l-2 border-[#d8bd83]/50 pl-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-[9px] font-semibold uppercase text-[#d8bd83]/65">PPI-01 · North-up · Executive deck</p>
                  <span className="hidden h-px w-8 bg-[#d8bd83]/25 sm:block" />
                  <span className="text-[9px] font-semibold uppercase text-[#7dd3c4]/70">Surface picture live</span>
                </div>
                <p className="mt-1 text-sm font-semibold uppercase text-[#7dd3c4]">Executive bridge radar</p>
                <h2 id="executive-radar-heading" className="mt-1 text-xl font-semibold text-white sm:text-2xl">{attentionCount ? `${attentionCount} contacts on the command plot` : "All sectors report clear"}</h2>
                <p className="mt-1 text-xs leading-5 text-white/50">Last sweep {formatRadarAge(radar.generatedAt)} · {radar.summary.critical} hostile · {radar.summary.warning} caution · next sweep in under one minute</p>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto lg:grid-cols-[142px_repeat(4,auto)]">
              <div className="relative min-h-12 border border-[#d8bd83]/30 bg-[#121c19] px-3 py-2 shadow-[inset_0_0_0_1px_rgba(216,189,131,.04)]" aria-label={`Current watch ${radar.adaptive.operatingStage}`}>
                <span className="absolute left-1 top-1 size-1 rounded-full bg-[#d8bd83]/35" aria-hidden="true" />
                <span className="absolute right-1 top-1 size-1 rounded-full bg-[#d8bd83]/35" aria-hidden="true" />
                <div className="flex items-center justify-between gap-2 text-[8px] font-semibold uppercase text-[#d8bd83]/60"><span>Current watch</span><span>PPI live</span></div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><span className="relative size-2.5 rounded-full bg-[#74d7c4] shadow-[0_0_9px_rgba(116,215,196,.75)]"><span className="absolute inset-0 animate-ping rounded-full bg-[#74d7c4]/40" /></span><strong className="text-xs uppercase text-[#e4ca93]">{radar.adaptive.operatingStage}</strong></span>
                  <span className="text-[8px] font-semibold uppercase text-white/38">Manned</span>
                </div>
              </div>
              <button type="button" onClick={() => void refreshRadar()} disabled={scanBusy} title="Run radar sweep" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50">
                <RefreshCw size={15} className={scanBusy ? "animate-spin" : ""} /> {scanBusy ? "Sweeping" : "Sweep"}
              </button>
              <button type="button" onClick={() => onOpenInspector()} title="Inspect Radar evidence" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm font-semibold text-white hover:bg-white/10">
                <Database size={15} /> Data
              </button>
              <button type="button" onClick={() => setPolicyOpen(current => !current)} aria-expanded={policyOpen} title="Configure Radar policy" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm font-semibold text-white hover:bg-white/10">
                <Settings2 size={15} /> Policy
              </button>
              <button type="button" onClick={() => window.dispatchEvent(new Event("aqua-advisor:open"))} title="Open Aqua Advisor" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#e8dcc2] px-3 text-sm font-semibold text-[#17211e] hover:bg-[#f2e8d3]">
                <Bot size={15} /> Advisor
              </button>
            </div>
          </header>

          {scanError ? <div role="alert" className="border-b border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100 sm:px-6">{scanError}</div> : null}

          {commandRail}

          <div className="relative grid grid-cols-2 border-b border-white/10 lg:grid-cols-4" aria-label="Executive outcomes">
            <RadarMetric icon={<Gauge size={14} />} label="Hull health" value={`${radar.adaptive.healthScore}/100`} tone={radar.adaptive.healthScore < 40 ? "critical" : radar.adaptive.healthScore < 70 ? "warning" : "healthy"} detail="Overall business outcome score: 70% company health and 30% current incident health. Critical incidents subtract 18 points, warnings 7, and watch findings 2 before the blend is applied." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "kpis", status: "attention" })} />
            <RadarMetric icon={<ShieldCheck size={14} />} label="Plot confidence" value={`${radar.adaptive.confidencePercent}%`} tone={radar.adaptive.confidencePercent < 40 ? "critical" : radar.adaptive.confidencePercent < 70 ? "warning" : "healthy"} detail="How trustworthy the assessment is: 55% connected-source confidence and 45% check confidence. Learning checks contribute partial confidence; blind checks contribute none." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "sources" })} />
            <RadarMetric icon={<Target size={14} />} label="Readiness" value={`${radar.adaptive.readinessPercent}%`} tone={radar.adaptive.readinessPercent < 40 ? "critical" : radar.adaptive.readinessPercent < 70 ? "warning" : "healthy"} detail="Average readiness across every Radar domain. It combines required connections with the evidence needed for dependable decisions." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "sources" })} />
            <RadarMetric icon={<AlertTriangle size={14} />} label="Contacts" value={attentionCount} tone={radar.summary.critical ? "critical" : radar.summary.warning ? "warning" : "healthy"} detail="Command-level incidents that are critical or outside warning guardrails. Related detector findings are grouped so one problem creates one useful contact." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "incidents", status: "attention" })} />
          </div>

          {metricHelp ? (
            <div role="status" aria-live="polite" className="flex items-start gap-3 border-b border-emerald-200/15 bg-emerald-200/[0.07] px-4 py-3 sm:px-6">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-emerald-200/10 text-emerald-200"><Info size={14} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-white">How {metricHelp.label.toLowerCase()} works</p><p className="mt-1 max-w-4xl text-xs leading-5 text-white/60">{metricHelp.detail}</p></div>
              <button type="button" onClick={() => setMetricHelp(null)} aria-label="Close metric explanation" title="Close explanation" className="grid size-7 shrink-0 place-items-center rounded-md text-white/35 transition hover:bg-white/10 hover:text-white"><X size={14} aria-hidden="true" /></button>
            </div>
          ) : null}

          <div className="relative grid lg:grid-cols-[minmax(340px,.94fr)_minmax(0,1.06fr)]">
            <div className="border-b border-white/10 bg-[#0a1413]/60 p-4 sm:p-6 lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-[10px] font-semibold uppercase text-[#d8bd83]/70">Primary plotting indicator</p><p className="mt-1 text-sm font-semibold text-white">{activeDomain === "all" ? "All operational sectors" : `${domainLabel(activeDomain)} sector`}</p></div>
                <select value={activeDomain} onChange={event => setActiveDomain(event.target.value as AdvisorDomain | "all")} aria-label="Executive radar domain" className="min-h-9 rounded-md border border-white/15 bg-[#1a211d] px-2.5 text-xs font-semibold text-white outline-none">
                  <option value="all">All domains</option>
                  {RADAR_DOMAINS.map(domain => <option key={domain} value={domain}>{domainLabel(domain)}</option>)}
                </select>
              </div>

              <div className="relative mx-auto mt-5 aspect-square w-full max-w-[390px]" aria-label="Executive business radar">
                <div className="absolute inset-[4%] rounded-full border-2 border-[#7dd3c4]/28 bg-[#07110f] shadow-[inset_0_0_48px_rgba(45,212,191,.06),0_0_24px_rgba(45,212,191,.05)]" />
                <div className="absolute inset-[15%] rounded-full border border-[#7dd3c4]/18" />
                <div className="absolute inset-[29%] rounded-full border border-[#7dd3c4]/15" />
                <div className="absolute inset-[43%] rounded-full border border-[#7dd3c4]/12" />
                <div className="absolute inset-x-[4%] top-1/2 h-px bg-[#7dd3c4]/14" />
                <div className="absolute inset-y-[4%] left-1/2 w-px bg-[#7dd3c4]/14" />
                <div className="absolute left-[17%] top-[17%] h-[66%] w-px origin-center rotate-45 bg-[#7dd3c4]/8" />
                <div className="absolute right-[17%] top-[17%] h-[66%] w-px origin-center -rotate-45 bg-[#7dd3c4]/8" />
                <span className="absolute left-1/2 top-0 -translate-x-1/2 text-[9px] font-bold text-[#d8bd83]">N · 000</span>
                <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[9px] font-bold text-[#d8bd83]">E · 090</span>
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] font-bold text-[#d8bd83]">S · 180</span>
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[9px] font-bold text-[#d8bd83]">W · 270</span>
                <div className="absolute bottom-1/2 left-1/2 h-[45%] w-px origin-bottom animate-spin bg-[#7dd3c4]/65 [animation-duration:7s]">
                  <span className="absolute -left-1 -top-1 size-2 rounded-full bg-[#8ce7d6] shadow-[0_0_16px_rgba(125,211,196,.95)]" />
                </div>
                <button type="button" onClick={() => onOpenInspector({ tab: attentionCount ? "incidents" : "checks", domain: activeDomain, status: attentionCount ? "attention" : "all" })} aria-label={`Inspect ${activeDomain === "all" ? "whole business" : domainLabel(activeDomain)} Radar picture`} className="absolute left-1/2 top-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-emerald-200/20 bg-[#151c18] text-center shadow-[0_0_30px_rgba(52,211,153,.08)] hover:border-emerald-200/40">
                  <span><strong className="block text-2xl tabular-nums text-white">{activeDomain === "all" ? attentionCount : selectedSummary?.issues ?? 0}</strong><span className="text-[9px] font-semibold uppercase text-[#7dd3c4]/70">{activeDomain === "all" ? "contacts held" : "sector contacts"}</span></span>
                </button>
                {domainSummaries.map(item => (
                  <button key={item.domain} type="button" onClick={() => setActiveDomain(current => current === item.domain ? "all" : item.domain)} aria-label={`${domainLabel(item.domain)}: ${item.issues} signals, ${item.blind} blind checks`} title={`${domainLabel(item.domain)} · ${item.checks} checks · ${item.firing} firing · ${item.blind} blind`} className={`absolute z-10 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border transition hover:scale-110 ${activeDomain === item.domain ? "border-white bg-white text-[#111714]" : radarNodeClass(item.status)}`} style={item.position}>
                    <span className="size-2 rounded-full bg-current" />
                  </button>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-4 divide-x divide-white/10 border-y border-white/10 py-2 text-center text-[9px] font-semibold uppercase text-white/42">
                <span><strong className="block text-sm tabular-nums text-red-300">{radar.summary.critical}</strong>Hostile</span>
                <span><strong className="block text-sm tabular-nums text-amber-200">{radar.summary.warning}</strong>Caution</span>
                <span><strong className="block text-sm tabular-nums text-sky-200">{radar.summary.watch}</strong>Watch</span>
                <span><strong className="block text-sm tabular-nums text-[#7dd3c4]">{coveragePercent}%</strong>Scope</span>
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
                <div><p className="text-[10px] font-semibold uppercase text-[#d8bd83]/70">Officer of the watch</p><h3 className="mt-1 text-base font-semibold text-white">{activeDomain === "all" ? "Priority contact board" : `${domainLabel(activeDomain)} contact board`}</h3></div>
                <button type="button" onClick={() => onOpenInspector({ tab: "incidents", domain: activeDomain, status: "attention" })} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/15 px-3 text-xs font-semibold text-white/65 hover:bg-white/10 hover:text-white">Inspect all <ArrowUpRight size={13} /></button>
              </div>
              <div className="divide-y divide-white/10">
                {executiveIssues.map(issue => (
                  <button key={issue.id} type="button" onClick={() => onOpenInspector({ tab: "incidents", query: issue.id, domain: issue.domain })} className="group grid w-full gap-3 px-4 py-4 text-left hover:bg-white/[0.04] sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${radarSeverityClass(issue.severity)}`}>{issue.severity}</span><span className="text-[10px] font-semibold uppercase text-white/38">{domainLabel(issue.domain)}</span></span>
                      <strong className="mt-2 block text-sm leading-5 text-white">{issue.title}</strong>
                      <span className="mt-1 block line-clamp-2 text-xs leading-5 text-white/48">{issue.detail}</span>
                    </span>
                    <span className="flex items-center gap-2 self-start text-[10px] font-semibold text-white/38"><span>{issue.issueIds.length} issues · {issue.checkIds.length} checks</span><ArrowUpRight size={13} className="text-white/25 transition group-hover:text-emerald-200" /></span>
                  </button>
                ))}
                {!executiveIssues.length ? <div className="px-6 py-12 text-center"><ShieldCheck className="mx-auto text-emerald-300" size={24} /><p className="mt-3 text-sm font-semibold text-white">No current contacts in this scope</p><p className="mt-1 text-xs text-white/42">Coverage and learning state remain visible below.</p></div> : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-white/10 lg:grid-cols-4" aria-label="Radar observability">
            <RadarMetric icon={<ScanSearch size={14} />} label="Checks live" value={radar.adaptive.liveChecks.toLocaleString()} tone="healthy" detail="Applicable checks with enough observable evidence to evaluate now. Learning, blind, and policy-inactive checks are excluded." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "checks", status: "live" })} />
            <RadarMetric icon={<EyeOff size={14} />} label="Blind" value={radar.summary.blindChecks.toLocaleString()} tone={radar.summary.blindChecks ? "warning" : "healthy"} detail="Applicable checks that cannot prove an outcome because their source, measurement, or required evidence is unavailable." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "checks", status: "blind" })} />
            <RadarMetric icon={<History size={14} />} label="Learning" value={radar.adaptive.learningChecks.toLocaleString()} tone="watch" detail="Connected checks accumulating the sample size, history span, or comparison baseline required by policy." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "checks", status: "learning" })} />
            <RadarMetric icon={<ShieldCheck size={14} />} label="Coverage" value={`${coveragePercent}%`} tone={coveragePercent < 70 ? "warning" : "healthy"} detail="The share of applicable checks that are currently observable. Open this card to find exactly which checks are blind." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "checks", status: "applicable" })} />
          </div>
        </section>
        {policyOpen ? <RadarPolicyPanel key={radar.adaptive.policy.updatedAt} radar={radar} onSaved={onRadarChange} onClose={() => setPolicyOpen(false)} /> : null}
      </div>
    );
  }

  return (
    <div className="mm-radar-operations-workspace grid gap-4" data-testid="radar-operations-workspace">
      <section className="mm-radar-operations-console overflow-hidden rounded-lg border border-[#29352f] bg-[#111513] text-white shadow-[0_18px_44px_rgba(0,0,0,0.14)]" aria-labelledby="business-radar-heading">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="relative mt-0.5 grid size-10 shrink-0 place-items-center rounded-md border border-emerald-300/20 bg-emerald-300/10 text-emerald-300">
              <RadioTower size={19} />
              <span className="absolute -right-1 -top-1 size-2.5 animate-pulse rounded-full border-2 border-[#111513] bg-emerald-400" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Active business radar</p>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-emerald-200">{radar.adaptive.operatingStage}</span>
              </div>
              <h2 id="business-radar-heading" className="mt-1 text-xl font-semibold text-white sm:text-2xl">Radar operations workspace</h2>
              <p className="mt-1 text-xs text-white/50">{attentionCount} command incidents · {radar.summary.applicableChecks.toLocaleString()} applicable checks · {radar.adaptive.learningChecks.toLocaleString()} learning · {radar.adaptive.inactiveChecks.toLocaleString()} inactive · {radar.adaptive.alwaysOnChecks.toLocaleString()} protected · {radar.summary.correlatedRisks} compound risks · last sweep {formatRadarAge(radar.generatedAt)} · automatic rescan every minute</p>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button type="button" onClick={onOpenExecutive} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm font-semibold text-white hover:bg-white/10">
              <Radar size={15} /> Executive view
            </button>
            <button type="button" onClick={() => onOpenInspector()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm font-semibold text-white hover:bg-white/10">
              <Database size={15} /> Data inspector
            </button>
            <button type="button" onClick={() => setPolicyOpen(current => !current)} aria-expanded={policyOpen} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm font-semibold text-white hover:bg-white/10">
              <Settings2 size={15} /> Policy
            </button>
            <button type="button" onClick={() => void refreshRadar()} disabled={scanBusy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50">
              <RefreshCw size={15} className={scanBusy ? "animate-spin" : ""} /> {scanBusy ? "Scanning" : "Scan now"}
            </button>
            <button type="button" onClick={() => window.dispatchEvent(new Event("aqua-advisor:open"))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-[#111513] hover:bg-white/90">
              <Bot size={15} /> {advisorConfigured ? "Ask Advisor" : "Open Advisor"}
            </button>
          </div>
        </header>

        {scanError ? <div role="alert" className="border-b border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100 sm:px-6">{scanError}</div> : null}

        <div className="grid grid-cols-2 border-b border-white/10 sm:grid-cols-4 xl:grid-cols-8">
          <RadarMetric icon={<Gauge size={14} />} label="Health" value={`${radar.adaptive.healthScore}/100`} tone={radar.adaptive.healthScore < 40 ? "critical" : radar.adaptive.healthScore < 70 ? "warning" : "healthy"} detail="Overall business outcome score: 70% company health and 30% current incident health. Critical incidents subtract 18 points, warnings 7, and watch findings 2 before the blend is applied." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "kpis", status: "attention" })} />
          <RadarMetric icon={<ShieldCheck size={14} />} label="Confidence" value={`${radar.adaptive.confidencePercent}%`} tone={radar.adaptive.confidencePercent < 40 ? "critical" : radar.adaptive.confidencePercent < 70 ? "warning" : "healthy"} detail="How trustworthy the assessment is: 55% connected-source confidence and 45% check confidence. Learning checks contribute partial confidence; blind checks contribute none." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "sources" })} />
          <RadarMetric icon={<Target size={14} />} label="Setup" value={`${radar.adaptive.readinessPercent}%`} tone={radar.adaptive.readinessPercent < 40 ? "critical" : radar.adaptive.readinessPercent < 70 ? "warning" : "healthy"} detail="Average readiness across every Radar domain. It combines whether required sources are connected with whether checks have enough evidence to make dependable decisions." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "sources" })} />
          <RadarMetric icon={<AlertTriangle size={14} />} label="Critical" value={radar.summary.critical} tone={radar.summary.critical ? "critical" : "healthy"} detail="Command-level incidents requiring immediate attention. Related detector findings are grouped so one underlying problem does not create a wall of duplicate alarms." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "incidents", status: "critical" })} />
          <RadarMetric icon={<Activity size={14} />} label="Warnings" value={radar.summary.warning} tone={radar.summary.warning ? "warning" : "healthy"} detail="Command-level incidents outside their warning guardrails but not yet critical. Open the card to inspect every grouped finding and its supporting evidence." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "incidents", status: "warning" })} />
          <RadarMetric icon={<ScanSearch size={14} />} label="Checks live" value={radar.adaptive.liveChecks.toLocaleString()} tone="healthy" detail="Applicable checks with enough observable evidence to evaluate now. Learning, blind, and policy-inactive checks are excluded from this number." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "checks", status: "live" })} />
          <RadarMetric icon={<History size={14} />} label="Learning" value={radar.adaptive.learningChecks.toLocaleString()} tone="watch" detail="Checks that are connected but still accumulating the minimum sample size, history span, or comparison baseline required by policy." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "checks", status: "learning" })} />
          <RadarMetric icon={<EyeOff size={14} />} label="Blind" value={radar.summary.blindChecks.toLocaleString()} tone={radar.summary.blindChecks ? "warning" : "healthy"} detail="Applicable checks that cannot currently prove an outcome because their source, measurement, or required evidence is unavailable." onExplain={setMetricHelp} onClick={() => onOpenInspector({ tab: "checks", status: "blind" })} />
        </div>

        {metricHelp ? (
          <div role="status" aria-live="polite" className="flex items-start gap-3 border-b border-emerald-200/15 bg-emerald-200/[0.07] px-4 py-3 sm:px-6">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-emerald-200/10 text-emerald-200"><Info size={14} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white">How {metricHelp.label.toLowerCase()} works</p>
              <p className="mt-1 max-w-4xl text-xs leading-5 text-white/60">{metricHelp.detail}</p>
            </div>
            <button type="button" onClick={() => setMetricHelp(null)} aria-label="Close metric explanation" title="Close explanation" className="grid size-7 shrink-0 place-items-center rounded-md text-white/35 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"><X size={14} aria-hidden="true" /></button>
          </div>
        ) : null}

        <div className="grid border-b border-white/10 md:grid-cols-2 xl:grid-cols-4">
          {radar.adaptive.conclusions.map(conclusion => <Link key={conclusion.id} href={conclusion.href} className="border-white/10 px-4 py-3 hover:bg-white/[0.04] md:border-r sm:px-5"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${conclusion.severity === "critical" ? "bg-red-400" : conclusion.severity === "warning" ? "bg-amber-300" : conclusion.severity === "watch" ? "bg-sky-300" : "bg-white/35"}`} /><span className="text-[10px] font-semibold uppercase text-white/40">{domainLabel(conclusion.domain)}</span></div><p className="mt-1.5 text-sm font-semibold text-white">{conclusion.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-white/42">{conclusion.detail}</p></Link>)}
        </div>

        <RadarMemoryTimeline memory={radar.memory} onInspect={onOpenInspector} />
        <RadarEvidenceVault evidence={radar.evidence} onInspect={onOpenInspector} />
        <CommercialLifecycleStrip commercial={radar.commercial} onInspect={onOpenInspector} />

        <div className="grid lg:grid-cols-[minmax(340px,.92fr)_minmax(0,1.08fr)]">
          <div className="border-b border-white/10 p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => onOpenInspector({ tab: "checks", domain: activeDomain })} aria-label={`Inspect ${radar.summary.totalChecks.toLocaleString()}-point scanner`} className="group text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Live scope</span>
                <span className="mt-1 flex items-center gap-2 text-base font-semibold text-white">{radar.summary.totalChecks.toLocaleString()}-point scanner <ArrowUpRight size={13} className="text-white/25 transition group-hover:text-emerald-200" /></span>
              </button>
              <select value={activeDomain} onChange={event => setActiveDomain(event.target.value as AdvisorDomain | "all")} aria-label="Radar domain" className="min-h-9 rounded-md border border-white/15 bg-[#1a201d] px-2.5 text-xs font-semibold text-white outline-none">
                <option value="all">All domains</option>
                {RADAR_DOMAINS.map(domain => <option key={domain} value={domain}>{domainLabel(domain)}</option>)}
              </select>
            </div>

            <div className="relative mx-auto mt-6 aspect-square w-full max-w-[470px]" aria-label="Business domain radar">
              <div className="absolute inset-[8%] rounded-full border border-emerald-200/16" />
              <div className="absolute inset-[22%] rounded-full border border-emerald-200/13" />
              <div className="absolute inset-[36%] rounded-full border border-emerald-200/10" />
              <div className="absolute bottom-1/2 left-1/2 h-[43%] w-px origin-bottom animate-spin bg-emerald-300/45 [animation-duration:7s]">
                <span className="absolute -left-1 -top-1 size-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,.8)]" />
              </div>
              <button type="button" onClick={() => onOpenInspector({ tab: "checks", domain: activeDomain })} aria-label={`Inspect ${activeDomain === "all" ? "all" : domainLabel(activeDomain)} Radar checks`} className="group absolute left-1/2 top-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-[#151b18] text-center shadow-[0_0_32px_rgba(52,211,153,.08)] transition hover:border-emerald-200/35 hover:bg-[#1b2420] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
                <div><strong className="block text-2xl tabular-nums text-white">{activeDomain === "all" ? radar.summary.totalChecks.toLocaleString() : radar.domains.find(item => item.domain === activeDomain)?.totalChecks ?? 0}</strong><span className="text-[9px] font-semibold uppercase tracking-wide text-white/42">{activeDomain === "all" ? "checks armed" : "domain checks"}</span></div>
              </button>
              {domainSummaries.map(item => (
                <button key={item.domain} type="button" onClick={() => setActiveDomain(current => current === item.domain ? "all" : item.domain)} title={`${domainLabel(item.domain)}: ${item.checks} checks, ${item.firing} firing, ${item.blind} blind, ${item.issues} signals`} className={`absolute z-10 flex min-h-7 max-w-[88px] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-semibold transition hover:scale-105 ${activeDomain === item.domain ? "border-white bg-white text-[#111513]" : radarNodeClass(item.status)}`} style={item.position}>
                  <span className="size-1.5 shrink-0 rounded-full bg-current" /><span className="truncate">{domainLabel(item.domain)}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              <RadarDetail label="Oldest lead wait" value={radar.speedToLead.oldestWaitingMs === null ? "Clear" : formatRadarDuration(radar.speedToLead.oldestWaitingMs)} onClick={() => onOpenInspector({ tab: "kpis", query: "awaiting-response", domain: "sales" })} />
              <RadarDetail label="Outside target" value={String(radar.speedToLead.breachedCount)} onClick={() => onOpenInspector({ tab: "kpis", query: "target-breaches", domain: "sales" })} />
              <RadarDetail label="Awaiting reply" value={String(radar.speedToLead.awaitingResponseCount)} onClick={() => onOpenInspector({ tab: "kpis", query: "awaiting-response", domain: "sales" })} />
              <RadarDetail label="Within target" value={radar.speedToLead.withinTargetPercent === null ? "No sample" : `${radar.speedToLead.withinTargetPercent}%`} onClick={() => onOpenInspector({ tab: "kpis", query: "speed-to-lead", domain: "sales" })} />
              <RadarDetail label="Check coverage" value={`${coveragePercent}%`} onClick={() => onOpenInspector({ tab: "checks", status: "applicable" })} />
              <RadarDetail label="Learning" value={radar.summary.learningChecks.toLocaleString()} onClick={() => onOpenInspector({ tab: "checks", status: "learning" })} />
              <RadarDetail label="Inactive by policy" value={radar.summary.inactiveChecks.toLocaleString()} onClick={() => onOpenInspector({ tab: "checks", status: "inactive" })} />
              <RadarDetail label="Evidence assured" value={`${radar.summary.assurancePercent}%`} onClick={() => onOpenInspector({ tab: "checks", status: "assured" })} />
              <RadarDetail label="Compound risks" value={radar.summary.correlatedRisks.toLocaleString()} onClick={() => onOpenInspector({ tab: "incidents", query: "correlation:" })} />
              <RadarDetail label="Sentinel mesh" value={radar.summary.sentinelChecks.toLocaleString()} onClick={() => onOpenInspector({ tab: "checks", scope: "sentinel" })} />
              <RadarDetail label="Properties watched" value={radar.summary.monitoredProperties.toLocaleString()} onClick={() => onOpenInspector({ tab: "checks", scope: "property" })} />
              <RadarDetail label="Active canaries" value={`${radar.summary.syntheticProperties.toLocaleString()} properties`} onClick={() => onOpenInspector({ tab: "checks", scope: "synthetic" })} />
              <RadarDetail label="Failed probes" value={radar.summary.failedSyntheticProbes.toLocaleString()} onClick={() => onOpenInspector({ tab: "checks", status: "attention", scope: "synthetic", lens: "connection" })} />
              <RadarDetail label="Historical checks" value={radar.summary.historicalChecks.toLocaleString()} onClick={() => onOpenInspector({ tab: "checks", scope: "history" })} />
              <RadarDetail label="Baseline coverage" value={`${radar.summary.baselineCoveragePercent}%`} onClick={() => onOpenInspector({ tab: "checks", scope: "history", lens: "baseline" })} />
              <RadarDetail label="Evidence samples" value={radar.summary.evidenceSamples.toLocaleString()} onClick={() => onOpenInspector({ tab: "evidence" })} />
              <RadarDetail label="Pattern breaks" value={radar.summary.historicalAnomalies.toLocaleString()} onClick={() => onOpenInspector({ tab: "checks", status: "firing", scope: "history", lens: "anomaly" })} />
              <RadarDetail label="Lead conversion" value={radar.commercial.conversionRatePercent === null ? "Learning" : `${radar.commercial.conversionRatePercent}%`} onClick={() => onOpenInspector({ tab: "kpis", query: "lead-conversion-rate", domain: "sales" })} />
              <RadarDetail label="Portfolio retention" value={radar.commercial.retentionRatePercent === null ? "Learning" : `${radar.commercial.retentionRatePercent}%`} onClick={() => onOpenInspector({ tab: "kpis", query: "portfolio-retention", domain: "clients" })} />
              <RadarDetail label="Churned in 90d" value={radar.commercial.recentlyChurnedClientCount.toLocaleString()} onClick={() => onOpenInspector({ tab: "kpis", query: "recent-client-churn", domain: "clients" })} />
              <RadarDetail label="Cancellation risk" value={radar.commercial.pendingCancellationCount.toLocaleString()} onClick={() => onOpenInspector({ tab: "kpis", query: "pending-cancellations", domain: "clients" })} />
              <RadarDetail label="Lifecycle checks" value={radar.summary.commercialLifecycleChecks.toLocaleString()} onClick={() => onOpenInspector({ tab: "checks", query: "commercial:lifecycle", scope: "kpi" })} />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
              <button type="button" onClick={() => onOpenInspector({ tab: feedMode === "signals" ? "incidents" : "checks", domain: activeDomain, status: feedMode === "checks" && checkFilter !== "all" && checkFilter !== "pass" ? checkFilter : "all", scope: feedMode === "checks" ? checkScope : "all" })} aria-label={`Inspect ${activeDomain === "all" ? "whole business" : domainLabel(activeDomain)} scanner ledger`} className="group text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Scanner ledger</span>
                <span className="mt-1 flex items-center gap-2 text-base font-semibold text-white">{activeDomain === "all" ? "Whole business" : domainLabel(activeDomain)} <ArrowUpRight size={13} className="text-white/25 transition group-hover:text-emerald-200" /></span>
              </button>
              <div className="inline-flex rounded-md border border-white/15 bg-white/[0.04] p-1" role="tablist" aria-label="Radar feed">
                <button type="button" role="tab" aria-selected={feedMode === "signals"} onClick={() => setFeedMode("signals")} className={`min-h-8 rounded px-2.5 text-[11px] font-semibold ${feedMode === "signals" ? "bg-white text-[#111513]" : "text-white/55 hover:text-white"}`}>Incidents {visibleIssues.length}</button>
                <button type="button" role="tab" aria-selected={feedMode === "checks"} onClick={() => setFeedMode("checks")} className={`min-h-8 rounded px-2.5 text-[11px] font-semibold ${feedMode === "checks" ? "bg-white text-[#111513]" : "text-white/55 hover:text-white"}`}>Checks {activeDomain === "all" ? radar.summary.totalChecks : radar.domains.find(item => item.domain === activeDomain)?.totalChecks ?? 0}</button>
              </div>
            </div>
            {feedMode === "checks" ? (
              <div className="grid gap-2 border-b border-white/10 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-6">
                <label className="relative block min-w-0">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                  <input value={checkQuery} onChange={event => setCheckQuery(event.target.value)} placeholder="Search checks, sources, evidence..." aria-label="Search radar checks" className="min-h-9 w-full rounded-md border border-white/15 bg-white/[0.06] pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/30 focus:border-emerald-300/40" />
                </label>
                <select value={checkFilter} onChange={event => setCheckFilter(event.target.value as typeof checkFilter)} aria-label="Check status" className="min-h-9 rounded-md border border-white/15 bg-[#1a201d] px-2.5 text-xs font-semibold text-white outline-none">
                  <option value="attention">Needs attention</option>
                  <option value="blind">Blind only</option>
                  <option value="learning">Learning only</option>
                  <option value="inactive">Inactive only</option>
                  <option value="pass">Passing only</option>
                  <option value="all">Every check</option>
                </select>
                <select value={checkScope} onChange={event => setCheckScope(event.target.value as typeof checkScope)} aria-label="Check layer" className="min-h-9 rounded-md border border-white/15 bg-[#1a201d] px-2.5 text-xs font-semibold text-white outline-none">
                  <option value="all">All layers</option>
                  <option value="kpi">KPI checks</option>
                  <option value="source">Source sentinels</option>
                  <option value="property">Property sentinels</option>
                  <option value="synthetic">Synthetic canaries</option>
                  <option value="history">Historical evidence</option>
                  <option value="watchdog">Radar watchdogs</option>
                </select>
              </div>
            ) : null}
            <div className="max-h-[720px] divide-y divide-white/10 overflow-y-auto">
              {feedMode === "signals" ? visibleIssues.map(issue => {
                const exactChecks = issue.checkIds.map(checkId => radar.checks.find(check => check.id === checkId)).filter((check): check is BusinessRadarCheck => Boolean(check));
                return (
                  <article key={issue.id} className="group grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6">
                    <button type="button" onClick={() => onOpenInspector({ tab: "incidents", query: issue.id, domain: issue.domain })} aria-label={`Inspect incident ${issue.title}`} className="min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${radarSeverityClass(issue.severity)}`}>{issue.severity}</span>
                        <span className="text-[10px] font-semibold uppercase text-white/35">{domainLabel(issue.domain)}</span>
                      </div>
                      <h4 className="mt-2 text-sm font-semibold leading-5 text-white">{issue.title}</h4>
                      <p className="mt-1 text-xs leading-5 text-white/48">{issue.detail}</p>
                      <p className="mt-2 text-[11px] font-semibold text-white/42">{issue.issueIds.length} underlying issue{issue.issueIds.length === 1 ? "" : "s"} · {issue.checkIds.length} exact check{issue.checkIds.length === 1 ? "" : "s"}</p>
                      {exactChecks.length ? <div className="mt-3 border-l border-white/15 pl-3"><p className="text-[9px] font-semibold uppercase text-white/30">What exactly</p><ul className="mt-1.5 space-y-1">{exactChecks.slice(0, 3).map(check => <li key={check.id} className="flex min-w-0 items-center gap-2 text-[11px] leading-4 text-white/48"><span className={`size-1.5 shrink-0 rounded-full ${check.status === "blind" || check.status === "critical" ? "bg-red-400" : check.status === "warning" ? "bg-amber-300" : "bg-sky-300"}`} /><span className="truncate">{check.title}</span></li>)}</ul>{exactChecks.length > 3 ? <p className="mt-1 text-[10px] text-white/30">+{exactChecks.length - 3} more in the exact breakdown</p> : null}</div> : issue.evidence[0] ? <p className="mt-2 text-[11px] leading-4 text-white/35">{issue.evidence[0]}</p> : null}
                    </button>
                    <div className="flex flex-wrap items-start gap-1 sm:justify-end">
                      <button type="button" onClick={() => void onCreateTask(issue)} disabled={taskBusyId === `radar:${issue.id}`} title="Add to strict queue" aria-label={`Add ${issue.title} to strict queue`} className="grid size-9 place-items-center rounded-md border border-white/15 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50">
                        {taskBusyId === `radar:${issue.id}` ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={15} />}
                      </button>
                      <button type="button" onClick={() => onOpenInspector({ tab: "incidents", query: issue.id, domain: issue.domain })} title="Inspect raw findings and every exact check" aria-label={`Open exact breakdown for ${issue.title}`} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/15 px-2.5 text-[11px] font-semibold text-white/65 hover:bg-white/10 hover:text-white"><Database size={14} /> Exact breakdown</button>
                      <Link href={issue.href} title="Open operational workspace" aria-label={`Open workspace for ${issue.title}`} className="grid size-9 place-items-center rounded-md border border-white/15 text-white/60 hover:bg-white/10 hover:text-white"><ArrowUpRight size={14} /></Link>
                    </div>
                  </article>
                );
              }) : displayedChecks.map(check => <RadarCheckRow key={check.id} check={check} onInspectCheck={() => onOpenInspector({ tab: "checks", query: check.id, domain: check.domain })} onInspectRecords={() => onOpenInspector({ tab: "records", query: check.sourceId, domain: check.domain })} />)}
              {feedMode === "signals" && !visibleIssues.length ? <div className="px-6 py-16 text-center"><ShieldCheck className="mx-auto text-emerald-300" size={26} /><p className="mt-3 text-sm font-semibold text-white">Domain clear</p><p className="mt-1 text-xs text-white/40">No current signals in this scope.</p></div> : null}
              {feedMode === "checks" && !displayedChecks.length ? <div className="px-6 py-16 text-center"><ScanSearch className="mx-auto text-emerald-300" size={26} /><p className="mt-3 text-sm font-semibold text-white">No matching checks</p><p className="mt-1 text-xs text-white/40">Change the domain, status, or search phrase.</p></div> : null}
              {feedMode === "checks" && matchingChecks.length > displayedChecks.length ? <div className="px-6 py-3 text-center text-[11px] text-white/35">Showing the first {displayedChecks.length} of {matchingChecks.length} matching checks. Select a domain to narrow the scanner.</div> : null}
            </div>
          </div>
        </div>
      </section>

      {policyOpen ? <RadarPolicyPanel key={radar.adaptive.policy.updatedAt} radar={radar} onSaved={onRadarChange} onClose={() => setPolicyOpen(false)} /> : null}

      <section className="mm-radar-coverage-matrix mm-surface-card overflow-hidden rounded-lg border border-black/10" aria-labelledby="radar-coverage-heading">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3"><span className="mm-area-icon grid size-10 shrink-0 place-items-center rounded-md"><ShieldCheck size={18} /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Never-blind matrix</p><h3 id="radar-coverage-heading" className="mt-1 text-lg font-semibold text-black/85">Check coverage by business area</h3></div></div>
          <div className="text-right"><p className="text-lg font-semibold tabular-nums text-black/80">{coveragePercent}%</p><p className="text-[10px] font-semibold uppercase text-black/35">observable · {radar.summary.assurancePercent}% assured</p></div>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3">
          {radar.domains.map((domain, index) => (
            <button key={domain.domain} type="button" onClick={() => { setActiveDomain(domain.domain); setFeedMode("checks"); setCheckFilter(domain.blindChecks ? "blind" : domain.firingChecks ? "attention" : "all"); }} className={`group grid min-h-32 grid-rows-[auto_auto_1fr] gap-3 border-black/10 px-4 py-4 text-left hover:bg-black/[0.025] sm:px-5 ${index ? "border-t sm:border-l xl:border-t-0" : ""}`}>
              <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase text-black/55">{domainLabel(domain.domain)}</span><span className="text-[10px] font-semibold tabular-nums text-black/35">{domain.applicableChecks} applicable · {domain.confidencePercent}% confidence</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.07]"><div className={`h-full rounded-full ${domain.blindChecks ? "bg-amber-500" : domain.firingChecks ? "bg-red-500" : "bg-emerald-600"}`} style={{ width: `${Math.max(2, domain.coveragePercent)}%` }} /></div>
              <div className="grid grid-cols-5 gap-2 self-end text-[10px] tabular-nums"><span><strong className="block text-sm text-emerald-700">{domain.passedChecks}</strong><span className="text-black/35">pass</span></span><span><strong className="block text-sm text-red-700">{domain.firingChecks}</strong><span className="text-black/35">fire</span></span><span><strong className="block text-sm text-violet-700">{domain.learningChecks}</strong><span className="text-black/35">learn</span></span><span><strong className="block text-sm text-sky-700">{domain.watchChecks}</strong><span className="text-black/35">watch</span></span><span><strong className="block text-sm text-amber-700">{domain.blindChecks}</strong><span className="text-black/35">blind</span></span></div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-black/10 bg-black/[0.015] px-4 py-3 sm:px-5">
          <div><p className="text-[10px] font-semibold uppercase text-black/35">Source connections</p><p className="mt-0.5 text-sm font-semibold text-black/70">{radar.summary.connectedSources}/{radar.summary.totalSources} sources watched</p></div>
          <Link href="/portal/agency/company?view=connections" className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/55 hover:bg-black/[0.03]" title="Manage connections" aria-label="Manage radar connections"><ArrowUpRight size={14} /></Link>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3">
          {radar.coverage.map((source, index) => <CoverageRow key={source.id} source={source} divided={index > 0} onInspect={() => onOpenInspector({ tab: "records", query: source.id, domain: source.domain })} />)}
        </div>
      </section>
    </div>
  );
}

function RadarMetric({ icon, label, value, tone, detail, onClick, onExplain }: { icon: React.ReactNode; label: string; value: string | number; tone: "critical" | "warning" | "watch" | "healthy"; detail: string; onClick: () => void; onExplain: (help: RadarMetricHelp) => void }) {
  const toneClass = tone === "critical" ? "text-red-300" : tone === "warning" ? "text-amber-300" : tone === "watch" ? "text-sky-300" : "text-emerald-300";
  return <div className="relative min-w-0 border-r border-t border-white/10 first:border-t-0 lg:border-t-0">
    <button type="button" onClick={onClick} title={`Inspect ${label}`} aria-label={`Inspect ${label}: ${value}`} className="group block min-h-[78px] w-full px-4 py-3 text-left transition hover:bg-white/[0.055] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 sm:px-5">
      <span className={`flex min-w-0 items-center gap-2 pr-6 text-[10px] font-semibold uppercase ${toneClass}`}>{icon}<span className="truncate">{label}</span></span>
      <span className="mt-1 flex items-end justify-between gap-2"><strong className="min-w-0 truncate text-xl tabular-nums text-white">{value}</strong><ArrowUpRight size={12} className="mb-1 shrink-0 text-white/25 transition group-hover:text-emerald-200" /></span>
    </button>
    <button type="button" onClick={() => onExplain({ label, detail })} aria-label={`Explain ${label}`} title={`How ${label.toLowerCase()} works`} className="absolute right-2 top-2 z-20 grid size-6 place-items-center rounded-md text-white/30 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"><Info size={13} aria-hidden="true" /></button>
  </div>;
}

function RadarDetail({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  if (!onClick) return <div className="bg-[#181e1b] px-3 py-3"><p className="text-[9px] font-semibold uppercase text-white/35">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-white">{value}</p></div>;
  return <button type="button" onClick={onClick} title={`Inspect ${label}`} aria-label={`Inspect ${label}: ${value}`} className="group min-w-0 bg-[#181e1b] px-3 py-3 text-left transition hover:bg-[#222b27] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
    <span className="flex items-center justify-between gap-2 text-[9px] font-semibold uppercase text-white/40"><span className="min-w-0 truncate">{label}</span><ArrowUpRight size={11} className="shrink-0 text-emerald-300/45 transition group-hover:text-emerald-200" /></span>
    <span className="mt-1 block truncate text-sm font-semibold tabular-nums text-white">{value}</span>
  </button>;
}

function RadarMemoryTimeline({ memory, onInspect }: { memory: BusinessIssueRadar["memory"]; onInspect: OpenRadarInspector }) {
  const statusLabel = memory.status === "first-sweep" ? "Learning baseline" : memory.status === "delayed" ? "Sweep continuity delayed" : "Temporal continuity live";
  const statusClass = memory.status === "delayed" ? "text-amber-300" : "text-emerald-300";
  const points = memory.history.slice(-48);
  return <div className="grid gap-4 border-b border-white/10 bg-white/[0.025] px-4 py-4 sm:px-6 xl:grid-cols-[minmax(0,.72fr)_minmax(320px,1.28fr)]">
    <div className="min-w-0">
      <button type="button" onClick={() => onInspect({ tab: "evidence" })} aria-label={`Inspect ${memory.totalSweeps.toLocaleString()} recorded Radar sweeps`} className="group flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2"><History size={14} className={statusClass} /><span className={`text-[10px] font-semibold uppercase ${statusClass}`}>{statusLabel}</span></span>
        <span className="inline-flex items-center gap-1.5 text-[10px] tabular-nums text-white/35">{memory.totalSweeps.toLocaleString()} recorded sweeps <ArrowUpRight size={11} className="transition group-hover:text-emerald-200" /></span>
      </button>
      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10">
        <RadarMemoryStat label="New" value={memory.newIssues} tone={memory.newIssues ? "warning" : "neutral"} onClick={() => onInspect({ tab: "incidents" })} />
        <RadarMemoryStat label="Worsening" value={memory.worseningIssues} tone={memory.worseningIssues ? "critical" : "neutral"} onClick={() => onInspect({ tab: "incidents", status: "attention" })} />
        <RadarMemoryStat label="Recovered" value={memory.recoveredIssues} tone={memory.recoveredIssues ? "positive" : "neutral"} onClick={() => onInspect({ tab: "evidence" })} />
        <RadarMemoryStat label="Recurring" value={memory.recurringIssues} tone={memory.recurringIssues ? "warning" : "neutral"} onClick={() => onInspect({ tab: "incidents", status: "attention" })} />
        <RadarMemoryStat label="Flapping" value={memory.flappingSources} tone={memory.flappingSources ? "critical" : "neutral"} onClick={() => onInspect({ tab: "sources" })} />
        <RadarMemoryStat label="Oldest open" value={memory.oldestOpenIssueMs === undefined ? "New" : formatRadarDuration(memory.oldestOpenIssueMs)} tone={memory.longRunningIssues ? "warning" : "neutral"} onClick={() => onInspect({ tab: "incidents", status: "attention" })} />
      </div>
    </div>
    <div className="min-w-0">
      <button type="button" onClick={() => onInspect({ tab: "evidence" })} aria-label="Inspect assurance memory" className="group flex w-full items-center justify-between gap-3 pr-12 text-left sm:pr-0"><span className="text-[10px] font-semibold uppercase text-white/35">Assurance memory</span><span className="inline-flex items-center gap-1.5 text-right text-[10px] leading-4 tabular-nums text-white/35">{signedInteger(memory.assuranceDelta)} assurance · {signedInteger(memory.firingDelta)} alarms · {signedInteger(memory.blindDelta)} blind <ArrowUpRight size={11} className="shrink-0 transition group-hover:text-emerald-200" /></span></button>
      <button type="button" onClick={() => onInspect({ tab: "evidence" })} className="mt-3 flex h-12 w-full items-end gap-1 text-left" aria-label="Inspect Radar assurance history">
        {points.map((point, index) => <span key={`${point.at}:${index}`} className={`min-w-1 flex-1 rounded-sm ${point.blindChecks ? "bg-red-400" : point.criticalIssues ? "bg-amber-300" : "bg-emerald-300"}`} style={{ height: `${Math.max(8, point.assurancePercent)}%` }} title={`${formatUkDate(point.at, { dateStyle: "medium", timeStyle: "short" })}: ${point.assurancePercent}% assured, ${point.firingChecks} alarms, ${point.blindChecks} blind`} />)}
        {!points.length ? <span className="text-xs text-white/35">The first recorded sweep will establish this timeline.</span> : null}
      </button>
    </div>
  </div>;
}

function RadarMemoryStat({ label, value, tone, onClick }: { label: string; value: React.ReactNode; tone: "critical" | "warning" | "positive" | "neutral"; onClick?: () => void }) {
  const valueClass = tone === "critical" ? "text-red-300" : tone === "warning" ? "text-amber-300" : tone === "positive" ? "text-emerald-300" : "text-white";
  if (!onClick) return <div className="bg-[#151a17] px-3 py-2.5"><p className="text-[9px] font-semibold uppercase text-white/35">{label}</p><p className={`mt-1 text-sm font-semibold tabular-nums ${valueClass}`}>{value}</p></div>;
  return <button type="button" onClick={onClick} aria-label={`Inspect ${label}: ${String(value)}`} className="group bg-[#151a17] px-3 py-2.5 text-left transition hover:bg-[#202823] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"><span className="flex items-center justify-between gap-2 text-[9px] font-semibold uppercase text-white/35"><span>{label}</span><ArrowUpRight size={10} className="transition group-hover:text-emerald-200" /></span><span className={`mt-1 block text-sm font-semibold tabular-nums ${valueClass}`}>{value}</span></button>;
}

function RadarEvidenceVault({ evidence, onInspect }: { evidence: BusinessIssueRadar["evidence"]; onInspect: OpenRadarInspector }) {
  return <div className="grid gap-4 border-b border-white/10 bg-[#121714] px-4 py-4 sm:px-6 xl:grid-cols-[minmax(0,.78fr)_minmax(320px,1.22fr)]">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => onInspect({ tab: "evidence" })} aria-label="Inspect durable evidence vault" className="group flex items-center gap-2"><Database size={14} className="text-sky-300" /><span className="text-[10px] font-semibold uppercase text-sky-300">Durable evidence vault</span><ArrowUpRight size={10} className="text-sky-300/45 transition group-hover:text-sky-200" /></button>
        <button type="button" onClick={() => onInspect({ tab: "evidence" })} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-white/15 px-2.5 text-[10px] font-semibold text-white/60 hover:bg-white/10 hover:text-white"><Database size={12} /> Inspect {evidence.totalSamples.toLocaleString()} samples</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-4 xl:grid-cols-2">
        <RadarMemoryStat label="KPI streams" value={`${evidence.measurableSeries}/${evidence.totalSeries}`} tone="neutral" onClick={() => onInspect({ tab: "evidence" })} />
        <RadarMemoryStat label="Baselines ready" value={evidence.baselineReadySeries} tone={evidence.baselineCoveragePercent >= 90 ? "positive" : "warning"} onClick={() => onInspect({ tab: "checks", status: "assured", scope: "history", lens: "baseline" })} />
        <RadarMemoryStat label="Pattern breaks" value={evidence.anomalousSeries} tone={evidence.anomalousSeries ? "critical" : "neutral"} onClick={() => onInspect({ tab: "checks", status: "firing", scope: "history", lens: "anomaly" })} />
        <RadarMemoryStat label="Recording gaps" value={evidence.recordingGaps} tone={evidence.recordingGaps ? "warning" : "positive"} onClick={() => onInspect({ tab: "checks", status: "attention", scope: "history", lens: "continuity" })} />
      </div>
    </div>
    <div className="min-w-0">
      <button type="button" onClick={() => onInspect({ tab: "checks", scope: "history", lens: "baseline" })} aria-label={`Inspect baseline coverage: ${evidence.baselineCoveragePercent}%`} className="group w-full text-left">
        <span className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold uppercase text-white/35">Baseline coverage</span><span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tabular-nums text-white/60">{evidence.baselineCoveragePercent}% <ArrowUpRight size={11} className="transition group-hover:text-sky-200" /></span></span>
        <span className="mt-3 block h-2 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-sky-300 transition-[width] duration-500" style={{ width: `${Math.max(1, evidence.baselineCoveragePercent)}%` }} /></span>
      </button>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {evidence.topMovements.slice(0, 4).map(movement => <button type="button" onClick={() => onInspect({ tab: "evidence", query: movement.familyLabel, domain: movement.domain })} aria-label={`Inspect evidence movement ${movement.familyLabel}`} key={movement.id} className="group flex min-w-0 items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:bg-white/[0.075] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
          <div className="min-w-0"><p className="truncate text-[10px] font-semibold text-white/68">{movement.familyLabel}</p><p className="mt-0.5 text-[9px] uppercase text-white/30">{domainLabel(movement.domain)} · {movement.deviationScore.toFixed(1)} deviations</p></div>
          <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums ${movement.adverse ? "text-amber-300" : "text-sky-300"}`}>{signedDecimal(movement.changePercent)}% <ArrowUpRight size={10} className="opacity-45 transition group-hover:opacity-100" /></span>
        </button>)}
        {!evidence.topMovements.length ? <p className="sm:col-span-2 text-xs leading-5 text-white/35">Retained sweeps are building comparison baselines. Movement evidence appears here as each stream matures.</p> : null}
      </div>
    </div>
  </div>;
}

function CommercialLifecycleStrip({ commercial, onInspect }: { commercial: BusinessIssueRadar["commercial"]; onInspect: OpenRadarInspector }) {
  const cohorts = commercial.cohorts.slice(0, 4);
  return (
    <section className="border-b border-white/10" aria-labelledby="commercial-lifecycle-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <button type="button" onClick={() => onInspect({ tab: "checks", query: "commercial:lifecycle", scope: "kpi" })} aria-label="Inspect commercial lifecycle checks" className="group text-left">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/65">Commercial lifecycle</span>
          <span id="commercial-lifecycle-heading" className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">Source quality from first lead to retained client <ArrowUpRight size={12} className="text-white/25 transition group-hover:text-emerald-200" /></span>
        </button>
        <Link href="/portal/clients?view=journey" className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-white/55 hover:text-white">Open journey evidence <ArrowUpRight size={13} /></Link>
      </div>
      <div className="grid grid-cols-2 border-b border-white/10 sm:grid-cols-4">
        <RadarDetail label="Leads retained" value={commercial.leadCount.toLocaleString()} onClick={() => onInspect({ tab: "records", domain: "sales" })} />
        <RadarDetail label="Converted" value={commercial.conversionRatePercent === null ? "Learning" : `${commercial.conversionRatePercent}%`} onClick={() => onInspect({ tab: "kpis", query: "lead-conversion-rate", domain: "sales" })} />
        <RadarDetail label="Retention" value={commercial.retentionRatePercent === null ? "Learning" : `${commercial.retentionRatePercent}%`} onClick={() => onInspect({ tab: "kpis", query: "portfolio-retention", domain: "clients" })} />
        <RadarDetail label="Pending exits" value={commercial.pendingCancellationCount.toLocaleString()} onClick={() => onInspect({ tab: "kpis", query: "pending-cancellations", domain: "clients" })} />
      </div>
      {cohorts.length ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          {cohorts.map((cohort, index) => (
            <button type="button" onClick={() => onInspect({ tab: "records", query: cohort.label, domain: "sales" })} aria-label={`Inspect commercial cohort ${cohort.label}`} key={cohort.key} className={`group min-w-0 px-4 py-3 text-left transition hover:bg-white/[0.045] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 sm:px-5 ${index < cohorts.length - 1 ? "border-b border-white/10 sm:border-r xl:border-b-0" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-white">{cohort.label}</p>
                <span className="inline-flex shrink-0 items-center gap-1.5"><span className={`size-2 rounded-full ${cohort.conversionSampleReady ? "bg-emerald-300" : "bg-sky-300/60"}`} title={cohort.conversionSampleReady ? "Cohort ready" : "Cohort learning"} /><ArrowUpRight size={10} className="text-white/25 transition group-hover:text-emerald-200" /></span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-white/42">
                <div><span className="block text-sm font-semibold tabular-nums text-white/80">{cohort.leadCount}</span>leads</div>
                <div><span className="block text-sm font-semibold tabular-nums text-white/80">{cohort.conversionRatePercent === null ? "-" : `${cohort.conversionRatePercent}%`}</span>convert</div>
                <div><span className="block text-sm font-semibold tabular-nums text-white/80">{cohort.churnRatePercent === null ? "-" : `${cohort.churnRatePercent}%`}</span>churn</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="px-4 py-5 text-xs leading-5 text-white/42 sm:px-6">Source cohorts will appear after the first lead or client source is recorded. Until then, conversion and churn comparisons remain in learning rather than pretending to be healthy.</div>
      )}
    </section>
  );
}

function RadarCheckRow({ check, onInspectCheck, onInspectRecords }: { check: BusinessRadarCheck; onInspectCheck: () => void; onInspectRecords: () => void }) {
  return <article className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6">
    <button type="button" onClick={onInspectCheck} aria-label={`Inspect Radar check ${check.title}`} className="group grid min-w-0 gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 sm:grid-cols-[auto_minmax(0,1fr)]">
      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border ${radarCheckIconClass(check.status)}`} title={radarCheckStatusLabel(check.status)}>
          {check.status === "pass" ? <Check size={14} /> : check.status === "blind" ? <EyeOff size={14} /> : check.status === "watch" ? <Crosshair size={14} /> : check.status === "learning" ? <History size={14} /> : check.status === "inactive" ? <Square size={14} /> : <AlertTriangle size={14} />}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${radarCheckStatusClass(check.status)}`}>{radarCheckStatusLabel(check.status)}</span>
          <span className="text-[10px] font-semibold uppercase text-white/35">{domainLabel(check.domain)} · {check.lensLabel} · {check.scope}</span>
        </span>
        <span className="mt-2 flex items-start justify-between gap-2 text-sm font-semibold leading-5 text-white"><span>{check.familyLabel}</span><ArrowUpRight size={12} className="mt-0.5 shrink-0 text-white/20 transition group-hover:text-emerald-200" /></span>
        <span className="mt-1 block text-xs leading-5 text-white/48">{check.detail}</span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/32"><span>Source {check.sourceId}</span>{check.evidence.slice(0, 2).map(item => <span key={item}>{item}</span>)}</span>
      </span>
    </button>
    <div className="flex gap-1"><button type="button" onClick={onInspectRecords} title="Inspect source records" aria-label={`Inspect source records for ${check.title}`} className="grid size-9 place-items-center rounded-md border border-white/15 text-white/60 hover:bg-white/10 hover:text-white"><Database size={14} /></button><Link href={check.href} title="Open operational workspace" aria-label={`Open workspace for ${check.title}`} className="grid size-9 place-items-center rounded-md border border-white/15 text-white/60 hover:bg-white/10 hover:text-white"><ArrowUpRight size={14} /></Link></div>
  </article>;
}

function CoverageRow({ source, divided, onInspect }: { source: AdvisorCoverageSource; divided: boolean; onInspect: () => void }) {
  const healthy = source.status === "connected" || source.status === "empty";
  return <div className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-black/10 px-4 py-3.5 sm:px-5 ${divided ? "border-t md:border-t-0 md:border-l" : ""}`}>
    <span className={`mt-1.5 size-2 rounded-full ${healthy ? source.status === "empty" ? "bg-sky-500" : "bg-emerald-600" : "bg-red-600"}`} />
    <div className="min-w-0"><p className="truncate text-sm font-semibold text-black/75">{source.label}</p><p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-black/42">{source.detail}</p></div>
    <div className="flex items-start gap-2"><div className="text-right"><p className={`text-[9px] font-bold uppercase ${healthy ? "text-emerald-700" : "text-red-700"}`}>{coverageStatusLabel(source.status)}</p><p className="mt-1 text-[10px] tabular-nums text-black/35">{source.recordCount} records</p></div><button type="button" onClick={onInspect} title={`Inspect ${source.label} records`} aria-label={`Inspect ${source.label} records`} className="grid size-8 place-items-center rounded-md border border-black/10 bg-white text-black/45 hover:bg-black/[0.03] hover:text-black/70"><Database size={13} /></button></div>
  </div>;
}
