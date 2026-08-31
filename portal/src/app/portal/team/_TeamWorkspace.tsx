"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  FileSignature,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Flag,
  LoaderCircle,
  LogIn,
  LogOut,
  NotebookPen,
  Pause,
  Play,
  Plus,
  ReceiptPoundSterling,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  UserRound,
} from "lucide-react";

import type { DashboardPlanningSnapshot } from "@/server/dashboardPlanning";
import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import { formatUkDate, timestampFromValue } from "@/lib/shared/formatDateTime";
import { TeamChat } from "@/components/people/TeamChat";
import type {
  AgencyTask,
  NotepadFolder,
  NotepadNote,
  PeopleContract,
  PeopleEmployee,
  PeopleFeedback,
  PeopleLeaveRequest,
  PeopleRecognition,
  PeopleShift,
  PeopleTrainingAssignment,
  PeopleWorkspaceStationId,
} from "@/server/types";

type ProgressionData = {
  company: { mission: string; vision: string; values: string[] };
  sops: Array<{ id: string; title: string; category?: string; resourceType?: string }>;
  recognitions: PeopleRecognition[];
  feedback: PeopleFeedback[];
  contracts: PeopleContract[];
};

type StaffModule = {
  id: string;
  title: string;
  summary?: string;
  blocks: Array<{ id: string; type: "heading" | "text" | "video" | "resource"; text?: string; url?: string; label?: string }>;
  passMark: number;
  quiz: Array<{ id: string; prompt: string; options: Array<{ id: string; text: string }> }>;
};

type TeamData = {
  people: {
    employee: PeopleEmployee;
    leaveRequests: PeopleLeaveRequest[];
    shifts: PeopleShift[];
    training: PeopleTrainingAssignment[];
    modules: StaffModule[];
    stations: readonly { id: PeopleWorkspaceStationId; label: string; description: string; href: string; mandatory?: boolean }[];
  };
  planning: DashboardPlanningSnapshot;
  tasks: AgencyTask[];
  notes: NotepadNote[];
  folders: NotepadFolder[];
  progression: ProgressionData;
};

export function TeamWorkspace({ section, initial }: { section: PeopleWorkspaceStationId; initial: TeamData }) {
  const station = initial.people.stations.find(item => item.id === section);
  const access = initial.people.employee.workspaceAccess.find(item => item.stationId === section);
  const editable = access?.mode === "edit";
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <header className="flex flex-col justify-between gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-800">{initial.people.employee.department || "Team workspace"}</p>
          <h1 className="mt-1 text-3xl font-semibold text-black/90">{station?.label || "My Work"}</h1>
          <p className="mt-2 text-sm text-black/50">{station?.description}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/55"><ShieldCheck size={15} className="text-emerald-800" /> {access?.mode === "view" ? "View-only station" : "Employee-owned station"}</span>
      </header>
      {section === "my-day" ? <MyDay initial={initial} editable={editable} /> : null}
      {section === "actions" ? <Actions initial={initial} editable={editable} /> : null}
      {section === "calendar" ? <Schedule initial={initial} /> : null}
      {section === "onboarding" ? <Onboarding initial={initial} editable={editable} /> : null}
      {section === "leave" ? <Leave initial={initial} editable={editable} /> : null}
      {section === "training" ? <Training initial={initial} editable={editable} /> : null}
      {section === "pay" ? <Pay initial={initial} /> : null}
      {section === "notes" ? <Notes initial={initial} editable={editable} /> : null}
      {section === "progression" ? <Progression initial={initial} editable={editable} /> : null}
      {section === "chat" ? <TeamChat canUse={editable} /> : null}
    </div>
  );
}

function MyDay({ initial, editable }: { initial: TeamData; editable: boolean }) {
  const router = useRouter();
  const [planning, setPlanning] = useState(initial.planning);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const employee = initial.people.employee;
  const actionsVisible = employee.workspaceAccess.some(item => item.stationId === "actions");
  const date = planning.today;
  const plan = planning.dayPlan;
  const todayTasks = initial.tasks.filter(task => task.status !== "done" && (!task.startAt || isoDay(task.startAt) <= date) && (!task.dueAt || isoDay(task.dueAt) >= date));
  const todayShifts = initial.people.shifts.filter(shift => isoDay(shift.startsAt) === date && shift.status !== "cancelled");
  const completedToday = initial.tasks.filter(task => task.status === "done" && task.completedAt && isoDay(task.completedAt) === date).length;
  const loggedMs = planning.sessions.reduce((sum, session) => sum + Math.max(0, (session.endedAt ?? Date.now()) - session.startedAt), 0);

  async function planningAction(action: string, payload: Record<string, unknown> = {}) {
    if (!editable) return;
    setBusy(action); setError("");
    try {
      const result = await checkedJsonMutation<{ ok?: boolean; planning?: DashboardPlanningSnapshot }>("/api/portal/dashboard-planning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, date, ...payload }) }, {
        fallback: "Your day could not be updated.",
        validate: value => value.ok === true && Boolean(value.planning),
      });
      setPlanning(result.planning!);
      // The portal-level monitor is persistent across this leaf refresh. Tell
      // it about clock-in/out immediately so its chip, heartbeat and check-in
      // prompts follow the same authoritative planning response.
      window.dispatchEvent(new CustomEvent("aqua-work-session:updated", { detail: result.planning! }));
      setReviewOpen(false); router.refresh();
    } catch (cause) { setError(mutationErrorMessage(cause, "Your day could not be updated.")); }
    finally { setBusy(""); }
  }

  function navigate(days: number) { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + days); router.push(`/portal/team?date=${isoDay(next.getTime())}`); }
  const today = isoDay(Date.now());
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 bg-[#112f29] p-5 text-white sm:flex-row sm:items-center sm:p-6">
          <div><p className="text-xs font-semibold uppercase text-[#a7d6ca]">Employee Day Command</p><div className="mt-2 flex items-center gap-2"><button aria-label="Previous day" onClick={() => navigate(-1)} className="inline-flex size-9 items-center justify-center rounded-md border border-white/15"><ArrowLeft size={16} /></button><h2 className="text-2xl font-semibold">{formatLongDay(date)}</h2><button aria-label="Next day" onClick={() => navigate(1)} className="inline-flex size-9 items-center justify-center rounded-md border border-white/15"><ArrowRight size={16} /></button></div><p className="mt-2 text-sm text-white/60">{date === today ? "Today" : date < today ? "Reviewing retained day" : "Planning ahead"} · {todayTasks.length} open actions</p></div>
          <div className="flex flex-wrap gap-2">{date !== today ? <button onClick={() => router.push("/portal/team")} className="min-h-10 rounded-md border border-white/15 px-4 text-sm font-semibold">Back to today</button> : null}{editable ? (planning.activeSession ? <button onClick={() => setReviewOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white"><LogOut size={16} /> Clock out</button> : <button onClick={() => planningAction("clock-in", { focus: plan?.focus || "My planned outcome" })} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#d7be83] px-4 text-sm font-semibold text-[#15221d]"><LogIn size={16} /> Clock in</button>) : null}</div>
        </div>
        <div className="grid gap-px bg-black/10 sm:grid-cols-4"><Metric label="Logged" value={`${(loggedMs / 3_600_000).toFixed(1)}h`} icon={Clock3} /><Metric label="Planned" value={`${(plan?.plannedHours ?? 0).toFixed(1)}h`} icon={Target} /><Metric label="Open" value={String(todayTasks.length)} icon={ClipboardCheck} /><Metric label="Done" value={String(completedToday)} icon={Check} /></div>
        <form onSubmit={event => { event.preventDefault(); if (!editable) return; const data = Object.fromEntries(new FormData(event.currentTarget)); void planningAction("save-plan", { focus: data.focus, planNotes: data.planNotes, plannedHours: Number(data.plannedHours) }); }} className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_10rem]">
          <div className="space-y-4"><label className="block text-xs font-semibold uppercase text-black/45">One outcome that makes this day count<input name="focus" disabled={!editable} defaultValue={plan?.focus} placeholder="Name the result, not the activity" className="mt-2 min-h-11 w-full rounded-md border border-black/15 px-3 text-base font-medium normal-case disabled:bg-black/[0.03]" /></label><label className="block text-xs font-semibold uppercase text-black/45">Plan and context<textarea name="planNotes" disabled={!editable} defaultValue={plan?.planNotes} rows={4} placeholder="Order the work, record dependencies, and define done." className="mt-2 w-full rounded-md border border-black/15 p-3 text-sm font-normal normal-case disabled:bg-black/[0.03]" /></label></div><div><label className="block text-xs font-semibold uppercase text-black/45">Planned hours<input name="plannedHours" disabled={!editable} type="number" step="0.25" min="0" max="24" defaultValue={plan?.plannedHours ?? 0} className="mt-2 min-h-11 w-full rounded-md border border-black/15 px-3 text-lg font-semibold normal-case disabled:bg-black/[0.03]" /></label>{editable ? <button disabled={busy === "save-plan"} className="mt-4 min-h-10 w-full rounded-md bg-black px-4 text-sm font-semibold text-white">Save day</button> : null}</div>
        </form>
      </section>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p> : null}
      {reviewOpen ? <ClockOutReview busy={busy === "clock-out"} onCancel={() => setReviewOpen(false)} onSubmit={payload => planningAction("clock-out", { clockOutReview: payload })} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-lg border border-black/10 bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-emerald-800">Do in this order</p><h2 className="mt-1 text-xl font-semibold">Assigned work</h2></div>{actionsVisible ? <Link href="/portal/team/actions" className="inline-flex min-h-6 items-center text-sm font-semibold text-emerald-800">All actions</Link> : null}</div><div className="mt-4 divide-y divide-black/10 border-y border-black/10">{todayTasks.slice(0, 6).map((task, index) => <div key={task.id} className="flex gap-3 py-4"><span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${task.priority === "urgent" ? "bg-red-600" : task.priority === "high" ? "bg-amber-600" : "bg-[#153a32]"}`}>{index + 1}</span><div className="min-w-0 flex-1"><p className="font-semibold">{task.title}</p><p className="mt-1 line-clamp-2 text-sm text-black/45">{task.notes || "No additional notes."}</p></div></div>)}{todayTasks.length === 0 ? <p className="py-8 text-center text-sm text-black/40">No assigned work is open for this day.</p> : null}</div></section>
        <div className="space-y-5"><section className="rounded-lg border border-black/10 bg-white p-5"><CalendarDays className="text-emerald-800" size={19} /><h2 className="mt-3 font-semibold">Today’s schedule</h2><div className="mt-4 space-y-3">{todayShifts.map(shift => <div key={shift.id} className="border-l-2 border-[#b89755] pl-3"><p className="text-sm font-semibold">{shift.title}</p><p className="mt-0.5 text-xs text-black/45">{time(shift.startsAt)}–{time(shift.endsAt)}{shift.location ? ` · ${shift.location}` : ""}</p></div>)}{todayShifts.length === 0 ? <p className="text-sm text-black/40">No shift or assignment is scheduled.</p> : null}</div></section><section className="rounded-lg border border-[#b89755]/30 bg-[#fcf8ee] p-5"><Sparkles className="text-[#876a32]" size={18} /><h2 className="mt-3 font-semibold">First principle</h2><p className="mt-2 text-sm leading-6 text-black/55">Your work record should tell the truth without requiring constant surveillance. Name external work when prompted and close the day with evidence.</p></section></div>
      </div>
    </div>
  );
}

function ClockOutReview({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); onSubmit({ outcome: data.outcome, openWork: data.nothingOpen ? undefined : data.openWork, nothingOpen: Boolean(data.nothingOpen), nextPriority: data.nextPriority, dayScore: Number(data.dayScore), unconfirmedTimeAcknowledged: Boolean(data.unconfirmedTimeAcknowledged) }); }
  return <form onSubmit={submit} className="rounded-lg border-2 border-[#9a3f3f] bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><span className="inline-flex size-10 items-center justify-center rounded-md bg-red-600 text-white"><LogOut size={18} /></span><div><p className="text-xs font-semibold uppercase text-red-700">Mandatory handover</p><h2 className="mt-1 text-xl font-semibold">Close the work session properly</h2></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold uppercase text-black/45 sm:col-span-2">What moved?<textarea required name="outcome" rows={3} className="mt-2 w-full rounded-md border border-black/15 p-3 text-sm font-normal normal-case" /></label><label className="text-xs font-semibold uppercase text-black/45">Open handover<textarea name="openWork" rows={3} className="mt-2 w-full rounded-md border border-black/15 p-3 text-sm font-normal normal-case" /></label><label className="text-xs font-semibold uppercase text-black/45">First priority next session<textarea required name="nextPriority" rows={3} className="mt-2 w-full rounded-md border border-black/15 p-3 text-sm font-normal normal-case" /></label><label className="flex items-center gap-2 text-sm"><input name="nothingOpen" type="checkbox" /> Nothing remains open</label><label className="flex items-center gap-2 text-sm"><input name="unconfirmedTimeAcknowledged" type="checkbox" /> I reviewed any unconfirmed time</label><label className="text-xs font-semibold uppercase text-black/45">Day score<select required name="dayScore" defaultValue="" className="mt-2 min-h-10 w-full rounded-md border border-black/15 px-3 text-sm font-normal normal-case"><option value="" disabled>Choose 1–5</option>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value}</option>)}</select></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onCancel} className="min-h-10 rounded-md border border-black/10 px-4 text-sm font-semibold">Keep working</button><button disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white">{busy ? <LoaderCircle className="animate-spin" size={15} /> : <LogOut size={15} />} Complete review & clock out</button></div></form>;
}

function Actions({ initial, editable }: { initial: TeamData; editable: boolean }) {
  const router = useRouter(); const [tasks, setTasks] = useState(initial.tasks); const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [filter, setFilter] = useState<"open" | "done">("open");
  async function request(method: string, body: Record<string, unknown>) {
    setBusy(String(body.id || "new")); setError("");
    try {
      const result = await checkedJsonMutation<{ ok?: boolean; task?: AgencyTask; tasks?: AgencyTask[] }>("/api/portal/tasks", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, {
        fallback: "The task could not be updated.",
        validate: value => value.ok === true && Boolean(value.task),
      });
      if (result.tasks) setTasks(result.tasks);
      else if (result.task) setTasks(current => method === "POST" ? [result.task!, ...current] : current.map(item => item.id === result.task!.id ? result.task! : item));
      router.refresh();
      return true;
    } catch (cause) {
      setError(mutationErrorMessage(cause, "The task could not be updated."));
      return false;
    } finally { setBusy(""); }
  }
  const visible = tasks.filter(task => filter === "done" ? task.status === "done" : task.status !== "done");
  return <div className="space-y-5"><section className="rounded-lg border border-black/10 bg-white p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div className="flex gap-2"><button onClick={() => setFilter("open")} className={`min-h-9 rounded-md px-3 text-sm font-semibold ${filter === "open" ? "bg-black text-white" : "border border-black/10"}`}>Open {tasks.filter(task => task.status !== "done").length}</button><button onClick={() => setFilter("done")} className={`min-h-9 rounded-md px-3 text-sm font-semibold ${filter === "done" ? "bg-black text-white" : "border border-black/10"}`}>Completed {tasks.filter(task => task.status === "done").length}</button></div>{editable ? <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const title = new FormData(form).get("title"); void request("POST", { title, priority: "normal", origin: "manual" }).then(saved => { if (saved) form.reset(); }); }} className="flex gap-2"><input name="title" required aria-label="New task title" placeholder="Add my own task" className="min-h-9 min-w-0 rounded-md border border-black/15 px-3 text-sm" /><button disabled={busy === "new"} aria-label="Add task" className="inline-flex size-9 items-center justify-center rounded-md bg-emerald-800 text-white"><Plus size={16} aria-hidden /></button></form> : null}</div>{error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}</section><section className="divide-y divide-black/10 overflow-hidden rounded-lg border border-black/10 bg-white">{visible.map(task => <div key={task.id} className="flex gap-4 p-4"><button disabled={!editable || busy === task.id} aria-label={task.status === "done" ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`} aria-pressed={task.status === "done"} onClick={() => request("PATCH", { id: task.id, status: task.status === "done" ? "todo" : "done" })} className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border ${task.status === "done" ? "border-emerald-700 bg-emerald-700 text-white" : "border-black/15"}`}><Check size={15} aria-hidden /></button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className={`font-semibold ${task.status === "done" ? "text-black/35 line-through" : ""}`}>{task.title}</p><span className="rounded-md bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase">{task.priority}</span></div>{task.notes ? <p className="mt-1 text-sm leading-6 text-black/45">{task.notes}</p> : null}<p className="mt-2 text-xs text-black/35">{task.origin === "manual" ? "Personal" : "Assigned"}{task.dueAt ? ` · due ${formatDate(task.dueAt)}` : ""}</p></div></div>)}{visible.length === 0 ? <p className="p-8 text-center text-sm text-black/40">Nothing in this view.</p> : null}</section></div>;
}

function Schedule({ initial }: { initial: TeamData }) { const shifts = initial.people.shifts.filter(shift => shift.status !== "cancelled"); return <div className="grid gap-6 lg:grid-cols-[1fr_20rem]"><section className="overflow-hidden rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 p-5"><p className="text-xs font-semibold uppercase text-emerald-800">Published schedule</p><h2 className="mt-1 text-xl font-semibold">Shifts and assignments</h2></header>{shifts.map(shift => <div key={shift.id} className="grid gap-3 border-b border-black/10 p-5 last:border-0 sm:grid-cols-[8rem_1fr_auto]"><div><p className="text-sm font-semibold">{formatDate(shift.startsAt)}</p><p className="mt-1 text-xs text-black/45">{time(shift.startsAt)}–{time(shift.endsAt)}</p></div><div><p className="font-semibold">{shift.title}</p><p className="mt-1 text-sm text-black/45">{shift.location || "Location not specified"}</p></div><span className="h-fit rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold capitalize text-emerald-800">{shift.status}</span></div>)}{shifts.length === 0 ? <p className="p-8 text-center text-sm text-black/40">No shifts or assignments are published.</p> : null}</section><section className="h-fit rounded-lg border border-black/10 bg-white p-5"><CalendarDays className="text-emerald-800" size={20} /><h2 className="mt-3 font-semibold">Your working pattern</h2><dl className="mt-4 space-y-4"><Definition label="Weekly hours" value={`${initial.people.employee.weeklyHours ?? 0}h`} /><Definition label="Employment" value={words(initial.people.employee.employmentType)} /><Definition label="Start date" value={initial.people.employee.startDate ? formatDate(initial.people.employee.startDate) : "Not set"} /></dl></section></div>; }

function Onboarding({ initial, editable }: { initial: TeamData; editable: boolean }) {
  const router = useRouter();
  const employee = initial.people.employee;
  const complete = employee.onboardingItems.filter(item => item.status === "done").length;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function update(itemId: string, status: "todo" | "done") {
    setBusy(itemId); setError("");
    try {
      await checkedJsonMutation<{ ok?: boolean }>("/api/portal/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update-onboarding", itemId, status }) }, {
        fallback: "The onboarding item could not be updated.",
        validate: value => value.ok === true,
      });
      router.refresh();
    } catch (cause) { setError(mutationErrorMessage(cause, "The onboarding item could not be updated.")); }
    finally { setBusy(""); }
  }
  return <section className="overflow-hidden rounded-lg border border-black/10 bg-white"><header className="flex flex-col justify-between gap-3 bg-[#112f29] p-5 text-white sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase text-[#a7d6ca]">Welcome aboard</p><h2 className="mt-1 text-2xl font-semibold">Your route to ready</h2></div><span className="text-sm font-semibold">{complete}/{employee.onboardingItems.length} complete</span></header><div className="h-2 bg-black/5"><div className="h-full bg-[#b89755]" style={{ width: `${employee.onboardingItems.length ? complete / employee.onboardingItems.length * 100 : 0}%` }} /></div>{error ? <p role="alert" className="m-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}<div className="divide-y divide-black/10">{employee.onboardingItems.map((item, index) => <div key={item.id} className="flex gap-4 p-5"><button disabled={!editable || item.owner !== "employee" || busy === item.id} aria-label={item.status === "done" ? `Mark onboarding step "${item.label}" not done` : `Mark onboarding step "${item.label}" done`} aria-pressed={item.status === "done"} onClick={() => update(item.id, item.status === "done" ? "todo" : "done")} className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full border ${item.status === "done" ? "border-emerald-700 bg-emerald-700 text-white" : "border-black/15 text-black/35"}`}>{item.status === "done" ? <Check size={16} aria-hidden /> : index + 1}</button><div><p className={`font-semibold ${item.status === "done" ? "text-black/35 line-through" : ""}`}>{item.label}</p><p className="mt-1 text-sm text-black/45">Owned by {item.owner}{item.owner === "company" ? " · your manager will complete this" : ""}</p></div></div>)}</div></section>;
}

function Leave({ initial, editable }: { initial: TeamData; editable: boolean }) {
  const router = useRouter(); const employee = initial.people.employee; const approved = initial.people.leaveRequests.filter(item => item.status === "approved").reduce((sum, item) => sum + item.days, 0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setBusy(true); setError("");
    try {
      await checkedJsonMutation<{ ok?: boolean }>("/api/portal/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "request-leave", ...Object.fromEntries(new FormData(form)) }) }, {
        fallback: "The leave request could not be sent.",
        validate: value => value.ok === true,
      });
      form.reset(); router.refresh();
    } catch (cause) { setError(mutationErrorMessage(cause, "The leave request could not be sent.")); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-6 xl:grid-cols-[1fr_22rem]"><section className="overflow-hidden rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 p-5"><p className="text-xs font-semibold uppercase text-emerald-800">Time off record</p><h2 className="mt-1 text-xl font-semibold">Requests and decisions</h2></header>{initial.people.leaveRequests.map(request => <div key={request.id} className="flex flex-col gap-3 border-b border-black/10 p-5 last:border-0 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold capitalize">{request.type} leave</p><p className="mt-1 text-sm text-black/45">{request.startsOn} to {request.endsOn} · {request.days} working days</p></div><span className={`w-fit rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${request.status === "approved" ? "bg-emerald-50 text-emerald-800" : request.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{request.status}</span></div>)}{initial.people.leaveRequests.length === 0 ? <p className="p-8 text-center text-sm text-black/40">No leave requests yet.</p> : null}</section><div className="space-y-5"><section className="rounded-lg border border-black/10 bg-white p-5"><p className="text-xs font-semibold uppercase text-black/40">Annual allowance</p><p className="mt-2 text-4xl font-semibold">{Math.max(0, (employee.holidayAllowanceDays ?? 0) - approved)} <span className="text-base text-black/40">days left</span></p><p className="mt-2 text-sm text-black/45">{approved} of {employee.holidayAllowanceDays ?? 0} approved days used.</p></section>{editable ? <form onSubmit={submit} className="rounded-lg border border-black/10 bg-white p-5"><h2 className="font-semibold">Request time off</h2><div className="mt-4 space-y-3"><SelectField name="type" label="Type" options={["annual", "sick", "unpaid", "compassionate", "parental", "other"]} /><InputField name="startsOn" label="Starts" type="date" required /><InputField name="endsOn" label="Ends" type="date" required /><label className="block text-xs font-semibold text-black/45">Note<textarea name="note" rows={3} className="mt-1.5 w-full rounded-md border border-black/15 p-3 text-sm font-normal" /></label>{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<button disabled={busy} className="min-h-10 w-full rounded-md bg-[#153a32] text-sm font-semibold text-white">{busy ? "Sending…" : "Send request"}</button></div></form> : null}</div></div>;
}

function Training({ initial, editable }: { initial: TeamData; editable: boolean }) {
  const router = useRouter();
  const [takingId, setTakingId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function update(item: PeopleTrainingAssignment) {
    setBusy(item.id); setError("");
    try {
      await checkedJsonMutation<{ ok?: boolean }>("/api/portal/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update-training", trainingId: item.id, status: item.status === "completed" ? "in-progress" : "completed" }) }, {
        fallback: "The training assignment could not be updated.",
        validate: value => value.ok === true,
      });
      router.refresh();
    } catch (cause) { setError(mutationErrorMessage(cause, "The training assignment could not be updated.")); }
    finally { setBusy(""); }
  }
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2 xl:col-span-3">{error}</p> : null}
      {initial.people.training.map(item => {
        const module = item.moduleId ? initial.people.modules.find(entry => entry.id === item.moduleId) : undefined;
        return (
          <article key={item.id} className="rounded-lg border border-black/10 bg-white p-5">
            <BookOpenCheck className={item.status === "completed" ? "text-emerald-700" : "text-[#9a7434]"} size={20} />
            <div className="mt-4 flex items-start justify-between gap-3"><h2 className="font-semibold">{item.title}</h2><span className="rounded-md bg-black/5 px-2 py-1 text-[10px] font-semibold uppercase">{words(item.status)}</span></div>
            {item.description ? <p className="mt-2 text-sm leading-6 text-black/50">{item.description}</p> : null}
            {item.dueAt ? <p className="mt-4 text-xs text-black/40">Due {formatDate(item.dueAt)}</p> : null}
            {typeof item.score === "number" ? <p className="mt-2 text-xs font-semibold text-emerald-800">Last score: {item.score}%</p> : null}
            {item.resourceUrl ? <a href={item.resourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-semibold text-emerald-800">Open resource</a> : null}
            {module && editable ? <button onClick={() => setTakingId(item.id)} className="mt-5 min-h-9 w-full rounded-md bg-[#153a32] text-sm font-semibold text-white">{item.status === "completed" ? "Review module" : "Take module"}</button>
              : editable ? <button disabled={busy === item.id} onClick={() => update(item)} className="mt-5 min-h-9 w-full rounded-md border border-black/10 text-sm font-semibold">{busy === item.id ? "Updating…" : item.status === "completed" ? "Mark in progress" : "Mark complete"}</button> : null}
            {module && takingId === item.id ? <ModuleTaker assignmentId={item.id} module={module} onClose={() => setTakingId("")} /> : null}
          </article>
        );
      })}
      {initial.people.training.length === 0 ? <div className="md:col-span-2 xl:col-span-3"><EmptyState icon={BookOpenCheck} title="No training assigned" detail="Your manager has not assigned any SOPs or development work yet." /></div> : null}
    </section>
  );
}

function ModuleTaker({ assignmentId, module, onClose }: { assignmentId: string; module: StaffModule; onClose: () => void }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true); setError("");
    try {
      const data = await checkedJsonMutation<{ ok?: boolean; result?: { score: number; passed: boolean } }>("/api/portal/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete-module", assignmentId, answers }) }, {
        fallback: "The module result could not be submitted.",
        validate: value => value.ok === true && Boolean(value.result),
      });
      setResult(data.result!); router.refresh();
    } catch (cause) { setError(mutationErrorMessage(cause, "The module result could not be submitted.")); }
    finally { setBusy(false); }
  }
  return (
    <div className="mt-4 space-y-4 rounded-md border border-black/10 bg-[#fbfbf9] p-4 text-left">
      {module.blocks.map(block => (
        <div key={block.id}>
          {block.type === "heading" ? <h3 className="font-semibold">{block.text}</h3> : null}
          {block.type === "text" ? <p className="text-sm leading-6 text-black/65">{block.text}</p> : null}
          {block.type === "video" && block.url ? <a href={block.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800"><Play size={14} /> Watch the video</a> : null}
          {block.type === "resource" && block.url ? <a href={block.url} target="_blank" rel="noreferrer" className="inline-flex text-sm font-semibold text-emerald-800">{block.label || "Open resource"}</a> : null}
        </div>
      ))}
      {module.quiz.length ? (
        <div className="space-y-3 border-t border-black/10 pt-3">
          <p className="text-xs font-semibold uppercase text-black/45">Quiz · pass at {module.passMark}%</p>
          {module.quiz.map((question, index) => (
            <div key={question.id}>
              <p className="text-sm font-medium">{index + 1}. {question.prompt}</p>
              <div className="mt-1 space-y-1">
                {question.options.map(option => (
                  <label key={option.id} className="flex items-center gap-2 text-sm"><input type="radio" name={question.id} checked={answers[question.id] === option.id} onChange={() => setAnswers(current => ({ ...current, [question.id]: option.id }))} /> {option.text}</label>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {result ? <p className={`text-sm font-semibold ${result.passed ? "text-emerald-700" : "text-red-700"}`}>{result.passed ? `Passed — ${result.score}%. Nice work.` : `${result.score}% — below the pass mark. Review and try again.`}</p> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="min-h-9 rounded-md border border-black/10 px-3 text-sm font-semibold">Close</button>
        <button onClick={submit} disabled={busy} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-[#153a32] px-4 text-sm font-semibold text-white">{busy ? <LoaderCircle className="animate-spin" size={14} /> : <Check size={14} />} Submit</button>
      </div>
    </div>
  );
}

function Pay({ initial }: { initial: TeamData }) { const employee = initial.people.employee; return <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]"><section className="h-fit rounded-lg border border-black/10 bg-[#112f29] p-6 text-white"><ReceiptPoundSterling className="text-[#d7be83]" size={22} /><p className="mt-5 text-xs font-semibold uppercase text-[#a7d6ca]">Current terms</p><p className="mt-2 text-3xl font-semibold">{employee.payBasis === "unpaid" ? "Unpaid role" : money(employee.basePayMinor ?? 0, employee.currency)}</p><p className="mt-2 text-sm capitalize text-white/55">{words(employee.payBasis)} · {words(employee.employmentType)}</p><dl className="mt-6 space-y-4 border-t border-white/10 pt-5"><Definition label="Weekly hours" value={`${employee.weeklyHours ?? 0}h`} inverse /><Definition label="Start date" value={employee.startDate ? formatDate(employee.startDate) : "Not set"} inverse /><Definition label="Currency" value={employee.currency} inverse /></dl></section><section className="rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 p-5"><p className="text-xs font-semibold uppercase text-[#8a6b2f]">Commission ledger rules</p><h2 className="mt-1 text-xl font-semibold">Active earning plans</h2><p className="mt-1 text-sm text-black/45">Rules shown here are the approved basis for calculation. Payment evidence remains in Finance.</p></header>{employee.commissionRules.filter(rule => rule.status === "active").map(rule => <div key={rule.id} className="grid gap-4 border-b border-black/10 p-5 last:border-0 sm:grid-cols-[1fr_auto_auto]"><div><p className="font-semibold">{rule.label}</p><p className="mt-1 text-sm text-black/45 capitalize">{words(rule.basis)} · {words(rule.cadence)}</p></div><div><p className="text-xs font-semibold uppercase text-black/35">Rate</p><p className="mt-1 font-semibold">{rule.ratePercent !== undefined ? `${rule.ratePercent}%` : money(rule.fixedAmountMinor ?? 0, employee.currency)}</p></div><span className="h-fit rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Active</span></div>)}{employee.commissionRules.filter(rule => rule.status === "active").length === 0 ? <p className="p-8 text-center text-sm text-black/40">No active commission plan is assigned.</p> : null}</section></div>; }

function Notes({ initial, editable }: { initial: TeamData; editable: boolean }) {
  const router = useRouter(); const [notes, setNotes] = useState(initial.notes); const [selectedId, setSelectedId] = useState(initial.notes[0]?.id ?? ""); const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const selected = notes.find(note => note.id === selectedId);
  async function create() {
    setBusy("create"); setError("");
    try {
      const result = await checkedJsonMutation<{ ok?: boolean; note?: NotepadNote }>("/api/portal/notepad", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create-note", title: "Work note" }) }, {
        fallback: "The note could not be created.",
        validate: value => value.ok === true && Boolean(value.note),
      });
      setNotes(current => [result.note!, ...current]); setSelectedId(result.note!.id);
    } catch (cause) { setError(mutationErrorMessage(cause, "The note could not be created.")); }
    finally { setBusy(""); }
  }
  async function save() {
    if (!selected) return; setBusy("save"); setError("");
    try {
      await checkedJsonMutation<{ ok?: boolean; note?: NotepadNote }>("/api/portal/notepad", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update-note", noteId: selected.id, title: selected.title, body: selected.body, tags: selected.tags, pinned: selected.pinned, status: selected.status }) }, {
        fallback: "The note could not be saved.",
        validate: value => value.ok === true && Boolean(value.note),
      });
      router.refresh();
    } catch (cause) { setError(mutationErrorMessage(cause, "The note could not be saved.")); }
    finally { setBusy(""); }
  }
  return <div className="grid min-h-[36rem] overflow-hidden rounded-lg border border-black/10 bg-white lg:grid-cols-[18rem_minmax(0,1fr)]"><aside className="border-b border-black/10 bg-[#f7f7f3] p-3 lg:border-b-0 lg:border-r"><div className="flex items-center justify-between px-2 py-2"><h2 className="text-sm font-semibold">Private work notes</h2>{editable ? <button disabled={busy === "create"} onClick={create} aria-label="New work note" className="inline-flex size-8 items-center justify-center rounded-md bg-black text-white"><Plus size={15} aria-hidden /></button> : null}</div><div className="mt-2 space-y-1">{notes.filter(note => note.status === "active").map(note => <button key={note.id} onClick={() => setSelectedId(note.id)} className={`w-full rounded-md px-3 py-3 text-left ${note.id === selectedId ? "bg-white shadow-sm" : "hover:bg-white/60"}`}><p className="truncate text-sm font-semibold">{note.title}</p><p className="mt-1 truncate text-xs text-black/40">{note.body || "Empty note"}</p></button>)}</div></aside><section className="p-5">{error ? <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}{selected ? <div className="flex h-full flex-col"><input value={selected.title} disabled={!editable} onChange={event => setNotes(current => current.map(note => note.id === selected.id ? { ...note, title: event.target.value } : note))} aria-label="Note title" className="w-full border-0 bg-transparent text-2xl font-semibold outline-none" /><textarea value={selected.body} disabled={!editable} onChange={event => setNotes(current => current.map(note => note.id === selected.id ? { ...note, body: event.target.value } : note))} aria-label="Note body" placeholder="Capture context, ideas, handover notes or the reasoning behind a decision." className="mt-5 min-h-80 flex-1 resize-none rounded-md border border-black/10 bg-[#fcfcfa] p-4 text-sm leading-7 outline-none" />{editable ? <button disabled={busy === "save"} onClick={save} className="mt-4 min-h-10 self-end rounded-md bg-black px-4 text-sm font-semibold text-white">{busy === "save" ? "Saving…" : "Save note"}</button> : null}</div> : <EmptyState icon={NotebookPen} title="No work notes" detail="Create a private note for context that should stay with your employee workspace." />}</section></div>;
}

function Progression({ initial, editable }: { initial: TeamData; editable: boolean }) {
  const router = useRouter();
  const employee = initial.people.employee;
  const { company, sops, recognitions, feedback, contracts } = initial.progression;
  const [busy, setBusy] = useState(false);
  const [sentiment, setSentiment] = useState<"positive" | "idea" | "concern">("idea");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const eotm = recognitions.filter(item => item.kind === "employee-of-month").length;
  const shoutouts = recognitions.filter(item => item.kind === "shoutout").length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = new FormData(event.currentTarget).get("message");
    if (!message) return;
    const form = event.currentTarget;
    setBusy(true); setSent(false); setError("");
    try {
      await checkedJsonMutation<{ ok?: boolean }>("/api/portal/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "submit-feedback", message, sentiment }) }, {
        fallback: "Your message could not be sent.",
        validate: value => value.ok === true,
      });
      form.reset(); setSent(true); router.refresh();
    } catch (cause) { setError(mutationErrorMessage(cause, "Your message could not be sent.")); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        <div className="flex flex-col gap-4 bg-[#112f29] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase text-[#a7d6ca]">Your place on the team</p>
            <h2 className="mt-2 text-2xl font-semibold">{employee.title}{employee.department ? ` · ${employee.department}` : ""}</h2>
            <p className="mt-1 text-sm text-white/60">{tenure(employee.startDate)} · {words(employee.employmentType)}</p>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs font-semibold"><Award size={15} className="text-[#d7be83]" /> {eotm} EOTM · {shoutouts} shoutouts</span>
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
          <div className="rounded-lg border border-[#b89755]/30 bg-[#fcf8ee] p-5">
            <Rocket className="text-[#876a32]" size={20} />
            <h3 className="mt-3 font-semibold">Your growth path</h3>
            {employee.targetRole || employee.growthPathNote ? (
              <div className="mt-2 space-y-2">
                {employee.targetRole ? <p className="text-sm"><span className="font-semibold">Growing toward:</span> {employee.targetRole}</p> : null}
                {employee.growthPathNote ? <p className="text-sm leading-6 text-black/60">{employee.growthPathNote}</p> : null}
              </div>
            ) : <p className="mt-2 text-sm text-black/50">Your growth path hasn’t been set yet — ask your manager where this role can take you.</p>}
          </div>
          <div className="rounded-lg border border-black/10 p-5">
            <Sparkles className="text-emerald-800" size={20} />
            <h3 className="mt-3 font-semibold">Recognition you’ve earned</h3>
            {recognitions.length ? (
              <ul className="mt-3 space-y-2">{recognitions.slice(0, 4).map(item => <li key={item.id} className="flex items-start gap-2 text-sm"><span className={`mt-1 inline-block size-2 shrink-0 rounded-full ${item.kind === "employee-of-month" ? "bg-[#8a6b2f]" : "bg-emerald-500"}`} /><span>{item.kind === "employee-of-month" ? "Employee of the month" : "Shoutout"}{item.note ? <span className="text-black/55"> — {item.note}</span> : null}</span></li>)}</ul>
            ) : <p className="mt-2 text-sm text-black/50">No recognition yet — keep doing great work.</p>}
          </div>
        </div>
      </section>

      <MyContracts contracts={contracts} editable={editable} />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <section className="rounded-lg border border-black/10 bg-white p-5">
            <Building2 className="text-emerald-800" size={20} />
            <h3 className="mt-3 text-lg font-semibold">Our mission</h3>
            {company.mission ? <p className="mt-2 text-sm leading-7 text-black/70">{company.mission}</p> : <p className="mt-2 text-sm text-black/45">The mission hasn’t been written yet.</p>}
            {company.vision ? <><h4 className="mt-5 text-xs font-semibold uppercase text-black/40">Where we’re heading</h4><p className="mt-1 text-sm leading-7 text-black/65">{company.vision}</p></> : null}
            {company.values.length ? <div className="mt-5"><h4 className="text-xs font-semibold uppercase text-black/40">What we value</h4><div className="mt-2 flex flex-wrap gap-2">{company.values.map(value => <span key={value} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">{value}</span>)}</div></div> : null}
          </section>
          <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
            <header className="flex items-center gap-2 border-b border-black/10 p-4"><BookOpenCheck className="text-emerald-800" size={18} /><h3 className="font-semibold">How we do things — SOPs</h3></header>
            <div className="divide-y divide-black/10">
              {sops.length ? sops.slice(0, 12).map(sop => <a key={sop.id} href={`/portal/team/training`} className="flex items-center justify-between gap-3 p-4 hover:bg-[#f7faf8]"><div><p className="font-medium">{sop.title}</p>{sop.category ? <p className="mt-0.5 text-xs text-black/40 capitalize">{sop.category}</p> : null}</div><span className="rounded-md bg-black/5 px-2 py-1 text-[10px] font-semibold uppercase text-black/50">{sop.resourceType || "procedure"}</span></a>) : <p className="p-6 text-center text-sm text-black/45">No SOPs published yet.</p>}
            </div>
          </section>
        </div>
        <section className="h-fit rounded-lg border border-black/10 bg-white p-5">
          <div className="flex items-center gap-2"><Send className="text-emerald-800" size={18} /><h3 className="font-semibold">Talk to the founder</h3></div>
          <p className="mt-1 text-sm text-black/50">Send an idea, a bit of praise, or something on your mind. It goes straight to Ed.</p>
          {editable ? (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div className="flex gap-2">{(["positive", "idea", "concern"] as const).map(value => <button type="button" key={value} onClick={() => setSentiment(value)} className={`min-h-9 flex-1 rounded-md border px-2 text-xs font-semibold capitalize ${sentiment === value ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-black/10 text-black/55"}`}>{value === "positive" ? "Praise" : value}</button>)}</div>
              <textarea name="message" required rows={4} aria-label="Your message to the founder" placeholder="What would you like to share?" className="w-full rounded-md border border-black/15 p-3 text-sm" />
              <button disabled={busy} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#153a32] text-sm font-semibold text-white">{busy ? <LoaderCircle className="animate-spin" size={15} /> : <Send size={15} />} Send to Ed</button>
              {error ? <p role="alert" className="text-center text-xs font-semibold text-red-700">{error}</p> : null}
              {sent ? <p className="text-center text-xs font-semibold text-emerald-700">Thank you — that’s been sent.</p> : null}
            </form>
          ) : <p className="mt-4 text-sm text-black/45">This station is view-only for you.</p>}
          {feedback.length ? (
            <div className="mt-5 border-t border-black/10 pt-4">
              <h4 className="text-xs font-semibold uppercase text-black/40">Your recent messages</h4>
              <ul className="mt-2 space-y-2">{feedback.slice(0, 4).map(item => <li key={item.id} className="rounded-md bg-[#f7f7f3] p-3 text-sm"><p className="line-clamp-2 text-black/70">{item.message}</p><p className="mt-1 text-xs text-black/40">{formatDate(item.createdAt)} · {item.status === "actioned" ? "Actioned" : item.status === "read" ? "Read" : "Sent"}</p></li>)}</ul>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function MyContracts({ contracts, editable }: { contracts: PeopleContract[]; editable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [openId, setOpenId] = useState("");
  const [error, setError] = useState("");
  const pending = contracts.filter(contract => contract.status === "sent");
  if (!contracts.length) return null;
  async function respond(contractId: string, decline: boolean, name: string) {
    setBusy(contractId); setError("");
    try {
      await checkedJsonMutation<{ ok?: boolean }>("/api/portal/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "acknowledge-contract", contractId, name, decline }) }, {
        fallback: "Your contract response could not be saved.",
        validate: value => value.ok === true,
      });
      setOpenId(""); router.refresh();
    } catch (cause) { setError(mutationErrorMessage(cause, "Your contract response could not be saved.")); }
    finally { setBusy(""); }
  }
  return (
    <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
      <header className="flex items-center gap-2 border-b border-black/10 p-4"><FileSignature className="text-emerald-800" size={18} /><h3 className="font-semibold">Your contracts</h3>{pending.length ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">{pending.length} to sign</span> : null}</header>
      {error ? <p role="alert" className="m-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="divide-y divide-black/10">
        {contracts.map(contract => (
          <div key={contract.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-semibold">{contract.title}</p><p className="mt-0.5 text-xs capitalize text-black/45">{contract.kind === "nda" ? "NDA" : contract.kind}</p></div>
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${contract.status === "acknowledged" ? "bg-emerald-50 text-emerald-800" : contract.status === "sent" ? "bg-amber-50 text-amber-800" : contract.status === "declined" ? "bg-red-50 text-red-700" : "bg-black/5 text-black/50"}`}>{contract.status === "acknowledged" ? "Signed" : contract.status === "sent" ? "Please sign" : contract.status}</span>
            </div>
            {contract.body ? <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-[#fafaf7] p-3 text-sm leading-6 text-black/65">{contract.body}</p> : null}
            {contract.status === "sent" && editable ? (
              openId === contract.id ? (
                <form onSubmit={event => { event.preventDefault(); const name = new FormData(event.currentTarget).get("name"); if (name) void respond(contract.id, false, String(name)); }} className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input name="name" required aria-label="Type your full name to sign" placeholder="Type your full name to sign" className="min-h-10 min-w-0 flex-1 rounded-md border border-black/15 px-3 text-sm" />
                  <button disabled={busy === contract.id} className="min-h-10 rounded-md bg-[#153a32] px-4 text-sm font-semibold text-white">Acknowledge &amp; sign</button>
                  <button type="button" onClick={() => respond(contract.id, true, "")} disabled={busy === contract.id} className="min-h-10 rounded-md border border-black/10 px-4 text-sm font-semibold text-black/60">Decline</button>
                </form>
              ) : <button onClick={() => setOpenId(contract.id)} className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-md bg-[#153a32] px-3 text-sm font-semibold text-white"><Check size={14} /> Review &amp; sign</button>
            ) : contract.status === "acknowledged" ? <p className="mt-2 text-xs text-emerald-700">Signed as {contract.acknowledgementName} on {formatDate(contract.acknowledgedAt ?? contract.updatedAt)}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function tenure(startDate?: number) {
  if (!startDate) return "Start date not set";
  const months = Math.max(0, Math.floor((Date.now() - startDate) / (30 * 24 * 60 * 60 * 1000)));
  if (months < 1) return "New this month";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} in`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return `${years}y${rem ? ` ${rem}m` : ""} in`;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock3 }) { return <div className="bg-white p-4"><Icon size={16} className="text-emerald-800" /><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs font-semibold uppercase text-black/40">{label}</p></div>; }
function Definition({ label, value, inverse = false }: { label: string; value: string; inverse?: boolean }) { return <div><dt className={`text-xs font-semibold uppercase ${inverse ? "text-white/40" : "text-black/35"}`}>{label}</dt><dd className={`mt-1 font-semibold ${inverse ? "text-white" : "text-black/80"}`}>{value}</dd></div>; }
function InputField(props: { name: string; label: string; type?: string; required?: boolean }) { return <label className="block text-xs font-semibold text-black/45"><span className="mb-1.5 block">{props.label}</span><input name={props.name} type={props.type} required={props.required} className="min-h-10 w-full rounded-md border border-black/15 px-3 text-sm font-normal text-black" /></label>; }
function SelectField({ name, label, options }: { name: string; label: string; options: string[] }) { return <label className="block text-xs font-semibold text-black/45"><span className="mb-1.5 block">{label}</span><select name={name} className="min-h-10 w-full rounded-md border border-black/15 px-3 text-sm font-normal capitalize text-black">{options.map(option => <option key={option} value={option}>{words(option)}</option>)}</select></label>; }
function EmptyState({ icon: Icon, title, detail }: { icon: typeof NotebookPen; title: string; detail: string }) { return <div className="grid min-h-64 place-items-center text-center"><div><Icon className="mx-auto text-black/25" size={24} /><p className="mt-3 font-semibold">{title}</p><p className="mx-auto mt-1 max-w-md text-sm text-black/45">{detail}</p></div></div>; }
function isoDay(value: number) { const date = new Date(timestampFromValue(value) ?? Date.now()); const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function formatLongDay(date: string) { return formatUkDate(`${date}T12:00:00`, { weekday: "long", day: "numeric", month: "long" }); }
function formatDate(value: number) { return formatUkDate(value, { dateStyle: "medium" }); }
function time(value: number) { return formatUkDate(value, { timeStyle: "short" }); }
function words(value: string) { return value.replaceAll("-", " "); }
function money(value: number, currency: string) { return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value / 100); }
