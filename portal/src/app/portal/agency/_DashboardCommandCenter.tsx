"use client";

import Link from "next/link";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  ArrowUpRight,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  NotebookPen,
  Play,
  Plus,
  Save,
  Square,
  Target,
  TimerReset,
  Trash2,
  TrendingUp,
} from "lucide-react";

import type { AdvisorActionSuggestion } from "@/lib/advisorActions";
import type { AgencyTask, AgencyTaskPriority, DashboardDayPlan, DashboardWeekPlan, DashboardWorkSession } from "@/server/types";

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
  advisorConfigured,
  counts,
}: {
  planning: DashboardPlanningPayload;
  tasks: AgencyTask[];
  signals: DashboardSignal[];
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
    const businessSignals: StrictItem[] = signals.filter(signal => !taskTitles.has(signal.title.trim().toLowerCase()));
    return [...taskSignals, ...businessSignals]
      .sort((a, b) => {
        const activeRank = (a.status === "in-progress" ? -1 : 0) - (b.status === "in-progress" ? -1 : 0);
        return activeRank || priorityRank(a.priority) - priorityRank(b.priority) || overdueRank(a, now) - overdueRank(b, now) || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER);
      })
      .slice(0, 8);
  }, [now, openTasks, signals]);

  const selectedSessions = sessions.filter(session => session.date === selectedDate);
  const loggedHours = selectedSessions.reduce((total, session) => total + sessionHours(session, now), 0);
  const loggedWeekHours = sessions.reduce((total, session) => total + sessionHours(session, now), 0);
  const dates = weekDates(planning.weekStart);
  const effectivePlans = dates.map(date => date === selectedDate
    ? { date, ...plan }
    : { date, ...draftFromPlan(weekPlans.find(item => item.date === date) ?? null) });
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
    <section className="space-y-4" aria-label="Daily command centre">
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
    </section>
  );
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
