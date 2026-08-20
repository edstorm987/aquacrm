"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { AdvisorCoverageSource, AdvisorDomain, BusinessIssueRadar, BusinessRadarCheck, BusinessRadarIssue, RadarCheckScope, RadarCheckStatus, RadarEvidenceInspectionIndex, RadarRuleLens } from "@/lib/radar/businessRadar";
import type { CommandIntelligenceSnapshot } from "@/lib/intelligence/commandIntelligence";
import { formatUkDate, isoDateTimeValue, timestampFromValue } from "@/lib/shared/formatDateTime";
import type { AgencyTask, AgencyTaskOrigin, AgencyTaskPriority, CommandCalendarEntry, CommandCalendarExternalEvent, CommandCalendarSource, CompanyProfile, DashboardDayPlan, DashboardWeekPlan, DashboardWeeklyEvidenceSnapshot, DashboardWorkSession } from "@/server/types";
import { ClockOutReviewDialog, type ClockOutReviewDraft } from "./_ClockOutReviewDialog";
import { CommandCentreKpiTrajectory } from "./_CommandCentreKpiTrajectory";
import type { BattleTablePayload, BattleTableSection } from "./_BattleTableWorkspace";
import type { WarRoomIncident } from "./_battleWarRoom";
import type { IntelligenceView } from "./_CommandIntelligenceWorkspace";
import { ClientsNeedingAttention } from "./_ClientsNeedingAttention";
import type { ClientAttentionItem } from "@/lib/server/clients/clientAttention";
import { RadarPolicyPanel } from "./_RadarPolicyPanel";
import { InfraHealthPanel } from "./_InfraHealthPanel";
import { FindingGroupBar } from "./_FindingGroupBar";
import type { RadarInspectionTab } from "./radar/RadarInspectionWorkspace";
import { CommandStationNav, type CommandStationAttention, type CommandStationMode } from "./_CommandStationNav";
import { DayCommandSensorPanel } from "./_DayCommandSensorPanel";
import { DayBriefingPanel, type DayTaskGenerationSummary } from "./_DayBriefingPanel";
import { DayKpiIntelligencePanel } from "./_DayKpiIntelligencePanel";
import { WeeklyReviewWorkspace, weeklyReviewDraftFromPlan } from "./_WeeklyReviewWorkspace";

// The non-default stations are code-split. Each renders ONLY behind an explicit
// station/mode click (battle · intelligence · radar inspector) and never on the
// canonical Day Command landing — but as static imports they still shipped and
// parsed (~3,300 lines of client TSX) on every dashboard load. `next/dynamic`
// moves them into their own chunks, fetched the moment the operator opens that
// station. Behaviour is identical; only the download timing changes.
const StationLoading = ({ label }: { label: string }) => (
  <div className="grid min-h-[24rem] place-items-center text-sm text-[#62e8ff]/60" role="status" aria-live="polite">
    Loading {label}…
  </div>
);

const BattleTableWorkspace = dynamic(
  () => import("./_BattleTableWorkspace").then(m => m.BattleTableWorkspace),
  { loading: () => <StationLoading label="Battle Table" /> },
);
const CommandIntelligenceWorkspace = dynamic(
  () => import("./_CommandIntelligenceWorkspace").then(m => m.CommandIntelligenceWorkspace),
  { loading: () => <StationLoading label="KPI Intelligence" /> },
);
const RadarInspectionWorkspace = dynamic(
  () => import("./radar/RadarInspectionWorkspace").then(m => m.RadarInspectionWorkspace),
  { loading: () => <StationLoading label="Radar" /> },
);

export type DashboardSignal = {
  id: string;
  title: string;
  detail: string;
  href: string;
  kind: string;
  priority: "normal" | "high" | "urgent";
  dueAt?: number;
};

export type DashboardPlanningPayload = {
  today: string;
  weekStart: string;
  weekPlan: DashboardWeekPlan | null;
  dayPlan: DashboardDayPlan | null;
  weekPlans: DashboardDayPlan[];
  sessions: DashboardWorkSession[];
  activeSession: DashboardWorkSession | null;
};

type DayDraft = {
  focus: string;
  planNotes: string;
  doneNotes: string;
  plannedHours: number;
  targetRevenuePounds: number;
};

type StrictItem = DashboardSignal & {
  taskId?: string;
  status?: AgencyTask["status"];
};

type RadarInspectorTarget = {
  tab: RadarInspectionTab;
  query: string;
  domain: AdvisorDomain | "all";
  status: RadarCheckStatus | "all" | "attention" | "applicable" | "assured" | "firing" | "live";
  scope: RadarCheckScope | "all" | "sentinel";
  lens: RadarRuleLens | "all";
  sourceId: string;
  datasetId: string;
  version: number;
};

type OpenRadarInspector = (target?: Partial<Omit<RadarInspectorTarget, "version">>) => void;

type CommandWorkspaceMode = "radar" | "workspace" | "inspector" | "day" | "calendar" | "actions" | "advisor" | "intelligence" | "battle";
type CommandSurfaceMode = CommandStationMode | "intelligence" | "radar";

type RadarMetricHelp = {
  label: string;
  detail: string;
};

export function DashboardCommandCenter({
  planning,
  tasks,
  calendarEntries,
  externalCalendarEvents,
  externalCalendarSources,
  signals,
  businessRadar,
  radarEvidence,
  recommendedActions,
  advisorConfigured,
  counts,
  intelligenceSnapshot,
  clientsNeedingAttention,
  executiveWorkspace,
  calendarWorkspace,
  actionsWorkspace,
  advisorWorkspace,
  devTeamWorkspace,
  devTeamVisible = false,
  devTeamBlockedCount = 0,
  devTeamLaunchBlockerCount = 0,
  battleTablePayload,
  scanPaused = false,
}: {
  planning: DashboardPlanningPayload;
  tasks: AgencyTask[];
  calendarEntries: CommandCalendarEntry[];
  externalCalendarEvents: CommandCalendarExternalEvent[];
  externalCalendarSources: CommandCalendarSource[];
  signals: DashboardSignal[];
  businessRadar: BusinessIssueRadar;
  radarEvidence: RadarEvidenceInspectionIndex;
  recommendedActions: AdvisorActionSuggestion[];
  advisorConfigured: boolean;
  counts: { activeClients: number; leads: number; delivery: number; products: number };
  intelligenceSnapshot: CommandIntelligenceSnapshot;
  clientsNeedingAttention: ClientAttentionItem[];
  executiveWorkspace: React.ReactNode;
  calendarWorkspace: React.ReactNode;
  actionsWorkspace: React.ReactNode;
  advisorWorkspace: React.ReactNode;
  /** Rendered server-side and only when the founder + Dev Mode gate passes; null otherwise. */
  devTeamWorkspace?: React.ReactNode;
  /** Mirrors `devDocsAccessible(session)`. False keeps the station out of the nav entirely. */
  devTeamVisible?: boolean;
  /** Items in the Dev Team board's Blocked lane — badges the station, and is
   *  the same number its "Blocked" tile shows. */
  devTeamBlockedCount?: number;
  /** The subset of those that are open launch blockers (state.md). */
  devTeamLaunchBlockerCount?: number;
  battleTablePayload: BattleTablePayload;
  /** Performance mode has paused the radar + KPI intelligence builds; the page
   *  passed lightweight placeholders and this surfaces the "Run scan" control. */
  scanPaused?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // "Run scan" navigates to a one-shot `?scan=1` render that forces the full
  // build. Once that heavy render has loaded, strip `scan` from the URL so a
  // later refresh returns to the fast paused view rather than rebuilding again.
  const runScanHref = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("scan", "1");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  })();
  useEffect(() => {
    if (searchParams.get("scan") !== "1") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("scan");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams]);
  const isDayCommandRoute = pathname === "/portal/agency/command-center";
  const requestedStationValue = searchParams.get("station");
  const requestedClockOutReview = searchParams.get("review") === "clock-out";
  const requestedStation = commandStationMode(requestedStationValue, devTeamVisible);
  const requestedDayCalendar = requestedStationValue === "calendar";
  const requestedIntelligenceView = intelligenceView(searchParams.get("view"));
  const requestedKpiIds = searchParams.get("kpi")?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
  const requestedScopeId = searchParams.get("scope")?.trim() || "ecosystem";
  const requestedBattleSection = battleTableSection(searchParams.get("battle"));
  const initialStation: CommandSurfaceMode = isDayCommandRoute ? "day" : pathname.startsWith("/portal/agency/radar") ? "radar" : requestedStation ?? "day";
  const initialRadarTarget = radarTargetFromSearchParams(searchParams);
  const actualToday = planning.today;
  const [selectedDate, setSelectedDate] = useState(actualToday);
  const [planningWeekStart, setPlanningWeekStart] = useState(planning.weekStart);
  const [plan, setPlan] = useState<DayDraft>(draftFromPlan(planning.dayPlan));
  const [weekPlan, setWeekPlan] = useState(weeklyReviewDraftFromPlan(planning.weekPlan));
  const [weekPlans, setWeekPlans] = useState(planning.weekPlans);
  const [sessions, setSessions] = useState(planning.sessions);
  const [activeSession, setActiveSession] = useState(planning.activeSession);
  const [taskRows, setTaskRows] = useState(tasks);
  const [dayDirty, setDayDirty] = useState(false);
  const [weekDirty, setWeekDirty] = useState(false);
  const [savingDay, setSavingDay] = useState(false);
  const [savingWeek, setSavingWeek] = useState(false);
  const [dateBusy, setDateBusy] = useState(false);
  const [weekExpanded, setWeekExpanded] = useState(false);
  const [attentionProtection, setAttentionProtectionState] = useState(true);
  const [clockBusy, setClockBusy] = useState(false);
  const [clockOutReviewOpen, setClockOutReviewOpen] = useState(false);
  const [clockOutReviewError, setClockOutReviewError] = useState("");
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [advisorBusy, setAdvisorBusy] = useState(false);
  const [taskGenerationBusy, setTaskGenerationBusy] = useState(false);
  const [taskGenerationSummary, setTaskGenerationSummary] = useState<DayTaskGenerationSummary | null>(null);
  const [advisorError, setAdvisorError] = useState("");
  const [advisorSuggestions, setAdvisorSuggestions] = useState<AdvisorActionSuggestion[]>([]);
  const [reviewedAt, setReviewedAt] = useState<number | null>(null);
  const [quickTask, setQuickTask] = useState("");
  const [quickPriority, setQuickPriority] = useState<AgencyTaskPriority>("high");
  const [doneEntry, setDoneEntry] = useState("");
  const [manualHours, setManualHours] = useState(1);
  const [manualFocus, setManualFocus] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [activeStation, setActiveStation] = useState<CommandSurfaceMode>(initialStation);
  const [intelligenceEntry, setIntelligenceEntry] = useState<{ view: IntelligenceView; kpiIds: string[]; scopeId: string; commercialFocus: { metricId?: string; recordId?: string; sourceId?: string; stageId?: string }; version: number }>({ view: requestedIntelligenceView, kpiIds: requestedKpiIds, scopeId: requestedScopeId, commercialFocus: commercialFocus(searchParams), version: 0 });
  const [dashboardMode, setDashboardMode] = useState<CommandWorkspaceMode>(requestedDayCalendar ? "calendar" : initialStation === "day" ? "day" : initialStation === "battle" ? "battle" : initialStation === "intelligence" ? "intelligence" : pathname.startsWith("/portal/agency/radar") ? "inspector" : initialStation === "radar" ? "workspace" : "radar");
  const [radarSnapshot, setRadarSnapshot] = useState(businessRadar);
  const [inspectorTarget, setInspectorTarget] = useState<RadarInspectorTarget>({ ...initialRadarTarget, version: 0 });
  const workspaceBodyRef = useRef<HTMLDivElement>(null);
  const clockOutReviewRequestHandledRef = useRef(false);

  const openInspector = useCallback((target: Partial<Omit<RadarInspectorTarget, "version">> = {}) => {
    setInspectorTarget(current => ({
      tab: target.tab ?? "records",
      query: target.query ?? "",
      domain: target.domain ?? "all",
      status: target.status ?? "all",
      scope: target.scope ?? "all",
      lens: target.lens ?? "all",
      sourceId: target.sourceId ?? "",
      datasetId: target.datasetId ?? "",
      version: current.version + 1,
    }));
    setActiveStation("radar");
    setDashboardMode("inspector");
  }, []);

  const applyRadarUpdate = useCallback((nextRadar: BusinessIssueRadar) => {
    setRadarSnapshot(nextRadar);
    void (async () => {
      try {
        const response = await fetch("/api/portal/tasks", { cache: "no-store" });
        const result = await response.json().catch(() => null) as { ok?: boolean; tasks?: AgencyTask[]; error?: string } | null;
        if (!response.ok || !result?.ok || !result.tasks) throw new Error(result?.error || "Task reconciliation could not reload.");
        setTaskRows(result.tasks);
      } catch (error) {
        setOperationError(error instanceof Error ? error.message : "Radar refreshed, but its tasks could not reload.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [activeSession]);

  useEffect(() => {
    function updateSmartSession(event: Event) {
      const next = (event as CustomEvent<DashboardPlanningPayload>).detail;
      if (!next) return;
      setActiveSession(next.activeSession);
      if (selectedDate === actualToday) setSessions(next.sessions);
      setNow(Date.now());
    }
    window.addEventListener("aqua-work-session:planning", updateSmartSession);
    return () => window.removeEventListener("aqua-work-session:planning", updateSmartSession);
  }, [actualToday, selectedDate]);

  useEffect(() => {
    function openClockOutReview() {
      if (!activeSession) return;
      setClockOutReviewError("");
      setClockOutReviewOpen(true);
    }
    window.addEventListener("aqua-work-session:clock-out-review", openClockOutReview);
    if (requestedClockOutReview && activeSession && !clockOutReviewRequestHandledRef.current) {
      clockOutReviewRequestHandledRef.current = true;
      openClockOutReview();
      const url = new URL(window.location.href);
      url.searchParams.delete("review");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    return () => window.removeEventListener("aqua-work-session:clock-out-review", openClockOutReview);
  }, [activeSession, requestedClockOutReview]);

  useEffect(() => {
    setWeekExpanded(window.localStorage.getItem("aqua-command-week-expanded") === "true");
  }, []);

  useEffect(() => {
    const sync = () => setAttentionProtectionState(attentionProtectionEnabled());
    const syncCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      setAttentionProtectionState(typeof detail?.enabled === "boolean" ? detail.enabled : attentionProtectionEnabled());
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key === ATTENTION_PROTECTION_STORAGE_KEY) sync();
    };
    sync();
    window.addEventListener(ATTENTION_PROTECTION_EVENT, syncCustom);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(ATTENTION_PROTECTION_EVENT, syncCustom);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  useEffect(() => {
    function inspectFromCommandDeck(event: Event) {
      const target = (event as CustomEvent<Partial<Omit<RadarInspectorTarget, "version">>>).detail;
      openInspector(target ?? {});
    }
    window.addEventListener("aqua-radar-inspector:open", inspectFromCommandDeck);
    return () => window.removeEventListener("aqua-radar-inspector:open", inspectFromCommandDeck);
  }, [openInspector]);

  useEffect(() => {
    workspaceBodyRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeStation, dashboardMode]);

  useEffect(() => {
    if (searchParams.get("station") !== "intelligence") return;
    const view = intelligenceView(searchParams.get("view"));
    const kpiIds = searchParams.get("kpi")?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
    const scopeId = searchParams.get("scope")?.trim() || "ecosystem";
    setActiveStation("intelligence");
    setDashboardMode("intelligence");
    setIntelligenceEntry(current => ({ view, kpiIds, scopeId, commercialFocus: commercialFocus(searchParams), version: current.version + 1 }));
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("station") !== "radar-inspector") return;
    const target = radarTargetFromSearchParams(searchParams);
    setInspectorTarget(current => ({ ...target, version: current.version + 1 }));
    setActiveStation("radar");
    setDashboardMode("inspector");
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("station") !== "calendar") return;
    setActiveStation("day");
    setDashboardMode("calendar");
  }, [searchParams]);

  const isToday = selectedDate === actualToday;
  const isFuture = selectedDate > actualToday;
  const selectedDayTasks = useMemo(
    () => taskRows.filter(task => taskTouchesDate(task, selectedDate)),
    [selectedDate, taskRows],
  );
  const completedOnSelectedDay = useMemo(
    () => taskRows.filter(task => timestampFallsOnDate(task.completedAt, selectedDate)),
    [selectedDate, taskRows],
  );
  const openTasks = taskRows.filter(task => task.status !== "done");
  const deterministicRecommendedActions = useMemo(() => buildBusinessRecommendedActions({
    radar: radarSnapshot,
    existingTaskTitles: openTasks.map(task => task.title),
    now: radarSnapshot.generatedAt,
    limit: 5,
  }), [openTasks, radarSnapshot]);
  const serverRecommendedActions = radarSnapshot.generatedAt === businessRadar.generatedAt ? recommendedActions : [];
  // The Battle Table war room reads the SAME live Radar snapshot this station
  // holds — so a Radar refresh moves the decisions queue with it instead of the
  // war room quoting the page's first render forever.
  const warRoomIncidents = useMemo<WarRoomIncident[]>(() => radarSnapshot.incidents.map(issue => ({
    id: issue.id,
    severity: issue.severity,
    title: issue.title,
    detail: issue.detail,
    evidence: issue.evidence,
    href: issue.href,
  })), [radarSnapshot.incidents]);
  const topRecommendedActions = useMemo(() => mergeRecommendedActions(
    advisorSuggestions,
    serverRecommendedActions,
    deterministicRecommendedActions,
    openTasks.map(task => task.title),
  ), [advisorSuggestions, deterministicRecommendedActions, serverRecommendedActions, openTasks]);
  const strictPool = useMemo<StrictItem[]>(() => {
    const taskTitles = new Set(openTasks.map(task => task.title.trim().toLowerCase()));
    const taskSignals: StrictItem[] = openTasks.map(task => ({
      id: `task:${task.id}`,
      title: task.title,
      detail: task.notes || (task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : "Captured action."),
      href: "/portal/agency/actions",
      kind: task.status === "in-progress" ? "In progress" : "Task",
      priority: task.priority === "urgent" ? "urgent" : task.priority === "high" ? "high" : "normal",
      dueAt: task.dueAt,
      taskId: task.id,
      status: task.status,
    }));
    const radarSignals: StrictItem[] = radarSnapshot.incidents
      .filter(incident => incident.severity !== "watch")
      .map(issue => ({
        id: `radar:${issue.id}`,
        title: issue.title,
        detail: issue.detail,
        href: issue.href,
        kind: domainLabel(issue.domain),
        priority: issue.severity === "critical" ? "urgent" : "high",
      }));
    const businessSignals: StrictItem[] = [...radarSignals, ...signals].filter(signal => !taskTitles.has(signal.title.trim().toLowerCase()));
    return [...taskSignals, ...businessSignals].sort((a, b) => {
        const activeRank = (a.status === "in-progress" ? -1 : 0) - (b.status === "in-progress" ? -1 : 0);
        return activeRank || priorityRank(a.priority) - priorityRank(b.priority) || overdueRank(a, now) - overdueRank(b, now) || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER);
      });
  }, [now, openTasks, radarSnapshot.incidents, signals]);
  const strictWindow = useMemo(() => buildProtectedAttentionWindow(strictPool, {
    groupKey: item => item.taskId ? "task" : item.kind,
    urgencyRank: item => priorityRank(item.priority),
    enabled: attentionProtection,
  }), [attentionProtection, strictPool]);
  const strictList = strictWindow.focus;

  const dayStrictList = useMemo<StrictItem[]>(() => {
    if (isToday) return strictList;
    const ranked = selectedDayTasks
      .map(task => ({
        id: `task:${task.id}`,
        title: task.title,
        detail: task.notes || taskTimingDetail(task),
        href: task.sourceHref || "/portal/agency/actions",
        kind: timestampFallsOnDate(task.completedAt, selectedDate)
          ? "Completed"
          : task.status === "done"
            ? "Completed later"
            : task.status === "in-progress"
              ? "In progress"
              : "Scheduled task",
        priority: task.priority === "urgent" ? "urgent" as const : task.priority === "high" ? "high" as const : "normal" as const,
        dueAt: task.dueAt,
        taskId: task.id,
        status: task.status,
      }))
      .sort((a, b) => {
        const completedRank = Number(a.status === "done") - Number(b.status === "done");
        const activeRank = Number(b.status === "in-progress") - Number(a.status === "in-progress");
        return completedRank || activeRank || priorityRank(a.priority) - priorityRank(b.priority) || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER);
      });
    return attentionProtection ? ranked.slice(0, 5) : ranked;
  }, [attentionProtection, isToday, selectedDate, selectedDayTasks, strictList]);

  const selectedSessions = sessions.filter(session => session.date === selectedDate);
  const loggedHours = selectedSessions.reduce((total, session) => total + accountableSessionHours(session), 0);
  const loggedWeekHours = sessions.reduce((total, session) => total + accountableSessionHours(session), 0);
  const selectedAquaHours = selectedSessions.reduce((total, session) => total + (session.aquaActiveMs ?? 0) / 3_600_000, 0);
  const selectedExternalHours = selectedSessions.reduce((total, session) => total + (session.externalWorkMs ?? 0) / 3_600_000, 0);
  const selectedBreakHours = selectedSessions.reduce((total, session) => total + (session.breakMs ?? 0) / 3_600_000, 0);
  const selectedUnconfirmedHours = selectedSessions.reduce((total, session) => total + (session.unconfirmedIdleMs ?? 0) / 3_600_000, 0);
  const selectedEvidenceMinutes = (selectedAquaHours + selectedExternalHours + selectedUnconfirmedHours) * 60;
  const selectedEvidenceConfidence = selectedEvidenceMinutes ? Math.round((selectedAquaHours + selectedExternalHours) * 60 / selectedEvidenceMinutes * 100) : 100;
  const selectedRouteSwitches = selectedSessions.reduce((total, session) => total + (session.routeSwitches ?? 0), 0);
  const selectedProductiveHours = selectedAquaHours + selectedExternalHours;
  const focusFragmentationWatch = selectedProductiveHours >= 0.5 && selectedRouteSwitches / selectedProductiveHours >= 18;
  const dates = weekDates(planningWeekStart);
  const effectivePlans = dates.map(date => date === selectedDate
    ? { date, ...plan }
    : { date, ...draftFromPlan(weekPlans.find(item => item.date === date) ?? null) });
  const selectedDaySchedule = [
    ...selectedDayTasks.flatMap(task => {
      const at = taskMomentForDate(task, selectedDate);
      return at ? [{
        id: `task:${task.id}`,
        title: task.title,
        kind: timestampFallsOnDate(task.completedAt, selectedDate) ? "Completed" : task.status === "in-progress" ? "In progress" : "Task",
        at,
        href: task.sourceHref || "/portal/agency/actions",
        priority: task.priority === "urgent" ? "urgent" as const : task.priority === "high" ? "high" as const : "normal" as const,
      }] : [];
    }),
    ...calendarEntries.flatMap(entry => {
      const at = calendarEntryMomentForDate(entry, selectedDate);
      return at && entry.status !== "cancelled" ? [{
        id: `calendar:${entry.id}`,
        title: entry.title,
        kind: entry.type.replaceAll("-", " "),
        at,
        href: "/portal/agency?station=calendar",
        priority: entry.type === "reminder" || entry.type === "target" ? "high" as const : "normal" as const,
      }] : [];
    }),
    ...externalCalendarEvents.flatMap(event => {
      const at = externalCalendarMomentForDate(event, selectedDate);
      const source = externalCalendarSources.find(item => item.id === event.sourceId);
      return at ? [{
        id: `external-calendar:${event.id}`,
        title: event.title,
        kind: `${source?.name ?? "Google Calendar"}${event.allDay ? " · all day" : ""}`,
        at,
        href: event.htmlLink || "/portal/agency?station=calendar",
        priority: "normal" as const,
      }] : [];
    }),
    ...(plan.focus.trim() ? [{
      id: `plan:${selectedDate}`,
      title: plan.focus,
      kind: "Day outcome",
      at: new Date(`${selectedDate}T12:00:00`).getTime(),
      href: "/portal/agency",
      priority: "normal" as const,
    }] : []),
  ]
    .sort((a, b) => a.at - b.at || priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 8);
  const plannedWeekHours = effectivePlans.reduce((total, item) => total + item.plannedHours, 0);
  const targetWeekRevenue = effectivePlans.reduce((total, item) => total + item.targetRevenuePounds, 0);
  const projectedCompletion = plan.plannedHours ? Math.min(100, Math.round((loggedHours / plan.plannedHours) * 100)) : 0;
  const workedDays = new Set(sessions.filter(session => session.endedAt).map(session => session.date)).size;
  const projectedWeekHours = workedDays ? (loggedWeekHours / workedDays) * 5 : loggedWeekHours;
  const weekPace = plannedWeekHours ? Math.round((loggedWeekHours / plannedWeekHours) * 100) : 0;
  const completedThisWeek = taskRows.filter(task => task.completedAt && task.completedAt >= new Date(`${planningWeekStart}T00:00:00`).getTime()).length;
  const weekTaskRows = taskRows.filter(task => dates.some(date => taskTouchesDate(task, date)));
  const weekUnconfirmedHours = sessions.reduce((total, session) => total + (session.unconfirmedIdleMs ?? 0) / 3_600_000, 0);
  const weekEvidenceSnapshot: DashboardWeeklyEvidenceSnapshot = {
    plannedHours: plannedWeekHours,
    confirmedHours: loggedWeekHours,
    unconfirmedHours: weekUnconfirmedHours,
    completedTasks: weekTaskRows.filter(task => task.status === "done").length,
    openTasks: weekTaskRows.filter(task => task.status !== "done").length,
    revenueTargetPounds: targetWeekRevenue,
    dayReviewsCompleted: new Set(sessions.filter(session => Boolean(session.clockOutReview)).map(session => session.date)).size,
    capturedAt: now,
  };
  const rankedRadarFeed = [...radarSnapshot.incidents]
    .sort((left, right) => radarSeverityRank(left.severity) - radarSeverityRank(right.severity) || right.detectedAt - left.detectedAt);
  const directRadarFeed = attentionProtection ? rankedRadarFeed.slice(0, 4) : rankedRadarFeed;
  const commandPriorityFeed = attentionProtection ? strictList.slice(0, 3) : strictList;
  const radarTasksBySource = new Map(taskRows.filter(task => (task.origin ?? "manual") === "radar" && task.sourceId).map(task => [task.sourceId!, task]));

  function updatePlan(patch: Partial<DayDraft>) {
    setPlan(current => ({ ...current, ...patch }));
    setDayDirty(true);
    setStatusMessage("");
  }

  async function saveDay(showStatus = true): Promise<DashboardPlanningPayload | null> {
    setSavingDay(true);
    setOperationError("");
    try {
      const next = await dashboardRequest({
        action: "save-plan",
        date: selectedDate,
        ...plan,
        plannedHours: Number(plan.plannedHours) || 0,
        targetRevenuePounds: Number(plan.targetRevenuePounds) || 0,
      });
      applyPlanning(next);
      setPlan(draftFromPlan(next.dayPlan));
      setDayDirty(false);
      if (showStatus) setStatusMessage(`${weekdayLong(selectedDate)} plan saved.`);
      return next;
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "The day plan could not save.");
      return null;
    } finally {
      setSavingDay(false);
    }
  }

  async function selectDay(date: string) {
    if (!validIsoDate(date) || date === selectedDate || savingDay || dateBusy) return;
    setDateBusy(true);
    setOperationError("");
    try {
      if (dayDirty) {
        const saved = await saveDay(false);
        if (!saved) return;
      }
      const next = await loadDashboardPlanning(date);
      setSelectedDate(date);
      setPlanningWeekStart(next.weekStart);
      setWeekPlans(next.weekPlans);
      setSessions(next.sessions);
      setActiveSession(date === actualToday ? next.activeSession : activeSession);
      setWeekPlan(weeklyReviewDraftFromPlan(next.weekPlan));
      setPlan(draftFromPlan(next.dayPlan));
      setDayDirty(false);
      setWeekDirty(false);
      setStatusMessage("");
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "That planning date could not load.");
    } finally {
      setDateBusy(false);
    }
  }

  function moveDay(offset: number) {
    void selectDay(offsetIsoDate(selectedDate, offset));
  }

  function toggleWeekCommand() {
    setWeekExpanded(current => {
      const next = !current;
      window.localStorage.setItem("aqua-command-week-expanded", String(next));
      return next;
    });
  }

  async function saveWeek(reviewStatus: "draft" | "complete" = weekPlan.reviewStatus) {
    setSavingWeek(true);
    setOperationError("");
    try {
      const next = await dashboardRequest({
        action: "save-week",
        date: selectedDate,
        weekStart: planningWeekStart,
        weekOutcome: weekPlan.outcome,
        weekReviewNotes: weekPlan.reviewNotes,
        weekWins: weekPlan.wins,
        weekMisses: weekPlan.misses,
        weekLessons: weekPlan.lessons,
        weekDecisions: weekPlan.decisions,
        weekRisks: weekPlan.risks,
        weekStartDoing: weekPlan.startDoing,
        weekStopDoing: weekPlan.stopDoing,
        weekContinueDoing: weekPlan.continueDoing,
        weekNextPriorities: weekPlan.nextWeekPriorities,
        weekExecutionScore: weekPlan.executionScore,
        weekEnergyScore: weekPlan.energyScore,
        weekConfidenceScore: weekPlan.confidenceScore,
        weekReviewStatus: reviewStatus,
        weekEvidenceSnapshot,
      });
      applyPlanning(next);
      setWeekPlan(weeklyReviewDraftFromPlan(next.weekPlan));
      setWeekDirty(false);
      setStatusMessage(reviewStatus === "complete" ? "Weekly review completed and retained." : "Weekly review draft saved.");
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "The week plan could not save.");
    } finally {
      setSavingWeek(false);
    }
  }

  async function clock(action: "clock-in" | "clock-out", clockOutReview?: ClockOutReviewDraft): Promise<boolean> {
    if (!isToday) return false;
    setClockBusy(true);
    setOperationError("");
    if (action === "clock-out") setClockOutReviewError("");
    try {
      if (action === "clock-in" && dayDirty) await saveDay(false);
      const next = await dashboardRequest({
        action,
        date: actualToday,
        focus: plan.focus,
        currentPath: window.location.pathname,
        clockOutReview: action === "clock-out" ? clockOutReview : undefined,
      });
      applyPlanning(next);
      setStatusMessage(action === "clock-in" ? "Clocked in." : "Clocked out and close-of-watch review recorded.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The time clock could not update.";
      if (action === "clock-out") setClockOutReviewError(message);
      else setOperationError(message);
      return false;
    } finally {
      setClockBusy(false);
    }
  }

  function requestClockOut() {
    setClockOutReviewError("");
    setClockOutReviewOpen(true);
  }

  async function completeClockOut(review: ClockOutReviewDraft) {
    const completed = await clock("clock-out", review);
    if (completed) setClockOutReviewOpen(false);
  }

  async function logManualTime() {
    if (isFuture || !manualHours) return;
    setSessionBusyId("manual");
    setOperationError("");
    try {
      const next = await dashboardRequest({
        action: "log-hours",
        date: selectedDate,
        hours: Number(manualHours),
        focus: manualFocus || plan.focus,
        notes: manualNotes,
      });
      applyPlanning(next);
      setManualFocus("");
      setManualNotes("");
      setStatusMessage(`${formatHours(Number(manualHours))}h added to ${weekdayLong(selectedDate)}.`);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "The hours could not be logged.");
    } finally {
      setSessionBusyId(null);
    }
  }

  async function removeSession(sessionId: string) {
    setSessionBusyId(sessionId);
    setOperationError("");
    try {
      const next = await dashboardRequest({ action: "delete-session", date: selectedDate, sessionId });
      applyPlanning(next);
      setStatusMessage("Time entry removed.");
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "The time entry could not be removed.");
    } finally {
      setSessionBusyId(null);
    }
  }

  async function createTask(input: { title: string; notes?: string; priority: AgencyTaskPriority; startAt?: number; dueAt?: number; origin?: AgencyTaskOrigin; sourceId?: string; sourceHref?: string; evidence?: string[]; evidenceSourceIds?: string[]; expectedOutcome?: string; reconciliationSourceIds?: string[] }, busyId: string) {
    setTaskBusyId(busyId);
    setOperationError("");
    try {
      const response = await fetch("/api/portal/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; task?: AgencyTask } | null;
      if (!response.ok || !result?.ok || !result.task) throw new Error(result?.error || "The task could not be created.");
      setTaskRows(current => current.some(task => task.id === result.task!.id) ? current.map(task => task.id === result.task!.id ? result.task! : task) : [...current, result.task!]);
      setStatusMessage(`Added “${result.task.title}” to the strict queue.`);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "The task could not be created.");
    } finally {
      setTaskBusyId(null);
    }
  }

  async function addStrictTodo(item: DashboardSignal) {
    await createTask({
      title: item.title,
      notes: `${item.detail}\n\nCreated from the main dashboard priority queue.`,
      priority: item.priority,
      dueAt: item.dueAt,
      origin: "crm",
      sourceId: item.id,
      sourceHref: item.href,
    }, item.id);
  }

  async function addRadarTask(issue: BusinessRadarIssue) {
    await createTask({
      title: issue.title,
      notes: `${issue.detail}\n\nRadar evidence:\n${issue.evidence.map(item => `- ${item}`).join("\n")}`,
      priority: issue.severity === "critical" ? "urgent" : "high",
      startAt: new Date(`${selectedDate}T09:00:00`).getTime(),
      dueAt: new Date(`${selectedDate}T17:00:00`).getTime(),
      origin: "radar",
      sourceId: issue.id,
      sourceHref: issue.href,
      evidence: issue.evidence,
      evidenceSourceIds: issue.sourceIds,
      expectedOutcome: `Radar no longer detects “${issue.title}” in the latest sweep.`,
      reconciliationSourceIds: [issue.id, ...issue.sourceIds],
    }, `radar:${issue.id}`);
  }

  async function addQuickTask() {
    const title = quickTask.trim();
    if (!title) return;
    await createTask({ title, priority: quickPriority, dueAt: new Date(`${selectedDate}T17:00:00`).getTime(), origin: "manual" }, "quick");
    setQuickTask("");
  }

  async function completeTask(taskId: string) {
    setTaskBusyId(taskId);
    setOperationError("");
    try {
      const response = await fetch("/api/portal/tasks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: taskId, status: "done" }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; task?: AgencyTask } | null;
      if (!response.ok || !result?.ok || !result.task) throw new Error(result?.error || "The task could not be completed.");
      setTaskRows(current => current.map(task => task.id === taskId ? result.task! : task));
      setStatusMessage(`Completed “${result.task.title}”.`);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "The task could not be completed.");
    } finally {
      setTaskBusyId(null);
    }
  }

  async function logDone() {
    const entry = doneEntry.trim();
    if (!entry) return;
    const stamp = isToday ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date()) : weekdayLong(selectedDate);
    const doneNotes = [plan.doneNotes.trim(), `- ${stamp} ${entry}`].filter(Boolean).join("\n");
    const nextPlan = { ...plan, doneNotes };
    setPlan(nextPlan);
    setDoneEntry("");
    setSavingDay(true);
    setOperationError("");
    try {
      const next = await dashboardRequest({ action: "save-plan", date: selectedDate, ...nextPlan });
      applyPlanning(next);
      setPlan(draftFromPlan(next.dayPlan));
      setDayDirty(false);
      setStatusMessage("Achievement recorded.");
    } catch (error) {
      setDayDirty(true);
      setOperationError(error instanceof Error ? error.message : "The achievement could not save.");
    } finally {
      setSavingDay(false);
    }
  }

  async function requestAdvisorBriefing() {
    setAdvisorBusy(true);
    setAdvisorError("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "suggest-actions" }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; suggestions?: AdvisorActionSuggestion[]; generatedAt?: number } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Aqua Advisor could not create a briefing.");
      setAdvisorSuggestions(result.suggestions ?? []);
      setReviewedAt(result.generatedAt ?? Date.now());
      setStatusMessage("Daily executive briefing generated.");
    } catch (error) {
      setAdvisorError(error instanceof Error ? error.message : "Aqua Advisor could not create a briefing.");
    } finally {
      setAdvisorBusy(false);
    }
  }

  async function generateTasksFromRadar() {
    setTaskGenerationBusy(true);
    setOperationError("");
    try {
      const beforeIds = new Set(taskRows.map(task => task.id));
      const response = await fetch("/api/portal/advisor/radar", { method: "POST", cache: "no-store" });
      const result = await response.json().catch(() => null) as { ok?: boolean; radar?: BusinessIssueRadar; error?: string } | null;
      if (!response.ok || !result?.ok || !result.radar) throw new Error(result?.error || "The Radar task scan could not complete.");
      setRadarSnapshot(result.radar);
      const tasksResponse = await fetch("/api/portal/tasks", { cache: "no-store" });
      const tasksResult = await tasksResponse.json().catch(() => null) as { ok?: boolean; tasks?: AgencyTask[]; error?: string } | null;
      if (!tasksResponse.ok || !tasksResult?.ok || !tasksResult.tasks) throw new Error(tasksResult?.error || "Radar scanned successfully, but reconciled tasks could not reload.");
      setTaskRows(tasksResult.tasks);
      const newTasks = tasksResult.tasks.filter(task => !beforeIds.has(task.id)).length;
      const activeRadarTasks = tasksResult.tasks.filter(task => task.status !== "done" && (task.origin ?? "manual") === "radar").length;
      const contacts = result.radar.summary.critical + result.radar.summary.warning;
      setTaskGenerationSummary({ generatedAt: Date.now(), newTasks, activeRadarTasks, contacts });
      setStatusMessage(`Radar task scan complete: ${newTasks} new and ${activeRadarTasks} active Radar tasks.`);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "The Radar task scan could not complete.");
    } finally {
      setTaskGenerationBusy(false);
    }
  }

  async function acceptAdvisorAction(action: AdvisorActionSuggestion) {
    await createTask({
      title: action.title,
      notes: action.detail,
      priority: action.priority === "low" ? "normal" : action.priority,
      dueAt: action.dueAt,
      origin: "advisor",
      sourceId: action.id,
      sourceHref: action.href,
      evidence: action.evidence ? [action.evidence] : [],
      evidenceSourceIds: action.sourceAlertIds,
      reconciliationSourceIds: action.sourceAlertIds,
      expectedOutcome: action.detail,
    }, action.id);
  }

  function applyPlanning(next: DashboardPlanningPayload) {
    setPlanningWeekStart(next.weekStart);
    setSessions(next.sessions);
    setActiveSession(next.activeSession);
    setWeekPlans(next.weekPlans);
    setWeekPlan(weeklyReviewDraftFromPlan(next.weekPlan));
    setNow(Date.now());
    window.dispatchEvent(new CustomEvent("aqua-work-session:updated", { detail: next }));
  }

  function selectWorkspaceMode(mode: Exclude<CommandWorkspaceMode, "inspector">) {
    setDashboardMode(mode);
  }

  async function returnToToday() {
    setActiveStation("day");
    setDashboardMode("day");
    if (!isToday) await selectDay(actualToday);
    window.requestAnimationFrame(() => workspaceBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function selectCommandStation(mode: CommandStationMode) {
    setActiveStation(mode);
    // Dev Team renders its own server-streamed station node, so it deliberately
    // leaves `dashboardMode` untouched — the shared workspace shell is not mounted.
    if (mode === "devteam") return;
    if (mode === "day") setDashboardMode("day");
    if (mode === "executive") setDashboardMode("radar");
    if (mode === "battle") setDashboardMode("battle");
  }

  function openIntelligence(kpiIds: string[] = [], scopeId = "ecosystem") {
    setIntelligenceEntry(current => ({ view: "compare", kpiIds, scopeId, commercialFocus: {}, version: current.version + 1 }));
    setActiveStation("intelligence");
    setDashboardMode("intelligence");
  }

  function openIntelligenceOverview() {
    setIntelligenceEntry(current => ({ view: "overview", kpiIds: [], scopeId: "ecosystem", commercialFocus: {}, version: current.version + 1 }));
    setActiveStation("intelligence");
    setDashboardMode("intelligence");
  }

  function openRadarWorkspace() {
    setActiveStation("radar");
    setDashboardMode("workspace");
  }

  function returnToCommandCentre() {
    setActiveStation("executive");
    setDashboardMode("radar");
  }

  const dayAttentionItems = dayStrictList.filter(item => item.status !== "done");
  const dayAttention: CommandStationAttention = {
    count: dayAttentionItems.length,
    tone: dayAttentionItems.some(item => item.priority === "urgent") ? "critical" : dayAttentionItems.some(item => item.priority === "high") ? "warning" : dayAttentionItems.length ? "info" : "clear",
    label: dayAttentionItems.length
      ? `${dayAttentionItems.length} live priorities in focus${isToday && strictWindow.reserveCount ? ` · ${strictWindow.reserveCount} safely held in reserve` : ""}`
      : "No live priorities are waiting in Day Command",
  };
  const executiveAttention: CommandStationAttention = {
    count: radarSnapshot.summary.critical + radarSnapshot.summary.warning,
    tone: radarSnapshot.summary.critical ? "critical" : radarSnapshot.summary.warning ? "warning" : "clear",
    label: radarSnapshot.summary.critical
      ? `${radarSnapshot.summary.critical} critical and ${radarSnapshot.summary.warning} warning Radar incidents`
      : radarSnapshot.summary.warning
        ? `${radarSnapshot.summary.warning} warning Radar incidents`
        : "Radar has no critical or warning incidents",
  };
  const battleAttention = battleTableAttention(battleTablePayload);
  // Dev Team badges the real size of the board's Blocked lane (composed
  // server-side from state.md + the plan files and passed in), so the nav, the
  // station's "Blocked" tile and the Working-on board all show ONE number
  // instead of the nav always reading "clear". The label breaks it down, and an
  // open launch blocker is critical while merely-stalled work is a warning.
  const devTeamStalledCount = Math.max(0, devTeamBlockedCount - devTeamLaunchBlockerCount);
  const devTeamAttention: CommandStationAttention = {
    count: devTeamBlockedCount,
    tone: devTeamLaunchBlockerCount ? "critical" : devTeamBlockedCount ? "warning" : "clear",
    label: devTeamBlockedCount
      ? `${devTeamBlockedCount} blocked on the Dev Team board — ${devTeamLaunchBlockerCount} open launch blocker${devTeamLaunchBlockerCount === 1 ? "" : "s"} and ${devTeamStalledCount} stalled plan${devTeamStalledCount === 1 ? "" : "s"}`
      : "Nothing is blocked on the Dev Team board",
  };
  const stationAttention: Record<CommandStationMode, CommandStationAttention> = { day: dayAttention, executive: executiveAttention, battle: battleAttention, devteam: devTeamAttention };

  return (
    <div className="grid gap-5">
      {clockOutReviewOpen && activeSession ? <ClockOutReviewDialog
        key={activeSession.id}
        session={activeSession}
        initialOutcome={plan.doneNotes}
        initialOpenWork={dayStrictList.filter(item => item.status !== "done").slice(0, 5).map(item => item.title).join("\n")}
        initialNextPriority={dayStrictList.find(item => item.status !== "done")?.title ?? ""}
        completedTaskCount={completedOnSelectedDay.length}
        busy={clockBusy}
        error={clockOutReviewError}
        onCancel={() => { if (!clockBusy) setClockOutReviewOpen(false); }}
        onConfirm={review => void completeClockOut(review)}
      /> : null}
      <CommandStationNav
        attention={stationAttention}
        activeMode={activeStation === "day" ? "day" : activeStation === "battle" ? "battle" : activeStation === "devteam" ? "devteam" : "executive"}
        showDevTeam={devTeamVisible}
        attentionProtection={attentionProtection}
        onAttentionProtectionChange={enabled => {
          setAttentionProtectionState(enabled);
          setAttentionProtectionEnabled(enabled);
        }}
        onSelect={selectCommandStation}
      />
      {scanPaused ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#e5c479]/30 bg-[#e5c479]/[0.06] px-4 py-3 text-sm text-[#f0dcae]" data-testid="command-scan-paused">
          <span className="flex items-center gap-2"><Gauge size={15} /> Performance mode is on — Radar and KPI intelligence are paused for a faster Command Centre. Run a scan to load live business signals.</span>
          <Link href={runScanHref} prefetch={false} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#e5c479]/40 bg-[#e5c479]/[0.12] px-3 font-semibold text-[#f6e8c6] hover:bg-[#e5c479]/20"><RefreshCw size={14} /> Run scan</Link>
        </div>
      ) : null}
      {activeStation === "devteam" ? <div className="grid min-w-0 gap-0" data-testid="dev-team-station">{devTeamWorkspace}</div> : activeStation === "executive" ? <div className="grid min-w-0 gap-0" data-testid="unified-command-centre">{executiveWorkspace}<CommandInstrumentDock alertCount={radarSnapshot.summary.critical + radarSnapshot.summary.warning} checkCount={radarSnapshot.summary.totalChecks} onOpenIntelligence={openIntelligenceOverview} onOpenRadar={openRadarWorkspace} /><CommandCentreKpiTrajectory intelligence={intelligenceSnapshot} onOpen={openIntelligence} /></div> : activeStation === "battle" ? <BattleTableWorkspace payload={battleTablePayload} intelligence={intelligenceSnapshot} onOpenIntelligence={openIntelligence} radarIncidents={warRoomIncidents} initialSection={requestedBattleSection} initialScopeId={requestedScopeId} /> : <section id="command-workspace" role="region" aria-label={`${activeStation === "day" ? "Day Command" : activeStation === "intelligence" ? "KPI Intelligence" : "Radar"} station`} data-command-mode={dashboardMode === "inspector" ? "workspace" : dashboardMode} className="mm-command-workspace-shell mm-command-workspace-inline relative flex min-h-[42rem] min-w-0 flex-col overflow-hidden rounded-md border border-[#62e8ff]/30 bg-[#020b11]">
      <header className="mm-command-workspace-header flex min-h-14 shrink-0 items-center gap-3 border-b border-[#62e8ff]/25 bg-[#020b11] px-3 text-white shadow-[0_8px_24px_rgba(0,20,28,.16)] sm:px-5">
        <span className="mm-command-workspace-emblem grid size-8 shrink-0 place-items-center border border-[#62e8ff]/35 bg-[#62e8ff]/[0.07] text-[#62e8ff]"><Compass size={16} /></span>
        <div className="min-w-0"><p className="text-[8px] font-semibold uppercase text-[#76dff1]/55">Aqua command network · Integrated station</p><p className="truncate text-sm font-semibold">{activeStation === "day" ? "Day Command" : activeStation === "intelligence" ? "Command Centre · KPI Intelligence" : "Command Centre · Radar Workspace"}</p></div>
        <div className="ml-auto flex items-center gap-2">
          {activeStation === "day" ? <button type="button" onClick={() => void returnToToday()} disabled={dateBusy || (dashboardMode === "day" && isToday)} title="Return to today’s Day Command" className="inline-flex min-h-8 items-center gap-1.5 border border-[#e5c479]/20 bg-[#e5c479]/[0.05] px-2.5 text-[8px] font-semibold uppercase text-[#e5c479] hover:bg-[#e5c479]/[0.1] hover:text-white disabled:cursor-default disabled:opacity-35"><CalendarDays size={12} /><span className="hidden sm:inline">Back to today</span><span className="sm:hidden">Today</span></button> : null}
          {activeStation === "intelligence" || activeStation === "radar" ? <Link role="button" href="/portal/agency" replace onClick={returnToCommandCentre} className="inline-flex min-h-8 items-center gap-1.5 border border-[#62e8ff]/22 bg-[#62e8ff]/[0.055] px-2.5 text-[8px] font-semibold uppercase text-[#8ef1ff] hover:bg-[#62e8ff]/[0.1] hover:text-white"><ArrowLeft size={12} /><span className="hidden sm:inline">Back to Command Centre</span><span className="sm:hidden">Command</span></Link> : null}
          <span className="hidden items-center gap-2 border border-[#68f5d0]/20 bg-[#68f5d0]/[0.05] px-2.5 py-1.5 text-[8px] font-semibold uppercase text-[#68f5d0] sm:inline-flex"><span className="size-1.5 animate-pulse bg-current shadow-[0_0_7px_currentColor]" /> Station active</span>
        </div>
      </header>
      {activeStation === "radar" ? <nav aria-label="Radar workspace views" className="mm-omega-workspace-nav grid shrink-0 grid-flow-col auto-cols-[minmax(10.5rem,1fr)] overflow-x-auto border-b border-[#62e8ff]/20 bg-[#031018] lg:grid-flow-row lg:grid-cols-4">
          <RadarWorkspaceButton active={dashboardMode === "radar"} icon={<RadioTower size={15} />} label="Live Radar feed" detail={`${radarSnapshot.summary.critical + radarSnapshot.summary.warning} contacts`} onClick={() => selectWorkspaceMode("radar")} />
          <RadarWorkspaceButton active={dashboardMode === "workspace"} icon={<ScanSearch size={15} />} label="Radar systems" detail={`${radarSnapshot.summary.totalChecks.toLocaleString()} checks`} onClick={() => selectWorkspaceMode("workspace")} />
          <RadarWorkspaceButton active={dashboardMode === "inspector"} tone="aqua" icon={<Gauge size={15} />} label="KPIs & evidence" detail={`${radarSnapshot.adaptive.confidencePercent}% confidence`} onClick={() => openInspector({ tab: "kpis" })} />
          <RadarWorkspaceButton active={dashboardMode === "advisor"} tone="gold" icon={<Bot size={15} />} label="Aqua Advisor" detail={advisorConfigured ? "Briefing ready" : "Setup required"} onClick={() => selectWorkspaceMode("advisor")} />
      </nav> : null}
      <div ref={workspaceBodyRef} className="mm-command-workspace-body min-h-0 flex-1 p-3 sm:p-5">
      {activeStation === "intelligence" ? (
        <div className="-m-3 sm:-m-5"><CommandIntelligenceWorkspace key={intelligenceEntry.version} snapshot={intelligenceSnapshot} initialView={intelligenceEntry.view} initialKpiIds={intelligenceEntry.kpiIds} initialScopeId={intelligenceEntry.scopeId} initialCommercialFocus={intelligenceEntry.commercialFocus} /></div>
      ) : dashboardMode === "calendar" ? (
        <div className="mm-omega-actions-workspace mm-command-calendar-workspace">{calendarWorkspace}</div>
      ) : dashboardMode === "inspector" ? (
        <RadarInspectionWorkspace key={inspectorTarget.version} initialRadar={radarSnapshot} initialEvidence={radarEvidence} initialTab={inspectorTarget.tab} initialQuery={inspectorTarget.query} initialDomain={inspectorTarget.domain} initialStatus={inspectorTarget.status} initialScope={inspectorTarget.scope} initialLens={inspectorTarget.lens} initialSourceId={inspectorTarget.sourceId} initialDatasetId={inspectorTarget.datasetId} embedded />
      ) : dashboardMode === "workspace" ? (
        <BusinessRadarDashboard
          variant="workspace"
          radar={radarSnapshot}
          onRadarChange={applyRadarUpdate}
          onCreateTask={addRadarTask}
          taskBusyId={taskBusyId}
          advisorConfigured={advisorConfigured}
          onOpenInspector={openInspector}
          onOpenExecutive={() => setDashboardMode("radar")}
        />
      ) : dashboardMode === "radar" ? (
        <BusinessRadarDashboard
          variant="executive"
          radar={radarSnapshot}
          onRadarChange={applyRadarUpdate}
          onCreateTask={addRadarTask}
          taskBusyId={taskBusyId}
          advisorConfigured={advisorConfigured}
          onOpenInspector={openInspector}
          commandRail={(
            <section id="executive-radar-feed" className="mm-executive-day-command scroll-mt-20 border-b border-white/10" aria-label="Integrated Radar feed and priority queue">
              <div className="grid xl:grid-cols-[minmax(460px,1.25fr)_minmax(360px,.85fr)]">
                <div className="mm-direct-radar-feed min-w-0 border-b border-white/10 px-4 py-4 sm:px-6 xl:border-b-0 xl:border-r">
                  <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><span className="relative grid size-8 shrink-0 place-items-center border border-[#62e8ff]/25 bg-[#62e8ff]/[0.07] text-[#62e8ff]"><RadioTower size={14} /><span className="absolute -right-0.5 -top-0.5 size-1.5 animate-pulse bg-[#68f5d0] shadow-[0_0_6px_#68f5d0]" /></span><div className="min-w-0"><p className="text-[9px] font-semibold uppercase text-[#62e8ff]/60">Direct Radar feed</p><h3 className="mt-1 text-sm font-semibold text-white">What the business radar noticed</h3></div></div><span className="shrink-0 text-[9px] font-semibold uppercase text-[#68f5d0]">{radarSnapshot.incidents.length} live</span></div>
                  <div className="mt-3"><FindingGroupBar groups={radarSnapshot.findingGroups} /></div>
                  <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
                    {directRadarFeed.map(issue => {
                      const acceptedTask = radarTasksBySource.get(issue.id);
                      const taskActive = acceptedTask && acceptedTask.status !== "done";
                      return <article key={issue.id} className="py-3">
                        <div className="flex items-start gap-2.5"><span className={`mt-0.5 grid size-6 shrink-0 place-items-center text-[9px] font-bold ${issue.severity === "critical" ? "bg-red-500/20 text-red-200" : issue.severity === "warning" ? "bg-amber-300/15 text-amber-200" : "bg-sky-300/15 text-sky-200"}`}>{issue.severity === "critical" ? "!" : issue.severity === "warning" ? "△" : "·"}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`text-[8px] font-bold uppercase ${issue.severity === "critical" ? "text-red-200" : issue.severity === "warning" ? "text-amber-200" : "text-sky-200"}`}>{issue.severity}</span><span className="text-[8px] font-semibold uppercase text-white/32">{domainLabel(issue.domain)} · {issue.findingCount} findings · {formatRadarAge(issue.detectedAt)}</span>{acceptedTask ? <span className="border border-[#68f5d0]/18 bg-[#68f5d0]/[0.06] px-1.5 py-0.5 text-[8px] font-semibold uppercase text-[#7dd3c4]">{taskActive ? acceptedTask.reconciliation?.status ?? "Queued" : "Completed"}</span> : null}</div><strong className="mt-1 block text-xs leading-5 text-white/82">{issue.title}</strong><p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-white/38">{issue.detail}</p></div></div>
                        <div className="mt-2 flex justify-end gap-1.5"><button type="button" onClick={() => openInspector({ tab: "incidents", query: issue.id, domain: issue.domain })} className="inline-flex min-h-7 items-center gap-1 border border-white/10 px-2 text-[9px] font-semibold text-white/48 hover:bg-white/[0.06] hover:text-white"><Database size={11} /> Inspect</button>{!acceptedTask ? <button type="button" onClick={() => void addRadarTask(issue)} disabled={taskBusyId === `radar:${issue.id}`} className="inline-flex min-h-7 items-center gap-1 border border-[#62e8ff]/22 bg-[#62e8ff]/[0.07] px-2 text-[9px] font-semibold text-[#8ef1ff] disabled:opacity-40">{taskBusyId === `radar:${issue.id}` ? <LoaderCircle size={11} className="animate-spin" /> : <Plus size={11} />} Accept for today</button> : taskActive ? <button type="button" onClick={() => void completeTask(acceptedTask.id)} disabled={taskBusyId === acceptedTask.id} className="inline-flex min-h-7 items-center gap-1 border border-[#68f5d0]/22 bg-[#68f5d0]/[0.06] px-2 text-[9px] font-semibold text-[#91f4dc] disabled:opacity-40">{taskBusyId === acceptedTask.id ? <LoaderCircle size={11} className="animate-spin" /> : <Check size={11} />} Mark complete</button> : null}</div>
                      </article>;
                    })}
                    {!directRadarFeed.length ? <div className="py-8 text-center"><ShieldCheck className="mx-auto text-[#68f5d0]" size={20} /><p className="mt-2 text-xs font-semibold text-white/70">No live Radar notices</p><p className="mt-1 text-[10px] text-white/35">The next sweep will populate this feed automatically.</p></div> : null}
                  </div>
                </div>

                <div className="min-w-0 px-4 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="text-[9px] font-semibold uppercase text-[#62e8ff]/60">Radar-directed work</p><h3 className="mt-1 text-sm font-semibold text-white">Strict priority queue</h3>{strictWindow.protected ? <p className="mt-1 text-[9px] text-[#68f5d0]/62">Attention shield · {strictWindow.focus.length} in focus · {strictWindow.reserveCount} safely queued</p> : null}</div><Link href="/portal/agency/actions" className="inline-flex min-h-8 shrink-0 items-center gap-1 border border-white/12 px-2.5 text-[10px] font-semibold text-white/55 hover:bg-white/[0.06] hover:text-white">All actions <ArrowUpRight size={12} /></Link></div>
                  <form onSubmit={event => { event.preventDefault(); void addQuickTask(); }} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_36px]">
                    <input value={quickTask} onChange={event => setQuickTask(event.target.value)} placeholder="Capture the next concrete action" className="min-h-9 border border-white/12 bg-[#07161b] px-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-[#62e8ff]/45" />
                    <select aria-label="New command task priority" value={quickPriority} onChange={event => setQuickPriority(event.target.value as AgencyTaskPriority)} className="min-h-9 border border-white/12 bg-[#07161b] px-2 text-xs text-white"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
                    <button disabled={!quickTask.trim() || taskBusyId === "quick"} title="Add command task" className="grid size-9 place-items-center border border-[#62e8ff]/25 bg-[#62e8ff]/[0.07] text-[#8ef1ff] disabled:opacity-30">{taskBusyId === "quick" ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}</button>
                  </form>
                  <ol className="mt-3 divide-y divide-white/10 border-y border-white/10">
                    {commandPriorityFeed.map((item, index) => <li key={item.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 py-2.5"><span className={`grid size-6 place-items-center text-[9px] font-semibold ${item.priority === "urgent" ? "bg-red-500/20 text-red-200" : item.priority === "high" ? "bg-amber-300/15 text-amber-200" : "bg-white/[0.06] text-white/50"}`}>{index + 1}</span><span className="min-w-0"><strong className="block truncate text-xs text-white/80">{item.title}</strong><span className="block truncate text-[10px] text-white/35">{item.kind}</span></span>{item.taskId ? <button type="button" onClick={() => void completeTask(item.taskId!)} title={`Complete ${item.title}`} className="grid size-8 place-items-center border border-white/10 text-[#7dd3c4] hover:bg-white/[0.06]"><Check size={13} /></button> : <button type="button" onClick={() => void addStrictTodo(item)} title={`Accept ${item.title}`} className="grid size-8 place-items-center border border-white/10 text-white/45 hover:bg-white/[0.06] hover:text-white"><Plus size={13} /></button>}</li>)}
                    {!strictList.length ? <li className="py-5 text-center text-xs text-white/38">No queued priorities. The command plot is clear.</li> : null}
                  </ol>
                </div>
              </div>
              <InfraHealthPanel infra={businessRadar.infra} />
              {(statusMessage || operationError) ? <div role={operationError ? "alert" : "status"} aria-live="polite" className={`border-t px-4 py-2.5 text-xs sm:px-6 ${operationError ? "border-red-300/20 bg-red-400/10 text-red-100" : "border-[#68f5d0]/20 bg-[#68f5d0]/[0.06] text-[#91f4dc]"}`}>{operationError || statusMessage}</div> : null}
            </section>
          )}
        />
      ) : dashboardMode === "advisor" ? (
        <div className="mm-command-advisor-workspace">{advisorWorkspace}</div>
      ) : dashboardMode === "actions" ? (
        <div className="mm-omega-actions-workspace">{actionsWorkspace}</div>
      ) : (
      <div className="mm-day-command-workspace grid gap-4">
      <div className="mm-surface-card overflow-hidden rounded-lg border border-black/10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Daily command</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => moveDay(-1)} disabled={dateBusy} title="Previous day" aria-label="View previous day" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 bg-white text-black/55 hover:bg-black/[0.03] disabled:opacity-40"><ChevronLeft size={16} /></button>
              <h2 className="min-w-0 text-xl font-semibold text-black/85">{formatLongDate(selectedDate)}</h2>
              <button type="button" onClick={() => moveDay(1)} disabled={dateBusy} title="Next day" aria-label="View next day" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 bg-white text-black/55 hover:bg-black/[0.03] disabled:opacity-40"><ChevronRight size={16} /></button>
              <label className="relative inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-2.5 text-xs font-semibold text-black/55 hover:bg-black/[0.03]"><CalendarDays size={14} /><span className="sr-only">Choose planning date</span><input type="date" aria-label="Choose planning date" value={selectedDate} onChange={event => void selectDay(event.target.value)} disabled={dateBusy} className="w-[7.4rem] bg-transparent text-xs tabular-nums outline-none disabled:opacity-40" /></label>
              {!isToday ? <button type="button" onClick={() => void selectDay(actualToday)} disabled={dateBusy} className="inline-flex min-h-9 items-center rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-brand hover:bg-black/[0.03] disabled:opacity-40">Today</button> : null}
              {dateBusy ? <LoaderCircle size={15} className="animate-spin text-brand" aria-label="Loading planning date" /> : null}
            </div>
            <p className="mt-1 text-sm text-black/48">{isToday ? `Today · live command · ${dayStrictList.length} live priorities` : `${isFuture ? "Future plan · complete day workspace" : "Historical review · complete day record"} · ${dayStrictList.filter(item => item.status !== "done").length} open · ${completedOnSelectedDay.length} completed this day`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => activeSession ? requestClockOut() : void clock("clock-in")} disabled={clockBusy || !isToday} title={isToday ? activeSession ? "Review the day before clocking out" : undefined : "Clocking is available on today"} className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35 ${activeSession ? "bg-red-700 hover:bg-red-800" : "bg-black hover:bg-black/85"}`}>
              {clockBusy ? <LoaderCircle size={16} className="animate-spin" /> : !isToday ? <History size={15} /> : activeSession ? <Square size={15} /> : <Play size={15} />}
              {!isToday ? "Clocking · today only" : activeSession ? `Clock out · ${formatElapsed(now - activeSession.startedAt)}` : "Clock in"}
            </button>
            <button type="button" onClick={() => void saveDay()} disabled={savingDay || !dayDirty} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/70 hover:bg-black/[0.03] disabled:opacity-40">
              {savingDay ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
              Save day
            </button>
          </div>
        </div>

        <div className="grid gap-px bg-black/10 sm:grid-cols-2 lg:grid-cols-5">
          <Metric icon={<Clock3 size={15} />} label="Logged" value={`${formatHours(loggedHours)}h`} />
          <Metric icon={<Target size={15} />} label="Planned" value={`${formatHours(plan.plannedHours)}h`} />
          <Metric icon={<TimerReset size={15} />} label="Remaining" value={`${formatHours(Math.max(0, plan.plannedHours - loggedHours))}h`} />
          <Metric icon={<TrendingUp size={15} />} label="Execution" value={`${projectedCompletion}%`} tone={projectedCompletion >= 80 ? "green" : "neutral"} />
          <Metric icon={<AlarmClock size={15} />} label="Revenue target" value={money(plan.targetRevenuePounds)} />
        </div>

        <div className="border-t border-black/10 p-4 sm:p-5">
          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-black/45">
            One outcome that makes this day count
            <input value={plan.focus} onChange={event => updatePlan({ focus: event.target.value })} placeholder="Name the result, not the activity" className="min-h-12 rounded-md border border-black/10 bg-white px-3 text-base font-semibold normal-case tracking-normal text-black/82 outline-none focus:border-brand" />
          </label>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div className="grid w-full grid-cols-2 gap-2 sm:max-w-sm">
              <NumberField label="Planned hours" value={plan.plannedHours} step={0.25} max={24} onChange={value => updatePlan({ plannedHours: value })} />
              <NumberField label="Revenue target GBP" value={plan.targetRevenuePounds} step={50} max={1_000_000} onChange={value => updatePlan({ targetRevenuePounds: value })} />
            </div>
            {isToday ? <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
              <button type="button" onClick={() => void requestAdvisorBriefing()} disabled={advisorBusy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#62e8ff]/22 bg-[#62e8ff]/[0.065] px-3 text-xs font-semibold text-[#8ef1ff] hover:bg-[#62e8ff]/[0.12] disabled:opacity-40">{advisorBusy ? <LoaderCircle size={14} className="animate-spin" /> : <Bot size={14} />}Generate briefing</button>
              <button type="button" onClick={() => void generateTasksFromRadar()} disabled={taskGenerationBusy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#e5c479]/20 bg-[#e5c479]/[0.055] px-3 text-xs font-semibold text-[#e5c479] hover:bg-[#e5c479]/[0.1] disabled:opacity-40">{taskGenerationBusy ? <LoaderCircle size={14} className="animate-spin" /> : <ScanSearch size={14} />}Generate tasks</button>
            </div> : <div className="border border-black/10 bg-black/[0.025] px-3 py-2 text-xs leading-5 text-black/48"><strong className="block text-black/68">{isFuture ? "Planning mode" : "Review mode"}</strong>Live Advisor generation returns on Today. This view is locked to {formatLongDate(selectedDate)}.</div>}
          </div>
        </div>
      </div>

      {(statusMessage || operationError) ? (
        <div role={operationError ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${operationError ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {operationError || statusMessage}
        </div>
      ) : null}

      {!isToday ? <div className="flex items-start gap-3 border border-[#62e8ff]/20 bg-[#62e8ff]/[0.045] px-4 py-3 text-xs leading-5 text-[#9defff]"><History size={16} className="mt-0.5 shrink-0" /><p><strong>{formatLongDate(selectedDate)} is loaded across the whole workspace.</strong> Tasks, completion history, schedule, hours, plan and evidence below belong to this date. KPI and Radar instruments are labelled current because they remain live business telemetry.</p></div> : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <div className="grid gap-4">
          <section className="mm-surface-card overflow-hidden rounded-lg border border-black/10" aria-labelledby="strict-work-heading">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">{isToday ? "Do in this order" : isFuture ? "Planned for this day" : "Daily execution record"}</p>
                <h3 id="strict-work-heading" className="mt-1 text-lg font-semibold text-black/85">{isToday ? "Strict work queue" : isFuture ? "Day work queue" : "Work and outcomes"}</h3>
              </div>
              <button type="button" onClick={() => selectWorkspaceMode("actions")} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">All actions <ArrowUpRight size={13} /></button>
            </div>
            {!isFuture && !isToday ? <div className="border-b border-black/10 bg-black/[0.018] px-4 py-3 text-xs text-black/45 sm:px-5">Historical ledger: use Plan and evidence to add retrospective notes without creating an overdue task.</div> : <form onSubmit={event => { event.preventDefault(); void addQuickTask(); }} className="grid gap-2 border-b border-black/10 bg-black/[0.018] p-3 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:px-5">
              <input value={quickTask} onChange={event => setQuickTask(event.target.value)} placeholder="Capture the next concrete action" className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-brand" />
              <select aria-label="New task priority" value={quickPriority} onChange={event => setQuickPriority(event.target.value as AgencyTaskPriority)} className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm">
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <button disabled={!quickTask.trim() || taskBusyId === "quick"} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white disabled:opacity-40">
                {taskBusyId === "quick" ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />} Add
              </button>
            </form>}
            <ol className="divide-y divide-black/[0.07]">
              {dayStrictList.map((item, index) => (
                <li key={item.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-start sm:px-5">
                  <span className={`grid size-8 place-items-center rounded-full text-xs font-semibold ${item.priority === "urgent" ? "bg-red-700 text-white" : item.priority === "high" ? "bg-amber-100 text-amber-800" : "bg-black/[0.05] text-black/55"}`}>{index + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-black/82">{item.title}</p>
                      <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-black/45">{item.kind}</span>
                      {item.status === "done" ? <span className="text-[10px] font-semibold uppercase text-emerald-700">Completed</span> : item.dueAt && item.dueAt < now ? <span className="text-[10px] font-semibold uppercase text-red-700">Overdue</span> : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-black/48">{item.detail}</p>
                  </div>
                  <div className="flex gap-1 sm:justify-end">
                    {item.taskId && item.status === "done" ? (
                      <span className="grid size-9 place-items-center rounded-md border border-emerald-100 bg-emerald-50 text-emerald-700" title="Completed"><CheckCircle2 size={15} /></span>
                    ) : item.taskId ? (
                      <button type="button" onClick={() => void completeTask(item.taskId!)} disabled={taskBusyId === item.taskId} className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-emerald-700 hover:bg-emerald-50" title="Complete task" aria-label={`Complete ${item.title}`}>
                        {taskBusyId === item.taskId ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={15} />}
                      </button>
                    ) : (
                      <button type="button" onClick={() => void addStrictTodo(item)} disabled={taskBusyId === item.id} className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/55 hover:bg-black/[0.03]" title="Add to tasks" aria-label={`Add ${item.title} to tasks`}>
                        {taskBusyId === item.id ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={15} />}
                      </button>
                    )}
                    <Link href={item.href} className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/55 hover:bg-black/[0.03]" title="Open source" aria-label={`Open source for ${item.title}`}><ArrowUpRight size={14} /></Link>
                  </div>
                </li>
              ))}
              {!dayStrictList.length ? <li className="px-5 py-10 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={24} /><p className="mt-2 text-sm font-semibold text-black/70">{isToday ? "Queue clear" : isFuture ? "Nothing planned yet" : "No task history for this day"}</p><p className="mt-1 text-xs text-black/42">{isToday ? "Capture the next growth or delivery move above." : isFuture ? "Add a dated task or define the day outcome." : "The plan, hours and evidence records remain available for review."}</p></li> : null}
            </ol>
          </section>

          <section className="mm-surface-card rounded-lg border border-black/10 p-4 sm:p-5" aria-labelledby="day-plan-heading">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3"><span className="mm-area-icon grid size-10 place-items-center rounded-md"><NotebookPen size={18} /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Plan and evidence</p><h3 id="day-plan-heading" className="mt-1 text-lg font-semibold text-black/85">{weekdayLong(selectedDate)}</h3></div></div>
              {dayDirty ? <span className="text-xs font-medium text-amber-700">Unsaved</span> : null}
            </div>
            <label className="mt-4 grid gap-1.5 text-sm font-medium text-black/70">Ordered plan
              <textarea value={plan.planNotes} onChange={event => updatePlan({ planNotes: event.target.value })} rows={6} placeholder="1. Deep work result\n2. Client decision\n3. Sales follow-up\n4. Admin closeout" className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-brand" />
            </label>
            <div className="mt-4 border-t border-black/10 pt-4">
              <label className="grid gap-1.5 text-sm font-medium text-black/70">Log what moved
                <div className="flex gap-2">
                  <input value={doneEntry} onChange={event => setDoneEntry(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void logDone(); } }} placeholder="Decision made, asset shipped, call completed..." className="min-h-10 min-w-0 flex-1 rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-brand" />
                  <button type="button" onClick={() => void logDone()} disabled={!doneEntry.trim() || savingDay} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-40"><Check size={15} /> Log</button>
                </div>
              </label>
              <label className="mt-3 grid gap-1.5 text-sm font-medium text-black/70">Done record
                <textarea value={plan.doneNotes} onChange={event => updatePlan({ doneNotes: event.target.value })} rows={5} placeholder="No evidence recorded yet." className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-brand" />
              </label>
            </div>
          </section>
          <DayKpiIntelligencePanel intelligence={intelligenceSnapshot} onOpen={openIntelligence} />
        </div>

        <div className="grid gap-4">
          <section className="mm-surface-card overflow-hidden rounded-lg border border-black/10" aria-labelledby="dashboard-calendar-heading">
            <div className="flex items-start justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <span className="mm-area-icon grid size-10 shrink-0 place-items-center rounded-md"><CalendarDays size={18} /></span>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Schedule · {shortDate(selectedDate)}</p><h3 id="dashboard-calendar-heading" className="mt-1 text-lg font-semibold text-black/85">{isToday ? "Today’s agenda" : isFuture ? "Planned schedule" : "Day timeline"}</h3></div>
              </div>
              <button type="button" onClick={() => selectWorkspaceMode("calendar")} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 bg-white px-2.5 text-xs font-semibold text-black/58 hover:bg-black/[0.03]"><CalendarDays size={13} />Calendar</button>
            </div>
            <div className="divide-y divide-black/[0.07]">
              {selectedDaySchedule.map(item => (
                <Link key={item.id} href={item.href} className="mm-interactive-row group grid grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5">
                  <time dateTime={isoDateTimeValue(item.at)} className="rounded-md bg-black/[0.035] px-2 py-1.5 text-center">
                    <span className="block text-[9px] font-semibold uppercase text-black/38">{calendarMonth(item.at)}</span>
                    <strong className="mt-0.5 block text-sm tabular-nums text-black/75">{calendarDay(item.at)}</strong>
                  </time>
                  <span className="min-w-0"><strong className="block truncate text-sm font-semibold text-black/76">{item.title}</strong><span className="mt-0.5 block text-[11px] text-black/42">{calendarWeekday(item.at)} · {item.kind}</span></span>
                  <ArrowUpRight size={14} className="text-black/25 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black/55" />
                </Link>
              ))}
              {!selectedDaySchedule.length ? <div className="px-5 py-8 text-center"><CalendarDays className="mx-auto text-black/18" size={22} /><p className="mt-2 text-sm font-semibold text-black/58">Nothing scheduled for this date</p><p className="mt-1 text-xs leading-5 text-black/40">Add a dated task or plan a daily outcome.</p></div> : null}
            </div>
          </section>

          <section className="mm-surface-card overflow-hidden rounded-lg border border-black/10" aria-labelledby="timesheet-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3"><span className="mm-area-icon grid size-10 place-items-center rounded-md"><Clock3 size={18} /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Employee record · accountable time</p><h3 id="timesheet-heading" className="mt-1 text-lg font-semibold text-black/85">Timesheet · {formatHours(loggedHours)}h confirmed</h3></div></div>
              {activeSession && isToday ? <button type="button" onClick={() => window.dispatchEvent(new Event("aqua-work-session:check-in"))} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03]"><Activity size={14} />Update activity</button> : null}
            </div>
            {activeSession && isToday ? <div className={`border-b px-4 py-3 text-sm sm:px-5 ${activeSession.needsActivityConfirmation ? "border-red-200 bg-red-50 text-red-900" : activeSession.currentMode === "break" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{workModeLabel(activeSession.currentMode)} · {formatElapsed(now - activeSession.startedAt)} clocked in</p><p className="mt-1 text-xs opacity-70">{activeSession.focus || plan.focus || "General work"}</p></div><span className="rounded-sm border border-current/15 bg-white/45 px-2 py-1 text-[10px] font-bold uppercase">{activeSession.needsActivityConfirmation ? "Check-in required" : activeSession.nextCheckInAt ? `Check-in ${formatClockTime(activeSession.nextCheckInAt)}` : "Evidence live"}</span></div></div> : null}
            <div className="grid gap-px border-b border-black/10 bg-black/10 sm:grid-cols-5">
              <AccountabilityMetric label="Aqua active" value={`${formatHours(selectedAquaHours)}h`} tone="aqua" />
              <AccountabilityMetric label="External work" value={`${formatHours(selectedExternalHours)}h`} tone="external" />
              <AccountabilityMetric label="Break" value={`${formatHours(selectedBreakHours)}h`} tone="break" />
              <AccountabilityMetric label="Unconfirmed" value={`${formatHours(selectedUnconfirmedHours)}h`} tone={selectedUnconfirmedHours ? "attention" : "neutral"} />
              <AccountabilityMetric label="Evidence confidence" value={`${selectedEvidenceConfidence}%`} tone={selectedEvidenceConfidence >= 90 ? "aqua" : selectedEvidenceConfidence >= 70 ? "break" : "attention"} />
            </div>
            {selectedSessions.some(session => Object.keys(session.routeActiveMs ?? {}).length) ? <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-4 py-3 text-[10px] text-black/45 sm:px-5"><span className="font-semibold uppercase text-black/35">Aqua workspace time</span>{topSessionRoutes(selectedSessions).map(route => <span key={route.path} className="rounded-sm bg-black/[0.04] px-2 py-1"><strong className="text-black/65">{routeLabel(route.path)}</strong> · {formatCompactDuration(route.activeMs)}</span>)}<span className={`rounded-sm px-2 py-1 ${focusFragmentationWatch ? "bg-amber-100 font-semibold text-amber-800" : "bg-black/[0.04]"}`}>{focusFragmentationWatch ? "Focus watch" : "Workspace moves"} · {selectedRouteSwitches}</span></div> : null}
            <div className="grid gap-2 border-b border-black/10 p-4 sm:grid-cols-2 sm:p-5">
              <NumberField label="Manual hours" value={manualHours} step={0.25} max={24} onChange={setManualHours} />
              <label className="grid gap-1.5 text-xs font-medium text-black/55">Work area<input value={manualFocus} onChange={event => setManualFocus(event.target.value)} placeholder={plan.focus || "What did you work on?"} className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm" /></label>
              <label className="grid gap-1.5 text-xs font-medium text-black/55 sm:col-span-2">Time note<textarea value={manualNotes} onChange={event => setManualNotes(event.target.value)} rows={2} placeholder="Result, decision, or output" className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm" /></label>
              <button type="button" onClick={() => void logManualTime()} disabled={isFuture || sessionBusyId === "manual" || !manualHours} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/70 hover:bg-black/[0.03] disabled:opacity-40 sm:col-span-2">
                {sessionBusyId === "manual" ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />} Add time entry
              </button>
            </div>
            <div className="divide-y divide-black/[0.07]">
              {selectedSessions.map(session => (
                <div key={session.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-black/75">{session.focus || "General work"}</p><p className="mt-1 text-xs text-black/42">{formatTimeRange(session)} · {formatHours(accountableSessionHours(session))}h confirmed · {formatHours(sessionHours(session, now))}h elapsed</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-black/38"><span>Aqua {formatHours((session.aquaActiveMs ?? 0) / 3_600_000)}h</span><span>External {formatHours((session.externalWorkMs ?? 0) / 3_600_000)}h</span>{(session.breakMs ?? 0) > 0 ? <span>Break {formatHours((session.breakMs ?? 0) / 3_600_000)}h</span> : null}{(session.unconfirmedIdleMs ?? 0) > 0 ? <span className="font-semibold text-red-700">Unconfirmed {formatHours((session.unconfirmedIdleMs ?? 0) / 3_600_000)}h</span> : null}{session.clockOutReview ? <span className="font-semibold text-brand">Day score {session.clockOutReview.dayScore}/5</span> : null}</div>{session.notes ? <p className="mt-1 text-xs leading-5 text-black/48">{session.notes}</p> : null}{session.clockOutReview ? <div className="mt-2 grid gap-1 border-l-2 border-brand/25 pl-2 text-[10px] leading-4 text-black/42"><p><strong className="text-black/60">Handover:</strong> {session.clockOutReview.nothingOpen ? "Nothing left open." : session.clockOutReview.openWork}</p><p><strong className="text-black/60">Next:</strong> {session.clockOutReview.nextPriority}</p></div> : null}</div>
                  {session.endedAt ? <button type="button" onClick={() => void removeSession(session.id)} disabled={sessionBusyId === session.id} title="Remove time entry" aria-label={`Remove ${session.focus || "time"} entry`} className="grid size-8 place-items-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700">{sessionBusyId === session.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button> : null}
                </div>
              ))}
              {!selectedSessions.length ? <p className="px-5 py-8 text-center text-sm text-black/40">No hours logged for this day.</p> : null}
            </div>
          </section>

          {advisorError ? <p role="alert" className="border border-red-300/20 bg-red-400/[0.05] px-3 py-2 text-xs text-red-200">{advisorError}</p> : null}
          {isToday ? <DayBriefingPanel
            radar={radarSnapshot}
            recommendations={topRecommendedActions}
            counts={counts}
            reviewedAt={reviewedAt}
            advisorConfigured={advisorConfigured}
            advisorBusy={advisorBusy}
            taskSummary={taskGenerationSummary}
            taskBusyId={taskBusyId}
            onGenerate={() => void requestAdvisorBriefing()}
            onAccept={action => void acceptAdvisorAction(action)}
            onOpenAdvisor={() => window.dispatchEvent(new Event("aqua-advisor:open"))}
          /> : <DayDateRecordPanel date={selectedDate} future={isFuture} plan={plan} loggedHours={loggedHours} tasks={selectedDayTasks} completedTasks={completedOnSelectedDay} />}
          <DayCommandSensorPanel radar={radarSnapshot} intelligence={intelligenceSnapshot} onOpenRadar={() => setActiveStation("executive")} onOpenIntelligence={openIntelligence} />
        </div>
      </div>

      <ClientsNeedingAttention items={clientsNeedingAttention} />

      <section className="mm-surface-card overflow-hidden rounded-lg border border-black/10" aria-labelledby="week-plan-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
          <button type="button" onClick={toggleWeekCommand} aria-expanded={weekExpanded} aria-controls="week-command-content" className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="mm-area-icon grid size-10 shrink-0 place-items-center rounded-md"><CalendarDays size={18} /></span>
            <span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-brand">Week command</span><span id="week-plan-heading" className="mt-1 block truncate text-lg font-semibold text-black/85">Week of {shortDate(planningWeekStart)}</span></span>
            <span className="ml-auto grid size-8 shrink-0 place-items-center rounded-md border border-black/10 bg-white text-black/45">{weekExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
          </button>
          {!weekExpanded ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-black/45"><span><strong className="text-black/70">{formatHours(plannedWeekHours)}h</strong> planned</span><span><strong className="text-black/70">{formatHours(loggedWeekHours)}h</strong> logged</span><span><strong className="text-black/70">{weekPace}%</strong> pace</span>{weekDirty ? <span className="font-semibold text-amber-700">Unsaved</span> : null}</div> : null}
        </div>
        {weekExpanded ? <div id="week-command-content" className="border-t border-black/10">
        <div className="p-4 sm:p-5">
          <WeeklyReviewWorkspace
            draft={weekPlan}
            evidence={weekEvidenceSnapshot}
            dirty={weekDirty}
            saving={savingWeek}
            onChange={patch => { setWeekPlan(current => ({ ...current, ...patch, reviewStatus: patch.reviewStatus ?? "draft" })); setWeekDirty(true); }}
            onSave={reviewStatus => void saveWeek(reviewStatus)}
          />
        </div>
        <div className="grid gap-px border-t border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-7">
          {dates.map(date => {
            const draft = date === selectedDate ? plan : draftFromPlan(weekPlans.find(item => item.date === date) ?? null);
            const logged = sessions.filter(session => session.date === date).reduce((sum, session) => sum + sessionHours(session, now), 0);
            const selected = date === selectedDate;
            return <button key={date} type="button" onClick={() => void selectDay(date)} className={`min-h-32 p-3 text-left transition ${selected ? "bg-[#f7f1e5]" : "bg-white hover:bg-black/[0.025]"}`}>
              <div className="flex items-center justify-between gap-2"><span className={`text-xs font-semibold ${selected ? "text-brand" : "text-black/50"}`}>{weekday(date)}</span><span className="text-[10px] text-black/35">{date.slice(8)}</span></div>
              <p className="mt-3 line-clamp-2 min-h-8 text-xs font-medium leading-4 text-black/68">{draft.focus || "No outcome planned"}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full rounded-full bg-brand" style={{ width: `${draft.plannedHours ? Math.min(100, (logged / draft.plannedHours) * 100) : 0}%` }} /></div>
              <p className="mt-2 text-[10px] text-black/42">{formatHours(logged)}h / {formatHours(draft.plannedHours)}h</p>
            </button>;
          })}
        </div>
        </div> : null}
      </section>
      </div>
      )}
      </div>
    </section>}
    </div>
  );
}

function CommandInstrumentDock({ alertCount, checkCount, onOpenIntelligence, onOpenRadar }: {
  alertCount: number;
  checkCount: number;
  onOpenIntelligence: () => void;
  onOpenRadar: () => void;
}) {
  return <nav aria-label="Command Centre instruments" className="grid border-x border-[#62e8ff]/30 bg-[#020b11] sm:grid-cols-2">
    <CommandInstrumentButton icon={<BarChart3 size={16} />} eyebrow="Integrated instrument · INT-20" label="Open KPI Intelligence" detail="Twenty KPIs, comparisons, campaigns and audiences" tone="aqua" onClick={onOpenIntelligence} />
    <CommandInstrumentButton icon={<ScanSearch size={16} />} eyebrow="Integrated instrument · RADAR OPS" label="Open Radar Workspace" detail={`${checkCount.toLocaleString()} checks · ${alertCount} contacts · evidence, sources and policy`} tone="cyan" onClick={onOpenRadar} />
  </nav>;
}

function CommandInstrumentButton({ icon, eyebrow, label, detail, tone, onClick }: { icon: React.ReactNode; eyebrow: string; label: string; detail: string; tone: "aqua" | "cyan"; onClick: () => void }) {
  const toneClass = tone === "aqua" ? "border-[#68f5d0]/24 bg-[#68f5d0]/[0.055] text-[#68f5d0]" : "border-[#62e8ff]/24 bg-[#62e8ff]/[0.055] text-[#62e8ff]";
  return <button type="button" onClick={onClick} className="group flex min-h-[68px] items-center gap-3 border-b border-r border-[#62e8ff]/12 px-4 text-left text-white hover:bg-[#62e8ff]/[0.055] sm:px-5"><span className={`grid size-9 shrink-0 place-items-center border ${toneClass}`}>{icon}</span><span className="min-w-0"><span className="block text-[8px] font-semibold uppercase text-[#76dff1]/55">{eyebrow}</span><strong className="mt-0.5 block text-sm text-white/82">{label}</strong><span className="mt-0.5 block text-[9px] text-white/30">{detail}</span></span><ArrowUpRight size={12} className="ml-auto shrink-0 text-white/22 group-hover:text-[#68f5d0]" /></button>;
}

function RadarWorkspaceButton({
  active,
  icon,
  label,
  detail,
  tone = "cyan",
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  detail: string;
  tone?: "cyan" | "aqua" | "gold";
  onClick: () => void;
}) {
  return <button type="button" aria-pressed={active} data-active={active} data-tone={tone} onClick={onClick} className="mm-omega-workspace-button grid min-h-[4.25rem] grid-cols-[32px_minmax(0,1fr)] items-center gap-2.5 border-r border-[#62e8ff]/15 px-3 text-left">
    <span className="mm-omega-workspace-button__icon grid size-8 place-items-center border border-current/25">{icon}</span>
    <span className="min-w-0"><strong className="block truncate text-[11px] font-semibold text-white/82">{label}</strong><span className="mt-0.5 block truncate text-[8px] font-semibold uppercase text-white/32">{detail}</span></span>
  </button>;
}

function DayDateRecordPanel({ date, future, plan, loggedHours, tasks, completedTasks }: {
  date: string;
  future: boolean;
  plan: DayDraft;
  loggedHours: number;
  tasks: AgencyTask[];
  completedTasks: AgencyTask[];
}) {
  const openCount = tasks.filter(task => task.status !== "done").length;
  const evidenceLines = plan.doneNotes.split("\n").filter(line => line.trim()).length;
  const completion = tasks.length ? Math.round(completedTasks.length / tasks.length * 100) : 0;

  return <section className="overflow-hidden border border-[#62e8ff]/22 bg-[#020b11] text-white" aria-labelledby="day-date-record-heading">
    <header className="flex items-start gap-2.5 border-b border-[#62e8ff]/14 bg-[#031018] px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center border border-[#e5c479]/22 bg-[#e5c479]/[0.055] text-[#e5c479]">{future ? <CalendarDays size={16} /> : <History size={16} />}</span>
      <div className="min-w-0"><p className="text-[8px] font-semibold uppercase text-[#e5c479]/62">{future ? "FORWARD WATCH · DAY PLAN" : "CAPTAIN’S LOG · DAY REVIEW"}</p><h3 id="day-date-record-heading" className="mt-0.5 text-sm font-semibold text-white/84">{future ? "Planning brief" : "Daily review"} · {shortDate(date)}</h3><p className="mt-0.5 text-[9px] text-white/30">{future ? "The complete working plan that will load on this date." : "The retained work, hours and evidence for this date."}</p></div>
    </header>
    <div className="grid grid-cols-2 border-b border-[#62e8ff]/12 sm:grid-cols-4">
      <DayRecordMetric label="Planned" value={`${formatHours(plan.plannedHours)}h`} />
      <DayRecordMetric label={future ? "Open work" : "Logged"} value={future ? String(openCount) : `${formatHours(loggedHours)}h`} />
      <DayRecordMetric label={future ? "Revenue target" : "Completed"} value={future ? money(plan.targetRevenuePounds) : String(completedTasks.length)} />
      <DayRecordMetric label={future ? "Evidence ready" : "Execution"} value={future ? String(evidenceLines) : `${completion}%`} />
    </div>
    <div className="px-4 py-4">
      <p className="text-[8px] font-semibold uppercase text-[#62e8ff]/55">Primary outcome</p>
      <p className="mt-1.5 text-sm font-semibold leading-6 text-white/76">{plan.focus.trim() || (future ? "No outcome has been committed yet." : "No outcome was recorded for this day.")}</p>
      <div className="mt-3 grid gap-3 border-t border-[#62e8ff]/10 pt-3 sm:grid-cols-2">
        <div><p className="text-[7px] font-semibold uppercase text-white/24">Ordered plan</p><p className="mt-1 whitespace-pre-line text-[9px] leading-4 text-white/38">{plan.planNotes.trim() || "No ordered plan recorded."}</p></div>
        <div><p className="text-[7px] font-semibold uppercase text-white/24">{future ? "Prepared evidence" : "Done evidence"}</p><p className="mt-1 whitespace-pre-line text-[9px] leading-4 text-white/38">{plan.doneNotes.trim() || "No evidence recorded."}</p></div>
      </div>
    </div>
    <footer className="border-t border-[#62e8ff]/9 px-4 py-2 text-[7px] uppercase text-white/18">Date-scoped record · {tasks.length} linked tasks · live Radar intentionally excluded from this archive</footer>
  </section>;
}

function DayRecordMetric({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-r border-[#62e8ff]/9 px-3 py-2.5"><p className="text-[7px] font-semibold uppercase text-white/22">{label}</p><strong className="mt-1 block text-sm tabular-nums text-[#8ef1ff]">{value}</strong></div>;
}

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

function BusinessRadarDashboard({
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

async function dashboardRequest(body: Record<string, unknown>): Promise<DashboardPlanningPayload> {
  const response = await fetch("/api/portal/dashboard-planning", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; planning?: DashboardPlanningPayload } | null;
  if (!response.ok || !result?.ok || !result.planning) throw new Error(result?.error || "Dashboard planning could not save.");
  return result.planning;
}

async function loadDashboardPlanning(date: string): Promise<DashboardPlanningPayload> {
  const response = await fetch(`/api/portal/dashboard-planning?date=${encodeURIComponent(date)}`, { cache: "no-store" });
  const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; planning?: DashboardPlanningPayload } | null;
  if (!response.ok || !result?.ok || !result.planning) throw new Error(result?.error || "Dashboard planning date could not load.");
  return result.planning;
}

function draftFromPlan(plan: DashboardDayPlan | null): DayDraft {
  return {
    focus: plan?.focus ?? "",
    planNotes: plan?.planNotes ?? "",
    doneNotes: plan?.doneNotes ?? "",
    plannedHours: plan?.plannedHours ?? 0,
    targetRevenuePounds: plan?.targetRevenuePounds ?? 0,
  };
}

function Metric({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string; tone?: "neutral" | "green" }) {
  return <div className={`bg-white px-4 py-3 ${tone === "green" ? "text-emerald-800" : "text-black/75"}`}><div className="flex items-center gap-2 text-xs text-current/60">{icon}<span>{label}</span></div><p className="mt-1 text-lg font-semibold tabular-nums">{value}</p></div>;
}

function NumberField({ label, value, step, max, onChange }: { label: string; value: number; step: number; max: number; onChange: (value: number) => void }) {
  return <label className="grid gap-1.5 text-xs font-medium text-black/55">{label}<input type="number" min="0" max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm tabular-nums" /></label>;
}

function WeekMetric({ label, value }: { label: string; value: string }) {
  return <div className="bg-white px-3 py-3"><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-black/75">{value}</p></div>;
}

function AccountabilityMetric({ label, value, tone }: { label: string; value: string; tone: "aqua" | "external" | "break" | "attention" | "neutral" }) {
  const toneClass = tone === "aqua" ? "text-emerald-800" : tone === "external" ? "text-sky-800" : tone === "break" ? "text-amber-800" : tone === "attention" ? "text-red-800" : "text-black/70";
  return <div className="bg-white px-3 py-3"><p className="text-[9px] font-semibold uppercase text-black/35">{label}</p><p className={`mt-1 text-sm font-semibold tabular-nums ${toneClass}`}>{value}</p></div>;
}

function mergeRecommendedActions(
  reviewed: AdvisorActionSuggestion[],
  primary: AdvisorActionSuggestion[],
  fallback: AdvisorActionSuggestion[],
  existingTaskTitles: string[],
): AdvisorActionSuggestion[] {
  const existing = new Set(existingTaskTitles.map(normalizeRecommendationTitle));
  const titles = new Set<string>();
  const sources = new Set<string>();
  return [...reviewed, ...primary, ...fallback].filter(action => {
    const title = normalizeRecommendationTitle(action.title);
    if (!title || existing.has(title) || titles.has(title) || action.sourceAlertIds.some(source => sources.has(source))) return false;
    titles.add(title);
    for (const source of action.sourceAlertIds) sources.add(source);
    return true;
  }).slice(0, 5);
}

function normalizeRecommendationTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function priorityRank(priority: DashboardSignal["priority"]) {
  return priority === "urgent" ? 0 : priority === "high" ? 1 : 2;
}

function domainLabel(domain: AdvisorDomain): string {
  const labels: Record<AdvisorDomain, string> = {
    company: "Company",
    sales: "Sales",
    inbox: "Inbox",
    clients: "Clients",
    finance: "Finance",
    delivery: "Delivery",
    marketing: "Marketing",
    operations: "Operations",
    compliance: "Compliance",
    development: "Development",
    team: "Team",
    systems: "Systems",
  };
  return labels[domain];
}

function formatRadarAge(timestamp: number): string {
  const validTimestamp = timestampFromValue(timestamp);
  if (validTimestamp === undefined) return "date needs review";
  const elapsed = Math.max(0, Date.now() - validTimestamp);
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}

function formatRadarDuration(duration: number): string {
  if (duration < 60_000) return `${Math.max(1, Math.round(duration / 1_000))}s`;
  if (duration < 3_600_000) return `${Math.round(duration / 60_000)}m`;
  if (duration < 86_400_000) return `${Math.round(duration / 3_600_000)}h`;
  const days = Math.floor(duration / 86_400_000);
  const hours = Math.round((duration % 86_400_000) / 3_600_000);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

function signedInteger(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function signedDecimal(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function radarNodeClass(status: "critical" | "warning" | "watch" | "blind" | "inactive" | "healthy"): string {
  if (status === "critical") return "border-red-300/35 bg-red-400/15 text-red-200";
  if (status === "warning") return "border-amber-300/35 bg-amber-400/15 text-amber-200";
  if (status === "watch") return "border-sky-300/35 bg-sky-400/15 text-sky-200";
  if (status === "blind") return "border-white/20 bg-white/10 text-white/45";
  if (status === "inactive") return "border-white/10 bg-white/[0.04] text-white/28";
  return "border-emerald-300/25 bg-emerald-400/10 text-emerald-200";
}

function radarSeverityRank(severity: BusinessRadarIssue["severity"]): number {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}

function radarSeverityClass(severity: BusinessRadarIssue["severity"]): string {
  if (severity === "critical") return "bg-red-400/15 text-red-200";
  if (severity === "warning") return "bg-amber-400/15 text-amber-200";
  return "bg-sky-400/15 text-sky-200";
}

function radarCheckStatusClass(status: RadarCheckStatus): string {
  if (status === "critical") return "bg-red-400/15 text-red-200";
  if (status === "warning") return "bg-amber-400/15 text-amber-200";
  if (status === "watch") return "bg-sky-400/15 text-sky-200";
  if (status === "blind") return "bg-white/10 text-white/55";
  if (status === "learning") return "bg-violet-400/15 text-violet-200";
  if (status === "inactive") return "bg-white/[0.05] text-white/35";
  return "bg-emerald-400/15 text-emerald-200";
}

function radarCheckIconClass(status: RadarCheckStatus): string {
  if (status === "critical") return "border-red-300/25 bg-red-400/10 text-red-200";
  if (status === "warning") return "border-amber-300/25 bg-amber-400/10 text-amber-200";
  if (status === "watch") return "border-sky-300/25 bg-sky-400/10 text-sky-200";
  if (status === "blind") return "border-white/15 bg-white/[0.06] text-white/45";
  if (status === "learning") return "border-violet-300/25 bg-violet-400/10 text-violet-200";
  if (status === "inactive") return "border-white/10 bg-white/[0.03] text-white/30";
  return "border-emerald-300/25 bg-emerald-400/10 text-emerald-200";
}

function radarCheckStatusLabel(status: RadarCheckStatus): string {
  if (status === "pass") return "Pass";
  if (status === "blind") return "Blind";
  if (status === "learning") return "Learning";
  if (status === "inactive") return "Inactive";
  return status;
}

function coverageStatusLabel(status: AdvisorCoverageSource["status"]): string {
  if (status === "connected") return "Live";
  if (status === "empty") return "Watching";
  if (status === "unavailable") return "Unavailable";
  return "Disconnected";
}

function intelligenceView(value: string | null): IntelligenceView {
  if (value === "lifecycle" || value === "campaigns" || value === "audiences" || value === "kpis" || value === "compare") return value;
  return "overview";
}

function commercialFocus(searchParams: Pick<URLSearchParams, "get">) {
  return {
    metricId: searchParams.get("metric")?.trim() || undefined,
    recordId: searchParams.get("record")?.trim() || undefined,
    sourceId: searchParams.get("source")?.trim() || undefined,
    stageId: searchParams.get("stage")?.trim() || undefined,
  };
}

function overdueRank(item: StrictItem, now: number) {
  return item.dueAt && item.dueAt < now ? -1 : 0;
}

function timestampFallsOnDate(value: number | undefined, date: string): boolean {
  if (!value) return false;
  const start = new Date(`${date}T00:00:00`).getTime();
  const end = new Date(`${date}T23:59:59.999`).getTime();
  return value >= start && value <= end;
}

function taskTouchesDate(task: AgencyTask, date: string): boolean {
  return timestampFallsOnDate(task.startAt, date)
    || timestampFallsOnDate(task.dueAt, date)
    || timestampFallsOnDate(task.completedAt, date);
}

function taskMomentForDate(task: AgencyTask, date: string): number | undefined {
  if (timestampFallsOnDate(task.startAt, date)) return task.startAt;
  if (timestampFallsOnDate(task.dueAt, date)) return task.dueAt;
  if (timestampFallsOnDate(task.completedAt, date)) return task.completedAt;
  return undefined;
}

function calendarEntryMomentForDate(entry: CommandCalendarEntry, date: string): number | undefined {
  const dayStart = new Date(`${date}T00:00:00`).getTime();
  const dayEnd = new Date(`${date}T23:59:59.999`).getTime();
  const entryEnd = entry.endsAt ?? entry.startsAt;
  if (entry.startsAt > dayEnd || entryEnd < dayStart) return undefined;
  return Math.max(dayStart + 12 * 60 * 60 * 1000, entry.startsAt);
}

function externalCalendarMomentForDate(event: CommandCalendarExternalEvent, date: string): number | undefined {
  const dayStart = new Date(`${date}T00:00:00`).getTime();
  const dayEnd = new Date(`${date}T23:59:59.999`).getTime();
  const eventEnd = event.endsAt ?? event.startsAt;
  if (event.startsAt > dayEnd || eventEnd < dayStart) return undefined;
  return event.allDay ? dayStart + 12 * 60 * 60 * 1_000 : Math.max(dayStart, event.startsAt);
}

function taskTimingDetail(task: AgencyTask): string {
  if (task.completedAt) return `Completed ${formatDateTime(task.completedAt)}.`;
  if (task.dueAt) return `Due ${formatDateTime(task.dueAt)}.`;
  if (task.startAt) return `Starts ${formatDateTime(task.startAt)}.`;
  return "Dated action.";
}

function sessionHours(session: DashboardWorkSession, now = Date.now()): number {
  return Math.max(0, (session.endedAt ?? now) - session.startedAt) / 3_600_000;
}

function accountableSessionHours(session: DashboardWorkSession): number {
  if (session.aquaActiveMs === undefined && session.externalWorkMs === undefined) return sessionHours(session);
  return Math.max(0, (session.aquaActiveMs ?? 0) + (session.externalWorkMs ?? 0)) / 3_600_000;
}

function workModeLabel(mode?: DashboardWorkSession["currentMode"]): string {
  if (mode === "aqua") return "Active in Aqua";
  if (mode === "external") return "Working elsewhere";
  if (mode === "break") return "Break in progress";
  return "Activity unconfirmed";
}

function formatClockTime(value: number): string {
  return formatUkDate(value, { hour: "2-digit", minute: "2-digit" });
}

function topSessionRoutes(sessions: DashboardWorkSession[]): Array<{ path: string; activeMs: number }> {
  const totals = new Map<string, number>();
  for (const session of sessions) for (const [path, activeMs] of Object.entries(session.routeActiveMs ?? {})) totals.set(path, (totals.get(path) ?? 0) + activeMs);
  return [...totals.entries()].map(([path, activeMs]) => ({ path, activeMs })).sort((left, right) => right.activeMs - left.activeMs).slice(0, 4);
}

function routeLabel(path: string): string {
  if (path === "/portal/agency") return "Day Command";
  const segment = path.split("/").filter(Boolean).pop() ?? "Aqua";
  return segment.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function formatCompactDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function formatHours(value: number): string {
  return value.toFixed(value >= 10 ? 0 : 1);
}

function formatElapsed(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function formatLongDate(value: string): string {
  return formatUkDate(`${value}T12:00:00`, { weekday: "long", day: "numeric", month: "long" });
}

function formatDateTime(value: number): string {
  return formatUkDate(value, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function calendarDay(value: number): string {
  return formatUkDate(value, { day: "2-digit" }, "--");
}

/**
 * Resolve `?station=` to a surface. `devteam` is GUARDED: it only resolves when
 * the Dev Team station is actually visible (founder + Dev Mode, decided
 * server-side), so a founder can refresh or bookmark `?station=devteam` while a
 * hand-typed URL still cannot land anyone else on a station that isn't there —
 * they fall through to the default, exactly as before.
 */
function commandStationMode(value: string | null, devTeamVisible = false): CommandSurfaceMode | null {
  if (value === "calendar") return "day";
  if (value === "omega") return "executive";
  if (value === "radar-inspector") return "radar";
  if (value === "devteam") return devTeamVisible ? "devteam" : null;
  return value && ["executive", "day", "battle", "intelligence", "radar"].includes(value)
    ? value as CommandSurfaceMode
    : null;
}

function battleTableAttention(payload: BattleTablePayload): CommandStationAttention {
  const target = payload.initial.monthlyRevenueTargetCents;
  const revenueProgress = target > 0 ? payload.actuals.monthRevenueCents / target * 100 : null;
  const criticalSignals = [
    payload.healthScore < 40,
    revenueProgress !== null && revenueProgress < 50,
    payload.actuals.overdueTasks > 0,
    capitalCriticalAttention(payload.initial) > 0,
  ].filter(Boolean).length;
  const warningSignals = [
    payload.healthScore >= 40 && payload.healthScore < 70,
    revenueProgress !== null && revenueProgress >= 50 && revenueProgress < 80,
    payload.actuals.clientsNeedingAttention > 0,
    payload.initial.objectives.some(objective => objective.status === "at-risk"),
    payload.totalSources > 0 && payload.connectedSources / payload.totalSources < 0.9,
    capitalWarningAttention(payload.initial) > 0,
  ].filter(Boolean).length;
  const count = criticalSignals + warningSignals;
  return {
    count,
    tone: criticalSignals ? "critical" : warningSignals ? "warning" : "clear",
    label: count
      ? `${criticalSignals} critical and ${warningSignals} strategic exceptions across targets, tasks, clients, capital, objectives and readiness`
      : "Strategy, targets and executive readiness are holding",
  };
}

function capitalCriticalAttention(company: CompanyProfile): number {
  const active = company.capital.shareholders.filter(item => item.status === "active");
  const issuedByClass = new globalThis.Map<string, number>();
  active.forEach(item => issuedByClass.set(item.shareClassId, (issuedByClass.get(item.shareClassId) ?? 0) + item.shares));
  return company.capital.shareClasses.filter(item => (issuedByClass.get(item.id) ?? 0) > item.authorisedShares).length
    + company.capital.dividends.filter(item => item.status !== "cancelled" && item.paymentDueAt && item.paymentDueAt < Date.now() && item.paidCents < item.declaredCents).length;
}

function capitalWarningAttention(company: CompanyProfile): number {
  return Number(!company.capital.shareholders.some(item => item.status === "active"))
    + company.capital.investments.filter(item => item.status === "active" && (!item.valuedAt || Date.now() - item.valuedAt > 90 * 86_400_000)).length
    + company.capital.transactions.filter(item => (item.status === "approved" || item.status === "completed") && !item.approvalId).length
    + company.capital.dividends.filter(item => item.status !== "draft" && item.status !== "cancelled" && !item.approvalId).length
    + company.capital.decisions.filter(item => item.status === "draft").length;
}

function battleTableSection(value: string | null): BattleTableSection {
  // The war room is the Battle Table's front door, so an unrecognised (or
  // absent) `battle` parameter lands there rather than on a planning form.
  // Every existing deep link — ?battle=capacity, ?battle=systems and the rest —
  // still opens its own drill-in section.
  return value && ["warroom", "overview", "intelligence", "strategy", "projections", "objectives", "capacity", "plans", "capital", "reviews", "systems"].includes(value)
    ? value as BattleTableSection
    : "warroom";
}

function radarTargetFromSearchParams(searchParams: Pick<URLSearchParams, "get">): Omit<RadarInspectorTarget, "version"> {
  const tab = radarInspectionTab(searchParams.get("view"));
  const domain = radarDomain(searchParams.get("domain"));
  const status = radarStatus(searchParams.get("status"));
  const scope = radarScope(searchParams.get("scope"));
  const lens = radarLens(searchParams.get("lens"));
  return {
    tab,
    query: cleanRadarParam(searchParams.get("query")),
    domain,
    status,
    scope,
    lens,
    sourceId: cleanRadarParam(searchParams.get("source")),
    datasetId: cleanRadarParam(searchParams.get("dataset")),
  };
}

function radarInspectionTab(value: string | null): RadarInspectionTab {
  return value && ["kpis", "checks", "evidence", "records", "sources", "incidents", "raw"].includes(value) ? value as RadarInspectionTab : "records";
}

function radarDomain(value: string | null): AdvisorDomain | "all" {
  return value && ["company", "sales", "inbox", "clients", "finance", "delivery", "marketing", "operations", "compliance", "development", "team", "systems"].includes(value) ? value as AdvisorDomain : "all";
}

function radarStatus(value: string | null): RadarInspectorTarget["status"] {
  return value && ["all", "attention", "applicable", "assured", "firing", "live", "pass", "critical", "warning", "watch", "blind", "learning", "inactive"].includes(value) ? value as RadarInspectorTarget["status"] : "all";
}

function radarScope(value: string | null): RadarInspectorTarget["scope"] {
  return value && ["all", "sentinel", "kpi", "source", "property", "synthetic", "history", "watchdog"].includes(value) ? value as RadarInspectorTarget["scope"] : "all";
}

function radarLens(value: string | null): RadarInspectorTarget["lens"] {
  return value && ["all", "connection", "freshness", "threshold", "trend", "anomaly", "integrity", "continuity", "baseline", "confidence", "forecast", "volatility", "resilience"].includes(value) ? value as RadarInspectorTarget["lens"] : "all";
}

function cleanRadarParam(value: string | null): string {
  return typeof value === "string" ? value.trim().slice(0, 240) : "";
}

function calendarMonth(value: number): string {
  return formatUkDate(value, { month: "short" }, "Review");
}

function calendarWeekday(value: number): string {
  return formatUkDate(value, { weekday: "long" });
}

function formatTimeRange(session: DashboardWorkSession): string {
  const start = formatUkDate(session.startedAt, { hour: "2-digit", minute: "2-digit" });
  return session.endedAt ? `${start}–${formatUkDate(session.endedAt, { hour: "2-digit", minute: "2-digit" })}` : `${start}–now`;
}

function weekDates(weekStart: string): string[] {
  const start = new Date(`${weekStart}T12:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return localIsoDate(date);
  });
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function offsetIsoDate(value: string, offset: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return localIsoDate(date);
}

function validIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

function weekday(value: string): string {
  return formatUkDate(`${value}T12:00:00`, { weekday: "short" }).slice(0, 3);
}

function weekdayLong(value: string): string {
  return formatUkDate(`${value}T12:00:00`, { weekday: "long" });
}

function shortDate(value: string): string {
  return formatUkDate(`${value}T12:00:00`, { day: "numeric", month: "short" });
}

function money(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value || 0);
}
