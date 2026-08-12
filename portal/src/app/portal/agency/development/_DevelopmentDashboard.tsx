import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Blocks,
  BookOpen,
  CheckCircle2,
  Code2,
  Eye,
  GitBranch,
  Globe2,
  Layers3,
  RadioTower,
  Rocket,
  Workflow,
} from "lucide-react";

import type { DevelopmentProjectRow, DevelopmentProjectStatus } from "./_DevelopmentPortfolio";

interface Props {
  projects: DevelopmentProjectRow[];
  toolkitCount: number;
  vaultCount: number;
  workflowCount: number;
  sopCount: number;
}

const pipeline: Array<{ status: DevelopmentProjectStatus; label: string }> = [
  { status: "planning", label: "Planning" },
  { status: "building", label: "Building" },
  { status: "review", label: "Review" },
  { status: "live", label: "Live" },
];

export function DevelopmentDashboard({ projects, toolkitCount, vaultCount, workflowCount, sopCount }: Props) {
  const active = projects.filter(project => project.status !== "archived");
  const live = active.filter(project => ["live", "redirected"].includes(project.status)).length;
  const inProgress = active.filter(project => ["planning", "building", "review"].includes(project.status)).length;
  const attention = active.filter(project => project.issue || project.errors24h > 0 || project.tagStatus === "missing" || project.tagStatus === "broken");
  const views24h = active.reduce((sum, project) => sum + project.views24h, 0);
  const errors24h = active.reduce((sum, project) => sum + project.errors24h, 0);
  const monitoringRequired = active.filter(project => project.tagStatus !== "not-needed");
  const monitored = monitoringRequired.filter(project => project.tagStatus === "installed").length;
  const coverage = monitoringRequired.length ? Math.round(monitored / monitoringRequired.length * 100) : 100;
  const ecosystem = active.filter(project => project.owner === "Ecosystem").length;
  const clients = active.filter(project => project.owner === "Client").length;
  const recentSignals = [...active]
    .filter(project => project.lastSignalAt)
    .sort((a, b) => (b.lastSignalAt ?? 0) - (a.lastSignalAt ?? 0))
    .slice(0, 5);

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-5 border-b border-black/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand"><Code2 size={13} aria-hidden /> Development dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold text-black/90">Build, release and monitor from one view.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">See every first-party and client build, what is moving, what is live, and what needs intervention before opening the full project workspace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/portal/agency/development?view=workspace" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85">
            <GitBranch size={16} /> Open development workspace
          </Link>
          <Link href="/portal/agency/development/website" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-black/65 hover:border-black/25 hover:text-black">
            <Globe2 size={16} /> Website control
          </Link>
        </div>
      </header>

      <section aria-label="Development health" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Active projects" value={String(active.length)} detail={`${ecosystem} ecosystem · ${clients} client`} icon={<Layers3 size={16} />} tone="blue" />
        <Metric label="In progress" value={String(inProgress)} detail={`${countStatus(active, "review")} awaiting review`} icon={<Workflow size={16} />} tone="violet" />
        <Metric label="Live systems" value={String(live)} detail={`${active.length ? Math.round(live / active.length * 100) : 0}% of active portfolio`} icon={<Rocket size={16} />} tone="emerald" />
        <Metric label="Monitoring" value={`${coverage}%`} detail={`${monitored} of ${monitoringRequired.length} connected`} icon={<RadioTower size={16} />} tone={coverage < 80 ? "amber" : "emerald"} />
        <Metric label="Needs attention" value={String(attention.length)} detail={`${errors24h} errors in 24h`} icon={<AlertTriangle size={16} />} tone={attention.length ? "amber" : "emerald"} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <div>
          <SectionHeading eyebrow="Delivery state" title="Build pipeline" detail="The current movement from planning through production." action={{ label: "Manage projects", href: "/portal/agency/development?view=workspace" }} />
          <div className="mt-4 grid border-y border-black/10 sm:grid-cols-2 lg:grid-cols-4">
            {pipeline.map((stage, index) => {
              const count = countStatus(active, stage.status);
              return (
                <Link key={stage.status} href={`/portal/agency/development?view=workspace&status=${stage.status}`} className={`group min-h-32 px-4 py-5 ${index ? "border-t border-black/10 sm:border-l sm:border-t-0" : ""} ${index === 2 ? "lg:border-l" : ""}`}>
                  <span className="text-[10px] font-semibold uppercase text-black/35">0{index + 1}</span>
                  <span className="mt-3 flex items-end justify-between gap-3">
                    <span><strong className="block text-2xl font-semibold text-black/80">{count}</strong><span className="mt-1 block text-xs font-medium text-black/50">{stage.label}</span></span>
                    <ArrowRight size={16} className="mb-1 text-black/20 transition group-hover:translate-x-0.5 group-hover:text-brand" />
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="mt-7">
            <SectionHeading eyebrow="Portfolio watch" title="Attention queue" detail="Only projects with a concrete issue, broken signal, or recent error appear here." />
            <div className="mt-3 divide-y divide-black/[0.07] border-y border-black/10">
              {attention.length ? attention.slice(0, 6).map(project => (
                <Link key={project.id} href={project.managementHref} className="group flex min-h-16 items-center gap-3 py-3">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-md ${project.errors24h || project.tagStatus === "broken" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                    {project.errors24h ? <Code2 size={16} /> : <AlertTriangle size={16} />}
                  </span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-semibold text-black/75">{project.name}</strong><span className="mt-0.5 block truncate text-xs text-black/45">{project.issue || `${project.errors24h} errors in the last 24 hours`}</span></span>
                  <span className="hidden text-[11px] font-medium text-black/35 sm:block">{project.clientName}</span>
                  <ArrowRight size={15} className="shrink-0 text-black/20 transition group-hover:translate-x-0.5 group-hover:text-brand" />
                </Link>
              )) : (
                <div className="flex min-h-28 items-center justify-center gap-3 text-sm text-emerald-700"><CheckCircle2 size={18} /> No active project issues detected.</div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-7">
          <div>
            <SectionHeading eyebrow="Live estate" title="Signals today" detail="Portfolio telemetry across connected properties." />
            <div className="mt-4 grid grid-cols-2 border-y border-black/10">
              <Signal label="Views" value={String(views24h)} icon={<Eye size={15} />} />
              <Signal label="Errors" value={String(errors24h)} icon={<Activity size={15} />} bad={errors24h > 0} />
            </div>
            <div className="divide-y divide-black/[0.07]">
              {recentSignals.length ? recentSignals.map(project => (
                <Link key={project.id} href={project.managementHref} className="flex items-center gap-3 py-3 text-xs">
                  <span className={`size-2 shrink-0 rounded-full ${project.errors24h ? "bg-red-500" : "bg-emerald-500"}`} />
                  <span className="min-w-0 flex-1 truncate font-medium text-black/65">{project.name}</span>
                  <span className="shrink-0 text-black/35">{relativeSignal(project.lastSignalAt)}</span>
                </Link>
              )) : <p className="py-5 text-xs leading-5 text-black/40">No connected project has reported a signal yet.</p>}
            </div>
          </div>

          <div>
            <SectionHeading eyebrow="Build system" title="Development library" detail="Reusable knowledge and controls behind delivery." />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <WorkspaceLink href="/portal/agency/development/toolkit" title="Toolkit" value={toolkitCount} detail="Tools, templates and components" icon={<Blocks size={16} />} />
              <WorkspaceLink href="/portal/agency/development/vault" title="Knowledge vault" value={vaultCount} detail="Knowledge, courses and credentials" icon={<BookOpen size={16} />} />
              <WorkspaceLink href="/portal/agency/development/workflow" title="Build flows" value={workflowCount} detail="Reusable delivery workflows" icon={<Workflow size={16} />} />
              <WorkspaceLink href="/portal/agency/sop-library" title="Linked SOPs" value={sopCount} detail="Operational development processes" icon={<CheckCircle2 size={16} />} />
            </div>
          </div>
        </aside>
      </section>

      <section>
        <SectionHeading eyebrow="Workspaces" title="Go deeper" detail="Open the specialist surface needed for the next decision." />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink href="/portal/agency/development?view=workspace" title="Project workspace" detail="Search, filter and manage every build." icon={<GitBranch size={17} />} />
          <QuickLink href="/portal/agency/development/website" title="Website control" detail="Preview, release and monitor the first-party site." icon={<Globe2 size={17} />} />
          <QuickLink href="/portal/agency/development/performance" title="Performance" detail="Traffic, conversions, experiments and reports." icon={<Activity size={17} />} />
          <QuickLink href="/portal/agency/development/workflow" title="Build flow" detail="Configure repeatable delivery stages." icon={<Workflow size={17} />} />
        </div>
      </section>
    </div>
  );
}

function countStatus(projects: DevelopmentProjectRow[], status: DevelopmentProjectStatus) {
  return projects.filter(project => project.status === status).length;
}

function Metric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone: "blue" | "emerald" | "violet" | "amber" }) {
  return <div className="mm-kpi-card mm-surface-card min-h-28 rounded-md p-4" data-kpi-tone={tone}><span className="mm-kpi-icon">{icon}</span><p className="mt-4 text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 text-2xl font-semibold text-black/80">{value}</p><p className="mt-1 text-[11px] text-black/40">{detail}</p></div>;
}

function SectionHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: { label: string; href: string } }) {
  return <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-brand">{eyebrow}</p><h2 className="mt-1 text-lg font-semibold text-black/80">{title}</h2><p className="mt-1 text-xs leading-5 text-black/45">{detail}</p></div>{action ? <Link href={action.href} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-brand hover:underline">{action.label}<ArrowRight size={13} /></Link> : null}</div>;
}

function Signal({ label, value, icon, bad = false }: { label: string; value: string; icon: React.ReactNode; bad?: boolean }) {
  return <div className="flex min-h-24 items-center gap-3 px-3 first:border-r first:border-black/10"><span className={bad ? "text-red-600" : "text-brand"}>{icon}</span><span><span className="block text-[10px] font-semibold uppercase text-black/35">{label}</span><strong className={`mt-1 block text-xl ${bad ? "text-red-700" : "text-black/75"}`}>{value}</strong></span></div>;
}

function WorkspaceLink({ href, title, value, detail, icon }: { href: string; title: string; value: number; detail: string; icon: React.ReactNode }) {
  return <Link href={href} className="mm-interactive-row group flex min-h-16 items-center gap-3 border-y border-black/[0.07] px-1 py-3"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/[0.04] text-black/50">{icon}</span><span className="min-w-0 flex-1"><strong className="block text-sm font-semibold text-black/70">{title}</strong><span className="block truncate text-[11px] text-black/40">{detail}</span></span><strong className="text-sm text-black/55">{value}</strong><ArrowRight size={14} className="text-black/20 transition group-hover:translate-x-0.5 group-hover:text-brand" /></Link>;
}

function QuickLink({ href, title, detail, icon }: { href: string; title: string; detail: string; icon: React.ReactNode }) {
  return <Link href={href} className="mm-surface-card mm-hover-lift group flex min-h-32 flex-col rounded-md p-4"><span className="grid size-9 place-items-center rounded-md bg-brand/10 text-brand">{icon}</span><strong className="mt-4 text-sm font-semibold text-black/75">{title}</strong><span className="mt-1 text-xs leading-5 text-black/45">{detail}</span><ArrowRight size={14} className="mt-auto self-end text-black/20 transition group-hover:translate-x-0.5 group-hover:text-brand" /></Link>;
}

function relativeSignal(value?: number) {
  if (!value) return "No signal";
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
