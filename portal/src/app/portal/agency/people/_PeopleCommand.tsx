"use client";

import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Award,
  BadgePoundSterling,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  Copy,
  Crown,
  ExternalLink,
  FileSignature,
  FileText,
  Gauge,
  GraduationCap,
  GripVertical,
  Hammer,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Network,
  NotebookPen,
  Plus,
  Route,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  TriangleAlert,
  UserRound,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";

import type {
  PeopleApplication,
  PeopleApplicationStage,
  PeopleCommissionRule,
  PeopleContract,
  PeopleContractKind,
  PeopleEmployee,
  PeopleHiringStageConfig,
  PeopleLeaveRequest,
  PeopleProcessConfig,
  PeopleShift,
  PeopleTrainingAssignment,
  PeopleTrainingBlock,
  PeopleTrainingModule,
  PeopleTrainingQuizQuestion,
  PeopleWorkspaceAccess,
  PeopleWorkspaceStationId,
} from "@/server/types";
import type { DelegatableTask, StaffCard, StaffDirectoryEntry, StaffOrgChart, StaffOrgNode, StaffPresenceState } from "@/server/people";
import type { StaffCapacitySignal, StaffCapacitySnapshot } from "@/server/staffCapacity";
import { TeamChat } from "@/components/people/TeamChat";
import type { AccessEnvironment } from "@/components/access/accessModel";
import { businessCalendarDate, businessCalendarMonth, dateInputValue, formatUkDate } from "@/lib/shared/formatDateTime";
import type { WorkspaceElementLevel } from "@/lib/server/access/workspaceElementAccess";
import type {
  PeopleWorkspaceProjection,
  StaffOverviewElementDto,
  StaffPayPersonDto,
  StaffPeopleElementDto,
  StaffPersonRef,
  StaffTrainingPersonDto,
} from "@/lib/server/access/peopleWorkspaceProjection";
import { PortalViewportLoading } from "@/components/ui/PortalViewportLoading";

const AccessControlPanel = dynamic(
  () => import("@/components/access/AccessControlPanel").then(module => module.AccessControlPanel),
  { loading: () => <PortalViewportLoading label="Preparing access control…" /> },
);

type Station = { id: PeopleWorkspaceStationId; label: string; description: string; href: string; mandatory?: boolean };
type Snapshot = PeopleWorkspaceProjection;

export type PeopleCommandTab = "overview" | "capacity" | "candidates" | "team" | "org" | "access" | "time" | "development" | "rewards" | "contracts" | "chat";
type Tab = PeopleCommandTab;
const TABS: Array<{ id: Tab; label: string; icon: typeof UsersRound }> = [
  { id: "overview", label: "Overview", icon: UsersRound },
  { id: "capacity", label: "Capacity & hiring", icon: Gauge },
  { id: "candidates", label: "Recruitment", icon: Route },
  { id: "team", label: "Directory", icon: BriefcaseBusiness },
  { id: "org", label: "Org chart", icon: Network },
  { id: "access", label: "Access", icon: ShieldCheck },
  { id: "time", label: "Time & leave", icon: CalendarDays },
  { id: "development", label: "Onboarding", icon: ClipboardCheck },
  { id: "rewards", label: "Pay & commission", icon: BadgePoundSterling },
  { id: "contracts", label: "Contracts", icon: FileSignature },
  { id: "chat", label: "Team chat", icon: MessageSquare },
];

const STAGES: PeopleApplicationStage[] = ["applied", "under-review", "interview", "shortlisted", "offer", "accepted", "onboarding", "declined", "withdrawn"];
const STAGE_LABEL: Record<PeopleApplicationStage, string> = {
  applied: "Applied", "under-review": "Under review", interview: "Interview", shortlisted: "Shortlisted", offer: "Offer", accepted: "Accepted", onboarding: "Onboarding", declined: "Declined", withdrawn: "Withdrawn",
};

function requestedTab(view: string | null, applicationId: string | null, employeeId: string | null, allowed: readonly Tab[]): Tab {
  if (applicationId && allowed.includes("candidates")) return "candidates";
  if (employeeId && allowed.includes("team")) return "team";
  return allowed.includes(view as Tab) ? (view as Tab) : allowed[0] ?? "overview";
}

export function PeopleCommand({ initial, accessLevels, canManageAccess = false, accessEnvironment = "live" }: { initial: Snapshot; accessLevels: Readonly<Record<Tab, WorkspaceElementLevel>>; canManageAccess?: boolean; accessEnvironment?: AccessEnvironment }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("application");
  const employeeId = searchParams.get("employee");
  const visibleTabs = TABS.filter(item => accessLevels[item.id] !== "hidden");
  const allowedTabs = visibleTabs.map(item => item.id);
  const [tab, setTab] = useState<Tab>(() => requestedTab(searchParams.get("view"), applicationId, employeeId, allowedTabs));
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employeeId ?? initial.pay?.people[0]?.id ?? initial.people?.directory[0]?.employeeId ?? "");

  useEffect(() => {
    setTab(requestedTab(searchParams.get("view"), applicationId, employeeId, allowedTabs));
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
    if (!allowedTabs.includes(nextTab)) return;
    setTab(nextTab);
    router.replace(`/portal/agency/people?view=${nextTab}`, { scroll: false });
  }

  function openPerson(entryId: string) {
    setSelectedEmployeeId(entryId);
    setTab("team");
    router.replace(`/portal/agency/people?employee=${entryId}`, { scroll: false });
  }

  async function action(name: string, payload: Record<string, unknown>) {
    if (accessLevels[tab] === "view" || accessLevels[tab] === "hidden") {
      setError("Use access is required to update this workspace element.");
      return null;
    }
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

  const canUseTab = tab === "rewards" || tab === "access"
    ? accessLevels[tab] === "manage"
    : accessLevels[tab] === "use" || accessLevels[tab] === "manage";

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
        {visibleTabs.map(item => <button key={item.id} onClick={() => openTab(item.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium ${tab === item.id ? "border-emerald-800 text-emerald-900" : "border-transparent text-black/50 hover:text-black/80"}`}><item.icon size={16} />{item.label}</button>)}
      </nav>

      {notice ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p> : null}

      {!canUseTab ? <p className="text-xs text-black/45">View-only access. Controls that change People records are disabled.</p> : null}
      <fieldset disabled={!canUseTab} className="contents">
      {tab === "overview" && initial.overview ? <Overview summary={initial.overview} allowedTabs={allowedTabs} onOpen={openTab} /> : null}
      {tab === "capacity" && initial.capacity ? <CapacityCommand capacity={initial.capacity} allowedTabs={allowedTabs} onOpen={openTab} /> : null}
      {tab === "candidates" && initial.people ? <Candidates applications={initial.people.applications} hiringStages={initial.people.hiringStages} focusedApplicationId={applicationId} busy={busy} action={action} /> : null}
      {tab === "team" && initial.people ? <Directory directory={initial.people.directory} cards={initial.people.cards} delegatable={initial.people.delegatable} contractTemplates={initial.people.contractTemplates} focusedEmployeeId={employeeId} onOpenTab={openTab} accessLevels={accessLevels} busy={busy} action={action} /> : null}
      {tab === "org" && initial.people ? <OrgChart chart={initial.people.orgChart} onOpenPerson={openPerson} /> : null}
      {tab === "contracts" && initial.people ? <ContractsCommand contracts={initial.people.contracts} directory={initial.people.directory} onOpenPerson={openPerson} /> : null}
      {tab === "chat" ? <TeamChat canUse={canUseTab} /> : null}
      {tab === "access" ? <AccessControlPanel
        scope={{ kind: "workspace", id: "staff", label: "Staff workspace" }}
        people={initial.access?.people ?? []}
        canManage={canManageAccess && accessLevels.access === "manage"}
        currentEnvironment={accessEnvironment}
        title="Staff roles and workspace elements"
        description="Control each staff member’s reusable role, exact workspace authority and the individual stations visible in their portal."
      /> : null}
      {tab === "time" && initial.schedule ? <TimeAndLeave employees={initial.schedule.people} requests={initial.schedule.leaveRequests} shifts={initial.schedule.shifts} busy={busy} action={action} /> : null}
      {tab === "development" && initial.training ? <Development employees={initial.training.people} training={initial.training.assignments} onboardingTemplate={initial.training.onboardingTemplate} modules={initial.training.modules} busy={busy} action={action} /> : null}
      {tab === "rewards" && initial.pay ? <Rewards employees={initial.pay.people} selectedEmployeeId={selectedEmployeeId} setSelectedEmployeeId={setSelectedEmployeeId} busy={busy} action={action} /> : null}
      </fieldset>
    </div>
  );
}

function Overview({ summary, allowedTabs, onOpen }: { summary: StaffOverviewElementDto; allowedTabs: readonly Tab[]; onOpen: (tab: Tab) => void }) {
  const metrics = [
    { label: "Active people", value: summary.activePeople, detail: `${summary.portalAccounts} portal accounts`, tab: "team" as Tab, icon: UsersRound },
    { label: "Candidates live", value: summary.candidatesLive, detail: `${summary.candidatesUnderReview} under review`, tab: "candidates" as Tab, icon: Route },
    { label: "Onboarding steps", value: summary.onboardingOpen, detail: "remaining across team", tab: "development" as Tab, icon: ClipboardCheck },
    { label: "Leave decisions", value: summary.pendingLeave, detail: "awaiting review", tab: "time" as Tab, icon: CalendarDays },
  ];
  return (
    <div className="space-y-6">
      {summary.employeeOfMonth ? (
        <section className="flex flex-col gap-3 rounded-lg border border-[#bda169]/40 bg-gradient-to-r from-[#fbf8ef] to-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex size-12 items-center justify-center rounded-full bg-[#8a6b2f] text-base font-semibold text-white">{initials(summary.employeeOfMonth.name)}<Star className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 text-[#8a6b2f]" size={16} fill="currentColor" /></span>
            <div><p className="text-xs font-semibold uppercase text-[#8a6b2f]">Employee of the month</p><p className="mt-0.5 text-lg font-semibold">{summary.employeeOfMonth.name}</p>{summary.employeeOfMonth.note ? <p className="mt-0.5 text-sm text-black/55">“{summary.employeeOfMonth.note}”</p> : null}</div>
          </div>
          {allowedTabs.includes("team") ? <button onClick={() => onOpen("team")} className="inline-flex h-fit items-center gap-1 rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-black/70 hover:bg-black/[0.03]">Open card <ChevronRight size={15} /></button> : null}
        </section>
      ) : null}
      <section className="grid gap-px overflow-hidden rounded-lg border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => {
          const content = <><metric.icon className="text-emerald-800" size={19} /><span className="mt-5 block text-3xl font-semibold tabular-nums">{metric.value}</span><span className="mt-1 block text-sm font-semibold">{metric.label}</span><span className="mt-1 block text-xs text-black/45">{metric.detail}</span></>;
          return allowedTabs.includes(metric.tab)
            ? <button key={metric.label} onClick={() => onOpen(metric.tab)} className="min-h-36 bg-white p-5 text-left hover:bg-[#f7faf8]">{content}</button>
            : <div key={metric.label} className="min-h-36 bg-white p-5 text-left">{content}</div>;
        })}
      </section>
      <section data-resolution-focus="details" className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-black/10 bg-white p-5">
          <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-emerald-800">Hiring flow</p><h2 className="mt-1 text-lg font-semibold">Candidate movement</h2></div>{allowedTabs.includes("candidates") ? <button onClick={() => onOpen("candidates")} className="inline-flex min-h-6 items-center text-sm font-semibold text-emerald-800">Open pipeline</button> : null}</div>
          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {(["applied", "under-review", "interview", "offer", "onboarding"] as PeopleApplicationStage[]).map(stage => <div key={stage} className="border-l-2 border-black/10 pl-3"><p className="text-2xl font-semibold">{summary.applicationStages[stage] ?? 0}</p><p className="mt-1 text-xs text-black/45">{STAGE_LABEL[stage]}</p></div>)}
          </div>
        </div>
        <div className="rounded-lg border border-[#bda169]/35 bg-[#fbf8ef] p-5">
          <Sparkles className="text-[#8a6b2f]" size={20} /><h2 className="mt-4 text-lg font-semibold">Premium outside, controlled inside.</h2><p className="mt-2 text-sm leading-6 text-black/55">Candidates receive a calm status experience. Staff receive only the exact working stations you compose. Pay, leave and sensitive records never leak into general task views.</p>
        </div>
      </section>
    </div>
  );
}

function CapacityCommand({ capacity, allowedTabs, onOpen }: { capacity: StaffCapacitySnapshot; allowedTabs: readonly Tab[]; onOpen: (tab: Tab) => void }) {
  if (!capacity.available) return <Empty title="Capacity intelligence is warming up" detail="The team Radar hasn't produced signals yet. It builds from your people, tasks, leave and shifts — add a little activity and it will populate here." />;
  const { health, attention, areas, hiring, coverage } = capacity;
  return (
    <div className="space-y-6">
      {health ? (
        <section className="grid gap-px overflow-hidden rounded-lg border border-black/10 bg-black/10 sm:grid-cols-3">
          <HealthTile label="Coverage" value={health.coveragePercent} detail={`${health.passedChecks}/${health.totalChecks} checks passing`} />
          <HealthTile label="Confidence" value={health.confidencePercent} detail={`${health.blindChecks} blind spot${health.blindChecks === 1 ? "" : "s"}`} />
          <HealthTile label="Readiness" value={health.readinessPercent} detail={`${health.firingChecks} firing · ${health.watchChecks} to watch`} />
        </section>
      ) : null}

      <section className="rounded-lg border border-black/10 bg-white">
        <header className="flex items-center justify-between border-b border-black/10 p-4"><div className="flex items-center gap-2"><TriangleAlert className="text-amber-600" size={18} /><h2 className="font-semibold">Where you're stretched</h2></div><span className="text-xs text-black/45">{attention.length} signal{attention.length === 1 ? "" : "s"} firing</span></header>
        <div className="divide-y divide-black/10">
          {attention.length ? attention.map((signal, index) => <SignalRow key={`${signal.area ?? "all"}:${signal.familyId}:${index}`} signal={signal} />) : <p className="p-6 text-center text-sm text-black/45">No capacity or hiring pressure is firing right now. The team is balanced.</p>}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Capacity by area</h2>{allowedTabs.includes("candidates") ? <button onClick={() => onOpen("candidates")} className="text-sm font-semibold text-emerald-800">Open recruitment</button> : null}</div>
        {areas.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{areas.map((signal, index) => <AreaCard key={`${signal.area ?? "all"}:${signal.familyId}:${index}`} signal={signal} />)}</div> : <Empty title="No area capacity yet" detail="Per-area capacity appears once your capacity plan and workload have data." />}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SignalGroup title="Hiring signals" detail="A suggested hire is a prompt, never committed work — you decide." signals={hiring} emptyText="No hiring triggers are active." />
        <SignalGroup title="Coverage & workload" detail="Owner, staff and freelancer coverage, and how work is balanced." signals={coverage} emptyText="No coverage gaps detected." />
      </div>
    </div>
  );
}

function HealthTile({ label, value, detail }: { label: string; value: number; detail: string }) {
  const tone = value >= 75 ? "text-emerald-700" : value >= 50 ? "text-amber-600" : "text-red-600";
  return <div className="bg-white p-5"><p className="text-xs font-semibold uppercase text-black/40">{label}</p><p className={`mt-2 text-3xl font-semibold tabular-nums ${tone}`}>{Math.round(value)}%</p><p className="mt-1 text-xs text-black/45">{detail}</p></div>;
}

function signalTone(status: StaffCapacitySignal["status"]) {
  if (status === "critical") return { dot: "bg-red-600", chip: "bg-red-50 text-red-700", label: "Critical" };
  if (status === "warning") return { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800", label: "Warning" };
  if (status === "watch") return { dot: "bg-yellow-400", chip: "bg-yellow-50 text-yellow-800", label: "Watch" };
  if (status === "blind") return { dot: "bg-black/30", chip: "bg-black/5 text-black/55", label: "Blind spot" };
  if (status === "pass") return { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800", label: "Healthy" };
  return { dot: "bg-black/20", chip: "bg-black/5 text-black/50", label: words(status) };
}

function SignalRow({ signal }: { signal: StaffCapacitySignal }) {
  const tone = signalTone(signal.status);
  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4">
      <span className={`mt-1 inline-block size-2.5 shrink-0 rounded-full ${tone.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{signal.title}</p><span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${tone.chip}`}>{tone.label}</span></div>
        <p className="mt-1 text-sm leading-6 text-black/55">{signal.detail}</p>
        {signal.evidence.length ? <ul className="mt-2 space-y-0.5">{signal.evidence.slice(0, 3).map((line, index) => <li key={index} className="text-xs text-black/40">— {line}</li>)}</ul> : null}
      </div>
      {signal.href ? <a href={signal.href} className="inline-flex h-fit shrink-0 items-center gap-1 rounded-md border border-black/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">Act <ExternalLink size={12} /></a> : null}
    </div>
  );
}

function AreaCard({ signal }: { signal: StaffCapacitySignal }) {
  const tone = signalTone(signal.status);
  return (
    <a href={signal.href || undefined} className="block rounded-lg border border-black/10 bg-white p-4 hover:bg-[#f7faf8]">
      <div className="flex items-center justify-between"><p className="font-semibold capitalize">{signal.area ? capacityAreaLabelClient(signal.area) : signal.familyLabel}</p><span className={`inline-block size-2.5 rounded-full ${tone.dot}`} /></div>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-black/55">{signal.detail}</p>
      <span className={`mt-3 inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${tone.chip}`}>{tone.label}</span>
    </a>
  );
}

function SignalGroup({ title, detail, signals, emptyText }: { title: string; detail: string; signals: StaffCapacitySignal[]; emptyText: string }) {
  return (
    <section className="rounded-lg border border-black/10 bg-white">
      <header className="border-b border-black/10 p-4"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-xs text-black/45">{detail}</p></header>
      <div className="divide-y divide-black/10">
        {signals.length ? signals.map((signal, index) => <SignalRow key={`${signal.area ?? "all"}:${signal.familyId}:${index}`} signal={signal} />) : <p className="p-6 text-center text-sm text-black/45">{emptyText}</p>}
      </div>
    </section>
  );
}

function OrgChart({ chart, onOpenPerson }: { chart: StaffOrgChart; onOpenPerson: (entryId: string) => void }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {chart.departments.length ? chart.departments.map(dept => (
          <div key={dept.name} className="rounded-lg border border-black/10 bg-white p-4">
            <p className="truncate font-semibold capitalize">{dept.name}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{dept.headcount}<span className="ml-1 text-xs font-normal text-black/40">{dept.headcount === 1 ? "person" : "people"}</span></p>
            <p className="mt-1 text-xs text-black/45">{dept.online} online · {dept.managers} manager{dept.managers === 1 ? "" : "s"}</p>
          </div>
        )) : <div className="sm:col-span-2 xl:col-span-4"><Empty title="No departments yet" detail="Set a department on each person to see team composition." /></div>}
      </section>

      <section className="rounded-lg border border-black/10 bg-white p-5">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Network className="text-emerald-800" size={18} /><h2 className="font-semibold">Reporting lines</h2></div><span className="text-xs text-black/45">{chart.totalPeople} {chart.totalPeople === 1 ? "person" : "people"}</span></div>
        <p className="mt-1 text-sm text-black/50">Set “reports to” on a person’s card to shape the tree.</p>
        <div className="mt-5">
          {chart.owner ? <OrgNodeRow node={chart.owner} depth={0} onOpenPerson={onOpenPerson} /> : <Empty title="No owner found" detail="An agency owner anchors the org chart." />}
        </div>
      </section>

      {chart.freelancers.length ? (
        <section className="rounded-lg border border-black/10 bg-white p-5">
          <div className="flex items-center gap-2"><Hammer className="text-[#8a6b2f]" size={17} /><h2 className="font-semibold">Freelancers & contractors</h2><span className="text-xs text-black/45">a distinct layer</span></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {chart.freelancers.map(entry => <button key={entry.id} onClick={() => onOpenPerson(entry.id)} className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-[#faf7f0] py-1 pl-1 pr-3 text-sm hover:bg-[#f3ead2]"><span className="inline-flex size-7 items-center justify-center rounded-full bg-[#8a6b2f] text-[10px] font-semibold text-white">{initials(entry.name)}</span><span className="font-medium">{entry.name}</span><span className="text-xs text-black/45">{entry.title}</span></button>)}
          </div>
        </section>
      ) : null}

      {chart.unplaced.length ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-sm font-semibold text-amber-800">Not placed in the tree</p>
          <p className="mt-1 text-xs text-amber-800/80">These people have a manager loop or a manager who has left — fix their “reports to”. {chart.unplaced.map(entry => entry.name).join(", ")}.</p>
        </section>
      ) : null}
    </div>
  );
}

function OrgNodeRow({ node, depth, onOpenPerson }: { node: StaffOrgNode; depth: number; onOpenPerson: (entryId: string) => void }) {
  const { entry } = node;
  return (
    <div className={depth > 0 ? "border-l border-black/10 pl-4" : ""}>
      <button onClick={() => onOpenPerson(entry.id)} className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-[#f7faf8]">
        <span className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${entry.isOwner ? "bg-[#8a6b2f]" : "bg-black"}`}>{initials(entry.name)}{entry.isOwner ? <Crown className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 text-[#8a6b2f]" size={13} /> : null}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><span className="truncate font-semibold">{entry.name}</span>{entry.isEmployeeOfMonth ? <Star size={12} className="text-[#8a6b2f]" fill="currentColor" /> : null}<span className={`inline-block size-2 rounded-full ${presenceDotClass(entry.presence.state)}`} /></span>
          <span className="block truncate text-xs text-black/45">{entry.title}{entry.department ? ` · ${entry.department}` : ""}</span>
        </span>
        {node.reports.length ? <span className="shrink-0 rounded-md bg-black/5 px-2 py-0.5 text-[10px] font-semibold text-black/55">{node.reports.length} report{node.reports.length === 1 ? "" : "s"}</span> : null}
      </button>
      {node.reports.length ? <div className="ml-4 mt-1 space-y-1">{node.reports.map(child => <OrgNodeRow key={child.entry.id} node={child} depth={depth + 1} onOpenPerson={onOpenPerson} />)}</div> : null}
    </div>
  );
}

function Candidates({ applications, hiringStages, focusedApplicationId, busy, action }: { applications: PeopleApplication[]; hiringStages: PeopleHiringStageConfig[]; focusedApplicationId: string | null; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  const labelOf = (id: PeopleApplicationStage) => hiringStages.find(stage => stage.id === id)?.label ?? STAGE_LABEL[id];
  const guidanceOf = (id: PeopleApplicationStage) => hiringStages.find(stage => stage.id === id)?.guidance;
  return (
    <div className="space-y-5">
      <HiringStagesEditor stages={hiringStages} busy={busy} action={action} />
      <section className="space-y-3">{applications.length ? applications.map(application => <CandidateRow key={application.id} application={application} labelOf={labelOf} guidanceOf={guidanceOf} stages={hiringStages} focused={focusedApplicationId === application.id} busy={busy} action={action} />) : <Empty title="No applications yet" detail="Share the public careers portal when you are ready to recruit." />}</section>
    </div>
  );
}

function CandidateRow({ application, labelOf, guidanceOf, stages, focused, busy, action }: { application: PeopleApplication; labelOf: (id: PeopleApplicationStage) => string; guidanceOf: (id: PeopleApplicationStage) => string | undefined; stages: PeopleHiringStageConfig[]; focused: boolean; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  const [stage, setStage] = useState(application.stage);
  return (
    <details id={`application-${application.id}`} className="group scroll-mt-24 rounded-lg border border-black/10 bg-white" open={focused || application.stage === "applied" || application.stage === "under-review"}>
      <summary className="flex cursor-pointer list-none flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#153a32] text-sm font-semibold text-white">{initials(application.name)}</span>
        <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{application.name}</span><span className="mt-0.5 block truncate text-sm text-black/45">{application.roleInterest} · {application.email}</span></span>
        <span className={`w-fit rounded-md px-2.5 py-1 text-xs font-semibold ${application.stage === "declined" || application.stage === "withdrawn" ? "bg-black/5 text-black/50" : "bg-emerald-50 text-emerald-800"}`}>{labelOf(application.stage)}</span>
        <ChevronRight className="text-black/35 transition group-open:rotate-90" size={17} />
      </summary>
      <div className="grid gap-6 border-t border-black/10 p-5 lg:grid-cols-[1fr_22rem]">
        <div>
          <p className="text-sm leading-6 text-black/65">{application.coverNote || "No cover note supplied."}</p>
          <dl className="mt-5 grid gap-4 border-t border-black/10 pt-4 sm:grid-cols-3"><Meta label="Location" value={application.location || "Not supplied"} /><Meta label="Arrangement" value={application.employmentPreference?.replaceAll("-", " ") || "Open"} /><Meta label="Applied" value={formatDate(application.submittedAt)} /></dl>
          <div className="mt-5 flex flex-wrap gap-2"><a href={`/api/portal/people/cv?applicationId=${application.id}`} target="_blank" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-semibold"><FileText size={15} /> Open CV</a>{application.portfolioUrl ? <a href={application.portfolioUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-semibold">Portfolio <ExternalLink size={14} /></a> : null}<button onClick={() => action("rotate-status-link", { applicationId: application.id })} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-semibold"><Copy size={14} /> Copy fresh status link</button></div>
        </div>
        <div className="space-y-4 rounded-md bg-[#f7f7f3] p-4">
          <label className="block text-xs font-semibold uppercase text-black/45">Decision stage<select value={stage} onChange={event => setStage(event.target.value as PeopleApplicationStage)} className="mt-2 min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm normal-case text-black">{stages.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          {guidanceOf(stage) ? <p className="rounded-md bg-white/70 px-3 py-2 text-xs leading-5 text-black/55">{guidanceOf(stage)}</p> : null}
          <textarea id={`note-${application.id}`} rows={3} placeholder="Optional note visible in retained history" className="w-full rounded-md border border-black/15 bg-white p-3 text-sm" />
          <button onClick={() => action("update-application", { applicationId: application.id, stage, note: (document.getElementById(`note-${application.id}`) as HTMLTextAreaElement | null)?.value })} disabled={busy === "update-application"} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><Check size={15} /> Save decision</button>
          {!application.employeeId && ["offer", "accepted"].includes(application.stage) ? <HireCandidate application={application} busy={busy} action={action} /> : null}
        </div>
      </div>
    </details>
  );
}

function HiringStagesEditor({ stages, busy, action }: { stages: PeopleHiringStageConfig[]; busy: string; action: ActionFn }) {
  const [draft, setDraft] = useState(stages);
  function update(id: string, field: "label" | "guidance", value: string) { setDraft(current => current.map(stage => stage.id === id ? { ...stage, [field]: value } : stage)); }
  return (
    <details className="rounded-lg border border-black/10 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4"><Settings2 className="text-emerald-800" size={16} /><span className="font-semibold">Configure your hiring process</span><span className="text-xs text-black/40">— your stage names + what you do at each</span></summary>
      <div className="space-y-2 border-t border-black/10 p-4">
        {draft.map(stage => (
          <div key={stage.id} className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <input value={stage.label} onChange={event => update(stage.id, "label", event.target.value)} className="min-h-9 rounded-md border border-black/15 px-2 text-sm font-medium" />
            <input value={stage.guidance ?? ""} onChange={event => update(stage.id, "guidance", event.target.value)} placeholder="What you do at this stage (optional guidance)" className="min-h-9 rounded-md border border-black/15 px-2 text-sm" />
          </div>
        ))}
        <div className="flex justify-end pt-2"><button onClick={() => action("save-hiring-stages", { stages: draft })} disabled={busy === "save-hiring-stages"} className="min-h-9 rounded-md bg-black px-4 text-sm font-semibold text-white">Save hiring process</button></div>
      </div>
    </details>
  );
}

function OnboardingTemplateEditor({ steps, busy, action }: { steps: PeopleProcessConfig["onboardingSteps"]; busy: string; action: ActionFn }) {
  const [draft, setDraft] = useState(steps);
  function update(index: number, patch: Partial<PeopleProcessConfig["onboardingSteps"][number]>) { setDraft(current => current.map((step, i) => i === index ? { ...step, ...patch } : step)); }
  function add() { setDraft(current => [...current, { id: `onboarding_new_${current.length + 1}`, label: "", owner: "company" }]); }
  function remove(index: number) { setDraft(current => current.filter((_, i) => i !== index)); }
  function move(index: number, direction: -1 | 1) { setDraft(current => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; }); }
  return (
    <details className="rounded-lg border border-black/10 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4"><Settings2 className="text-emerald-800" size={16} /><span className="font-semibold">Configure the onboarding template</span><span className="text-xs text-black/40">— new hires start from these steps</span></summary>
      <div className="space-y-2 border-t border-black/10 p-4">
        {draft.map((step, index) => {
          const stepName = step.label.trim() || `step ${index + 1}`;
          return (
          <div key={step.id} className="flex items-center gap-2">
            <input value={step.label} onChange={event => update(index, { label: event.target.value })} aria-label={`Onboarding step ${index + 1} label`} placeholder="Onboarding step" className="min-h-9 min-w-0 flex-1 rounded-md border border-black/15 px-2 text-sm" />
            <select value={step.owner} onChange={event => update(index, { owner: event.target.value as "company" | "employee" })} aria-label={`Who owns ${stepName}`} className="min-h-9 rounded-md border border-black/15 bg-white px-2 text-xs font-semibold"><option value="company">Company</option><option value="employee">Employee</option></select>
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${stepName} earlier`} className="inline-flex size-8 items-center justify-center rounded-md border border-black/10 disabled:opacity-25"><ArrowUp size={13} aria-hidden /></button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === draft.length - 1} aria-label={`Move ${stepName} later`} className="inline-flex size-8 items-center justify-center rounded-md border border-black/10 disabled:opacity-25"><ArrowDown size={13} aria-hidden /></button>
            <button type="button" onClick={() => remove(index)} aria-label={`Remove ${stepName}`} className="inline-flex size-8 items-center justify-center rounded-md border border-red-200 text-red-600"><X size={13} aria-hidden /></button>
          </div>
          );
        })}
        <div className="flex justify-between pt-2"><button onClick={add} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black/10 px-3 text-sm font-semibold"><Plus size={14} /> Add step</button><button onClick={() => action("save-onboarding-template", { steps: draft })} disabled={busy === "save-onboarding-template"} className="min-h-9 rounded-md bg-black px-4 text-sm font-semibold text-white">Save template</button></div>
        <p className="text-xs text-black/40">Existing employees keep their current checklist — this shapes new hires.</p>
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

type ActionFn = (name: string, payload: Record<string, unknown>) => Promise<unknown>;

function Directory({ directory, cards, delegatable, contractTemplates, focusedEmployeeId, onOpenTab, accessLevels, busy, action }: { directory: StaffDirectoryEntry[]; cards: StaffCard[]; delegatable: DelegatableTask[]; contractTemplates: StaffPeopleElementDto["contractTemplates"]; focusedEmployeeId: string | null; onOpenTab: (tab: Tab) => void; accessLevels: Readonly<Record<Tab, WorkspaceElementLevel>>; busy: string; action: ActionFn }) {
  const [selectedId, setSelectedId] = useState(focusedEmployeeId ?? "");
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { if (focusedEmployeeId) setSelectedId(focusedEmployeeId); }, [focusedEmployeeId]);

  const selectedCard = cards.find(card => card.entry.id === selectedId || (card.entry.employeeId && card.entry.employeeId === selectedId));
  if (selectedCard) return <StaffCardView card={selectedCard} directory={directory} delegatable={delegatable} contractTemplates={contractTemplates} onBack={() => setSelectedId("")} onOpenTab={onOpenTab} accessLevels={accessLevels} busy={busy} action={action} />;

  const departments = [...new Set(directory.map(entry => entry.department).filter(Boolean))].sort() as string[];
  const statuses = [...new Set(directory.map(entry => entry.status))];
  const online = directory.filter(entry => entry.presence.state === "online");
  const idle = directory.filter(entry => entry.presence.state === "idle");
  const filtered = directory.filter(entry =>
    (dept === "all" || entry.department === dept) &&
    (status === "all" || entry.status === status) &&
    (!query.trim() || `${entry.name} ${entry.title} ${entry.email}`.toLowerCase().includes(query.trim().toLowerCase())),
  );

  return (
    <div className="space-y-4">
      <WhosAround online={online} idle={idle} total={directory.length} onOpen={setSelectedId} />
      <section className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-3 lg:flex-row lg:items-center">
        <label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, role or email" className="min-h-10 w-full rounded-md border border-black/15 bg-white pl-9 pr-3 text-sm" /></label>
        <div className="flex gap-2">
          <select value={dept} onChange={event => setDept(event.target.value)} aria-label="Filter by department" className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm capitalize"><option value="all">All departments</option>{departments.map(name => <option key={name} value={name}>{name}</option>)}</select>
          <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter by status" className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm capitalize"><option value="all">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value}</option>)}</select>
          <button onClick={() => setShowAdd(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white"><Plus size={15} /> Add</button>
        </div>
      </section>

      {showAdd ? <DirectEmployee busy={busy} action={action} /> : null}

      <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
        <div className="hidden grid-cols-[minmax(0,1fr)_9rem_7rem_6rem_5rem] gap-3 border-b border-black/10 bg-[#f7f7f3] px-4 py-3 text-xs font-semibold uppercase text-black/40 md:grid"><span>Person</span><span>Department</span><span>Presence</span><span>Open work</span><span>Status</span></div>
        <div className="divide-y divide-black/10">
          {filtered.length ? filtered.map(entry => <DirectoryRow key={entry.id} entry={entry} onOpen={() => setSelectedId(entry.id)} />) : <Empty title="No one matches" detail="Adjust the filters, or add a team member." />}
        </div>
      </section>
    </div>
  );
}

function WhosAround({ online, idle, total, onOpen }: { online: StaffDirectoryEntry[]; idle: StaffDirectoryEntry[]; total: number; onOpen: (id: string) => void }) {
  const around = [...online, ...idle];
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-2 font-semibold"><span className="inline-block size-2.5 rounded-full bg-emerald-500" />{online.length} online</span>
        <span className="flex items-center gap-2 text-black/55"><span className="inline-block size-2.5 rounded-full bg-amber-400" />{idle.length} idle</span>
        <span className="text-black/40">of {total} {total === 1 ? "person" : "people"}</span>
      </div>
      {around.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {around.slice(0, 8).map(entry => <button key={entry.id} onClick={() => onOpen(entry.id)} title={`${entry.name} · ${entry.presence.state}`} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-[#f7faf8] py-1 pl-1 pr-2.5 text-xs font-semibold hover:bg-emerald-50"><span className={`relative inline-flex size-6 items-center justify-center rounded-full text-[10px] text-white ${entry.isOwner ? "bg-[#8a6b2f]" : "bg-black"}`}>{initials(entry.name)}<span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white ${presenceDotClass(entry.presence.state)}`} /></span>{entry.name.split(/\s+/)[0]}</button>)}
          {around.length > 8 ? <span className="text-xs text-black/40">+{around.length - 8} more</span> : null}
        </div>
      ) : <span className="text-sm text-black/40">No one is clocked in right now.</span>}
    </section>
  );
}

function DirectoryRow({ entry, onOpen }: { entry: StaffDirectoryEntry; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="grid w-full grid-cols-1 items-center gap-3 px-4 py-3 text-left hover:bg-[#f7faf8] md:grid-cols-[minmax(0,1fr)_9rem_7rem_6rem_5rem]">
      <span className="flex min-w-0 items-center gap-3">
        <span className={`relative inline-flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${entry.isOwner ? "bg-[#8a6b2f]" : "bg-black"}`}>{initials(entry.name)}{entry.isOwner ? <Crown className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 text-[#8a6b2f]" size={15} /> : null}</span>
        <span className="min-w-0"><span className="flex items-center gap-2 font-semibold"><span className="truncate">{entry.name}</span>{entry.isOwner ? <span className="rounded bg-[#f3ead2] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#7a5c26]">Owner</span> : null}{entry.isEmployeeOfMonth ? <Star className="text-[#8a6b2f]" size={14} fill="currentColor" aria-label="Employee of the month" /> : null}</span><span className="block truncate text-sm text-black/45">{entry.title}</span></span>
      </span>
      <span className="truncate text-sm text-black/60 capitalize">{entry.department || "—"}</span>
      <span className="flex items-center gap-2 text-sm text-black/60"><span className={`inline-block size-2 rounded-full ${presenceDotClass(entry.presence.state)}`} />{presenceLabel(entry)}</span>
      <span className="text-sm text-black/60">{entry.openTasks} open</span>
      <span className="flex items-center gap-2"><span className="rounded-md bg-black/5 px-2 py-0.5 text-xs font-semibold capitalize">{entry.status}</span>{!entry.hasPortalAccount ? <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">No portal</span> : null}</span>
    </button>
  );
}

type CardTab = "overview" | "work" | "jobs" | "pay" | "access" | "leave" | "training" | "contracts" | "notes";
const CARD_TABS: Array<{ id: CardTab; label: string; icon: typeof UsersRound; freelancerOnly?: boolean }> = [
  { id: "overview", label: "Overview", icon: UserRound },
  { id: "work", label: "Work", icon: ListChecks },
  { id: "jobs", label: "Jobs", icon: Hammer, freelancerOnly: true },
  { id: "pay", label: "Pay", icon: BadgePoundSterling },
  { id: "access", label: "Access", icon: ShieldCheck },
  { id: "leave", label: "Leave & shifts", icon: CalendarDays },
  { id: "training", label: "Training", icon: GraduationCap },
  { id: "contracts", label: "Contracts", icon: FileSignature },
  { id: "notes", label: "Notes", icon: NotebookPen },
];

function isFreelancerEmployee(card: StaffCard) {
  return card.employee?.employmentType === "freelancer" || card.employee?.employmentType === "contractor";
}

function StaffCardView({ card, directory, delegatable, contractTemplates, onBack, onOpenTab, accessLevels, busy, action }: { card: StaffCard; directory: StaffDirectoryEntry[]; delegatable: DelegatableTask[]; contractTemplates: StaffPeopleElementDto["contractTemplates"]; onBack: () => void; onOpenTab: (tab: Tab) => void; accessLevels: Readonly<Record<Tab, WorkspaceElementLevel>>; busy: string; action: ActionFn }) {
  const [tab, setTab] = useState<CardTab>("overview");
  const { entry, employee, work, holiday } = card;
  const isFreelancer = isFreelancerEmployee(card);
  const tabs = CARD_TABS.filter(item => {
    if (item.freelancerOnly && !isFreelancer) return false;
    if ((item.id === "pay" || item.id === "jobs") && accessLevels.rewards === "hidden") return false;
    if (item.id === "access" && accessLevels.access === "hidden") return false;
    if (item.id === "leave" && accessLevels.time === "hidden") return false;
    if (item.id === "training" && accessLevels.development === "hidden") return false;
    if (item.id === "contracts" && accessLevels.contracts === "hidden") return false;
    return true;
  });
  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><ArrowLeft size={16} /> Back to directory</button>
      <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
        <div className="flex flex-col gap-4 bg-[#112f29] p-5 text-white sm:flex-row sm:items-center sm:p-6">
          <span className={`relative inline-flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${entry.isOwner ? "bg-[#d7be83] text-[#15221d]" : "bg-white/10 text-white"}`}>{initials(entry.name)}{entry.isOwner ? <Crown className="absolute -right-1 -top-1 rounded-full bg-[#112f29] p-0.5 text-[#d7be83]" size={17} /> : null}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-semibold">{entry.name}</h2>{entry.isOwner ? <span className="rounded bg-[#d7be83] px-2 py-0.5 text-xs font-semibold uppercase text-[#15221d]">Owner</span> : null}{entry.isEmployeeOfMonth ? <span className="inline-flex items-center gap-1 rounded bg-[#d7be83] px-2 py-0.5 text-xs font-semibold uppercase text-[#15221d]"><Star size={12} fill="currentColor" /> Employee of the month</span> : null}</div>
            <p className="mt-1 text-sm text-white/60">{entry.title}{entry.department ? ` · ${entry.department}` : ""} · {words(entry.employmentType)}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2"><span className={`inline-block size-2 rounded-full ${presenceDotClass(entry.presence.state)}`} />{entry.presence.state === "online" ? "Online now" : entry.presence.state === "idle" ? "Idle" : entry.presence.lastSeenAt ? `Seen ${relativeDay(entry.presence.lastSeenAt)}` : "Not seen yet"}</span>
            <span className="rounded-md bg-white/10 px-3 py-2 capitalize">{entry.status}</span>
          </div>
        </div>
        <div className="grid gap-px bg-black/10 sm:grid-cols-4">
          <CardStat label="Days worked" value={String(work.daysWorked)} icon={CalendarDays} />
          <CardStat label="Logged" value={formatHours(work.loggedMs)} icon={Clock3} />
          <CardStat label="Open work" value={String(work.openTasks)} icon={ListChecks} />
          <CardStat label="Holiday left" value={employee ? `${holiday.remainingDays}d` : "—"} icon={UserRoundCheck} />
        </div>
      </section>

      <nav aria-label="Staff card sections" className="flex gap-1 overflow-x-auto border-b border-black/10">
        {tabs.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium ${tab === item.id ? "border-emerald-800 text-emerald-900" : "border-transparent text-black/50 hover:text-black/80"}`}><item.icon size={15} />{item.label}</button>)}
      </nav>

      {tab === "overview" ? <CardOverview card={card} directory={directory} canManagePeople={accessLevels.team === "manage"} canManagePay={accessLevels.rewards === "manage"} canManageSchedule={accessLevels.time === "manage"} busy={busy} action={action} /> : null}
      {tab === "work" ? <CardWork card={card} delegatable={delegatable} busy={busy} action={action} /> : null}
      {tab === "jobs" && isFreelancer ? <fieldset disabled={accessLevels.rewards !== "manage"} className="contents"><CardJobs card={card} busy={busy} action={action} /></fieldset> : null}
      {tab === "pay" ? <CardPay card={card} onOpenTab={onOpenTab} /> : null}
      {tab === "access" ? <CardAccess card={card} onOpenTab={onOpenTab} /> : null}
      {tab === "leave" ? <CardLeave card={card} onOpenTab={onOpenTab} /> : null}
      {tab === "training" ? <CardTraining card={card} onOpenTab={onOpenTab} /> : null}
      {tab === "contracts" ? <fieldset disabled={accessLevels.contracts !== "manage"} className="contents"><CardContracts card={card} contractTemplates={contractTemplates} busy={busy} action={action} /></fieldset> : null}
      {tab === "notes" ? <Empty title="Work notes arrive next" detail="Private notes and feedback for this person land here in a later phase of the Staff Command." /> : null}
    </div>
  );
}

function CardStat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock3 }) {
  return <div className="bg-white p-4"><Icon className="text-[#a7d6ca]" size={16} /><p className="mt-3 text-2xl font-semibold tabular-nums text-black/85">{value}</p><p className="mt-1 text-xs font-semibold uppercase text-black/40">{label}</p></div>;
}

function CardOverview({ card, directory, canManagePeople, canManagePay, canManageSchedule, busy, action }: { card: StaffCard; directory: StaffDirectoryEntry[]; canManagePeople: boolean; canManagePay: boolean; canManageSchedule: boolean; busy: string; action: ActionFn }) {
  const { employee } = card;
  if (!employee) return <div className="space-y-4"><OwnerBanner /><section className="rounded-lg border border-black/10 bg-white p-5"><dl className="grid gap-4 sm:grid-cols-2"><Meta label="Email" value={card.entry.email} /><Meta label="Employment" value={words(card.entry.employmentType)} /><Meta label="Portal" value={card.entry.hasPortalAccount ? "Active" : "None"} /><Meta label="Open work" value={`${card.work.openTasks} actions`} /></dl></section></div>;
  const managerOptions = directory.filter(entry => entry.employeeId && entry.employeeId !== employee.id && entry.status !== "alumni" && entry.employmentType !== "freelancer" && entry.employmentType !== "contractor");
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); await action("update-employee", { employeeId: employee.id, ...data, startDate: data.startDate ? new Date(`${data.startDate}T09:00:00`).getTime() : undefined, ...(canManagePay ? { basePayMinor: Math.round(Number(data.basePay || 0) * 100) } : {}) }); };
  return (
    <div className="space-y-5">
    <RecognitionSection card={card} busy={busy} action={action} />
    <FeedbackSection card={card} action={action} />
    <section className="rounded-lg border border-black/10 bg-white p-5">
      <h3 className="text-sm font-semibold uppercase text-emerald-800">Employee record</h3>
      <fieldset disabled={!canManagePeople} className="contents"><form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input name="name" label="Name" defaultValue={employee.name} />
        <Input name="email" label="Email" type="email" defaultValue={employee.email} />
        <Input name="title" label="Title" defaultValue={employee.title} />
        <Input name="department" label="Department" defaultValue={employee.department} />
        <label className="block text-xs font-semibold text-black/55"><span className="mb-1.5 block">Reports to</span><select name="managerEmployeeId" defaultValue={employee.managerEmployeeId ?? ""} className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black"><option value="">No manager (top level)</option>{managerOptions.map(entry => <option key={entry.employeeId} value={entry.employeeId}>{entry.name}{entry.title ? ` · ${entry.title}` : ""}</option>)}</select></label>
        <Select name="employmentType" label="Employment" defaultValue={employee.employmentType} options={["full-time", "part-time", "contractor", "freelancer", "intern", "volunteer"]} />
        <Select name="status" label="Status" defaultValue={employee.status} options={["preboarding", "active", "leave", "suspended", "alumni"]} />
        {canManageSchedule ? <><Input name="weeklyHours" label="Weekly hours" type="number" step="0.5" defaultValue={employee.weeklyHours} /><Input name="holidayAllowanceDays" label="Holiday allowance" type="number" step="0.5" defaultValue={employee.holidayAllowanceDays} /></> : null}
        {canManagePay ? <><Select name="payBasis" label="Pay basis" defaultValue={employee.payBasis} options={["salary", "hourly", "day-rate", "commission-only", "unpaid"]} /><Input name="basePay" label="Base pay" type="number" step="0.01" defaultValue={(employee.basePayMinor ?? 0) / 100} /><Input name="currency" label="Currency" defaultValue={employee.currency} maxLength={3} /></> : null}
        <Input name="startDate" label="Start date" type="date" defaultValue={employee.startDate ? isoDay(employee.startDate) : ""} />
        <Input name="targetRole" label="Growth path — role they're growing toward" defaultValue={employee.targetRole} />
        <label className="block text-xs font-semibold text-black/55 sm:col-span-1"><span className="mb-1.5 block">How they get there (shown to them)</span><input name="growthPathNote" defaultValue={employee.growthPathNote} className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black" /></label>
        <button disabled={busy === "update-employee"} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white sm:col-span-2">Save employee record</button>
      </form></fieldset>
      {!employee.userId ? <div className="mt-4"><ProvisionEmployee employee={employee} busy={busy} action={action} /></div> : null}
    </section>
    </div>
  );
}

function RecognitionSection({ card, busy, action }: { card: StaffCard; busy: string; action: ActionFn }) {
  const employee = card.employee;
  if (!employee) return null;
  const period = businessCalendarMonth();
  return (
    <section className={`rounded-lg border p-5 ${card.entry.isEmployeeOfMonth ? "border-[#bda169]/45 bg-[#fbf8ef]" : "border-black/10 bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Award className="text-[#8a6b2f]" size={18} /><h3 className="font-semibold">Recognition</h3>{card.entry.isEmployeeOfMonth ? <span className="inline-flex items-center gap-1 rounded bg-[#d7be83] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#15221d]"><Star size={11} fill="currentColor" /> Employee of the month</span> : null}</div>
        <div className="flex gap-2">
          <button disabled={busy === "award-recognition"} onClick={() => action("award-recognition", { employeeId: employee.id, kind: "employee-of-month", period, note: window.prompt(`Why is ${employee.name} employee of the month?`) || undefined })} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-[#8a6b2f] px-3 text-xs font-semibold text-white"><Star size={13} /> Employee of the month</button>
          <button disabled={busy === "award-recognition"} onClick={() => action("award-recognition", { employeeId: employee.id, kind: "shoutout", note: window.prompt(`Shoutout for ${employee.name}:`) || undefined })} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black/10 px-3 text-xs font-semibold"><Sparkles size={13} /> Shoutout</button>
        </div>
      </div>
      {card.recognitions.length ? (
        <ul className="mt-4 space-y-2">
          {card.recognitions.slice(0, 5).map(item => <li key={item.id} className="flex items-start gap-2 text-sm"><span className={`mt-1 inline-block size-2 shrink-0 rounded-full ${item.kind === "employee-of-month" ? "bg-[#8a6b2f]" : "bg-emerald-500"}`} /><span><span className="font-medium">{item.kind === "employee-of-month" ? `Employee of the month${item.period ? ` · ${item.period}` : ""}` : "Shoutout"}</span>{item.note ? <span className="text-black/55"> — {item.note}</span> : null}<span className="ml-1 text-xs text-black/35">{formatDate(item.createdAt)}</span></span></li>)}
        </ul>
      ) : <p className="mt-3 text-sm text-black/45">No recognition yet. Celebrate great work — it shows on their card and the directory.</p>}
    </section>
  );
}

const FEEDBACK_TONE: Record<string, { dot: string; label: string }> = {
  positive: { dot: "bg-emerald-500", label: "Praise" }, idea: { dot: "bg-blue-500", label: "Idea" }, concern: { dot: "bg-amber-500", label: "Concern" },
};

function FeedbackSection({ card, action }: { card: StaffCard; action: ActionFn }) {
  if (!card.employee || !card.feedback.length) return null;
  const unread = card.feedback.filter(item => item.status === "new").length;
  return (
    <section className="rounded-lg border border-black/10 bg-white p-5">
      <div className="flex items-center gap-2"><Send className="text-emerald-800" size={17} /><h3 className="font-semibold">Feedback from {card.employee.name.split(/\s+/)[0]}</h3>{unread ? <span className="rounded-full bg-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-white">{unread} new</span> : null}</div>
      <ul className="mt-4 space-y-3">
        {card.feedback.slice(0, 6).map(item => { const tone = FEEDBACK_TONE[item.sentiment] ?? FEEDBACK_TONE.idea; return (
          <li key={item.id} className={`rounded-md border p-3 ${item.status === "new" ? "border-emerald-200 bg-emerald-50/40" : "border-black/10"}`}>
            <div className="flex items-center gap-2"><span className={`inline-block size-2 rounded-full ${tone.dot}`} /><span className="text-xs font-semibold uppercase text-black/45">{tone.label}</span><span className="text-xs text-black/35">{formatDate(item.createdAt)}</span></div>
            <p className="mt-1.5 text-sm leading-6 text-black/70">{item.message}</p>
            <div className="mt-2 flex gap-2">
              {item.status === "new" ? <button onClick={() => action("set-feedback-status", { feedbackId: item.id, status: "read" })} className="min-h-8 rounded-md border border-black/10 px-2.5 text-xs font-semibold">Mark read</button> : null}
              {item.status !== "actioned" ? <button onClick={() => action("set-feedback-status", { feedbackId: item.id, status: "actioned" })} className="min-h-8 rounded-md bg-emerald-800 px-2.5 text-xs font-semibold text-white">Mark actioned</button> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={13} /> Actioned</span>}
            </div>
          </li>
        ); })}
      </ul>
    </section>
  );
}

function CardWork({ card, delegatable, busy, action }: { card: StaffCard; delegatable: DelegatableTask[]; busy: string; action: ActionFn }) {
  const open = card.tasks.filter(task => task.status !== "done");
  const done = card.tasks.filter(task => task.status === "done");
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
          <header className="border-b border-black/10 p-4"><p className="text-xs font-semibold uppercase text-emerald-800">Assigned work</p><h3 className="mt-1 font-semibold">{open.length} open · {done.length} done</h3></header>
          <div className="divide-y divide-black/10">
            {card.tasks.length ? card.tasks.map(task => <div key={task.id} className="flex items-start gap-3 p-4"><span className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${task.status === "done" ? "bg-emerald-700" : task.priority === "urgent" ? "bg-red-600" : task.priority === "high" ? "bg-amber-600" : "bg-[#153a32]"}`}>{task.status === "done" ? <Check size={13} /> : "•"}</span><div className="min-w-0 flex-1"><p className={`font-medium ${task.status === "done" ? "text-black/40 line-through" : ""}`}>{task.title}</p>{task.notes ? <p className="mt-0.5 line-clamp-2 text-sm text-black/45">{task.notes}</p> : null}<p className="mt-1 text-xs text-black/35 capitalize">{words(task.origin ?? "manual")}{task.dueAt ? ` · due ${formatDate(task.dueAt)}` : ""}</p></div></div>) : <Empty title="No assigned work" detail="Delegate an action to this person below." />}
          </div>
        </section>
        <aside className="h-fit space-y-3 rounded-lg border border-black/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase text-black/40">Work record</p>
          <dl className="space-y-3"><Meta label="Days worked" value={String(card.work.daysWorked)} /><Meta label="Logged (all time)" value={formatHours(card.work.loggedMs)} /><Meta label="Last 7 days" value={formatHours(card.work.last7DaysMs)} /><Meta label="Work sessions" value={String(card.work.sessions)} /><Meta label="Presence" value={card.entry.presence.state === "online" ? "Online now" : card.entry.presence.state === "idle" ? "Idle (clocked in)" : "Offline"} /><Meta label="Last seen" value={card.entry.presence.lastSeenAt ? formatDateTime(card.entry.presence.lastSeenAt) : "Not seen yet"} /></dl>
        </aside>
      </div>
      <DelegatePanel entry={card.entry} delegatable={delegatable} />
    </div>
  );
}

function DelegatePanel({ entry, delegatable }: { entry: StaffDirectoryEntry; delegatable: DelegatableTask[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");
  const pool = delegatable.filter(task => task.assigneeUserId !== entry.userId);

  async function send(method: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch("/api/portal/tasks", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      router.refresh();
    } finally { setBusy(false); }
  }
  async function createNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = new FormData(form).get("title");
    if (!title) return;
    await send("POST", { title, priority: "normal", origin: "manual", assigneeUserId: entry.userId });
    form.reset();
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white p-5">
      <div className="flex items-center gap-2"><Send className="text-emerald-800" size={17} /><h3 className="font-semibold">Delegate work to {entry.name.split(/\s+/)[0]}</h3></div>
      {!entry.userId ? (
        <p className="mt-3 text-sm text-black/50">Provision a portal account (Overview → Activate portal) before assigning work — tasks route to a person's login.</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-black/40">Reassign your open work</p>
            <div className="mt-2 flex gap-2">
              <select value={pick} onChange={event => setPick(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-md border border-black/15 bg-white px-3 text-sm"><option value="">{pool.length ? "Choose a task…" : "No unassigned work to hand off"}</option>{pool.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select>
              <button disabled={!pick || busy} onClick={() => { void send("PATCH", { id: pick, assigneeUserId: entry.userId }); setPick(""); }} className="inline-flex min-h-10 items-center rounded-md bg-black px-3 text-sm font-semibold text-white disabled:opacity-40">Assign</button>
            </div>
          </div>
          <form onSubmit={createNew}>
            <p className="text-xs font-semibold uppercase text-black/40">Or delegate a new task</p>
            <div className="mt-2 flex gap-2">
              <input name="title" required placeholder="What needs doing?" className="min-h-10 min-w-0 flex-1 rounded-md border border-black/15 px-3 text-sm" />
              <button disabled={busy} className="inline-flex min-h-10 items-center gap-1 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white"><Plus size={15} /> Add</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function CardPay({ card, onOpenTab }: { card: StaffCard; onOpenTab: (tab: Tab) => void }) {
  const { employee } = card;
  if (!employee) return <Empty title="No pay record" detail="This is your derived owner card. Create a People record for yourself to track owner pay and commission." />;
  const active = employee.commissionRules.filter(rule => rule.status === "active");
  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="h-fit rounded-lg border border-black/10 bg-[#112f29] p-6 text-white"><BadgePoundSterling className="text-[#d7be83]" size={22} /><p className="mt-4 text-xs font-semibold uppercase text-[#a7d6ca]">Current terms</p><p className="mt-2 text-3xl font-semibold">{employee.payBasis === "unpaid" ? "Unpaid" : money(employee.basePayMinor ?? 0, employee.currency)}</p><p className="mt-1 text-sm capitalize text-white/55">{words(employee.payBasis)}</p><dl className="mt-5 space-y-3 border-t border-white/10 pt-4"><Meta label="Currency" value={employee.currency} inverse /><Meta label="Weekly hours" value={`${employee.weeklyHours ?? 0}h`} inverse /></dl></section>
      <section className="rounded-lg border border-black/10 bg-white"><header className="flex items-center justify-between border-b border-black/10 p-4"><div><p className="text-xs font-semibold uppercase text-[#8a6b2f]">Commission</p><h3 className="mt-1 font-semibold">Active plans</h3></div><button onClick={() => onOpenTab("rewards")} className="text-sm font-semibold text-emerald-800">Edit plans</button></header>{active.length ? active.map(rule => <div key={rule.id} className="flex items-center justify-between gap-3 border-b border-black/10 p-4 last:border-0"><div><p className="font-medium">{rule.label}</p><p className="mt-0.5 text-sm text-black/45 capitalize">{words(rule.basis)} · {words(rule.cadence)}</p></div><span className="font-semibold">{rule.ratePercent !== undefined ? `${rule.ratePercent}%` : money(rule.fixedAmountMinor ?? 0, employee.currency)}</span></div>) : <p className="p-6 text-center text-sm text-black/45">No active commission plan.</p>}<p className="border-t border-black/10 p-4 text-xs text-black/40">Payment evidence stays in Finance — surfaced on this card in a later phase.</p></section>
    </div>
  );
}

function CardAccess({ card, onOpenTab }: { card: StaffCard; onOpenTab: (tab: Tab) => void }) {
  const { employee, stations } = card;
  if (!employee) return <Empty title="No station access" detail="The derived owner card has full agency access by role. Create a People record to compose specific stations." />;
  const access = [...employee.workspaceAccess].sort((a, b) => a.order - b.order);
  return (
    <section className="rounded-lg border border-black/10 bg-white">
      <header className="flex items-center justify-between border-b border-black/10 p-4"><div><p className="text-xs font-semibold uppercase text-emerald-800">Workspace</p><h3 className="mt-1 font-semibold">{access.length} station{access.length === 1 ? "" : "s"} granted</h3></div><button onClick={() => onOpenTab("access")} className="text-sm font-semibold text-emerald-800">Compose access</button></header>
      <div className="divide-y divide-black/10">
        {access.map((item, index) => { const station = stations.find(value => value.id === item.stationId); if (!station) return null; return <div key={item.stationId} className="flex items-center gap-3 p-4"><span className="inline-flex size-7 items-center justify-center rounded-md bg-black/5 text-xs font-semibold">{index + 1}</span><div className="min-w-0 flex-1"><p className="font-medium">{station.label}</p><p className="truncate text-xs text-black/40">{station.description}</p></div><span className={`rounded-md px-2 py-1 text-xs font-semibold ${item.mode === "edit" ? "bg-emerald-50 text-emerald-800" : "bg-black/5 text-black/55"}`}>{item.mode === "edit" ? "Edit" : "View"}</span></div>; })}
      </div>
    </section>
  );
}

function CardLeave({ card, onOpenTab }: { card: StaffCard; onOpenTab: (tab: Tab) => void }) {
  const { employee, holiday, leaveRequests, shifts } = card;
  if (!employee) return <Empty title="No leave record" detail="The derived owner card does not track leave. Create a People record to manage owner time off." />;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4">
        <section className="overflow-hidden rounded-lg border border-black/10 bg-white"><header className="flex items-center justify-between border-b border-black/10 p-4"><h3 className="font-semibold">Leave</h3><button onClick={() => onOpenTab("time")} className="text-sm font-semibold text-emerald-800">Decide leave</button></header><div className="divide-y divide-black/10">{leaveRequests.length ? leaveRequests.map(request => <div key={request.id} className="flex items-center justify-between gap-3 p-4"><div><p className="font-medium capitalize">{request.type} leave</p><p className="mt-0.5 text-sm text-black/45">{request.startsOn} → {request.endsOn} · {request.days}d</p></div><span className={`rounded-md px-2 py-1 text-xs font-semibold capitalize ${request.status === "approved" ? "bg-emerald-50 text-emerald-800" : request.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{request.status}</span></div>) : <p className="p-6 text-center text-sm text-black/45">No leave requests.</p>}</div></section>
        <section className="overflow-hidden rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 p-4"><h3 className="font-semibold">Upcoming shifts</h3></header><div className="divide-y divide-black/10">{shifts.length ? shifts.slice(0, 6).map(shift => <div key={shift.id} className="flex items-center gap-3 p-4"><CalendarDays className="text-emerald-800" size={16} /><div><p className="font-medium">{shift.title}</p><p className="mt-0.5 text-sm text-black/45">{formatDateTime(shift.startsAt)}{shift.location ? ` · ${shift.location}` : ""}</p></div></div>) : <p className="p-6 text-center text-sm text-black/45">No shifts published.</p>}</div></section>
      </div>
      <aside className="h-fit rounded-lg border border-black/10 bg-white p-5"><p className="text-xs font-semibold uppercase text-black/40">Annual allowance</p><p className="mt-2 text-4xl font-semibold">{holiday.remainingDays}<span className="text-base text-black/40"> / {holiday.allowanceDays}d</span></p><p className="mt-2 text-sm text-black/45">{holiday.usedDays} approved day{holiday.usedDays === 1 ? "" : "s"} used.</p></aside>
    </div>
  );
}

function CardTraining({ card, onOpenTab }: { card: StaffCard; onOpenTab: (tab: Tab) => void }) {
  if (!card.employee) return <Empty title="No training record" detail="Create a People record to assign the owner training." />;
  return (
    <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
      <header className="flex items-center justify-between border-b border-black/10 p-4"><h3 className="font-semibold">Assigned training</h3><button onClick={() => onOpenTab("development")} className="text-sm font-semibold text-emerald-800">Assign</button></header>
      <div className="divide-y divide-black/10">
        {card.training.length ? card.training.map(item => <div key={item.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="font-medium">{item.title}</p>{item.description ? <p className="mt-0.5 line-clamp-1 text-sm text-black/45">{item.description}</p> : null}{item.dueAt ? <p className="mt-1 text-xs text-black/35">Due {formatDate(item.dueAt)}</p> : null}</div><span className="rounded-md bg-black/5 px-2 py-1 text-xs font-semibold capitalize">{words(item.status)}</span></div>) : <Empty title="Nothing assigned" detail="No SOPs or development work assigned yet." />}
      </div>
    </section>
  );
}

const JOB_STATUS_TONE: Record<string, string> = {
  proposed: "bg-black/5 text-black/60", active: "bg-emerald-50 text-emerald-800", delivered: "bg-blue-50 text-blue-700", paid: "bg-[#f3ead2] text-[#7a5c26]", cancelled: "bg-red-50 text-red-700",
};

function CardJobs({ card, busy, action }: { card: StaffCard; busy: string; action: ActionFn }) {
  const employee = card.employee;
  const [adding, setAdding] = useState(false);
  if (!employee) return null;
  const jobs = card.freelancerJobs;
  const openValue = jobs.filter(job => job.status === "active" || job.status === "proposed").reduce((sum, job) => sum + (job.feeMinor ?? 0), 0);
  const paidValue = jobs.filter(job => job.status === "paid").reduce((sum, job) => sum + (job.feeMinor ?? 0), 0);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await action("save-freelancer-job", { employeeId: employee.id, title: data.title, brief: data.brief, clientId: data.clientId, dueOn: data.dueOn, feeMinor: data.fee ? Math.round(Number(data.fee) * 100) : undefined, currency: employee.currency });
    setAdding(false);
  };
  const advance = async (jobId: string, status: string, paymentRef?: string) => { await action("set-freelancer-job-status", { jobId, status, paymentRef }); };
  const shareDeliverable = async (jobId: string) => {
    const url = window.prompt("Deliverable link (http or https):")?.trim();
    if (!url) return;
    const name = window.prompt("Name shown to the freelancer:")?.trim();
    if (!name) return;
    await action("add-freelancer-deliverable", { jobId, name, url });
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-px overflow-hidden rounded-lg border border-black/10 bg-black/10 sm:grid-cols-3">
        <div className="bg-white p-4"><p className="text-xs font-semibold uppercase text-black/40">Open jobs</p><p className="mt-2 text-2xl font-semibold">{jobs.filter(job => job.status === "proposed" || job.status === "active").length}</p></div>
        <div className="bg-white p-4"><p className="text-xs font-semibold uppercase text-black/40">Committed value</p><p className="mt-2 text-2xl font-semibold">{money(openValue, employee.currency)}</p></div>
        <div className="bg-white p-4"><p className="text-xs font-semibold uppercase text-black/40">Paid to date</p><p className="mt-2 text-2xl font-semibold">{money(paidValue, employee.currency)}</p></div>
      </section>

      <div className="flex items-center justify-between"><h3 className="font-semibold">One-time project jobs</h3><button onClick={() => setAdding(value => !value)} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white"><Plus size={15} /> New job</button></div>

      {adding ? (
        <form onSubmit={create} className="grid gap-3 rounded-lg border border-black/10 bg-white p-4 sm:grid-cols-2">
          <Input name="title" label="Job title" required />
          <Input name="clientId" label="Client / project (optional)" />
          <Input name="fee" label={`Fee (${employee.currency})`} type="number" step="0.01" />
          <Input name="dueOn" label="Due date" type="date" />
          <label className="block text-xs font-semibold text-black/55 sm:col-span-2"><span className="mb-1.5 block">Brief</span><textarea name="brief" rows={2} className="w-full rounded-md border border-black/15 bg-white p-3 text-sm font-normal" /></label>
          <button disabled={busy === "save-freelancer-job"} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white sm:col-span-2">Create job</button>
        </form>
      ) : null}

      <section className="divide-y divide-black/10 overflow-hidden rounded-lg border border-black/10 bg-white">
        {jobs.length ? jobs.map(job => (
          <div key={job.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{job.title}</p><span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${JOB_STATUS_TONE[job.status] ?? "bg-black/5"}`}>{job.status}</span></div><p className="mt-1 text-sm text-black/45">{job.feeMinor !== undefined ? money(job.feeMinor, job.currency) : "No fee set"}{job.dueOn ? ` · due ${job.dueOn}` : ""}{job.clientId ? ` · ${job.clientId}` : ""}</p>{job.brief ? <p className="mt-2 line-clamp-2 text-sm text-black/50">{job.brief}</p> : null}{job.paymentRef ? <p className="mt-1 text-xs text-black/40">Finance ref: {job.paymentRef}</p> : null}</div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <JobButton disabled={busy !== ""} onClick={() => void shareDeliverable(job.id)}>Share deliverable</JobButton>
                {job.status === "proposed" ? <JobButton disabled={busy !== ""} onClick={() => advance(job.id, "active")}>Start</JobButton> : null}
                {job.status === "active" ? <JobButton disabled={busy !== ""} onClick={() => advance(job.id, "delivered")}>Mark delivered</JobButton> : null}
                {job.status === "delivered" ? <JobButton primary disabled={busy !== ""} onClick={() => advance(job.id, "paid", window.prompt("Finance payment reference (optional):") || undefined)}>Mark paid</JobButton> : null}
                {job.status !== "paid" && job.status !== "cancelled" ? <JobButton disabled={busy !== ""} onClick={() => advance(job.id, "cancelled")}>Cancel</JobButton> : null}
              </div>
            </div>
            {job.deliverables?.length ? <div className="mt-3 border-t border-black/10 pt-3"><p className="text-xs font-semibold uppercase text-black/40">Shared deliverables</p><div className="mt-2 flex flex-wrap gap-2">{job.deliverables.map(item => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="rounded-md border border-black/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 underline">{item.name}</a>)}</div></div> : null}
            {job.submissions?.length ? <div className="mt-3 border-t border-black/10 pt-3"><p className="text-xs font-semibold uppercase text-black/40">Work received</p><div className="mt-2 flex flex-wrap gap-2">{job.submissions.map(item => <a key={item.id} href={item.url} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800 underline">{item.name}</a>)}</div></div> : null}
          </div>
        )) : <Empty title="No jobs yet" detail="Create a one-time project job for this freelancer. Track it from proposed to paid; the payment itself is recorded in Finance." />}
      </section>
    </div>
  );
}

function JobButton({ children, onClick, disabled, primary = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return <button disabled={disabled} onClick={onClick} className={`inline-flex min-h-9 items-center rounded-md px-3 text-xs font-semibold ${primary ? "bg-emerald-800 text-white" : "border border-black/10 text-black/70 hover:bg-black/[0.03]"}`}>{children}</button>;
}

const CONTRACT_KINDS: PeopleContractKind[] = ["offer", "employment", "nda", "commission", "policy", "other"];
const CONTRACT_TONE: Record<string, { chip: string; label: string }> = {
  draft: { chip: "bg-black/5 text-black/55", label: "Draft" },
  sent: { chip: "bg-amber-50 text-amber-800", label: "Awaiting sign-off" },
  acknowledged: { chip: "bg-emerald-50 text-emerald-800", label: "Signed" },
  declined: { chip: "bg-red-50 text-red-700", label: "Declined" },
};

function ContractStatusPill({ contract }: { contract: PeopleContract }) {
  const tone = CONTRACT_TONE[contract.status] ?? CONTRACT_TONE.draft;
  return <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${tone.chip}`}>{tone.label}</span>;
}

function CardContracts({ card, contractTemplates, busy, action }: { card: StaffCard; contractTemplates: StaffPeopleElementDto["contractTemplates"]; busy: string; action: ActionFn }) {
  const employee = card.employee;
  const [adding, setAdding] = useState(false);
  if (!employee) return <Empty title="No contracts" detail="The derived owner card doesn't hold staff contracts. Create a People record to manage owner agreements." />;
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await action("create-contract", { employeeId: employee!.id, kind: data.kind, templateId: data.templateId || undefined, title: data.title, body: data.body });
    setAdding(false);
  }
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-emerald-800">Staff contracts</p><h3 className="mt-1 font-semibold">{employee.name}’s agreements</h3></div><button onClick={() => setAdding(value => !value)} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white"><Plus size={15} /> New contract</button></div>

      {adding ? (
        <form onSubmit={create} className="grid gap-3 rounded-lg border border-black/10 bg-white p-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-black/55"><span className="mb-1.5 block">Type</span><select name="kind" defaultValue="employment" className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm capitalize">{CONTRACT_KINDS.map(kind => <option key={kind} value={kind}>{kind === "nda" ? "NDA" : words(kind)}</option>)}</select></label>
          <label className="block text-xs font-semibold text-black/55"><span className="mb-1.5 block">From template (optional)</span><select name="templateId" defaultValue="" className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm"><option value="">Blank</option>{contractTemplates.map(template => <option key={template.id} value={template.id}>{template.title}</option>)}</select></label>
          <Input name="title" label="Title" />
          <div className="sm:col-span-2"><label className="block text-xs font-semibold text-black/55"><span className="mb-1.5 block">Body (leave blank to use the template’s)</span><textarea name="body" rows={5} className="w-full rounded-md border border-black/15 p-3 text-sm" /></label></div>
          <button disabled={busy === "create-contract"} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white sm:col-span-2">Create draft</button>
        </form>
      ) : null}

      <section className="divide-y divide-black/10 overflow-hidden rounded-lg border border-black/10 bg-white">
        {card.contracts.length ? card.contracts.map(contract => (
          <div key={contract.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{contract.title}</p><span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-black/50">{contract.kind === "nda" ? "NDA" : contract.kind}</span><ContractStatusPill contract={contract} /></div>
              {contract.summary ? <p className="mt-1 text-sm text-black/50">{contract.summary}</p> : null}
              {contract.status === "acknowledged" ? <p className="mt-1 text-xs text-emerald-700">Signed by {contract.acknowledgementName} · {formatDate(contract.acknowledgedAt ?? contract.updatedAt)}</p> : contract.status === "sent" ? <p className="mt-1 text-xs text-black/40">Sent {formatDate(contract.sentAt ?? contract.updatedAt)} — awaiting their sign-off</p> : null}
            </div>
            {contract.status === "draft" ? <button onClick={() => action("send-contract", { contractId: contract.id })} disabled={busy === "send-contract"} className="inline-flex h-fit min-h-9 items-center gap-1 rounded-md bg-emerald-800 px-3 text-xs font-semibold text-white"><Send size={13} /> Send for sign-off</button> : null}
          </div>
        )) : <Empty title="No contracts yet" detail="Draft an offer letter, employment terms, an NDA or a commission agreement — from a template or blank." />}
      </section>
      <p className="text-xs text-black/40">Staff sign off by acknowledgement in their portal (My growth &amp; company). All staff contracts also appear in the Contracts tab.</p>
    </div>
  );
}

function ContractsCommand({ contracts, directory, onOpenPerson }: { contracts: PeopleContract[]; directory: StaffDirectoryEntry[]; onOpenPerson: (entryId: string) => void }) {
  const nameOf = (employeeId: string) => directory.find(entry => entry.employeeId === employeeId)?.name ?? "A team member";
  const groups: Array<{ key: PeopleContract["status"]; label: string }> = [
    { key: "sent", label: "Awaiting sign-off" }, { key: "draft", label: "Drafts" }, { key: "acknowledged", label: "Signed" }, { key: "declined", label: "Declined" },
  ];
  return (
    <div className="space-y-5">
      <section className="grid gap-px overflow-hidden rounded-lg border border-black/10 bg-black/10 sm:grid-cols-4">
        {groups.map(group => <div key={group.key} className="bg-white p-4"><p className="text-xs font-semibold uppercase text-black/40">{group.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{contracts.filter(contract => contract.status === group.key).length}</p></div>)}
      </section>
      {contracts.length ? groups.map(group => {
        const rows = contracts.filter(contract => contract.status === group.key);
        if (!rows.length) return null;
        return (
          <section key={group.key} className="overflow-hidden rounded-lg border border-black/10 bg-white">
            <header className="border-b border-black/10 p-4"><h3 className="font-semibold">{group.label}</h3></header>
            <div className="divide-y divide-black/10">
              {rows.map(contract => (
                <button key={contract.id} onClick={() => onOpenPerson(contract.employeeId)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-[#f7faf8]">
                  <div className="min-w-0"><p className="truncate font-medium">{contract.title}</p><p className="mt-0.5 text-sm text-black/45">{nameOf(contract.employeeId)} · {contract.kind === "nda" ? "NDA" : contract.kind}</p></div>
                  <ContractStatusPill contract={contract} />
                </button>
              ))}
            </div>
          </section>
        );
      }) : <Empty title="No staff contracts yet" detail="Create offer letters, employment terms, NDAs and commission agreements from a person’s Contracts tab. They all gather here." />}
    </div>
  );
}

function OwnerBanner() {
  return <section className="flex items-start gap-3 rounded-lg border border-[#bda169]/35 bg-[#fbf8ef] p-4"><Crown className="mt-0.5 shrink-0 text-[#8a6b2f]" size={18} /><p className="text-sm leading-6 text-black/60">This is your <strong>owner card</strong>, derived from your account so your own capacity counts. Assigned work and days worked are live; create a People record for yourself if you want to manage owner pay, access and leave here too.</p></section>;
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

function TimeAndLeave({ employees, requests, shifts, busy, action }: { employees: StaffPersonRef[]; requests: PeopleLeaveRequest[]; shifts: PeopleShift[]; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  async function saveShift(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); await action("save-shift", { ...data, startsAt: new Date(String(data.startsAt)).getTime(), endsAt: new Date(String(data.endsAt)).getTime(), status: "published" }); event.currentTarget.reset(); }
  return <div className="space-y-6"><HolidaysCalendar employees={employees} requests={requests} shifts={shifts} /><div className="grid gap-6 xl:grid-cols-[1fr_22rem]"><div className="space-y-5"><section className="rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 p-4"><h2 className="font-semibold">Leave requests</h2></header>{requests.length ? requests.map(request => { const employee = employees.find(item => item.id === request.employeeId); return <div key={request.id} className="flex flex-col gap-3 border-b border-black/10 p-4 last:border-0 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold">{employee?.name || "Unknown employee"}</p><p className="mt-1 text-sm text-black/50">{request.type} · {request.startsOn} to {request.endsOn} · {request.days} working days</p></div><span className="w-fit rounded-md bg-black/5 px-2 py-1 text-xs font-semibold capitalize">{request.status}</span>{request.status === "pending" ? <div className="flex gap-2"><button onClick={() => action("decide-leave", { requestId: request.id, status: "approved" })} className="min-h-9 rounded-md bg-emerald-800 px-3 text-xs font-semibold text-white">Approve</button><button onClick={() => action("decide-leave", { requestId: request.id, status: "rejected" })} className="min-h-9 rounded-md border border-black/10 px-3 text-xs font-semibold">Reject</button></div> : null}</div>; }) : <div className="p-5 text-sm text-black/45">No leave requests yet.</div>}</section><section className="rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 p-4"><h2 className="font-semibold">Published shifts</h2></header>{shifts.length ? shifts.map(shift => <div key={shift.id} className="flex gap-3 border-b border-black/10 p-4 last:border-0"><CalendarDays className="text-emerald-800" size={17} /><div><p className="font-semibold">{shift.title} · {employees.find(item => item.id === shift.employeeId)?.name}</p><p className="mt-1 text-sm text-black/45">{formatDateTime(shift.startsAt)} to {formatUkDate(shift.endsAt, { timeStyle: "short" })}{shift.location ? ` · ${shift.location}` : ""}</p></div></div>) : <div className="p-5 text-sm text-black/45">No shifts published.</div>}</section></div><form onSubmit={saveShift} className="h-fit rounded-lg border border-black/10 bg-white p-5"><Plus className="text-emerald-800" size={18} /><h2 className="mt-3 text-lg font-semibold">Publish shift</h2><div className="mt-5 space-y-3"><Select name="employeeId" label="Employee" options={employees.map(item => item.id)} labels={Object.fromEntries(employees.map(item => [item.id, item.name]))} /><Input name="title" label="Shift or assignment" required /><Input name="startsAt" label="Starts" type="datetime-local" required /><Input name="endsAt" label="Ends" type="datetime-local" required /><Input name="location" label="Location" /><button disabled={busy === "save-shift"} className="min-h-10 w-full rounded-md bg-black text-sm font-semibold text-white">Publish shift</button></div></form></div></div>;
}

function HolidaysCalendar({ employees, requests, shifts }: { employees: StaffPersonRef[]; requests: PeopleLeaveRequest[]; shifts: PeopleShift[] }) {
  const [monthStart, setMonthStart] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const nameOf = (employeeId: string) => employees.find(item => item.id === employeeId)?.name ?? "Someone";
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadOffset = (monthStart.getDay() + 6) % 7; // Monday-first
  const approved = requests.filter(request => request.status === "approved");
  const liveShifts = shifts.filter(shift => shift.status !== "cancelled");
  const cells: Array<{ day: number; iso: string } | null> = [
    ...Array.from({ length: leadOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => { const day = index + 1; return { day, iso: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` }; }),
  ];
  const todayIso = businessCalendarDate();
  return (
    <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
      <header className="flex items-center justify-between border-b border-black/10 p-4">
        <div className="flex items-center gap-2"><CalendarDays className="text-emerald-800" size={18} /><h2 className="font-semibold">{formatUkDate(`${year}-${String(month + 1).padStart(2, "0")}-15`, { month: "long", year: "numeric" })}</h2></div>
        <div className="flex items-center gap-2">
          <span className="mr-2 hidden items-center gap-3 text-xs text-black/50 sm:flex"><span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-full bg-amber-400" /> Leave</span><span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-full bg-emerald-500" /> Shift</span></span>
          <button aria-label="Previous month" onClick={() => setMonthStart(new Date(year, month - 1, 1))} className="inline-flex size-9 items-center justify-center rounded-md border border-black/10"><ArrowLeft size={15} /></button>
          <button onClick={() => { const now = new Date(); setMonthStart(new Date(now.getFullYear(), now.getMonth(), 1)); }} className="min-h-9 rounded-md border border-black/10 px-3 text-xs font-semibold">Today</button>
          <button aria-label="Next month" onClick={() => setMonthStart(new Date(year, month + 1, 1))} className="inline-flex size-9 items-center justify-center rounded-md border border-black/10"><ArrowUp className="rotate-90" size={15} /></button>
        </div>
      </header>
      <div className="grid grid-cols-7 border-b border-black/10 bg-[#f7f7f3] text-center text-[11px] font-semibold uppercase text-black/40">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <div key={day} className="py-2">{day}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, index) => {
          if (!cell) return <div key={`pad-${index}`} className="min-h-20 border-b border-r border-black/[0.06] bg-[#fafafa]" />;
          const onLeave = approved.filter(request => request.startsOn <= cell.iso && request.endsOn >= cell.iso);
          const dayShifts = liveShifts.filter(shift => isoDay(shift.startsAt) === cell.iso);
          const weekend = index % 7 >= 5;
          return (
            <div key={cell.iso} className={`min-h-20 border-b border-r border-black/[0.06] p-1.5 ${weekend ? "bg-[#fafaf7]" : "bg-white"}`}>
              <p className={`text-xs font-semibold ${cell.iso === todayIso ? "inline-flex size-5 items-center justify-center rounded-full bg-emerald-800 text-white" : "text-black/45"}`}>{cell.day}</p>
              <div className="mt-1 space-y-0.5">
                {onLeave.slice(0, 2).map(request => <p key={request.id} className="truncate rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-800" title={`${nameOf(request.employeeId)} · ${request.type} leave`}>{nameOf(request.employeeId).split(/\s+/)[0]}</p>)}
                {dayShifts.slice(0, 2).map(shift => <p key={shift.id} className="truncate rounded bg-emerald-50 px-1 text-[10px] font-medium text-emerald-800" title={`${nameOf(shift.employeeId)} · ${shift.title}`}>{nameOf(shift.employeeId).split(/\s+/)[0]}</p>)}
                {onLeave.length + dayShifts.length > 4 ? <p className="px-1 text-[10px] text-black/40">+{onLeave.length + dayShifts.length - 4}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Development({ employees, training, onboardingTemplate, modules, busy, action }: { employees: StaffTrainingPersonDto[]; training: PeopleTrainingAssignment[]; onboardingTemplate: PeopleProcessConfig["onboardingSteps"]; modules: PeopleTrainingModule[]; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? ""); const employee = employees.find(item => item.id === employeeId);
  async function saveTraining(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); await action("save-training", { ...data, employeeId, status: "assigned", dueAt: data.dueAt ? new Date(`${data.dueAt}T18:00:00`).getTime() : undefined }); event.currentTarget.reset(); }
  async function saveChecklist(items: PeopleEmployee["onboardingItems"]) { await action("update-onboarding", { employeeId, onboardingItems: items }); }
  return <div className="space-y-5"><OnboardingTemplateEditor steps={onboardingTemplate} busy={busy} action={action} /><TrainingModules modules={modules} busy={busy} action={action} />{employee ? <AssignModule employeeId={employee.id} employeeName={employee.name} modules={modules} busy={busy} action={action} /> : null}<div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]"><aside className="rounded-lg border border-black/10 bg-white p-3">{employees.map(item => <button key={item.id} onClick={() => setEmployeeId(item.id)} className={`min-h-11 w-full rounded-md px-3 text-left text-sm font-semibold ${employeeId === item.id ? "bg-emerald-50 text-emerald-900" : "hover:bg-black/[0.03]"}`}>{item.name}</button>)}</aside><div className="space-y-6">{employee ? <section className="rounded-lg border border-black/10 bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-emerald-800">Onboarding checklist</p><h2 className="mt-1 text-xl font-semibold">{employee.name}</h2></div><span className="text-sm font-semibold">{employee.onboardingItems.filter(item => item.status === "done").length}/{employee.onboardingItems.length}</span></div><div className="mt-5 divide-y divide-black/10 border-y border-black/10">{employee.onboardingItems.map(item => <label key={item.id} className="flex min-h-14 cursor-pointer items-center gap-3 py-3"><input type="checkbox" checked={item.status === "done"} onChange={() => saveChecklist(employee.onboardingItems.map(value => value.id === item.id ? { ...value, status: value.status === "done" ? "todo" : "done", completedAt: value.status === "done" ? undefined : Date.now() } : value))} /><span className="min-w-0 flex-1"><span className={`block text-sm font-medium ${item.status === "done" ? "text-black/35 line-through" : ""}`}>{item.label}</span><span className="mt-0.5 block text-xs text-black/40">Owned by {item.owner}</span></span></label>)}</div></section> : null}<section className="grid gap-5 xl:grid-cols-[1fr_21rem]"><div className="rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 p-4"><h2 className="font-semibold">Assigned development</h2></header>{training.filter(item => item.employeeId === employeeId).map(item => <div key={item.id} className="border-b border-black/10 p-4 last:border-0"><div className="flex justify-between gap-3"><p className="font-semibold">{item.title}</p><span className="text-xs font-semibold capitalize text-black/45">{item.status.replaceAll("-", " ")}</span></div>{item.description ? <p className="mt-2 text-sm text-black/50">{item.description}</p> : null}</div>)}{training.filter(item => item.employeeId === employeeId).length === 0 ? <p className="p-5 text-sm text-black/45">Nothing assigned yet.</p> : null}</div><form onSubmit={saveTraining} className="rounded-lg border border-black/10 bg-white p-4"><h3 className="font-semibold">Assign training</h3><div className="mt-4 space-y-3"><Input name="title" label="Training" required /><Input name="resourceUrl" label="Resource URL" type="url" /><Input name="dueAt" label="Due date" type="date" /><button disabled={busy === "save-training" || !employeeId} className="min-h-10 w-full rounded-md bg-black text-sm font-semibold text-white">Assign</button></div></form></section></div></div></div>;
}

function localId(prefix: string) { return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`; }

function TrainingModules({ modules, busy, action }: { modules: PeopleTrainingModule[]; busy: string; action: ActionFn }) {
  return (
    <details className="rounded-lg border border-black/10 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4"><GraduationCap className="text-emerald-800" size={17} /><span className="font-semibold">Training modules & quizzes</span><span className="text-xs text-black/40">— you author, staff complete</span></summary>
      <div className="space-y-3 border-t border-black/10 p-4">
        <div className="flex justify-end"><button onClick={() => action("save-training-module", { title: "New module", status: "draft" })} disabled={busy === "save-training-module"} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white"><Plus size={15} /> New module</button></div>
        {modules.length ? modules.map(module => <ModuleEditor key={module.id} module={module} busy={busy} action={action} />) : <Empty title="No modules yet" detail="Create a module, add content blocks (text, video, resources) and quiz questions, then publish and assign it." />}
      </div>
    </details>
  );
}

function ModuleEditor({ module, busy, action }: { module: PeopleTrainingModule; busy: string; action: ActionFn }) {
  const [draft, setDraft] = useState(module);
  function patch(next: Partial<PeopleTrainingModule>) { setDraft(current => ({ ...current, ...next })); }
  function addBlock(type: PeopleTrainingBlock["type"]) { patch({ blocks: [...draft.blocks, { id: localId("block"), type }] }); }
  function updateBlock(id: string, next: Partial<PeopleTrainingBlock>) { patch({ blocks: draft.blocks.map(block => block.id === id ? { ...block, ...next } : block) }); }
  function removeBlock(id: string) { patch({ blocks: draft.blocks.filter(block => block.id !== id) }); }
  function addQuestion() { patch({ quiz: [...draft.quiz, { id: localId("q"), prompt: "", options: [{ id: localId("o"), text: "", correct: true }, { id: localId("o"), text: "", correct: false }] }] }); }
  function updateQuestion(id: string, next: Partial<PeopleTrainingQuizQuestion>) { patch({ quiz: draft.quiz.map(question => question.id === id ? { ...question, ...next } : question) }); }
  function removeQuestion(id: string) { patch({ quiz: draft.quiz.filter(question => question.id !== id) }); }
  function save(status?: "draft" | "published") { void action("save-training-module", { id: draft.id, title: draft.title, summary: draft.summary, passMark: draft.passMark, blocks: draft.blocks, quiz: draft.quiz, status: status ?? draft.status }); }

  return (
    <details className="rounded-lg border border-black/10 bg-[#fafaf7]">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3"><span className="font-semibold">{draft.title || "Untitled module"}</span><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${draft.status === "published" ? "bg-emerald-50 text-emerald-800" : "bg-black/5 text-black/50"}`}>{draft.status}</span><span className="ml-auto text-xs text-black/40">{draft.blocks.length} blocks · {draft.quiz.length} questions</span></summary>
      <div className="space-y-4 border-t border-black/10 p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input label="Title" value={draft.title} onChange={value => patch({ title: value })} />
          <Input label="Pass mark (%)" type="number" value={draft.passMark} onChange={value => patch({ passMark: Number(value) })} />
          <div className="sm:col-span-2"><Input label="Summary" value={draft.summary ?? ""} onChange={value => patch({ summary: value })} /></div>
        </div>

        <div>
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase text-black/45">Content blocks</p><div className="flex gap-1">{(["heading", "text", "video", "resource"] as const).map(type => <button key={type} onClick={() => addBlock(type)} className="rounded-md border border-black/10 px-2 py-1 text-[11px] font-semibold capitalize hover:bg-black/[0.03]">+ {type}</button>)}</div></div>
          <div className="mt-2 space-y-2">
            {draft.blocks.map(block => (
              <div key={block.id} className="flex items-start gap-2 rounded-md border border-black/10 bg-white p-2">
                <span className="mt-1 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-black/50">{block.type}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  {block.type === "heading" || block.type === "text" ? <textarea value={block.text ?? ""} onChange={event => updateBlock(block.id, { text: event.target.value })} rows={block.type === "text" ? 3 : 1} placeholder={block.type === "heading" ? "Heading" : "Paragraph text"} className="w-full rounded border border-black/15 p-2 text-sm" /> : null}
                  {block.type === "video" || block.type === "resource" ? <input value={block.url ?? ""} onChange={event => updateBlock(block.id, { url: event.target.value })} placeholder={block.type === "video" ? "Video URL" : "Resource URL"} className="min-h-9 w-full rounded border border-black/15 px-2 text-sm" /> : null}
                  {block.type === "resource" ? <input value={block.label ?? ""} onChange={event => updateBlock(block.id, { label: event.target.value })} placeholder="Link label" className="min-h-9 w-full rounded border border-black/15 px-2 text-sm" /> : null}
                </div>
                <button type="button" onClick={() => removeBlock(block.id)} aria-label={`Remove this ${block.type} block`} className="mt-1 inline-flex size-7 items-center justify-center rounded-md border border-red-200 text-red-600"><X size={13} aria-hidden /></button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase text-black/45">Quiz</p><button onClick={addQuestion} className="rounded-md border border-black/10 px-2 py-1 text-[11px] font-semibold hover:bg-black/[0.03]">+ Question</button></div>
          <div className="mt-2 space-y-2">
            {draft.quiz.map(question => (
              <div key={question.id} className="rounded-md border border-black/10 bg-white p-2">
                <div className="flex items-start gap-2"><input value={question.prompt} onChange={event => updateQuestion(question.id, { prompt: event.target.value })} placeholder="Question" className="min-h-9 min-w-0 flex-1 rounded border border-black/15 px-2 text-sm font-medium" /><button type="button" onClick={() => removeQuestion(question.id)} aria-label={`Remove question "${question.prompt.trim() || "untitled"}"`} className="inline-flex size-7 items-center justify-center rounded-md border border-red-200 text-red-600"><X size={13} aria-hidden /></button></div>
                <div className="mt-2 space-y-1 pl-1">
                  {question.options.map(option => (
                    <label key={option.id} className="flex items-center gap-2">
                      <input type="radio" name={`correct-${question.id}`} checked={option.correct} onChange={() => updateQuestion(question.id, { options: question.options.map(o => ({ ...o, correct: o.id === option.id })) })} />
                      <input value={option.text} onChange={event => updateQuestion(question.id, { options: question.options.map(o => o.id === option.id ? { ...o, text: event.target.value } : o) })} placeholder="Answer option" className="min-h-8 min-w-0 flex-1 rounded border border-black/15 px-2 text-sm" />
                      <button onClick={() => updateQuestion(question.id, { options: question.options.filter(o => o.id !== option.id) })} className="text-xs text-black/40">remove</button>
                    </label>
                  ))}
                  <button onClick={() => updateQuestion(question.id, { options: [...question.options, { id: localId("o"), text: "", correct: false }] })} className="text-xs font-semibold text-emerald-800">+ option</button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-black/40">A question needs ≥2 options with one marked correct. Pick the correct one with the radio.</p>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={() => save("draft")} disabled={busy === "save-training-module"} className="min-h-9 rounded-md border border-black/10 px-4 text-sm font-semibold">Save draft</button>
          <button onClick={() => save("published")} disabled={busy === "save-training-module"} className="min-h-9 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white">Save & publish</button>
        </div>
      </div>
    </details>
  );
}

function AssignModule({ employeeId, employeeName, modules, busy, action }: { employeeId: string; employeeName: string; modules: PeopleTrainingModule[]; busy: string; action: ActionFn }) {
  const [pick, setPick] = useState("");
  const published = modules.filter(module => module.status === "published");
  if (!published.length) return null;
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-white p-3">
      <span className="text-sm font-semibold">Assign a module to {employeeName.split(/\s+/)[0]}:</span>
      <select value={pick} onChange={event => setPick(event.target.value)} className="min-h-9 rounded-md border border-black/15 bg-white px-2 text-sm"><option value="">Choose a module…</option>{published.map(module => <option key={module.id} value={module.id}>{module.title}</option>)}</select>
      <button disabled={!pick || busy === "assign-module"} onClick={() => { void action("assign-module", { employeeId, moduleId: pick }); setPick(""); }} className="min-h-9 rounded-md bg-black px-3 text-sm font-semibold text-white disabled:opacity-40">Assign</button>
    </section>
  );
}

function Rewards({ employees, selectedEmployeeId, setSelectedEmployeeId, busy, action }: { employees: StaffPayPersonDto[]; selectedEmployeeId: string; setSelectedEmployeeId: (id: string) => void; busy: string; action: (name: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  const employee = employees.find(item => item.id === selectedEmployeeId) ?? employees[0];
  const [rules, setRules] = useState<PeopleCommissionRule[]>(employee?.commissionRules ?? []);
  function choose(id: string) { setSelectedEmployeeId(id); setRules(employees.find(item => item.id === id)?.commissionRules ?? []); }
  function addRule() { setRules(current => [...current, { id: `commission_${Date.now()}`, label: "New commission plan", basis: "revenue", ratePercent: 10, cadence: "per-event", status: "draft" }]); }
  if (!employee) return <Empty title="No employee selected" detail="Commission rules attach to a retained People record." />;
  return <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]"><aside className="rounded-lg border border-black/10 bg-white p-3">{employees.map(item => <button key={item.id} onClick={() => choose(item.id)} className={`min-h-11 w-full rounded-md px-3 text-left text-sm font-semibold ${employee.id === item.id ? "bg-emerald-50 text-emerald-900" : "hover:bg-black/[0.03]"}`}>{item.name}</button>)}</aside><section className="rounded-lg border border-black/10 bg-white p-5"><div className="flex flex-col justify-between gap-3 border-b border-black/10 pb-5 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase text-[#8a6b2f]">Compensation control</p><h2 className="mt-1 text-xl font-semibold">{employee.name}</h2><p className="mt-1 text-sm text-black/50">{employee.payBasis.replaceAll("-", " ")} · {money(employee.basePayMinor ?? 0, employee.currency)}</p></div><div className="flex gap-2"><button onClick={addRule} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-semibold"><Plus size={15} /> Rule</button><button onClick={() => action("update-commission", { employeeId: employee.id, commissionRules: rules })} disabled={busy === "update-commission"} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white">Save commission</button></div></div><div className="mt-5 space-y-3">{rules.length ? rules.map((rule, index) => <div key={rule.id} className="grid gap-3 rounded-md border border-black/10 bg-[#fafaf7] p-4 sm:grid-cols-2 xl:grid-cols-5"><Input label="Plan" value={rule.label} onChange={value => setRules(current => current.map((item, i) => i === index ? { ...item, label: value } : item))} /><Select label="Basis" value={rule.basis} onChange={value => setRules(current => current.map((item, i) => i === index ? { ...item, basis: value as PeopleCommissionRule["basis"] } : item))} options={["revenue", "gross-margin", "new-client", "product", "fixed-bonus"]} /><Input label="Rate %" type="number" value={rule.ratePercent ?? ""} onChange={value => setRules(current => current.map((item, i) => i === index ? { ...item, ratePercent: Number(value) } : item))} /><Select label="Cadence" value={rule.cadence} onChange={value => setRules(current => current.map((item, i) => i === index ? { ...item, cadence: value as PeopleCommissionRule["cadence"] } : item))} options={["per-event", "monthly", "quarterly"]} /><Select label="Status" value={rule.status} onChange={value => setRules(current => current.map((item, i) => i === index ? { ...item, status: value as PeopleCommissionRule["status"] } : item))} options={["draft", "active", "paused", "retired"]} /></div>) : <Empty title="No commission rules" detail="Add a fixed or percentage rule. Drafts remain invisible to the employee until activated." />}</div></section></div>;
}

function Empty({ title, detail }: { title: string; detail: string }) { return <div className="rounded-lg border border-dashed border-black/15 bg-white p-8 text-center"><Settings2 className="mx-auto text-black/25" size={22} /><p className="mt-3 font-semibold">{title}</p><p className="mx-auto mt-1 max-w-md text-sm text-black/45">{detail}</p></div>; }
function Meta({ label, value, inverse = false }: { label: string; value: string; inverse?: boolean }) { return <div className="flex items-center justify-between gap-3"><dt className={`text-xs font-semibold uppercase ${inverse ? "text-white/40" : "text-black/35"}`}>{label}</dt><dd className={`text-sm font-medium capitalize ${inverse ? "text-white" : "text-black/80"}`}>{value}</dd></div>; }

function Input(props: { label: string; name?: string; type?: string; defaultValue?: string | number; value?: string | number; onChange?: (value: string) => void; required?: boolean; step?: string; maxLength?: number }) { const { label, onChange, ...inputProps } = props; return <label className="block text-xs font-semibold text-black/55"><span className="mb-1.5 block">{label}</span><input {...inputProps} onChange={onChange ? event => onChange(event.target.value) : undefined} className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black" /></label>; }
function Select(props: { label: string; name?: string; options: string[]; labels?: Record<string, string>; defaultValue?: string; value?: string; onChange?: (value: string) => void }) { const { label, options, labels, onChange, ...selectProps } = props; return <label className="block text-xs font-semibold text-black/55"><span className="mb-1.5 block">{label}</span><select {...selectProps} onChange={onChange ? event => onChange(event.target.value) : undefined} className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black">{options.map(option => <option key={option} value={option}>{labels?.[option] ?? option.replaceAll("-", " ")}</option>)}</select></label>; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?"; }
function isoDay(value: number) { return dateInputValue(value); }
function formatDate(value: number) { return formatUkDate(value, { dateStyle: "medium" }); }
function formatDateTime(value: number) { return formatUkDate(value, { dateStyle: "medium", timeStyle: "short" }); }
function money(value: number, currency: string) { return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value / 100); }
function words(value: string) { return value.replaceAll("-", " "); }
function formatHours(ms: number) { return `${(ms / 3_600_000).toFixed(1)}h`; }
function relativeDay(value: number) { const days = Math.floor((Date.now() - value) / 86_400_000); if (days <= 0) return "today"; if (days === 1) return "yesterday"; if (days < 7) return `${days}d ago`; return formatDate(value); }
function presenceDotClass(state: StaffPresenceState) { return state === "online" ? "bg-emerald-500" : state === "idle" ? "bg-amber-400" : "bg-black/20"; }
function capacityAreaLabelClient(areaId: string) { return areaId.split("-").map((word, index) => index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word).join(" "); }
function presenceLabel(entry: StaffDirectoryEntry) { if (entry.presence.state === "online") return "Online"; if (entry.presence.state === "idle") return "Idle"; return entry.presence.lastSeenAt ? relativeDay(entry.presence.lastSeenAt) : "—"; }
