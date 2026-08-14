"use client";

import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  BadgePoundSterling,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileText,
  GripVertical,
  LoaderCircle,
  Plus,
  Route,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import type {
  PeopleApplication,
  PeopleApplicationStage,
  PeopleCommissionRule,
  PeopleEmployee,
  PeopleLeaveRequest,
  PeopleShift,
  PeopleTrainingAssignment,
  PeopleWorkspaceAccess,
  PeopleWorkspaceStationId,
} from "@/server/types";

type Station = { id: PeopleWorkspaceStationId; label: string; description: string; href: string; mandatory?: boolean };
type Snapshot = {
  applications: PeopleApplication[];
  employees: PeopleEmployee[];
  leaveRequests: PeopleLeaveRequest[];
  shifts: PeopleShift[];
  training: PeopleTrainingAssignment[];
  stations: readonly Station[];
};

type Tab = "overview" | "candidates" | "team" | "access" | "time" | "development" | "rewards";
const TABS: Array<{ id: Tab; label: string; icon: typeof UsersRound }> = [
  { id: "overview", label: "Overview", icon: UsersRound },
  { id: "candidates", label: "Recruitment", icon: Route },
  { id: "team", label: "Team", icon: BriefcaseBusiness },
  { id: "access", label: "Access", icon: ShieldCheck },
  { id: "time", label: "Time & leave", icon: CalendarDays },
  { id: "development", label: "Onboarding", icon: ClipboardCheck },
  { id: "rewards", label: "Pay & commission", icon: BadgePoundSterling },
];

const STAGES: PeopleApplicationStage[] = ["applied", "under-review", "interview", "shortlisted", "offer", "accepted", "onboarding", "declined", "withdrawn"];
const STAGE_LABEL: Record<PeopleApplicationStage, string> = {
  applied: "Applied", "under-review": "Under review", interview: "Interview", shortlisted: "Shortlisted", offer: "Offer", accepted: "Accepted", onboarding: "Onboarding", declined: "Declined", withdrawn: "Withdrawn",
};

function requestedTab(view: string | null, applicationId: string | null, employeeId: string | null): Tab {
  if (applicationId) return "candidates";
  if (employeeId) return "team";
  return TABS.some(item => item.id === view) ? (view as Tab) : "overview";
}

export function PeopleCommand({ initial }: { initial: Snapshot }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("application");
  const employeeId = searchParams.get("employee");
  const [tab, setTab] = useState<Tab>(() => requestedTab(searchParams.get("view"), applicationId, employeeId));
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employeeId ?? initial.employees[0]?.id ?? "");

  useEffect(() => {
    setTab(requestedTab(searchParams.get("view"), applicationId, employeeId));
    if (employeeId) setSelectedEmployeeId(employeeId);
    const targetId = applicationId ? `application-${applicationId}` : employeeId ? `employee-${employeeId}` : "";
    if (!targetId) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      const details = target instanceof HTMLDetailsElement ? target : target?.querySelector("details");
      if (details instanceof HTMLDetailsElement) details.open = true;
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [applicationId, employeeId, searchParams]);

  function openTab(nextTab: Tab) {
    setTab(nextTab);
    router.replace(`/portal/agency/people?view=${nextTab}`, { scroll: false });
  }

  async function action(name: string, payload: Record<string, unknown>) {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/portal/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: name, ...payload }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; statusUrl?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "People could not be updated.");
      if (result.statusUrl) {
        await navigator.clipboard.writeText(result.statusUrl);
        setNotice("A fresh private status link was copied.");
      } else {
        setNotice("People records updated.");
      }
      router.refresh();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "People could not be updated.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const activeEmployees = initial.employees.filter(employee => employee.status !== "alumni");
  const openApplications = initial.applications.filter(application => !["declined", "withdrawn", "onboarding"].includes(application.stage));
  const pendingLeave = initial.leaveRequests.filter(request => request.status === "pending");
  const onboardingOpen = initial.employees.reduce((sum, employee) => sum + employee.onboardingItems.filter(item => item.status !== "done").length, 0);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <header className="flex flex-col justify-between gap-4 border-b border-black/10 pb-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-800">People command</p>
          <h1 className="mt-1 text-3xl font-semibold text-black/90">From application to excellent work.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">One retained identity for candidates, employees, contractors and commission partners. Access is curated per person and every change stays attributable.</p>
        </div>
        <a href="/careers" target="_blank" rel="noreferrer" className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-black/75 shadow-sm hover:bg-black/[0.03]">View application portal <ExternalLink size={15} /></a>
      </header>

      <nav aria-label="People views" className="flex gap-1 overflow-x-auto border-b border-black/10">
        {TABS.map(item => <button key={item.id} onClick={() => openTab(item.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium ${tab === item.id ? "border-emerald-800 text-emerald-900" : "border-transparent text-black/50 hover:text-black/80"}`}><item.icon size={16} />{item.label}</button>)}
      </nav>

      {notice ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p> : null}

      {tab === "overview" ? <Overview applications={initial.applications} employees={activeEmployees} pendingLeave={pendingLeave.length} onboardingOpen={onboardingOpen} onOpen={openTab} /> : null}
      {tab === "candidates" ? <Candidates applications={initial.applications} focusedApplicationId={applicationId} busy={busy} action={action} /> : null}
      {tab === "team" ? <Team employees={initial.employees} focusedEmployeeId={employeeId} busy={busy} action={action} /> : null}
      {tab === "access" ? <AccessComposer employees={initial.employees} stations={initial.stations} selectedEmployeeId={selectedEmployeeId} setSelectedEmployeeId={setSelectedEmployeeId} busy={busy} action={action} /> : null}
      {tab === "time" ? <TimeAndLeave employees={initial.employees} requests={initial.leaveRequests} shifts={initial.shifts} busy={busy} action={action} /> : null}
      {tab === "development" ? <Development employees={initial.employees} training={initial.training} busy={busy} action={action} /> : null}
      {tab === "rewards" ? <Rewards employees={initial.employees} selectedEmployeeId={selectedEmployeeId} setSelectedEmployeeId={setSelectedEmployeeId} busy={busy} action={action} /> : null}
    </div>
  );
}

function Overview({ applications, employees, pendingLeave, onboardingOpen, onOpen }: { applications: PeopleApplication[]; employees: PeopleEmployee[]; pendingLeave: number; onboardingOpen: number; onOpen: (tab: Tab) => void }) {
  const metrics = [
    { label: "Active people", value: employees.length, detail: `${employees.filter(employee => Boolean(employee.userId)).length} portal accounts`, tab: "team" as Tab, icon: UsersRound },
    { label: "Candidates live", value: applications.filter(item => !["declined", "withdrawn", "onboarding"].includes(item.stage)).length, detail: `${applications.filter(item => item.stage === "under-review").length} under review`, tab: "candidates" as Tab, icon: Route },
    { label: "Onboarding steps", value: onboardingOpen, detail: "remaining across team", tab: "development" as Tab, icon: ClipboardCheck },
    { label: "Leave decisions", value: pendingLeave, detail: "awaiting review", tab: "time" as Tab, icon: CalendarDays },
  ];
  return (
    <div className="space-y-6">
      <section className="grid gap-px overflow-hidden rounded-lg border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => <button key={metric.label} onClick={() => onOpen(metric.tab)} className="min-h-36 bg-white p-5 text-left hover:bg-[#f7faf8]"><metric.icon className="text-emerald-800" size={19} /><span className="mt-5 block text-3xl font-semibold tabular-nums">{metric.value}</span><span className="mt-1 block text-sm font-semibold">{metric.label}</span><span className="mt-1 block text-xs text-black/45">{metric.detail}</span></button>)}
      </section>
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-black/10 bg-white p-5">
          <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-emerald-800">Hiring flow</p><h2 className="mt-1 text-lg font-semibold">Candidate movement</h2></div><button onClick={() => onOpen("candidates")} className="text-sm font-semibold text-emerald-800">Open pipeline</button></div>
          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {(["applied", "under-review", "interview", "offer", "onboarding"] as PeopleApplicationStage[]).map(stage => <div key={stage} className="border-l-2 border-black/10 pl-3"><p className="text-2xl font-semibold">{applications.filter(item => item.stage === stage).length}</p><p className="mt-1 text-xs text-black/45">{STAGE_LABEL[stage]}</p></div>)}
          </div>
        </div>
        <div className="rounded-lg border border-[#bda169]/35 bg-[#fbf8ef] p-5">
          <Sparkles className="text-[#8a6b2f]" size={20} /><h2 className="mt-4 text-lg font-semibold">Premium outside, controlled inside.</h2><p className="mt-2 text-sm leading-6 text-black/55">Candidates receive a calm status experience. Staff receive only the exact working stations you compose. Pay, leave and sensitive records never leak into general task views.</p>
        </div>
      </section>
    </div>
  );
}

function Candidates({ applications, focusedApplicationId, busy, action }: { applications: PeopleApplication[]; focusedApplicationId: string | null; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  return <section className="space-y-3">{applications.length ? applications.map(application => <CandidateRow key={application.id} application={application} focused={focusedApplicationId === application.id} busy={busy} action={action} />) : <Empty title="No applications yet" detail="Share the public careers portal when you are ready to recruit." />}</section>;
}

function CandidateRow({ application, focused, busy, action }: { application: PeopleApplication; focused: boolean; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  const [stage, setStage] = useState(application.stage);
  return (
    <details id={`application-${application.id}`} className="group scroll-mt-24 rounded-lg border border-black/10 bg-white" open={focused || application.stage === "applied" || application.stage === "under-review"}>
      <summary className="flex cursor-pointer list-none flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#153a32] text-sm font-semibold text-white">{initials(application.name)}</span>
        <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{application.name}</span><span className="mt-0.5 block truncate text-sm text-black/45">{application.roleInterest} · {application.email}</span></span>
        <span className={`w-fit rounded-md px-2.5 py-1 text-xs font-semibold ${application.stage === "declined" || application.stage === "withdrawn" ? "bg-black/5 text-black/50" : "bg-emerald-50 text-emerald-800"}`}>{STAGE_LABEL[application.stage]}</span>
        <ChevronRight className="text-black/35 transition group-open:rotate-90" size={17} />
      </summary>
      <div className="grid gap-6 border-t border-black/10 p-5 lg:grid-cols-[1fr_22rem]">
        <div>
          <p className="text-sm leading-6 text-black/65">{application.coverNote || "No cover note supplied."}</p>
          <dl className="mt-5 grid gap-4 border-t border-black/10 pt-4 sm:grid-cols-3"><Meta label="Location" value={application.location || "Not supplied"} /><Meta label="Arrangement" value={application.employmentPreference?.replaceAll("-", " ") || "Open"} /><Meta label="Applied" value={formatDate(application.submittedAt)} /></dl>
          <div className="mt-5 flex flex-wrap gap-2"><a href={`/api/portal/people/cv?applicationId=${application.id}`} target="_blank" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-semibold"><FileText size={15} /> Open CV</a>{application.portfolioUrl ? <a href={application.portfolioUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-semibold">Portfolio <ExternalLink size={14} /></a> : null}<button onClick={() => action("rotate-status-link", { applicationId: application.id })} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-semibold"><Copy size={14} /> Copy fresh status link</button></div>
        </div>
        <div className="space-y-4 rounded-md bg-[#f7f7f3] p-4">
          <label className="block text-xs font-semibold uppercase text-black/45">Decision stage<select value={stage} onChange={event => setStage(event.target.value as PeopleApplicationStage)} className="mt-2 min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm normal-case text-black">{STAGES.map(item => <option key={item} value={item}>{STAGE_LABEL[item]}</option>)}</select></label>
          <textarea id={`note-${application.id}`} rows={3} placeholder="Optional note visible in retained history" className="w-full rounded-md border border-black/15 bg-white p-3 text-sm" />
          <button onClick={() => action("update-application", { applicationId: application.id, stage, note: (document.getElementById(`note-${application.id}`) as HTMLTextAreaElement | null)?.value })} disabled={busy === "update-application"} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><Check size={15} /> Save decision</button>
          {!application.employeeId && ["offer", "accepted"].includes(application.stage) ? <HireCandidate application={application} busy={busy} action={action} /> : null}
        </div>
      </div>
    </details>
  );
}

function HireCandidate({ application, busy, action }: { application: PeopleApplication; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await action("hire-candidate", { applicationId: application.id, ...data, startDate: data.startDate ? new Date(`${data.startDate}T09:00:00`).getTime() : undefined });
  }
  return <details className="border-t border-black/10 pt-3"><summary className="cursor-pointer text-sm font-semibold text-emerald-800">Create employee workspace</summary><form onSubmit={submit} className="mt-3 space-y-3"><input name="title" required defaultValue={application.roleInterest} placeholder="Job title" className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm" /><input name="department" placeholder="Department" className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm" /><select name="employmentType" defaultValue={application.employmentPreference || "full-time"} className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm"><option value="full-time">Full time</option><option value="part-time">Part time</option><option value="contractor">Contractor</option><option value="freelancer">Freelancer</option><option value="intern">Intern</option><option value="volunteer">Volunteer</option></select><input name="startDate" type="date" className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm" /><input name="temporaryPassword" type="password" minLength={12} required placeholder="Temporary password (12+ characters)" className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm" /><button disabled={busy === "hire-candidate"} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white">{busy === "hire-candidate" ? <LoaderCircle className="animate-spin" size={15} /> : <UserRoundCheck size={15} />} Hire and provision</button></form></details>;
}

function Team({ employees, focusedEmployeeId, busy, action }: { employees: PeopleEmployee[]; focusedEmployeeId: string | null; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]"><section className="space-y-3">{employees.length ? employees.map(employee => <div id={`employee-${employee.id}`} className={`scroll-mt-24 rounded-lg ${focusedEmployeeId === employee.id ? "ring-2 ring-emerald-600/35" : ""}`} key={employee.id}><EmployeeRow employee={employee} busy={busy} action={action} /></div>) : <Empty title="No team records" detail="Create an employee directly or hire a candidate." />}</section><DirectEmployee busy={busy} action={action} /></div>;
}

function EmployeeRow({ employee, busy, action }: { employee: PeopleEmployee; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); await action("update-employee", { employeeId: employee.id, ...data, startDate: data.startDate ? new Date(`${data.startDate}T09:00:00`).getTime() : undefined, basePayMinor: Math.round(Number(data.basePay || 0) * 100) }); }
  return <details className="rounded-lg border border-black/10 bg-white"><summary className="flex cursor-pointer list-none items-center gap-3 p-4"><span className="inline-flex size-10 items-center justify-center rounded-full bg-black text-sm font-semibold text-white">{initials(employee.name)}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{employee.name}</span><span className="text-sm text-black/45">{employee.title} · {employee.department || "No department"}</span></span>{employee.userId ? <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Portal active</span> : <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">Portal pending</span>}<span className="rounded-md bg-black/5 px-2 py-1 text-xs font-semibold capitalize">{employee.status}</span><ChevronRight className="transition group-open:rotate-90" size={16} /></summary><form onSubmit={submit} className="grid gap-4 border-t border-black/10 p-4 sm:grid-cols-2"><Input name="name" label="Name" defaultValue={employee.name} /><Input name="email" label="Email" type="email" defaultValue={employee.email} /><Input name="title" label="Title" defaultValue={employee.title} /><Input name="department" label="Department" defaultValue={employee.department} /><Select name="employmentType" label="Employment" defaultValue={employee.employmentType} options={["full-time", "part-time", "contractor", "freelancer", "intern", "volunteer"]} /><Select name="status" label="Status" defaultValue={employee.status} options={["preboarding", "active", "leave", "suspended", "alumni"]} /><Input name="weeklyHours" label="Weekly hours" type="number" step="0.5" defaultValue={employee.weeklyHours} /><Input name="holidayAllowanceDays" label="Holiday allowance" type="number" step="0.5" defaultValue={employee.holidayAllowanceDays} /><Select name="payBasis" label="Pay basis" defaultValue={employee.payBasis} options={["salary", "hourly", "day-rate", "commission-only", "unpaid"]} /><Input name="basePay" label="Base pay" type="number" step="0.01" defaultValue={(employee.basePayMinor ?? 0) / 100} /><Input name="currency" label="Currency" defaultValue={employee.currency} maxLength={3} /><Input name="startDate" label="Start date" type="date" defaultValue={employee.startDate ? isoDay(employee.startDate) : ""} /><button disabled={busy === "update-employee"} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white sm:col-span-2">Save employee record</button></form>{!employee.userId ? <ProvisionEmployee employee={employee} busy={busy} action={action} /> : null}</details>;
}

function ProvisionEmployee({ employee, busy, action }: { employee: PeopleEmployee; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const temporaryPassword = new FormData(event.currentTarget).get("temporaryPassword"); await action("provision-employee", { employeeId: employee.id, temporaryPassword }); }
  return <form onSubmit={submit} className="flex flex-col gap-3 border-t border-black/10 bg-[#f7f7f3] p-4 sm:flex-row sm:items-end"><div className="flex-1"><p className="text-sm font-semibold">Provision employee portal</p><p className="mt-1 text-xs text-black/45">Creates a staff login and requires a password change on first use.</p></div><Input name="temporaryPassword" label="Temporary password" type="password" required /><button disabled={busy === "provision-employee"} className="min-h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white">Activate portal</button></form>;
}

function DirectEmployee({ busy, action }: { busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await action("create-employee", Object.fromEntries(new FormData(event.currentTarget))); event.currentTarget.reset(); }
  return <form onSubmit={submit} className="h-fit rounded-lg border border-black/10 bg-white p-5"><Plus className="text-emerald-800" size={19} /><h2 className="mt-3 text-lg font-semibold">Add someone directly</h2><p className="mt-1 text-sm leading-6 text-black/50">Useful for contractors, freelancers and internal records that do not begin with a public application.</p><div className="mt-5 space-y-3"><Input name="name" label="Name" required /><Input name="email" label="Email" type="email" required /><Input name="title" label="Title" required /><Input name="department" label="Department" /><Select name="employmentType" label="Employment" defaultValue="contractor" options={["full-time", "part-time", "contractor", "freelancer", "intern", "volunteer"]} /><button disabled={busy === "create-employee"} className="min-h-10 w-full rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white">Create People record</button></div></form>;
}

function AccessComposer({ employees, stations, selectedEmployeeId, setSelectedEmployeeId, busy, action }: { employees: PeopleEmployee[]; stations: readonly Station[]; selectedEmployeeId: string; setSelectedEmployeeId: (id: string) => void; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  const employee = employees.find(item => item.id === selectedEmployeeId) ?? employees[0];
  const [access, setAccess] = useState<PeopleWorkspaceAccess[]>(employee?.workspaceAccess ?? []);
  const [dragged, setDragged] = useState<PeopleWorkspaceStationId | null>(null);
  function choose(id: string) { const next = employees.find(item => item.id === id); setSelectedEmployeeId(id); setAccess(next?.workspaceAccess ?? []); }
  function toggle(stationId: PeopleWorkspaceStationId) { setAccess(current => current.some(item => item.stationId === stationId) ? current.filter(item => item.stationId !== stationId) : [...current, { stationId, mode: "edit", order: current.length }]); }
  function move(stationId: PeopleWorkspaceStationId, direction: -1 | 1) { setAccess(current => { const next = [...current]; const index = next.findIndex(item => item.stationId === stationId); const target = index + direction; if (index < 0 || target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next.map((item, order) => ({ ...item, order })); }); }
  function drop(targetId: PeopleWorkspaceStationId, event: DragEvent) { event.preventDefault(); if (!dragged || dragged === targetId) return; setAccess(current => { const sourceIndex = current.findIndex(item => item.stationId === dragged); const targetIndex = current.findIndex(item => item.stationId === targetId); const next = [...current]; const [item] = next.splice(sourceIndex, 1); next.splice(targetIndex, 0, item); return next.map((entry, order) => ({ ...entry, order })); }); setDragged(null); }
  if (!employee) return <Empty title="No employee selected" detail="Create a team member before composing workspace access." />;
  return <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]"><aside className="rounded-lg border border-black/10 bg-white p-3"><p className="px-2 py-2 text-xs font-semibold uppercase text-black/40">Team member</p>{employees.map(item => <button key={item.id} onClick={() => choose(item.id)} className={`flex min-h-12 w-full items-center gap-3 rounded-md px-2 text-left ${item.id === employee.id ? "bg-emerald-50 text-emerald-900" : "hover:bg-black/[0.03]"}`}><span className="inline-flex size-8 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">{initials(item.name)}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.name}</span><span className="block truncate text-xs opacity-55">{item.title}</span></span></button>)}</aside><section className="rounded-lg border border-black/10 bg-white p-5"><div className="flex flex-col justify-between gap-3 border-b border-black/10 pb-5 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase text-emerald-800">Workspace composer</p><h2 className="mt-1 text-xl font-semibold">{employee.name}'s sidebar</h2><p className="mt-1 text-sm text-black/50">Drag enabled stations into order. View-only protects sensitive records.</p></div><button onClick={() => action("update-access", { employeeId: employee.id, workspaceAccess: access })} disabled={busy === "update-access"} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white">Save access</button></div><div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.2fr]"><div><h3 className="text-sm font-semibold">Station library</h3><div className="mt-3 space-y-2">{stations.map(station => { const enabled = access.some(item => item.stationId === station.id); return <label key={station.id} className="flex cursor-pointer gap-3 rounded-md border border-black/10 p-3 hover:bg-black/[0.02]"><input type="checkbox" checked={enabled} disabled={station.mandatory} onChange={() => toggle(station.id)} className="mt-1" /><span><span className="block text-sm font-semibold">{station.label}</span><span className="mt-1 block text-xs leading-5 text-black/45">{station.description}</span></span></label>; })}</div></div><div><h3 className="text-sm font-semibold">Visible order</h3><div className="mt-3 space-y-2">{access.map((item, index) => { const station = stations.find(value => value.id === item.stationId); if (!station) return null; return <div key={item.stationId} draggable onDragStart={() => setDragged(item.stationId)} onDragOver={event => event.preventDefault()} onDrop={event => drop(item.stationId, event)} className="flex min-h-14 items-center gap-3 rounded-md border border-black/10 bg-[#fafaf7] px-3"><GripVertical className="cursor-grab text-black/30" size={16} /><span className="inline-flex size-7 items-center justify-center rounded-md bg-white text-xs font-semibold shadow-sm">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{station.label}</span><span className="block truncate text-xs text-black/40">{station.href}</span></span><select aria-label={`${station.label} access`} value={item.mode} onChange={event => setAccess(current => current.map(value => value.stationId === item.stationId ? { ...value, mode: event.target.value as "view" | "edit" } : value))} className="min-h-8 rounded-md border border-black/10 bg-white px-2 text-xs"><option value="view">View</option><option value="edit">Edit</option></select><button aria-label={`Move ${station.label} up`} disabled={index === 0} onClick={() => move(item.stationId, -1)} className="inline-flex size-8 items-center justify-center rounded-md border border-black/10 disabled:opacity-25"><ArrowUp size={14} /></button><button aria-label={`Move ${station.label} down`} disabled={index === access.length - 1} onClick={() => move(item.stationId, 1)} className="inline-flex size-8 items-center justify-center rounded-md border border-black/10 disabled:opacity-25"><ArrowDown size={14} /></button></div>; })}</div></div></div></section></div>;
}

function TimeAndLeave({ employees, requests, shifts, busy, action }: { employees: PeopleEmployee[]; requests: PeopleLeaveRequest[]; shifts: PeopleShift[]; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  async function saveShift(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); await action("save-shift", { ...data, startsAt: new Date(String(data.startsAt)).getTime(), endsAt: new Date(String(data.endsAt)).getTime(), status: "published" }); event.currentTarget.reset(); }
  return <div className="grid gap-6 xl:grid-cols-[1fr_22rem]"><div className="space-y-5"><section className="rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 p-4"><h2 className="font-semibold">Leave requests</h2></header>{requests.length ? requests.map(request => { const employee = employees.find(item => item.id === request.employeeId); return <div key={request.id} className="flex flex-col gap-3 border-b border-black/10 p-4 last:border-0 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold">{employee?.name || "Unknown employee"}</p><p className="mt-1 text-sm text-black/50">{request.type} · {request.startsOn} to {request.endsOn} · {request.days} working days</p></div><span className="w-fit rounded-md bg-black/5 px-2 py-1 text-xs font-semibold capitalize">{request.status}</span>{request.status === "pending" ? <div className="flex gap-2"><button onClick={() => action("decide-leave", { requestId: request.id, status: "approved" })} className="min-h-9 rounded-md bg-emerald-800 px-3 text-xs font-semibold text-white">Approve</button><button onClick={() => action("decide-leave", { requestId: request.id, status: "rejected" })} className="min-h-9 rounded-md border border-black/10 px-3 text-xs font-semibold">Reject</button></div> : null}</div>; }) : <div className="p-5 text-sm text-black/45">No leave requests yet.</div>}</section><section className="rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 p-4"><h2 className="font-semibold">Published shifts</h2></header>{shifts.length ? shifts.map(shift => <div key={shift.id} className="flex gap-3 border-b border-black/10 p-4 last:border-0"><CalendarDays className="text-emerald-800" size={17} /><div><p className="font-semibold">{shift.title} · {employees.find(item => item.id === shift.employeeId)?.name}</p><p className="mt-1 text-sm text-black/45">{formatDateTime(shift.startsAt)} to {new Intl.DateTimeFormat("en-GB", { timeStyle: "short" }).format(shift.endsAt)}{shift.location ? ` · ${shift.location}` : ""}</p></div></div>) : <div className="p-5 text-sm text-black/45">No shifts published.</div>}</section></div><form onSubmit={saveShift} className="h-fit rounded-lg border border-black/10 bg-white p-5"><Plus className="text-emerald-800" size={18} /><h2 className="mt-3 text-lg font-semibold">Publish shift</h2><div className="mt-5 space-y-3"><Select name="employeeId" label="Employee" options={employees.map(item => item.id)} labels={Object.fromEntries(employees.map(item => [item.id, item.name]))} /><Input name="title" label="Shift or assignment" required /><Input name="startsAt" label="Starts" type="datetime-local" required /><Input name="endsAt" label="Ends" type="datetime-local" required /><Input name="location" label="Location" /><button disabled={busy === "save-shift"} className="min-h-10 w-full rounded-md bg-black text-sm font-semibold text-white">Publish shift</button></div></form></div>;
}

function Development({ employees, training, busy, action }: { employees: PeopleEmployee[]; training: PeopleTrainingAssignment[]; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? ""); const employee = employees.find(item => item.id === employeeId);
  async function saveTraining(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); await action("save-training", { ...data, employeeId, status: "assigned", dueAt: data.dueAt ? new Date(`${data.dueAt}T18:00:00`).getTime() : undefined }); event.currentTarget.reset(); }
  async function saveChecklist(items: PeopleEmployee["onboardingItems"]) { await action("update-onboarding", { employeeId, onboardingItems: items }); }
  return <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]"><aside className="rounded-lg border border-black/10 bg-white p-3">{employees.map(item => <button key={item.id} onClick={() => setEmployeeId(item.id)} className={`min-h-11 w-full rounded-md px-3 text-left text-sm font-semibold ${employeeId === item.id ? "bg-emerald-50 text-emerald-900" : "hover:bg-black/[0.03]"}`}>{item.name}</button>)}</aside><div className="space-y-6">{employee ? <section className="rounded-lg border border-black/10 bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-emerald-800">Onboarding checklist</p><h2 className="mt-1 text-xl font-semibold">{employee.name}</h2></div><span className="text-sm font-semibold">{employee.onboardingItems.filter(item => item.status === "done").length}/{employee.onboardingItems.length}</span></div><div className="mt-5 divide-y divide-black/10 border-y border-black/10">{employee.onboardingItems.map(item => <label key={item.id} className="flex min-h-14 cursor-pointer items-center gap-3 py-3"><input type="checkbox" checked={item.status === "done"} onChange={() => saveChecklist(employee.onboardingItems.map(value => value.id === item.id ? { ...value, status: value.status === "done" ? "todo" : "done", completedAt: value.status === "done" ? undefined : Date.now() } : value))} /><span className="min-w-0 flex-1"><span className={`block text-sm font-medium ${item.status === "done" ? "text-black/35 line-through" : ""}`}>{item.label}</span><span className="mt-0.5 block text-xs text-black/40">Owned by {item.owner}</span></span></label>)}</div></section> : null}<section className="grid gap-5 xl:grid-cols-[1fr_21rem]"><div className="rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 p-4"><h2 className="font-semibold">Assigned development</h2></header>{training.filter(item => item.employeeId === employeeId).map(item => <div key={item.id} className="border-b border-black/10 p-4 last:border-0"><div className="flex justify-between gap-3"><p className="font-semibold">{item.title}</p><span className="text-xs font-semibold capitalize text-black/45">{item.status.replaceAll("-", " ")}</span></div>{item.description ? <p className="mt-2 text-sm text-black/50">{item.description}</p> : null}</div>)}{training.filter(item => item.employeeId === employeeId).length === 0 ? <p className="p-5 text-sm text-black/45">Nothing assigned yet.</p> : null}</div><form onSubmit={saveTraining} className="rounded-lg border border-black/10 bg-white p-4"><h3 className="font-semibold">Assign training</h3><div className="mt-4 space-y-3"><Input name="title" label="Training" required /><Input name="resourceUrl" label="Resource URL" type="url" /><Input name="dueAt" label="Due date" type="date" /><button disabled={busy === "save-training" || !employeeId} className="min-h-10 w-full rounded-md bg-black text-sm font-semibold text-white">Assign</button></div></form></section></div></div>;
}

function Rewards({ employees, selectedEmployeeId, setSelectedEmployeeId, busy, action }: { employees: PeopleEmployee[]; selectedEmployeeId: string; setSelectedEmployeeId: (id: string) => void; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  const employee = employees.find(item => item.id === selectedEmployeeId) ?? employees[0];
  const [rules, setRules] = useState<PeopleCommissionRule[]>(employee?.commissionRules ?? []);
  function choose(id: string) { setSelectedEmployeeId(id); setRules(employees.find(item => item.id === id)?.commissionRules ?? []); }
  function addRule() { setRules(current => [...current, { id: `commission_${Date.now()}`, label: "New commission plan", basis: "revenue", ratePercent: 10, cadence: "per-event", status: "draft" }]); }
  if (!employee) return <Empty title="No employee selected" detail="Commission rules attach to a retained People record." />;
  return <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]"><aside className="rounded-lg border border-black/10 bg-white p-3">{employees.map(item => <button key={item.id} onClick={() => choose(item.id)} className={`min-h-11 w-full rounded-md px-3 text-left text-sm font-semibold ${employee.id === item.id ? "bg-emerald-50 text-emerald-900" : "hover:bg-black/[0.03]"}`}>{item.name}</button>)}</aside><section className="rounded-lg border border-black/10 bg-white p-5"><div className="flex flex-col justify-between gap-3 border-b border-black/10 pb-5 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase text-[#8a6b2f]">Compensation control</p><h2 className="mt-1 text-xl font-semibold">{employee.name}</h2><p className="mt-1 text-sm text-black/50">{employee.payBasis.replaceAll("-", " ")} · {money(employee.basePayMinor ?? 0, employee.currency)}</p></div><div className="flex gap-2"><button onClick={addRule} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-semibold"><Plus size={15} /> Rule</button><button onClick={() => action("update-commission", { employeeId: employee.id, commissionRules: rules })} disabled={busy === "update-commission"} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white">Save commission</button></div></div><div className="mt-5 space-y-3">{rules.length ? rules.map((rule, index) => <div key={rule.id} className="grid gap-3 rounded-md border border-black/10 bg-[#fafaf7] p-4 sm:grid-cols-2 xl:grid-cols-5"><Input label="Plan" value={rule.label} onChange={value => setRules(current => current.map((item, i) => i === index ? { ...item, label: value } : item))} /><Select label="Basis" value={rule.basis} onChange={value => setRules(current => current.map((item, i) => i === index ? { ...item, basis: value as PeopleCommissionRule["basis"] } : item))} options={["revenue", "gross-margin", "new-client", "product", "fixed-bonus"]} /><Input label="Rate %" type="number" value={rule.ratePercent ?? ""} onChange={value => setRules(current => current.map((item, i) => i === index ? { ...item, ratePercent: Number(value) } : item))} /><Select label="Cadence" value={rule.cadence} onChange={value => setRules(current => current.map((item, i) => i === index ? { ...item, cadence: value as PeopleCommissionRule["cadence"] } : item))} options={["per-event", "monthly", "quarterly"]} /><Select label="Status" value={rule.status} onChange={value => setRules(current => current.map((item, i) => i === index ? { ...item, status: value as PeopleCommissionRule["status"] } : item))} options={["draft", "active", "paused", "retired"]} /></div>) : <Empty title="No commission rules" detail="Add a fixed or percentage rule. Drafts remain invisible to the employee until activated." />}</div></section></div>;
}

function Empty({ title, detail }: { title: string; detail: string }) { return <div className="rounded-lg border border-dashed border-black/15 bg-white p-8 text-center"><Settings2 className="mx-auto text-black/25" size={22} /><p className="mt-3 font-semibold">{title}</p><p className="mx-auto mt-1 max-w-md text-sm text-black/45">{detail}</p></div>; }
function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase text-black/35">{label}</dt><dd className="mt-1 text-sm font-medium capitalize">{value}</dd></div>; }

function Input(props: { label: string; name?: string; type?: string; defaultValue?: string | number; value?: string | number; onChange?: (value: string) => void; required?: boolean; step?: string; maxLength?: number }) { const { label, onChange, ...inputProps } = props; return <label className="block text-xs font-semibold text-black/55"><span className="mb-1.5 block">{label}</span><input {...inputProps} onChange={onChange ? event => onChange(event.target.value) : undefined} className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black" /></label>; }
function Select(props: { label: string; name?: string; options: string[]; labels?: Record<string, string>; defaultValue?: string; value?: string; onChange?: (value: string) => void }) { const { label, options, labels, onChange, ...selectProps } = props; return <label className="block text-xs font-semibold text-black/55"><span className="mb-1.5 block">{label}</span><select {...selectProps} onChange={onChange ? event => onChange(event.target.value) : undefined} className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black">{options.map(option => <option key={option} value={option}>{labels?.[option] ?? option.replaceAll("-", " ")}</option>)}</select></label>; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?"; }
function isoDay(value: number) { return new Date(value).toISOString().slice(0, 10); }
function formatDate(value: number) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(value); }
function formatDateTime(value: number) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(value); }
function money(value: number, currency: string) { return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value / 100); }
