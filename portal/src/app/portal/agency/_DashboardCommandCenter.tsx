"use client";

import Link from "next/link";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Crosshair,
  Database,
  EyeOff,
  Gauge,
  History,
  ListTodo,
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
} from "lucide-react";

import type { AdvisorActionSuggestion } from "@/lib/advisorActions";
import type { AdvisorCoverageSource, AdvisorDomain, BusinessIssueRadar, BusinessRadarCheck, BusinessRadarIssue, RadarCheckScope, RadarCheckStatus } from "@/lib/businessRadar";
import type { AgencyTask, AgencyTaskPriority, DashboardDayPlan, DashboardWeekPlan, DashboardWorkSession } from "@/server/types";
import { RadarPolicyPanel } from "./_RadarPolicyPanel";

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

export function DashboardCommandCenter({
  planning,
  tasks,
  signals,
  businessRadar,
  advisorConfigured,
  counts,
}: {
  planning: DashboardPlanningPayload;
  tasks: AgencyTask[];
  signals: DashboardSignal[];
  businessRadar: BusinessIssueRadar;
  advisorConfigured: boolean;
  counts: { activeClients: number; leads: number; delivery: number; products: number };
}) {
  const actualToday = planning.today;
  const [selectedDate, setSelectedDate] = useState(actualToday);
  const [plan, setPlan] = useState<DayDraft>(draftFromPlan(planning.dayPlan));
  const [weekPlan, setWeekPlan] = useState({
    outcome: planning.weekPlan?.outcome ?? "",
    reviewNotes: planning.weekPlan?.reviewNotes ?? "",
  });
  const [weekPlans, setWeekPlans] = useState(planning.weekPlans);
  const [sessions, setSessions] = useState(planning.sessions);
  const [activeSession, setActiveSession] = useState(planning.activeSession);
  const [taskRows, setTaskRows] = useState(tasks);
  const [dayDirty, setDayDirty] = useState(false);
  const [weekDirty, setWeekDirty] = useState(false);
  const [savingDay, setSavingDay] = useState(false);
  const [savingWeek, setSavingWeek] = useState(false);
  const [clockBusy, setClockBusy] = useState(false);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [advisorBusy, setAdvisorBusy] = useState(false);
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
  const [dashboardMode, setDashboardMode] = useState<"radar" | "day">(businessRadar.summary.critical ? "radar" : "day");
  const [radarSnapshot, setRadarSnapshot] = useState(businessRadar);

  useEffect(() => {
    if (!activeSession) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [activeSession]);

  const openTasks = taskRows.filter(task => task.status !== "done");
  const strictList = useMemo<StrictItem[]>(() => {
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
    return [...taskSignals, ...businessSignals]
      .sort((a, b) => {
        const activeRank = (a.status === "in-progress" ? -1 : 0) - (b.status === "in-progress" ? -1 : 0);
        return activeRank || priorityRank(a.priority) - priorityRank(b.priority) || overdueRank(a, now) - overdueRank(b, now) || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER);
      })
      .slice(0, 8);
  }, [now, openTasks, radarSnapshot.incidents, signals]);

  const selectedSessions = sessions.filter(session => session.date === selectedDate);
  const loggedHours = selectedSessions.reduce((total, session) => total + sessionHours(session, now), 0);
  const loggedWeekHours = sessions.reduce((total, session) => total + sessionHours(session, now), 0);
  const dates = weekDates(planning.weekStart);
  const effectivePlans = dates.map(date => date === selectedDate
    ? { date, ...plan }
    : { date, ...draftFromPlan(weekPlans.find(item => item.date === date) ?? null) });
  const upcomingCalendar = [
    ...openTasks.flatMap(task => {
      const at = task.dueAt ?? task.startAt;
      return at ? [{
        id: `task:${task.id}`,
        title: task.title,
        kind: task.status === "in-progress" ? "In progress" : "Task",
        at,
        href: "/portal/agency/actions",
        priority: task.priority === "urgent" ? "urgent" as const : task.priority === "high" ? "high" as const : "normal" as const,
      }] : [];
    }),
    ...effectivePlans.filter(item => item.focus.trim()).map(item => ({
      id: `plan:${item.date}`,
      title: item.focus,
      kind: "Day outcome",
      at: new Date(`${item.date}T12:00:00`).getTime(),
      href: "/portal/agency",
      priority: "normal" as const,
    })),
  ]
    .filter(item => item.at >= new Date(`${actualToday}T00:00:00`).getTime())
    .sort((a, b) => a.at - b.at || priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 6);
  const plannedWeekHours = effectivePlans.reduce((total, item) => total + item.plannedHours, 0);
  const targetWeekRevenue = effectivePlans.reduce((total, item) => total + item.targetRevenuePounds, 0);
  const projectedCompletion = plan.plannedHours ? Math.min(100, Math.round((loggedHours / plan.plannedHours) * 100)) : 0;
  const workedDays = new Set(sessions.filter(session => session.endedAt).map(session => session.date)).size;
  const projectedWeekHours = workedDays ? (loggedWeekHours / workedDays) * 5 : loggedWeekHours;
  const weekPace = plannedWeekHours ? Math.round((loggedWeekHours / plannedWeekHours) * 100) : 0;
  const completedThisWeek = taskRows.filter(task => task.completedAt && task.completedAt >= new Date(`${planning.weekStart}T00:00:00`).getTime()).length;
  const isToday = selectedDate === actualToday;
  const isFuture = selectedDate > actualToday;

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
    if (date === selectedDate || savingDay) return;
    let availablePlans = weekPlans;
    if (dayDirty) {
      const saved = await saveDay(false);
      if (!saved) return;
      availablePlans = saved.weekPlans;
    }
    setSelectedDate(date);
    setPlan(draftFromPlan(availablePlans.find(item => item.date === date) ?? null));
    setDayDirty(false);
    setStatusMessage("");
    setOperationError("");
  }

  async function saveWeek() {
    setSavingWeek(true);
    setOperationError("");
    try {
      const next = await dashboardRequest({
        action: "save-week",
        date: selectedDate,
        weekStart: planning.weekStart,
        weekOutcome: weekPlan.outcome,
        weekReviewNotes: weekPlan.reviewNotes,
      });
      applyPlanning(next);
      setWeekPlan({ outcome: next.weekPlan?.outcome ?? "", reviewNotes: next.weekPlan?.reviewNotes ?? "" });
      setWeekDirty(false);
      setStatusMessage("Week direction saved.");
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "The week plan could not save.");
    } finally {
      setSavingWeek(false);
    }
  }

  async function clock(action: "clock-in" | "clock-out") {
    if (!isToday) return;
    setClockBusy(true);
    setOperationError("");
    try {
      if (action === "clock-in" && dayDirty) await saveDay(false);
      const next = await dashboardRequest({
        action,
        date: actualToday,
        focus: plan.focus,
        notes: action === "clock-out" ? plan.doneNotes : undefined,
      });
      applyPlanning(next);
      setStatusMessage(action === "clock-in" ? "Clocked in." : "Clocked out and hours recorded.");
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "The time clock could not update.");
    } finally {
      setClockBusy(false);
    }
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

  async function createTask(input: { title: string; notes?: string; priority: AgencyTaskPriority; dueAt?: number }, sourceId: string) {
    setTaskBusyId(sourceId);
    setOperationError("");
    try {
      const response = await fetch("/api/portal/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; task?: AgencyTask } | null;
      if (!response.ok || !result?.ok || !result.task) throw new Error(result?.error || "The task could not be created.");
      setTaskRows(current => [...current, result.task!]);
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
    }, item.id);
  }

  async function addRadarTask(issue: BusinessRadarIssue) {
    await createTask({
      title: issue.title,
      notes: `${issue.detail}\n\nRadar evidence:\n${issue.evidence.map(item => `- ${item}`).join("\n")}`,
      priority: issue.severity === "critical" ? "urgent" : "high",
    }, `radar:${issue.id}`);
  }

  async function addQuickTask() {
    const title = quickTask.trim();
    if (!title) return;
    await createTask({ title, priority: quickPriority, dueAt: new Date(`${selectedDate}T17:00:00`).getTime() }, "quick");
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
    } catch (error) {
      setAdvisorError(error instanceof Error ? error.message : "Aqua Advisor could not create a briefing.");
    } finally {
      setAdvisorBusy(false);
    }
  }

  async function addAdvisorTask(item: AdvisorActionSuggestion) {
    await createTask({
      title: item.title,
      notes: `${item.detail}\n\nEvidence reviewed by Aqua Advisor: ${item.evidence}`,
      priority: item.priority,
      dueAt: item.dueAt,
    }, item.id);
    setAdvisorSuggestions(current => current.filter(suggestion => suggestion.id !== item.id));
  }

  function applyPlanning(next: DashboardPlanningPayload) {
    setSessions(next.sessions);
    setActiveSession(next.activeSession);
    setWeekPlans(next.weekPlans);
    setWeekPlan({ outcome: next.weekPlan?.outcome ?? "", reviewNotes: next.weekPlan?.reviewNotes ?? "" });
    setNow(Date.now());
  }

  return (
    <section className="space-y-4" aria-label="Command center">
      <div className="overflow-hidden rounded-lg border border-[#2d4c44] bg-[#10241f] text-white shadow-sm" aria-label="Command deck">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-emerald-200/35 bg-white/[0.06]" aria-hidden="true">
              <span className="absolute inset-x-1/2 top-0 h-full w-px bg-emerald-100/15" />
              <span className="absolute inset-y-1/2 left-0 h-px w-full bg-emerald-100/15" />
              <span className="absolute inset-2 rounded-full border border-emerald-100/15" />
              <Radar className="relative text-emerald-200" size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200/70">Command deck</p>
              <h2 className="mt-0.5 text-base font-semibold text-white sm:text-lg">All stations on one bridge</h2>
              <p className="mt-1 text-xs leading-5 text-white/55">Radar findings automatically join your strict priority queue.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-100/[0.07] px-3 py-1.5 text-xs font-semibold text-emerald-100">
            <RadioTower size={14} /> Radar online
          </span>
        </div>

        <nav className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4" aria-label="Command center stations">
          <button type="button" aria-pressed={dashboardMode === "radar"} onClick={() => setDashboardMode("radar")} className={`group flex min-h-[72px] items-center gap-3 border-b border-r border-white/10 px-4 text-left transition sm:border-b-0 ${dashboardMode === "radar" ? "bg-white text-[#10241f]" : "text-white/72 hover:bg-white/[0.06] hover:text-white"}`}>
            <Radar size={18} className={dashboardMode === "radar" ? "text-emerald-700" : "text-emerald-200"} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Active radar</span>
              <span className={`mt-0.5 block text-[11px] ${dashboardMode === "radar" ? "text-black/48" : "text-white/42"}`}>{radarSnapshot.summary.critical + radarSnapshot.summary.warning} alerts on watch</span>
            </span>
          </button>
          <button type="button" aria-pressed={dashboardMode === "day"} onClick={() => setDashboardMode("day")} className={`group flex min-h-[72px] items-center gap-3 border-b border-white/10 px-4 text-left transition sm:border-b-0 sm:border-r ${dashboardMode === "day" ? "bg-white text-[#10241f]" : "text-white/72 hover:bg-white/[0.06] hover:text-white"}`}>
            <ListTodo size={18} className={dashboardMode === "day" ? "text-emerald-700" : "text-emerald-200"} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Day command</span>
              <span className={`mt-0.5 block text-[11px] ${dashboardMode === "day" ? "text-black/48" : "text-white/42"}`}>{strictList.length} priorities queued</span>
            </span>
          </button>
          <Link href="/portal/agency/actions" className="flex min-h-[72px] items-center gap-3 border-r border-white/10 px-4 text-left text-white/72 transition hover:bg-white/[0.06] hover:text-white">
            <ClipboardCheck size={18} className="text-amber-200" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Actions</span>
              <span className="mt-0.5 block text-[11px] text-white/42">{openTasks.length} open across the business</span>
            </span>
          </Link>
          <Link href="/portal/agency/company" className="flex min-h-[72px] items-center gap-3 px-4 text-left text-white/72 transition hover:bg-white/[0.06] hover:text-white">
            <Building2 size={18} className="text-sky-200" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Company</span>
              <span className="mt-0.5 block text-[11px] text-white/42">{counts.activeClients} clients · {counts.products} offers</span>
            </span>
          </Link>
        </nav>
      </div>

      {dashboardMode === "radar" ? (
        <BusinessRadarDashboard
          radar={radarSnapshot}
          onRadarChange={setRadarSnapshot}
          onCreateTask={addRadarTask}
          taskBusyId={taskBusyId}
          advisorConfigured={advisorConfigured}
        />
      ) : (
      <>
      <div className="mm-surface-card overflow-hidden rounded-lg border border-black/10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 px-4 py-4 sm:px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Daily command</p>
            <h2 className="mt-1 text-xl font-semibold text-black/85">{formatLongDate(selectedDate)}</h2>
            <p className="mt-1 text-sm text-black/48">{isToday ? "Today" : isFuture ? "Planned day" : "Daily record"} · {strictList.length} priorities queued · {completedThisWeek} completed this week</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void clock(activeSession ? "clock-out" : "clock-in")} disabled={clockBusy || !isToday} title={isToday ? undefined : "Clocking is available on today"} className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35 ${activeSession ? "bg-red-700 hover:bg-red-800" : "bg-black hover:bg-black/85"}`}>
              {clockBusy ? <LoaderCircle size={16} className="animate-spin" /> : activeSession ? <Square size={15} /> : <Play size={15} />}
              {activeSession ? `Clock out · ${formatElapsed(now - activeSession.startedAt)}` : "Clock in"}
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
          <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-sm">
            <NumberField label="Planned hours" value={plan.plannedHours} step={0.25} max={24} onChange={value => updatePlan({ plannedHours: value })} />
            <NumberField label="Revenue target GBP" value={plan.targetRevenuePounds} step={50} max={1_000_000} onChange={value => updatePlan({ targetRevenuePounds: value })} />
          </div>
        </div>
      </div>

      {(statusMessage || operationError) ? (
        <div role={operationError ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${operationError ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {operationError || statusMessage}
        </div>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <div className="grid gap-4">
          <section className="mm-surface-card overflow-hidden rounded-lg border border-black/10" aria-labelledby="strict-work-heading">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">Do in this order</p>
                <h3 id="strict-work-heading" className="mt-1 text-lg font-semibold text-black/85">Strict work queue</h3>
              </div>
              <Link href="/portal/agency/actions" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">All actions <ArrowUpRight size={13} /></Link>
            </div>
            <form onSubmit={event => { event.preventDefault(); void addQuickTask(); }} className="grid gap-2 border-b border-black/10 bg-black/[0.018] p-3 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:px-5">
              <input value={quickTask} onChange={event => setQuickTask(event.target.value)} placeholder="Capture the next concrete action" className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-brand" />
              <select aria-label="New task priority" value={quickPriority} onChange={event => setQuickPriority(event.target.value as AgencyTaskPriority)} className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm">
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <button disabled={!quickTask.trim() || taskBusyId === "quick"} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white disabled:opacity-40">
                {taskBusyId === "quick" ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />} Add
              </button>
            </form>
            <ol className="divide-y divide-black/[0.07]">
              {strictList.map((item, index) => (
                <li key={item.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-start sm:px-5">
                  <span className={`grid size-8 place-items-center rounded-full text-xs font-semibold ${item.priority === "urgent" ? "bg-red-700 text-white" : item.priority === "high" ? "bg-amber-100 text-amber-800" : "bg-black/[0.05] text-black/55"}`}>{index + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-black/82">{item.title}</p>
                      <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-black/45">{item.kind}</span>
                      {item.dueAt && item.dueAt < now ? <span className="text-[10px] font-semibold uppercase text-red-700">Overdue</span> : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-black/48">{item.detail}</p>
                  </div>
                  <div className="flex gap-1 sm:justify-end">
                    {item.taskId ? (
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
              {!strictList.length ? <li className="px-5 py-10 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={24} /><p className="mt-2 text-sm font-semibold text-black/70">Queue clear</p><p className="mt-1 text-xs text-black/42">Capture the next growth or delivery move above.</p></li> : null}
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
        </div>

        <div className="grid gap-4">
          <section className="mm-surface-card overflow-hidden rounded-lg border border-black/10" aria-labelledby="dashboard-calendar-heading">
            <div className="flex items-start justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <span className="mm-area-icon grid size-10 shrink-0 place-items-center rounded-md"><CalendarDays size={18} /></span>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Schedule</p><h3 id="dashboard-calendar-heading" className="mt-1 text-lg font-semibold text-black/85">Coming up</h3></div>
              </div>
              <Link href="/portal/agency/calendar" className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black/10 bg-white px-2.5 text-xs font-semibold text-black/58 hover:bg-black/[0.03]">Calendar <ArrowUpRight size={13} /></Link>
            </div>
            <div className="divide-y divide-black/[0.07]">
              {upcomingCalendar.map(item => (
                <Link key={item.id} href={item.href} className="mm-interactive-row group grid grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5">
                  <time dateTime={new Date(item.at).toISOString()} className="rounded-md bg-black/[0.035] px-2 py-1.5 text-center">
                    <span className="block text-[9px] font-semibold uppercase text-black/38">{calendarMonth(item.at)}</span>
                    <strong className="mt-0.5 block text-sm tabular-nums text-black/75">{calendarDay(item.at)}</strong>
                  </time>
                  <span className="min-w-0"><strong className="block truncate text-sm font-semibold text-black/76">{item.title}</strong><span className="mt-0.5 block text-[11px] text-black/42">{calendarWeekday(item.at)} · {item.kind}</span></span>
                  <ArrowUpRight size={14} className="text-black/25 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black/55" />
                </Link>
              ))}
              {!upcomingCalendar.length ? <div className="px-5 py-8 text-center"><CalendarDays className="mx-auto text-black/18" size={22} /><p className="mt-2 text-sm font-semibold text-black/58">Nothing dated yet</p><p className="mt-1 text-xs leading-5 text-black/40">Add dates to tasks or plan a daily outcome.</p></div> : null}
            </div>
          </section>

          <section className="mm-surface-card overflow-hidden rounded-lg border border-black/10" aria-labelledby="timesheet-heading">
            <div className="flex items-center gap-3 border-b border-black/10 px-4 py-4 sm:px-5"><span className="mm-area-icon grid size-10 place-items-center rounded-md"><Clock3 size={18} /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Employee record</p><h3 id="timesheet-heading" className="mt-1 text-lg font-semibold text-black/85">Timesheet · {formatHours(loggedHours)}h</h3></div></div>
            {activeSession && isToday ? <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:px-5"><p className="font-semibold">Working · {formatElapsed(now - activeSession.startedAt)}</p><p className="mt-1 text-xs text-emerald-800/70">{activeSession.focus || plan.focus || "General work"}</p></div> : null}
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
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-black/75">{session.focus || "General work"}</p><p className="mt-1 text-xs text-black/42">{formatTimeRange(session)} · {formatHours(sessionHours(session, now))}h</p>{session.notes ? <p className="mt-1 text-xs leading-5 text-black/48">{session.notes}</p> : null}</div>
                  {session.endedAt ? <button type="button" onClick={() => void removeSession(session.id)} disabled={sessionBusyId === session.id} title="Remove time entry" aria-label={`Remove ${session.focus || "time"} entry`} className="grid size-8 place-items-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700">{sessionBusyId === session.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button> : null}
                </div>
              ))}
              {!selectedSessions.length ? <p className="px-5 py-8 text-center text-sm text-black/40">No hours logged for this day.</p> : null}
            </div>
          </section>

          <section className="mm-surface-card rounded-lg border border-black/10 p-4 sm:p-5" aria-labelledby="advisor-briefing-heading">
            <div className="flex items-start gap-3"><span className="mm-area-icon grid size-10 shrink-0 place-items-center rounded-md"><Bot size={18} /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Aqua Advisor</p><h3 id="advisor-briefing-heading" className="mt-1 text-lg font-semibold text-black/85">Executive briefing</h3><p className="mt-1 text-sm text-black/48">{counts.activeClients} clients · {counts.leads} leads · {counts.delivery} delivery items · {counts.products} products</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void requestAdvisorBriefing()} disabled={advisorBusy || !advisorConfigured} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/35">{advisorBusy ? <LoaderCircle size={15} className="animate-spin" /> : <Bot size={15} />}{advisorConfigured ? "Generate brief" : "Setup required"}</button>
              <button type="button" onClick={() => window.dispatchEvent(new Event("aqua-advisor:open"))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/68 hover:bg-black/[0.03]">Open Advisor <ArrowUpRight size={14} /></button>
            </div>
            {reviewedAt ? <p className="mt-2 text-xs text-black/38">Reviewed {formatDateTime(reviewedAt)}</p> : null}
            {advisorError ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{advisorError}</p> : null}
            <div className="mt-3 divide-y divide-black/[0.07] border-y border-black/[0.07]">
              {advisorSuggestions.slice(0, 4).map(item => <div key={item.id} className="py-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-black/78">{item.title}</p><p className="mt-1 text-xs leading-5 text-black/48">{item.detail}</p></div><button type="button" onClick={() => void addAdvisorTask(item)} disabled={taskBusyId === item.id} title="Add to strict queue" aria-label={`Add ${item.title} to strict queue`} className="grid size-8 shrink-0 place-items-center rounded-md border border-black/10 bg-white text-black/55">{taskBusyId === item.id ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}</button></div></div>)}
              {!advisorSuggestions.length ? <p className="py-4 text-xs leading-5 text-black/42">{advisorConfigured ? "Generate a fresh business review when priorities are unclear." : "Connect OpenAI from Company connections, then request a grounded daily brief."}</p> : null}
            </div>
          </section>
        </div>
      </div>

      <section className="mm-surface-card overflow-hidden rounded-lg border border-black/10" aria-labelledby="week-plan-heading">
        <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3"><span className="mm-area-icon grid size-10 shrink-0 place-items-center rounded-md"><CalendarDays size={18} /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Week command</p><h3 id="week-plan-heading" className="mt-1 text-lg font-semibold text-black/85">Week of {shortDate(planning.weekStart)}</h3></div></div>
              <button type="button" onClick={() => void saveWeek()} disabled={savingWeek || !weekDirty} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/68 disabled:opacity-40">{savingWeek ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}Save week</button>
            </div>
            <label className="mt-4 grid gap-1.5 text-sm font-medium text-black/70">Weekly outcome<input value={weekPlan.outcome} onChange={event => { setWeekPlan(current => ({ ...current, outcome: event.target.value })); setWeekDirty(true); }} placeholder="The result this week must produce" className="min-h-11 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold outline-none focus:border-brand" /></label>
            <label className="mt-3 grid gap-1.5 text-sm font-medium text-black/70">Weekly review<textarea value={weekPlan.reviewNotes} onChange={event => { setWeekPlan(current => ({ ...current, reviewNotes: event.target.value })); setWeekDirty(true); }} rows={3} placeholder="Wins, misses, lessons, and what changes next week" className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-brand" /></label>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-black/10 bg-black/10">
            <WeekMetric label="Planned" value={`${formatHours(plannedWeekHours)}h`} />
            <WeekMetric label="Logged" value={`${formatHours(loggedWeekHours)}h`} />
            <WeekMetric label="Current pace" value={`${weekPace}%`} />
            <WeekMetric label="Projected" value={`${formatHours(projectedWeekHours)}h`} />
            <WeekMetric label="Revenue target" value={money(targetWeekRevenue)} />
            <WeekMetric label="Capacity" value={plannedWeekHours > 40 ? "Over 40h" : `${formatHours(Math.max(0, 40 - plannedWeekHours))}h free`} />
          </div>
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
      </section>
      </>
      )}
    </section>
  );
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
  radar,
  onRadarChange,
  onCreateTask,
  taskBusyId,
  advisorConfigured,
}: {
  radar: BusinessIssueRadar;
  onRadarChange: (radar: BusinessIssueRadar) => void;
  onCreateTask: (issue: BusinessRadarIssue) => Promise<void>;
  taskBusyId: string | null;
  advisorConfigured: boolean;
}) {
  const [activeDomain, setActiveDomain] = useState<AdvisorDomain | "all">("all");
  const [feedMode, setFeedMode] = useState<"signals" | "checks">("signals");
  const [checkFilter, setCheckFilter] = useState<"all" | "attention" | "blind" | "learning" | "inactive" | "pass">("attention");
  const [checkScope, setCheckScope] = useState<"all" | RadarCheckScope>("all");
  const [checkQuery, setCheckQuery] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState("");
  const [policyOpen, setPolicyOpen] = useState(false);
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
      const response = await fetch("/api/portal/advisor/radar", { cache: "no-store" });
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

  return (
    <div className="grid gap-4" data-testid="active-business-radar">
      <section className="overflow-hidden rounded-lg border border-[#29352f] bg-[#111513] text-white shadow-[0_18px_44px_rgba(0,0,0,0.14)]" aria-labelledby="business-radar-heading">
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
              <h2 id="business-radar-heading" className="mt-1 text-xl font-semibold text-white sm:text-2xl">{attentionCount ? `${attentionCount} incident${attentionCount === 1 ? "" : "s"} need command attention` : radar.adaptive.confidencePercent < 70 ? "No urgent incidents; evidence is still calibrating" : "No urgent business incidents detected"}</h2>
              <p className="mt-1 text-xs text-white/50">{radar.summary.applicableChecks.toLocaleString()} applicable checks · {radar.adaptive.learningChecks.toLocaleString()} learning · {radar.adaptive.inactiveChecks.toLocaleString()} inactive · {radar.adaptive.alwaysOnChecks.toLocaleString()} protected · {radar.summary.correlatedRisks} compound risks · last sweep {formatRadarAge(radar.generatedAt)} · automatic rescan every minute</p>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button type="button" onClick={() => setPolicyOpen(current => !current)} aria-expanded={policyOpen} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm font-semibold text-white hover:bg-white/10">
              <Settings2 size={15} /> Policy
            </button>
            <button type="button" onClick={() => void refreshRadar()} disabled={scanBusy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50">
              <RefreshCw size={15} className={scanBusy ? "animate-spin" : ""} /> {scanBusy ? "Scanning" : "Scan now"}
            </button>
            <button type="button" onClick={() => window.dispatchEvent(new Event("aqua-advisor:open"))} className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-[#111513] hover:bg-white/90 sm:col-auto">
              <Bot size={15} /> {advisorConfigured ? "Ask Advisor" : "Open Advisor"}
            </button>
          </div>
        </header>

        {scanError ? <div role="alert" className="border-b border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100 sm:px-6">{scanError}</div> : null}

        <div className="grid grid-cols-2 border-b border-white/10 sm:grid-cols-4 xl:grid-cols-8">
          <RadarMetric icon={<Gauge size={14} />} label="Health" value={`${radar.adaptive.healthScore}/100`} tone={radar.adaptive.healthScore < 40 ? "critical" : radar.adaptive.healthScore < 70 ? "warning" : "healthy"} />
          <RadarMetric icon={<ShieldCheck size={14} />} label="Confidence" value={`${radar.adaptive.confidencePercent}%`} tone={radar.adaptive.confidencePercent < 40 ? "critical" : radar.adaptive.confidencePercent < 70 ? "warning" : "healthy"} />
          <RadarMetric icon={<Target size={14} />} label="Setup" value={`${radar.adaptive.readinessPercent}%`} tone={radar.adaptive.readinessPercent < 40 ? "critical" : radar.adaptive.readinessPercent < 70 ? "warning" : "healthy"} />
          <RadarMetric icon={<AlertTriangle size={14} />} label="Critical" value={radar.summary.critical} tone={radar.summary.critical ? "critical" : "healthy"} />
          <RadarMetric icon={<Activity size={14} />} label="Warnings" value={radar.summary.warning} tone={radar.summary.warning ? "warning" : "healthy"} />
          <RadarMetric icon={<ScanSearch size={14} />} label="Checks live" value={radar.adaptive.liveChecks.toLocaleString()} tone="healthy" />
          <RadarMetric icon={<History size={14} />} label="Learning" value={radar.adaptive.learningChecks.toLocaleString()} tone="watch" />
          <RadarMetric icon={<EyeOff size={14} />} label="Blind" value={radar.summary.blindChecks.toLocaleString()} tone={radar.summary.blindChecks ? "warning" : "healthy"} />
        </div>

        <div className="grid border-b border-white/10 md:grid-cols-2 xl:grid-cols-4">
          {radar.adaptive.conclusions.map(conclusion => <Link key={conclusion.id} href={conclusion.href} className="border-white/10 px-4 py-3 hover:bg-white/[0.04] md:border-r sm:px-5"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${conclusion.severity === "critical" ? "bg-red-400" : conclusion.severity === "warning" ? "bg-amber-300" : conclusion.severity === "watch" ? "bg-sky-300" : "bg-white/35"}`} /><span className="text-[10px] font-semibold uppercase text-white/40">{domainLabel(conclusion.domain)}</span></div><p className="mt-1.5 text-sm font-semibold text-white">{conclusion.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-white/42">{conclusion.detail}</p></Link>)}
        </div>

        <RadarMemoryTimeline memory={radar.memory} />
        <RadarEvidenceVault evidence={radar.evidence} />

        <div className="grid lg:grid-cols-[minmax(340px,.92fr)_minmax(0,1.08fr)]">
          <div className="border-b border-white/10 p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Live scope</p><h3 className="mt-1 text-base font-semibold text-white">{radar.summary.totalChecks.toLocaleString()}-point scanner</h3></div>
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
              <div className="absolute left-1/2 top-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-[#151b18] text-center shadow-[0_0_32px_rgba(52,211,153,.08)]">
                <div><strong className="block text-2xl tabular-nums text-white">{activeDomain === "all" ? radar.summary.totalChecks.toLocaleString() : radar.domains.find(item => item.domain === activeDomain)?.totalChecks ?? 0}</strong><span className="text-[9px] font-semibold uppercase tracking-wide text-white/42">{activeDomain === "all" ? "checks armed" : "domain checks"}</span></div>
              </div>
              {domainSummaries.map(item => (
                <button key={item.domain} type="button" onClick={() => setActiveDomain(current => current === item.domain ? "all" : item.domain)} title={`${domainLabel(item.domain)}: ${item.checks} checks, ${item.firing} firing, ${item.blind} blind, ${item.issues} signals`} className={`absolute z-10 flex min-h-7 max-w-[88px] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-semibold transition hover:scale-105 ${activeDomain === item.domain ? "border-white bg-white text-[#111513]" : radarNodeClass(item.status)}`} style={item.position}>
                  <span className="size-1.5 shrink-0 rounded-full bg-current" /><span className="truncate">{domainLabel(item.domain)}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              <RadarDetail label="Oldest lead wait" value={radar.speedToLead.oldestWaitingMs === null ? "Clear" : formatRadarDuration(radar.speedToLead.oldestWaitingMs)} />
              <RadarDetail label="Outside target" value={String(radar.speedToLead.breachedCount)} />
              <RadarDetail label="Awaiting reply" value={String(radar.speedToLead.awaitingResponseCount)} />
              <RadarDetail label="Within target" value={radar.speedToLead.withinTargetPercent === null ? "No sample" : `${radar.speedToLead.withinTargetPercent}%`} />
              <RadarDetail label="Check coverage" value={`${coveragePercent}%`} />
              <RadarDetail label="Learning" value={radar.summary.learningChecks.toLocaleString()} />
              <RadarDetail label="Inactive by policy" value={radar.summary.inactiveChecks.toLocaleString()} />
              <RadarDetail label="Evidence assured" value={`${radar.summary.assurancePercent}%`} />
              <RadarDetail label="Compound risks" value={radar.summary.correlatedRisks.toLocaleString()} />
              <RadarDetail label="Sentinel mesh" value={radar.summary.sentinelChecks.toLocaleString()} />
              <RadarDetail label="Properties watched" value={radar.summary.monitoredProperties.toLocaleString()} />
              <RadarDetail label="Active canaries" value={`${radar.summary.syntheticProperties.toLocaleString()} properties`} />
              <RadarDetail label="Failed probes" value={radar.summary.failedSyntheticProbes.toLocaleString()} />
              <RadarDetail label="Historical checks" value={radar.summary.historicalChecks.toLocaleString()} />
              <RadarDetail label="Baseline coverage" value={`${radar.summary.baselineCoveragePercent}%`} />
              <RadarDetail label="Evidence samples" value={radar.summary.evidenceSamples.toLocaleString()} />
              <RadarDetail label="Pattern breaks" value={radar.summary.historicalAnomalies.toLocaleString()} />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
              <div><p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Scanner ledger</p><h3 className="mt-1 text-base font-semibold text-white">{activeDomain === "all" ? "Whole business" : domainLabel(activeDomain)}</h3></div>
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
              {feedMode === "signals" ? visibleIssues.map(issue => (
                  <article key={issue.id} className="group grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${radarSeverityClass(issue.severity)}`}>{issue.severity}</span>
                        <span className="text-[10px] font-semibold uppercase text-white/35">{domainLabel(issue.domain)}</span>
                      </div>
                      <h4 className="mt-2 text-sm font-semibold leading-5 text-white">{issue.title}</h4>
                      <p className="mt-1 text-xs leading-5 text-white/48">{issue.detail}</p>
                      {issue.evidence[0] ? <p className="mt-2 text-[11px] leading-4 text-white/35">{issue.findingCount} grouped findings · {issue.evidence[0]}</p> : null}
                    </div>
                    <div className="flex items-start gap-1 sm:justify-end">
                      <button type="button" onClick={() => void onCreateTask(issue)} disabled={taskBusyId === `radar:${issue.id}`} title="Add to strict queue" aria-label={`Add ${issue.title} to strict queue`} className="grid size-9 place-items-center rounded-md border border-white/15 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50">
                        {taskBusyId === `radar:${issue.id}` ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={15} />}
                      </button>
                      <Link href={issue.href} title="Open evidence" aria-label={`Open evidence for ${issue.title}`} className="grid size-9 place-items-center rounded-md border border-white/15 text-white/60 hover:bg-white/10 hover:text-white"><ArrowUpRight size={14} /></Link>
                    </div>
                  </article>
                )) : displayedChecks.map(check => <RadarCheckRow key={check.id} check={check} />)}
              {feedMode === "signals" && !visibleIssues.length ? <div className="px-6 py-16 text-center"><ShieldCheck className="mx-auto text-emerald-300" size={26} /><p className="mt-3 text-sm font-semibold text-white">Domain clear</p><p className="mt-1 text-xs text-white/40">No current signals in this scope.</p></div> : null}
              {feedMode === "checks" && !displayedChecks.length ? <div className="px-6 py-16 text-center"><ScanSearch className="mx-auto text-emerald-300" size={26} /><p className="mt-3 text-sm font-semibold text-white">No matching checks</p><p className="mt-1 text-xs text-white/40">Change the domain, status, or search phrase.</p></div> : null}
              {feedMode === "checks" && matchingChecks.length > displayedChecks.length ? <div className="px-6 py-3 text-center text-[11px] text-white/35">Showing the first {displayedChecks.length} of {matchingChecks.length} matching checks. Select a domain to narrow the scanner.</div> : null}
            </div>
          </div>
        </div>
      </section>

      {policyOpen ? <RadarPolicyPanel key={radar.adaptive.policy.updatedAt} radar={radar} onSaved={onRadarChange} onClose={() => setPolicyOpen(false)} /> : null}

      <section className="mm-surface-card overflow-hidden rounded-lg border border-black/10" aria-labelledby="radar-coverage-heading">
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
          {radar.coverage.map((source, index) => <CoverageRow key={source.id} source={source} divided={index > 0} />)}
        </div>
      </section>
    </div>
  );
}

function RadarMetric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: "critical" | "warning" | "watch" | "healthy" }) {
  const toneClass = tone === "critical" ? "text-red-300" : tone === "warning" ? "text-amber-300" : tone === "watch" ? "text-sky-300" : "text-emerald-300";
  return <div className="border-r border-t border-white/10 px-4 py-3 first:border-t-0 sm:px-5 lg:border-t-0"><div className={`flex items-center gap-2 text-[10px] font-semibold uppercase ${toneClass}`}>{icon}<span>{label}</span></div><strong className="mt-1 block text-xl tabular-nums text-white">{value}</strong></div>;
}

function RadarDetail({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#181e1b] px-3 py-3"><p className="text-[9px] font-semibold uppercase text-white/35">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-white">{value}</p></div>;
}

function RadarMemoryTimeline({ memory }: { memory: BusinessIssueRadar["memory"] }) {
  const statusLabel = memory.status === "first-sweep" ? "Learning baseline" : memory.status === "delayed" ? "Sweep continuity delayed" : "Temporal continuity live";
  const statusClass = memory.status === "delayed" ? "text-amber-300" : "text-emerald-300";
  const points = memory.history.slice(-48);
  return <div className="grid gap-4 border-b border-white/10 bg-white/[0.025] px-4 py-4 sm:px-6 xl:grid-cols-[minmax(0,.72fr)_minmax(320px,1.28fr)]">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><History size={14} className={statusClass} /><p className={`text-[10px] font-semibold uppercase ${statusClass}`}>{statusLabel}</p></div>
        <p className="text-[10px] tabular-nums text-white/35">{memory.totalSweeps.toLocaleString()} recorded sweeps</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10">
        <RadarMemoryStat label="New" value={memory.newIssues} tone={memory.newIssues ? "warning" : "neutral"} />
        <RadarMemoryStat label="Worsening" value={memory.worseningIssues} tone={memory.worseningIssues ? "critical" : "neutral"} />
        <RadarMemoryStat label="Recovered" value={memory.recoveredIssues} tone={memory.recoveredIssues ? "positive" : "neutral"} />
        <RadarMemoryStat label="Recurring" value={memory.recurringIssues} tone={memory.recurringIssues ? "warning" : "neutral"} />
        <RadarMemoryStat label="Flapping" value={memory.flappingSources} tone={memory.flappingSources ? "critical" : "neutral"} />
        <RadarMemoryStat label="Oldest open" value={memory.oldestOpenIssueMs === undefined ? "New" : formatRadarDuration(memory.oldestOpenIssueMs)} tone={memory.longRunningIssues ? "warning" : "neutral"} />
      </div>
    </div>
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 pr-12 sm:pr-0"><p className="text-[10px] font-semibold uppercase text-white/35">Assurance memory</p><p className="text-right text-[10px] leading-4 tabular-nums text-white/35">{signedInteger(memory.assuranceDelta)} assurance · {signedInteger(memory.firingDelta)} alarms · {signedInteger(memory.blindDelta)} blind</p></div>
      <div className="mt-3 flex h-12 items-end gap-1" aria-label="Radar assurance history">
        {points.map((point, index) => <span key={`${point.at}:${index}`} className={`min-w-1 flex-1 rounded-sm ${point.blindChecks ? "bg-red-400" : point.criticalIssues ? "bg-amber-300" : "bg-emerald-300"}`} style={{ height: `${Math.max(8, point.assurancePercent)}%` }} title={`${new Date(point.at).toLocaleString("en-GB")}: ${point.assurancePercent}% assured, ${point.firingChecks} alarms, ${point.blindChecks} blind`} />)}
        {!points.length ? <span className="text-xs text-white/35">The first recorded sweep will establish this timeline.</span> : null}
      </div>
    </div>
  </div>;
}

function RadarMemoryStat({ label, value, tone }: { label: string; value: React.ReactNode; tone: "critical" | "warning" | "positive" | "neutral" }) {
  const valueClass = tone === "critical" ? "text-red-300" : tone === "warning" ? "text-amber-300" : tone === "positive" ? "text-emerald-300" : "text-white";
  return <div className="bg-[#151a17] px-3 py-2.5"><p className="text-[9px] font-semibold uppercase text-white/35">{label}</p><p className={`mt-1 text-sm font-semibold tabular-nums ${valueClass}`}>{value}</p></div>;
}

function RadarEvidenceVault({ evidence }: { evidence: BusinessIssueRadar["evidence"] }) {
  return <div className="grid gap-4 border-b border-white/10 bg-[#121714] px-4 py-4 sm:px-6 xl:grid-cols-[minmax(0,.78fr)_minmax(320px,1.22fr)]">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Database size={14} className="text-sky-300" /><p className="text-[10px] font-semibold uppercase text-sky-300">Durable evidence vault</p></div>
        <p className="text-[10px] tabular-nums text-white/35">{evidence.totalSamples.toLocaleString()} retained samples</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-4 xl:grid-cols-2">
        <RadarMemoryStat label="KPI streams" value={`${evidence.measurableSeries}/${evidence.totalSeries}`} tone="neutral" />
        <RadarMemoryStat label="Baselines ready" value={evidence.baselineReadySeries} tone={evidence.baselineCoveragePercent >= 90 ? "positive" : "warning"} />
        <RadarMemoryStat label="Pattern breaks" value={evidence.anomalousSeries} tone={evidence.anomalousSeries ? "critical" : "neutral"} />
        <RadarMemoryStat label="Recording gaps" value={evidence.recordingGaps} tone={evidence.recordingGaps ? "warning" : "positive"} />
      </div>
    </div>
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase text-white/35">Baseline coverage</p><p className="text-[10px] font-semibold tabular-nums text-white/60">{evidence.baselineCoveragePercent}%</p></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-sky-300 transition-[width] duration-500" style={{ width: `${Math.max(1, evidence.baselineCoveragePercent)}%` }} /></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {evidence.topMovements.slice(0, 4).map(movement => <div key={movement.id} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
          <div className="min-w-0"><p className="truncate text-[10px] font-semibold text-white/68">{movement.familyLabel}</p><p className="mt-0.5 text-[9px] uppercase text-white/30">{domainLabel(movement.domain)} · {movement.deviationScore.toFixed(1)} deviations</p></div>
          <span className={`shrink-0 text-xs font-semibold tabular-nums ${movement.adverse ? "text-amber-300" : "text-sky-300"}`}>{signedDecimal(movement.changePercent)}%</span>
        </div>)}
        {!evidence.topMovements.length ? <p className="sm:col-span-2 text-xs leading-5 text-white/35">Retained sweeps are building comparison baselines. Movement evidence appears here as each stream matures.</p> : null}
      </div>
    </div>
  </div>;
}

function RadarCheckRow({ check }: { check: BusinessRadarCheck }) {
  return <article className="grid gap-3 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-6">
    <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border ${radarCheckIconClass(check.status)}`} title={radarCheckStatusLabel(check.status)}>
          {check.status === "pass" ? <Check size={14} /> : check.status === "blind" ? <EyeOff size={14} /> : check.status === "watch" ? <Crosshair size={14} /> : check.status === "learning" ? <History size={14} /> : check.status === "inactive" ? <Square size={14} /> : <AlertTriangle size={14} />}
    </span>
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${radarCheckStatusClass(check.status)}`}>{radarCheckStatusLabel(check.status)}</span>
        <span className="text-[10px] font-semibold uppercase text-white/35">{domainLabel(check.domain)} · {check.lensLabel} · {check.scope}</span>
      </div>
      <h4 className="mt-2 text-sm font-semibold leading-5 text-white">{check.familyLabel}</h4>
      <p className="mt-1 text-xs leading-5 text-white/48">{check.detail}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/32"><span>Source {check.sourceId}</span>{check.evidence.slice(0, 2).map(item => <span key={item}>{item}</span>)}</div>
    </div>
    <Link href={check.href} title="Open check evidence" aria-label={`Open evidence for ${check.title}`} className="grid size-9 place-items-center rounded-md border border-white/15 text-white/60 hover:bg-white/10 hover:text-white"><ArrowUpRight size={14} /></Link>
  </article>;
}

function CoverageRow({ source, divided }: { source: AdvisorCoverageSource; divided: boolean }) {
  const healthy = source.status === "connected" || source.status === "empty";
  return <div className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-black/10 px-4 py-3.5 sm:px-5 ${divided ? "border-t md:border-t-0 md:border-l" : ""}`}>
    <span className={`mt-1.5 size-2 rounded-full ${healthy ? source.status === "empty" ? "bg-sky-500" : "bg-emerald-600" : "bg-red-600"}`} />
    <div className="min-w-0"><p className="truncate text-sm font-semibold text-black/75">{source.label}</p><p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-black/42">{source.detail}</p></div>
    <div className="text-right"><p className={`text-[9px] font-bold uppercase ${healthy ? "text-emerald-700" : "text-red-700"}`}>{coverageStatusLabel(source.status)}</p><p className="mt-1 text-[10px] tabular-nums text-black/35">{source.recordCount} records</p></div>
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
  const elapsed = Math.max(0, Date.now() - timestamp);
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

function overdueRank(item: StrictItem, now: number) {
  return item.dueAt && item.dueAt < now ? -1 : 0;
}

function sessionHours(session: DashboardWorkSession, now = Date.now()): number {
  return Math.max(0, (session.endedAt ?? now) - session.startedAt) / 3_600_000;
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
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function calendarDay(value: number): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit" }).format(new Date(value));
}

function calendarMonth(value: number): string {
  return new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(value));
}

function calendarWeekday(value: number): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(new Date(value));
}

function formatTimeRange(session: DashboardWorkSession): string {
  const format = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
  return session.endedAt ? `${format.format(session.startedAt)}–${format.format(session.endedAt)}` : `${format.format(session.startedAt)}–now`;
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

function weekday(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(`${value}T12:00:00`)).slice(0, 3);
}

function weekdayLong(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(new Date(`${value}T12:00:00`));
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function money(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value || 0);
}
