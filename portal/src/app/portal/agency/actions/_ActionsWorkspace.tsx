"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Bell, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, ExternalLink, List, LoaderCircle, Plus, Repeat2, Sparkles, Trash2, UserRound, X } from "lucide-react";
import type { AdvisorActionSuggestion } from "@/lib/advisorActions";
import type { AgencyTask, AgencyTaskPriority, AgencyTaskRecurrence, AgencyTaskStatus, SopDocument } from "@/server/types";

export type GeneratedAction = {
  id: string;
  title: string;
  detail: string;
  href: string;
  kind: string;
  dueAt?: number;
  priority: "normal" | "high" | "urgent";
};

export type TeamMember = { id: string; name: string; email: string };

type View = "list" | "calendar";

export function ActionsWorkspace({ initialTasks, generatedActions, advisorConfigured, team, sops }: { initialTasks: AgencyTask[]; generatedActions: GeneratedAction[]; advisorConfigured: boolean; team: TeamMember[]; sops: SopDocument[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [view, setView] = useState<View>("list");
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [advisorSuggestions, setAdvisorSuggestions] = useState<AdvisorActionSuggestion[]>([]);
  const [advisorBusy, setAdvisorBusy] = useState(false);
  const [advisorError, setAdvisorError] = useState("");
  const [advisorReviewedAt, setAdvisorReviewedAt] = useState<number | null>(null);
  const [addingSuggestionId, setAddingSuggestionId] = useState<string | null>(null);
  const openTasks = tasks.filter(task => task.status !== "done");
  const visibleTasks = showDone ? tasks : openTasks;
  const overdue = openTasks.filter(task => task.dueAt && task.dueAt < startOfDay(Date.now())).length;

  async function patchTask(id: string, patch: Partial<AgencyTask>) {
    const response = await fetch("/api/portal/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    const result = await response.json() as { ok: boolean; task?: AgencyTask; tasks?: AgencyTask[] };
    if (result.ok && result.task) {
      setTasks(result.tasks ?? (current => current.map(task => task.id === id ? result.task as AgencyTask : task)));
      router.refresh();
    }
  }

  async function deleteTask(id: string) {
    const response = await fetch(`/api/portal/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setTasks(current => current.filter(task => task.id !== id));
  }

  async function requestAdvisorReview() {
    setAdvisorBusy(true);
    setAdvisorError("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "suggest-actions" }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; suggestions?: AdvisorActionSuggestion[]; generatedAt?: number } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Aqua Advisor could not review the business right now.");
      setAdvisorSuggestions(result.suggestions ?? []);
      setAdvisorReviewedAt(result.generatedAt ?? Date.now());
    } catch (error) {
      setAdvisorError(error instanceof Error ? error.message : "Aqua Advisor could not review the business right now.");
    } finally {
      setAdvisorBusy(false);
    }
  }

  async function addAdvisorSuggestion(suggestion: AdvisorActionSuggestion) {
    setAddingSuggestionId(suggestion.id);
    setAdvisorError("");
    try {
      const response = await fetch("/api/portal/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: suggestion.title,
          notes: `${suggestion.detail}\n\nEvidence reviewed by Aqua Advisor: ${suggestion.evidence}`,
          priority: suggestion.priority,
          dueAt: suggestion.dueAt,
        }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; task?: AgencyTask } | null;
      if (!response.ok || !result?.ok || !result.task) throw new Error(result?.error || "The suggested task could not be added.");
      setTasks(current => [result.task as AgencyTask, ...current]);
      setAdvisorSuggestions(current => current.filter(item => item.id !== suggestion.id));
      router.refresh();
    } catch (error) {
      setAdvisorError(error instanceof Error ? error.message : "The suggested task could not be added.");
    } finally {
      setAddingSuggestionId(null);
    }
  }

  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Work</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-black/90">Actions</h1><p className="mt-2 text-sm text-black/50">Everything that needs to happen, who owns it, and when it is due.</p></div>
      <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white sm:w-auto"><Plus size={16} />Add task</button>
    </header>

    <AdvisorPanel
      configured={advisorConfigured}
      suggestions={advisorSuggestions}
      busy={advisorBusy}
      reviewedAt={advisorReviewedAt}
      error={advisorError}
      addingId={addingSuggestionId}
      onReview={requestAdvisorReview}
      onAdd={addAdvisorSuggestion}
      onDismiss={id => setAdvisorSuggestions(current => current.filter(item => item.id !== id))}
    />

    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-black/10 py-3">
      <div className="grid w-full grid-cols-3 gap-2 text-xs sm:flex sm:w-auto sm:gap-5 sm:text-sm"><span><strong className="text-black/85">{openTasks.length + generatedActions.length}</strong> open</span><span className={overdue ? "text-red-700" : "text-black/45"}><strong>{overdue}</strong> overdue</span><span className="text-black/45"><strong>{team.length}</strong> people</span></div>
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
        <label className="flex min-h-9 items-center gap-2 text-xs text-black/50 sm:px-2"><input type="checkbox" checked={showDone} onChange={event => setShowDone(event.target.checked)} />Show completed</label>
        <div className="flex rounded-md border border-black/10 bg-white p-0.5">
          <ModeButton active={view === "list"} onClick={() => setView("list")} icon={<List size={15} />} label="List" />
          <ModeButton active={view === "calendar"} onClick={() => setView("calendar")} icon={<CalendarDays size={15} />} label="Calendar" />
        </div>
      </div>
    </div>

    {view === "list" ? <section aria-label="All actions" className="grid gap-3">
      {[...generatedActions].map(action => <GeneratedCard key={action.id} action={action} />)}
      {visibleTasks.map(task => <TaskCard key={task.id} task={task} team={team} sops={sops} expanded={editing === task.id} onToggle={() => setEditing(current => current === task.id ? null : task.id)} onPatch={patch => patchTask(task.id, patch)} onDelete={() => deleteTask(task.id)} />)}
      {!generatedActions.length && !visibleTasks.length ? <div className="py-20 text-center"><Check className="mx-auto text-emerald-600" size={28} /><h2 className="mt-3 text-base font-semibold text-black/75">Everything is clear</h2><p className="mt-1 text-sm text-black/45">Add a task when something new needs doing.</p></div> : null}
    </section> : <CalendarView month={month} tasks={visibleTasks} actions={generatedActions} team={team} onPrevious={() => setMonth(addMonths(month, -1))} onNext={() => setMonth(addMonths(month, 1))} onToday={() => setMonth(startOfMonth(new Date()))} />}

    {adding ? <TaskModal team={team} sops={sops} onClose={() => setAdding(false)} onCreated={task => { setTasks(current => [task, ...current]); setAdding(false); }} /> : null}
  </div>;
}

function AdvisorPanel({ configured, suggestions, busy, reviewedAt, error, addingId, onReview, onAdd, onDismiss }: { configured: boolean; suggestions: AdvisorActionSuggestion[]; busy: boolean; reviewedAt: number | null; error: string; addingId: string | null; onReview: () => void; onAdd: (suggestion: AdvisorActionSuggestion) => void; onDismiss: (id: string) => void }) {
  return <section aria-labelledby="advisor-actions-heading" className="mm-surface-card overflow-hidden rounded-lg border border-brand/20 bg-brand/[0.035] px-4 py-4 sm:px-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand text-white"><Sparkles size={17} /></span>
        <div>
          <h2 id="advisor-actions-heading" className="text-sm font-semibold text-black/85">Aqua Advisor</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">Reviews live company health, alerts and open work, then proposes the most useful next actions. You decide what becomes a task.</p>
          {reviewedAt ? <p className="mt-1 text-[10px] text-black/35">Last reviewed {new Date(reviewedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p> : null}
        </div>
      </div>
      {configured ? <button type="button" onClick={onReview} disabled={busy} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-55 sm:w-auto">{busy ? <LoaderCircle className="animate-spin" size={15} /> : <Sparkles size={15} />}{busy ? "Reviewing business..." : reviewedAt ? "Review again" : "Find smart actions"}</button> : <Link href="/portal/agency/company?view=connections&integration=openai" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white sm:w-auto">Configure advisor <ArrowUpRight size={14} /></Link>}
    </div>

    {error ? <p role="alert" className="mt-4 border-l-2 border-red-500 pl-3 text-xs leading-5 text-red-700">{error}</p> : null}
    {reviewedAt && !busy && !suggestions.length && !error ? <div className="mt-4 flex items-center gap-2 border-t border-brand/15 pt-4 text-xs font-medium text-emerald-700"><Check size={15} />No additional actions are suggested from the current records.</div> : null}
    {suggestions.length ? <div className="mt-4 divide-y divide-brand/15 border-t border-brand/15">
      {suggestions.map(suggestion => <article key={suggestion.id} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Priority value={suggestion.priority} />
            <Pill>{suggestion.category}</Pill>
            <span className="text-[10px] capitalize text-black/38">{suggestion.confidence} confidence</span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-black/82">{suggestion.title}</h3>
          <p className="mt-1 text-xs leading-5 text-black/52">{suggestion.detail}</p>
          <p className="mt-2 text-[11px] leading-5 text-black/42"><strong className="font-semibold text-black/58">Why:</strong> {suggestion.evidence} · Due {new Date(suggestion.dueAt).toLocaleDateString("en-GB")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Link href={suggestion.href} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-xs font-medium text-black/52 hover:text-black">Open evidence <ArrowUpRight size={13} /></Link>
          <button type="button" onClick={() => onDismiss(suggestion.id)} className="min-h-9 px-2 text-xs font-medium text-black/42 hover:text-black">Dismiss</button>
          <button type="button" onClick={() => onAdd(suggestion)} disabled={addingId === suggestion.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-white disabled:opacity-55">{addingId === suggestion.id ? <LoaderCircle className="animate-spin" size={13} /> : <Plus size={13} />}{addingId === suggestion.id ? "Adding..." : "Add to Actions"}</button>
        </div>
      </article>)}
    </div> : null}
  </section>;
}

function TaskCard({ task, team, sops, expanded, onToggle, onPatch, onDelete }: { task: AgencyTask; team: TeamMember[]; sops: SopDocument[]; expanded: boolean; onToggle: () => void; onPatch: (patch: Partial<AgencyTask>) => void; onDelete: () => void }) {
  const owner = team.find(member => member.id === task.assigneeUserId);
  const attachedSops = sops.filter(sop => task.sopIds?.includes(sop.id));
  const isOverdue = task.status !== "done" && task.dueAt && task.dueAt < startOfDay(Date.now());
  return <article className={`mm-surface-card mm-hover-lift rounded-lg border bg-white transition ${isOverdue ? "border-red-200" : "border-black/10"}`}>
    <div className="grid min-h-20 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-4">
      <button type="button" onClick={() => onPatch({ status: task.status === "done" ? "todo" : "done" })} title={task.status === "done" ? "Reopen task" : "Complete task"} className={`grid size-9 place-items-center rounded-full border ${task.status === "done" ? "border-emerald-600 bg-emerald-600 text-white" : "border-black/15 text-transparent hover:text-black/25"}`}><Check size={16} /></button>
      <button type="button" onClick={onToggle} className="min-w-0 text-left"><span className="flex flex-wrap items-center gap-2"><strong className={`text-sm ${task.status === "done" ? "text-black/40 line-through" : "text-black/82"}`}>{task.title}</strong><Priority value={task.priority} />{task.status === "in-progress" ? <Pill>In progress</Pill> : null}{attachedSops.length ? <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700"><BookOpen size={11} />{attachedSops.length} {attachedSops.length === 1 ? "SOP" : "SOPs"}</span> : null}</span><span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/45">{owner ? <span className="inline-flex items-center gap-1"><UserRound size={13} />{owner.name}</span> : <span>Unassigned</span>}{task.startAt || task.dueAt ? <span className={`inline-flex items-center gap-1 ${isOverdue ? "font-medium text-red-700" : ""}`}><Clock3 size={13} />{dateRange(task.startAt, task.dueAt)}</span> : <span>No date</span>}{task.reminderAt ? <span className="inline-flex items-center gap-1"><Bell size={12} />{formatDateTime(task.reminderAt)}</span> : null}{task.recurrence ? <span className="inline-flex items-center gap-1 capitalize"><Repeat2 size={12} />{task.recurrence}</span> : null}</span></button>
      <button type="button" onClick={onToggle} className="col-start-2 w-fit rounded-md border border-black/10 px-3 py-2 text-xs font-medium text-black/55 sm:col-start-auto">{expanded ? "Close" : "Edit"}</button>
    </div>
    {expanded ? <TaskEditor task={task} team={team} sops={sops} onPatch={onPatch} onDelete={onDelete} /> : null}
  </article>;
}

function TaskEditor({ task, team, sops, onPatch, onDelete }: { task: AgencyTask; team: TeamMember[]; sops: SopDocument[]; onPatch: (patch: Partial<AgencyTask>) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState({ title: task.title, notes: task.notes ?? "", status: task.status, priority: task.priority, assigneeUserId: task.assigneeUserId ?? "", startAt: dateInput(task.startAt), dueAt: dateInput(task.dueAt), reminderAt: dateTimeInput(task.reminderAt), recurrence: task.recurrence ?? "none" as AgencyTaskRecurrence, sopIds: task.sopIds ?? [] });
  return <div className="grid gap-3 border-t border-black/10 bg-black/[0.015] p-4">
    <input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm font-medium" />
    <textarea value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} rows={3} className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm" placeholder="Notes, links, or the expected outcome" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Select label="Status" value={draft.status} onChange={value => setDraft(current => ({ ...current, status: value as AgencyTaskStatus }))} options={[["todo","To do"],["in-progress","In progress"],["done","Done"]]} />
      <Select label="Priority" value={draft.priority} onChange={value => setDraft(current => ({ ...current, priority: value as AgencyTaskPriority }))} options={[["low","Low"],["normal","Normal"],["high","High"],["urgent","Urgent"]]} />
      <Select label="Assigned to" value={draft.assigneeUserId} onChange={value => setDraft(current => ({ ...current, assigneeUserId: value }))} options={[["","Unassigned"], ...team.map(member => [member.id, member.name] as [string,string])]} />
      <div className="grid grid-cols-2 gap-2"><DateField label="Start" value={draft.startAt} onChange={value => setDraft(current => ({ ...current, startAt: value }))} /><DateField label="Due" value={draft.dueAt} onChange={value => setDraft(current => ({ ...current, dueAt: value }))} /></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-[10px] font-medium text-black/45">Reminder<input type="datetime-local" value={draft.reminderAt} onChange={event => setDraft(current => ({ ...current, reminderAt: event.target.value }))} className="min-h-10 rounded-md border border-black/15 bg-white px-2 text-xs" /></label>
      <Select label="Repeats" value={draft.recurrence} onChange={value => setDraft(current => ({ ...current, recurrence: value as AgencyTaskRecurrence }))} options={[["none","Does not repeat"],["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"]]} />
    </div>
    <SopPicker sops={sops} selected={draft.sopIds} onChange={sopIds => setDraft(current => ({ ...current, sopIds }))} />
    <div className="flex justify-between gap-3"><button type="button" onClick={onDelete} className="inline-flex min-h-10 items-center gap-2 px-2 text-xs font-medium text-red-700"><Trash2 size={14} />Delete</button><button type="button" onClick={() => onPatch({ title: draft.title, notes: draft.notes, status: draft.status, priority: draft.priority, assigneeUserId: draft.assigneeUserId || undefined, startAt: toTimestamp(draft.startAt), dueAt: toTimestamp(draft.dueAt, true), reminderAt: toDateTimeTimestamp(draft.reminderAt) ?? 0, recurrence: draft.recurrence, sopIds: draft.sopIds })} className="rounded-md bg-black px-4 text-xs font-semibold text-white">Save changes</button></div>
  </div>;
}

function GeneratedCard({ action }: { action: GeneratedAction }) {
  return <Link href={action.href} className="mm-surface-card mm-hover-lift group grid min-h-20 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-black/10 bg-white p-3 transition sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-4"><span className={`grid size-8 place-items-center rounded-md ${action.priority === "urgent" ? "bg-red-50 text-red-600" : action.priority === "high" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}><Sparkles size={14} /></span><span><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-black/82">{action.title}</strong><Pill>{action.kind}</Pill></span><span className="mt-1 block text-xs leading-5 text-black/45">{action.detail}{action.dueAt ? ` · ${new Date(action.dueAt).toLocaleDateString("en-GB")}` : ""}</span></span><span className="col-start-2 text-xs font-medium text-black/40 group-hover:text-black/70 sm:col-start-auto">Open</span></Link>;
}

function CalendarView({ month, tasks, actions, team, onPrevious, onNext, onToday }: { month: Date; tasks: AgencyTask[]; actions: GeneratedAction[]; team: TeamMember[]; onPrevious: () => void; onNext: () => void; onToday: () => void }) {
  const days = calendarDays(month);
  return <section>
    <div className="flex flex-wrap items-center justify-between gap-3 pb-3"><h2 className="text-lg font-semibold text-black/80">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2><div className="flex gap-1"><button onClick={onPrevious} aria-label="Previous month" className="grid size-9 place-items-center rounded-md border border-black/10"><ChevronLeft size={16} /></button><button onClick={onToday} className="rounded-md border border-black/10 px-3 text-xs font-medium">Today</button><button onClick={onNext} aria-label="Next month" className="grid size-9 place-items-center rounded-md border border-black/10"><ChevronRight size={16} /></button></div></div>
    <div className="overflow-x-auto overscroll-x-contain"><div className="grid min-w-[700px] grid-cols-7 border-l border-t border-black/10">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => <div key={day} className="border-b border-r border-black/10 bg-black/[0.02] px-2 py-2 text-center text-[10px] font-semibold uppercase text-black/40">{day}</div>)}{days.map(day => {
      const dayTasks = tasks.filter(task => overlapsDay(task.startAt ?? task.dueAt, task.dueAt ?? task.startAt, day));
      const dayActions = actions.filter(action => action.dueAt && sameDay(action.dueAt, day.getTime()));
      return <div key={day.toISOString()} className={`min-h-28 border-b border-r border-black/10 p-1.5 ${day.getMonth() === month.getMonth() ? "bg-white" : "bg-black/[0.015]"}`}><span className={`grid size-6 place-items-center rounded-full text-[11px] ${sameDay(day.getTime(), Date.now()) ? "bg-black text-white" : "text-black/50"}`}>{day.getDate()}</span><div className="mt-1 grid gap-1">{dayTasks.slice(0,3).map(task => <div key={task.id} title={task.title} className={`truncate rounded px-1.5 py-1 text-[10px] ${task.status === "done" ? "bg-emerald-50 text-emerald-700 line-through" : "bg-blue-50 text-blue-800"}`}>{task.title}{task.assigneeUserId ? ` · ${team.find(member => member.id === task.assigneeUserId)?.name ?? ""}` : ""}</div>)}{dayActions.slice(0,2).map(action => <Link key={action.id} href={action.href} className="truncate rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-800">{action.title}</Link>)}{dayTasks.length + dayActions.length > 5 ? <span className="px-1 text-[9px] text-black/35">+{dayTasks.length + dayActions.length - 5} more</span> : null}</div></div>;
    })}</div></div>
  </section>;
}

function TaskModal({ team, sops, onClose, onCreated }: { team: TeamMember[]; sops: SopDocument[]; onClose: () => void; onCreated: (task: AgencyTask) => void }) {
  const [busy, setBusy] = useState(false);
  const [sopIds, setSopIds] = useState<string[]>([]);
  return <div className="fixed inset-0 z-[90] grid items-end bg-black/35 sm:items-center sm:p-6"><button className="absolute inset-0" aria-label="Close task form" onClick={onClose} /><form role="dialog" aria-modal="true" aria-labelledby="new-task-title" className="relative mx-auto grid max-h-[100dvh] w-full max-w-xl gap-4 overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg" onSubmit={async event => { event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget); const response = await fetch("/api/portal/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: data.get("title"), notes: data.get("notes"), priority: data.get("priority"), assigneeUserId: data.get("assigneeUserId") || undefined, startAt: toTimestamp(String(data.get("startAt") ?? "")), dueAt: toTimestamp(String(data.get("dueAt") ?? ""), true), reminderAt: toDateTimeTimestamp(String(data.get("reminderAt") ?? "")), recurrence: data.get("recurrence"), sopIds }) }); const result = await response.json() as { ok: boolean; task?: AgencyTask }; setBusy(false); if (result.ok && result.task) onCreated(result.task); }}>
    <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-black/40">New task</p><h2 id="new-task-title" className="mt-1 text-xl font-semibold">What needs to happen?</h2></div><button type="button" aria-label="Close task form" onClick={onClose} className="grid size-9 place-items-center rounded-md border border-black/10"><X size={16} /></button></div>
    <label className="grid gap-1 text-xs font-medium text-black/55">Task<input autoFocus required name="title" className="min-h-11 rounded-md border border-black/15 px-3 text-sm" placeholder="Prepare homepage concepts" /></label>
    <label className="grid gap-1 text-xs font-medium text-black/55">Notes<textarea name="notes" rows={4} className="rounded-md border border-black/15 px-3 py-2 text-sm" placeholder="Outcome, links, context, or checklist" /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium text-black/55">Assigned to<select name="assigneeUserId" className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm"><option value="">Unassigned</option>{team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label className="grid gap-1 text-xs font-medium text-black/55">Priority<select name="priority" defaultValue="normal" className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="grid gap-1 text-xs font-medium text-black/55">Start date<input name="startAt" type="date" className="min-h-11 rounded-md border border-black/15 px-3 text-sm" /></label><label className="grid gap-1 text-xs font-medium text-black/55">Due date<input name="dueAt" type="date" className="min-h-11 rounded-md border border-black/15 px-3 text-sm" /></label></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium text-black/55">Reminder<input name="reminderAt" type="datetime-local" className="min-h-11 rounded-md border border-black/15 px-3 text-sm" /></label><label className="grid gap-1 text-xs font-medium text-black/55">Repeats<select name="recurrence" defaultValue="none" className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div>
    <SopPicker sops={sops} selected={sopIds} onChange={setSopIds} />
    <div className="flex justify-end"><button disabled={busy} className="min-h-11 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Adding..." : "Add task"}</button></div>
  </form></div>;
}

function SopPicker({ sops, selected, onChange }: { sops: SopDocument[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <fieldset className="grid gap-2 rounded-md border border-black/10 bg-white p-3">
    <legend className="sr-only">Attached SOPs</legend>
    <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-black/60">Attached SOPs</span><Link href="/portal/agency/sop-library" target="_blank" className="inline-flex items-center gap-1 text-[11px] font-medium text-black/45 hover:text-black">Open library <ExternalLink size={11} /></Link></div>
    {sops.length ? <div className="grid max-h-40 gap-1 overflow-y-auto">{sops.map(sop => <label key={sop.id} className="flex min-h-9 items-center gap-2 rounded px-2 text-xs text-black/70 hover:bg-black/[0.03]"><input type="checkbox" checked={selected.includes(sop.id)} onChange={event => onChange(event.target.checked ? [...selected, sop.id] : selected.filter(id => id !== sop.id))} /><BookOpen size={13} className="text-black/35" /><span className="min-w-0 flex-1 truncate">{sop.title}</span>{sop.category ? <span className="text-[10px] text-black/35">{sop.category}</span> : null}</label>)}</div> : <p className="text-xs leading-5 text-black/40">No SOPs in your library yet.</p>}
  </fieldset>;
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} title={label} className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2 text-xs font-medium ${active ? "bg-black text-white" : "text-black/50"}`}>{icon}<span>{label}</span></button>; }
function Priority({ value }: { value: AgencyTaskPriority }) { if (value === "normal") return null; const style = value === "urgent" ? "bg-red-50 text-red-700" : value === "high" ? "bg-amber-50 text-amber-700" : "bg-black/[0.04] text-black/45"; return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${style}`}>{value}</span>; }
function Pill({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium text-black/50">{children}</span>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string,string][] }) { return <label className="grid gap-1 text-[10px] font-medium text-black/45">{label}<select value={value} onChange={event => onChange(event.target.value)} className="min-h-10 rounded-md border border-black/15 bg-white px-2 text-xs">{options.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>; }
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-1 text-[10px] font-medium text-black/45">{label}<input type="date" value={value} onChange={event => onChange(event.target.value)} className="min-h-10 min-w-0 rounded-md border border-black/15 bg-white px-1 text-xs" /></label>; }
function startOfDay(value: number) { const date = new Date(value); date.setHours(0,0,0,0); return date.getTime(); }
function toTimestamp(value: string, end = false): number | undefined { if (!value) return undefined; const date = new Date(`${value}T${end ? "23:59:59" : "00:00:00"}`); return Number.isFinite(date.getTime()) ? date.getTime() : undefined; }
function dateInput(value?: number) { return value ? new Date(value).toISOString().slice(0,10) : ""; }
function dateTimeInput(value?: number) { if (!value) return ""; const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0,16); }
function toDateTimeTimestamp(value: string): number | undefined { if (!value) return undefined; const time = new Date(value).getTime(); return Number.isFinite(time) ? time : undefined; }
function formatDateTime(value: number) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function dateRange(start?: number, due?: number) { if (start && due && !sameDay(start,due)) return `${new Date(start).toLocaleDateString("en-GB",{day:"numeric",month:"short"})} – ${new Date(due).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`; const value = due ?? start; return value ? new Date(value).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : "No date"; }
function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function addMonths(date: Date, amount: number) { return new Date(date.getFullYear(), date.getMonth() + amount, 1); }
function sameDay(a: number, b: number) { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); }
function overlapsDay(start: number | undefined, end: number | undefined, day: Date) { if (!start && !end) return false; const dayStart = startOfDay(day.getTime()), dayEnd = dayStart + 86_400_000 - 1; return (start ?? end ?? 0) <= dayEnd && (end ?? start ?? 0) >= dayStart; }
function calendarDays(month: Date) { const first = startOfMonth(month); const offset = (first.getDay() + 6) % 7; const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset); return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)); }
