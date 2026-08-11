"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  ArrowUpRight,
  Boxes,
  ExternalLink,
  FolderGit2,
  GitBranch,
  Globe2,
  LayoutDashboard,
  LayoutTemplate,
  LoaderCircle,
  RadioTower,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

export type DevelopmentProjectStatus =
  | "planning"
  | "building"
  | "review"
  | "live"
  | "redirected"
  | "archived";

export type DevelopmentProjectKind =
  | "website"
  | "client-portal"
  | "dev-portal"
  | "software"
  | "lead-magnet"
  | "repo"
  | "template"
  | "tag";

export interface DevelopmentProjectRow {
  id: string;
  name: string;
  kind: DevelopmentProjectKind;
  status: DevelopmentProjectStatus;
  owner: "Ecosystem" | "Client";
  clientId?: string;
  builderReady?: boolean;
  clientName: string;
  managementHref: string;
  previewUrl?: string;
  liveUrl?: string;
  repoUrl?: string;
  localPath?: string;
  folder?: string;
  tags?: string[];
  telemetrySiteKey?: string;
  telemetryPropertyId?: string;
  tagStatus?: "planned" | "installed" | "missing" | "broken" | "not-needed";
  lastSignalAt?: number;
  views24h: number;
  errors24h: number;
  issue?: string;
  statusDetail?: string;
}

const views = [
  { id: "all", label: "All projects" },
  { id: "owned", label: "Our ecosystem" },
  { id: "website", label: "Websites" },
  { id: "portal", label: "Portals" },
  { id: "software", label: "Software" },
  { id: "lead-magnet", label: "Lead magnets" },
  { id: "attention", label: "Needs attention" },
] as const;

const statuses: Array<{ id: DevelopmentProjectStatus; label: string }> = [
  { id: "planning", label: "Planning" },
  { id: "building", label: "Building" },
  { id: "review", label: "Review" },
  { id: "live", label: "Live" },
  { id: "redirected", label: "Handed over" },
  { id: "archived", label: "Archived" },
];

const kindLabels: Record<DevelopmentProjectKind, string> = {
  website: "Website",
  "client-portal": "Client portal",
  "dev-portal": "Development portal",
  software: "Software",
  "lead-magnet": "Lead magnet",
  repo: "Repository",
  template: "Template",
  tag: "Monitoring tag",
};

export function DevelopmentPortfolio({
  initialProjects,
}: {
  initialProjects: DevelopmentProjectRow[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [view, setView] = useState<(typeof views)[number]["id"]>("all");
  const [status, setStatus] = useState("active");
  const [folder, setFolder] = useState("all");
  const [tag, setTag] = useState("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter(project => {
      const matchesView =
        view === "all"
        || (view === "owned" && project.owner === "Ecosystem")
        || (view === "website" && project.kind === "website")
        || (view === "portal" && ["client-portal", "dev-portal"].includes(project.kind))
        || (view === "software" && ["software", "repo", "template"].includes(project.kind))
        || (view === "lead-magnet" && project.kind === "lead-magnet")
        || (view === "attention" && Boolean(project.issue));
      const matchesStatus = status === "all"
        || (status === "active" && project.status !== "archived")
        || project.status === status;
      const matchesFolder = folder === "all" || folderRoot(project.folder) === folder;
      const matchesTag = tag === "all" || project.tags?.includes(tag);
      const matchesQuery = !needle || [
        project.name,
        project.clientName,
        kindLabels[project.kind],
        project.repoUrl,
        project.liveUrl,
        project.localPath,
        project.folder,
        project.telemetryPropertyId,
        ...(project.tags ?? []),
      ].some(value => value?.toLowerCase().includes(needle));
      return matchesView && matchesStatus && matchesFolder && matchesTag && matchesQuery;
    });
  }, [folder, projects, query, status, tag, view]);

  const folders = useMemo(() => Array.from(new Set(projects.map(project => folderRoot(project.folder)))).sort(), [projects]);
  const tags = useMemo(() => Array.from(new Set(projects.flatMap(project => project.tags ?? []))).sort(), [projects]);

  const counts = useMemo(() => ({
    total: projects.filter(project => project.status !== "archived").length,
    building: projects.filter(project => project.status === "building" || project.status === "review").length,
    live: projects.filter(project => project.status === "live" || project.status === "redirected").length,
    attention: projects.filter(project => project.issue).length,
  }), [projects]);

  async function updateStatus(project: DevelopmentProjectRow, nextStatus: DevelopmentProjectStatus) {
    if (!project.clientId) return;
    setBusyId(project.id);
    setNotice("");
    try {
      const response = await fetch("/api/tenants/client-properties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: project.clientId,
          action: "update",
          property: { id: project.id, status: nextStatus },
        }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) {
        setNotice(result?.error ?? "Project status could not be updated.");
        return;
      }
      setProjects(current => current.map(item => item.id === project.id
        ? { ...item, status: nextStatus, issue: nextStatus === "review" ? "Ready for review" : item.issue === "Ready for review" ? undefined : item.issue }
        : item));
      setNotice(`${project.name} moved to ${statusLabel(nextStatus)}.`);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Development</p>
          <h1 className="mt-1 text-3xl font-semibold text-black/90">Everything we build.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
            Every website, portal, software product, repository and live signal across the Personal EcoSystem and client work.
          </p>
        </div>
        <Link href="/portal/clients" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85">
          <Boxes size={16} />Add client project
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={<LayoutDashboard size={16} />} label="Projects" value={counts.total} tone="blue" />
        <Metric icon={<AppWindow size={16} />} label="In progress" value={counts.building} tone="violet" />
        <Metric icon={<RadioTower size={16} />} label="Live" value={counts.live} tone="emerald" />
        <Metric icon={<AlertTriangle size={16} />} label="Needs attention" value={counts.attention} tone={counts.attention ? "amber" : "emerald"} />
      </section>

      <section>
        <div className="flex flex-col gap-3 border-b border-black/10 pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex gap-1 overflow-x-auto" aria-label="Project views">
            {views.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`min-h-9 shrink-0 rounded-md px-3 text-xs font-semibold ${view === item.id ? "bg-black text-white" : "text-black/50 hover:bg-black/[0.04] hover:text-black/75"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:flex">
            <label className="relative min-w-0 flex-1 xl:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" size={15} />
              <span className="sr-only">Search projects</span>
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search projects"
                className="min-h-10 w-full rounded-md border border-black/10 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand"
              />
            </label>
            <select
              value={status}
              onChange={event => setStatus(event.target.value)}
              aria-label="Filter project status"
              className="min-h-10 min-w-32 rounded-md border border-black/10 bg-white px-3 text-sm text-black/65 outline-none focus:border-brand"
            >
              <option value="active">Active</option>
              <option value="all">All statuses</option>
              {statuses.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <select
              value={folder}
              onChange={event => setFolder(event.target.value)}
              aria-label="Filter project folder"
              className="min-h-10 min-w-32 rounded-md border border-black/10 bg-white px-3 text-sm text-black/65 outline-none focus:border-brand"
            >
              <option value="all">All folders</option>
              {folders.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <select
              value={tag}
              onChange={event => setTag(event.target.value)}
              aria-label="Filter project tag"
              className="min-h-10 min-w-32 rounded-md border border-black/10 bg-white px-3 text-sm text-black/65 outline-none focus:border-brand"
            >
              <option value="all">All tags</option>
              {tags.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>

        {notice ? <p role="status" className="mt-3 text-xs font-medium text-brand">{notice}</p> : null}

        {filtered.length ? (
          <div className="grid gap-2 pt-4">
            {filtered.map(project => (
              <article key={project.id} className="mm-surface-card mm-hover-lift grid gap-4 rounded-md p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(180px,.6fr)_160px_auto] lg:items-center">
                <div className="flex min-w-0 gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-md ${projectIconTone(project.kind)}`}>
                    <ProjectIcon kind={project.kind} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-black/85">{project.name}</h2>
                      {project.owner === "Ecosystem" ? <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand">Ours</span> : null}
                      {project.issue ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{project.issue}</span> : null}
                      <TagStatusBadge status={project.tagStatus} />
                    </div>
                    <p className="mt-1 text-xs text-black/45">{kindLabels[project.kind]} · {project.clientName}</p>
                    {project.folder ? <p className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-[11px] font-medium text-black/40"><FolderGit2 size={12} className="shrink-0" />{project.folder}</p> : null}
                    <p className="mt-1 truncate text-[11px] text-black/35">{project.statusDetail || project.repoUrl || project.localPath || "Project record ready"}</p>
                    {project.tags?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {project.tags.slice(0, 5).map(item => <span key={item} className="rounded bg-black/[0.045] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-black/45">{item}</span>)}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <MiniMetric label="Views" value={String(project.views24h)} />
                  <MiniMetric label="Errors" value={String(project.errors24h)} bad={project.errors24h > 0} />
                  <MiniMetric label="Signal" value={lastSignal(project.lastSignalAt)} />
                </div>

                {project.clientId ? (
                  <label className="relative">
                    <span className="sr-only">{project.name} status</span>
                    <select
                      value={project.status}
                      disabled={busyId === project.id}
                      onChange={event => void updateStatus(project, event.target.value as DevelopmentProjectStatus)}
                      className="min-h-10 w-full rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/65 outline-none focus:border-brand disabled:opacity-50"
                    >
                      {statuses.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                    {busyId === project.id ? <LoaderCircle className="absolute right-8 top-3 animate-spin text-black/35" size={14} /> : null}
                  </label>
                ) : (
                  <span className="inline-flex min-h-10 items-center rounded-md bg-black/[0.04] px-3 text-xs font-semibold text-black/60">{statusLabel(project.status)}</span>
                )}

                <div className="flex items-center justify-end gap-1">
                  {project.clientId && ["website", "lead-magnet"].includes(project.kind) ? (
                    <Link
                      href={project.builderReady
                        ? `/portal/clients/${encodeURIComponent(project.clientId)}/edit-website`
                        : `/portal/clients/${encodeURIComponent(project.clientId)}?tab=website`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-2 text-[11px] font-semibold text-black/55 hover:bg-black/[0.04] hover:text-black/80"
                    >
                      <LayoutTemplate size={13} aria-hidden="true" /> Design
                    </Link>
                  ) : null}
                  {project.liveUrl ? <ProjectLink href={project.liveUrl} label="Public gate" icon={<Globe2 size={14} />} text /> : null}
                  {project.previewUrl ? <ProjectLink href={project.previewUrl} label="Real preview" icon={<ExternalLink size={14} />} text /> : null}
                  {project.repoUrl ? <ProjectLink href={project.repoUrl} label={`Open ${project.name} repository`} icon={<GitBranch size={15} />} /> : null}
                  <Link href={project.managementHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85">
                    Manage <ArrowUpRight size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mm-surface-card mt-4 rounded-md py-16 text-center">
            <Search className="mx-auto text-black/25" size={25} />
            <h2 className="mt-3 text-sm font-semibold text-black/75">No matching projects</h2>
            <p className="mt-1 text-xs text-black/45">Change the view, status or search.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectIcon({ kind }: { kind: DevelopmentProjectKind }) {
  if (kind === "website") return <Globe2 size={17} />;
  if (kind === "lead-magnet") return <Activity size={17} />;
  if (kind === "repo") return <GitBranch size={17} />;
  if (kind === "tag") return <RadioTower size={17} />;
  return <AppWindow size={17} />;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "blue" | "emerald" | "violet" | "amber" }) {
  return (
    <div className="mm-kpi-card mm-surface-card mm-hover-lift flex min-h-24 items-center gap-3 rounded-md p-4" data-kpi-tone={tone}>
      <span className="mm-kpi-icon">{icon}</span>
      <div><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-0.5 text-xl font-semibold text-black/80">{value}</p></div>
    </div>
  );
}

function projectIconTone(kind: DevelopmentProjectKind) {
  if (kind === "website") return "bg-blue-50 text-blue-700";
  if (["client-portal", "dev-portal"].includes(kind)) return "bg-violet-50 text-violet-700";
  if (kind === "lead-magnet") return "bg-pink-50 text-pink-700";
  if (kind === "tag") return "bg-emerald-50 text-emerald-700";
  return "bg-cyan-50 text-cyan-700";
}

function MiniMetric({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return <div><p className="text-[10px] uppercase text-black/30">{label}</p><p className={`mt-1 truncate font-semibold ${bad ? "text-red-700" : "text-black/60"}`}>{value}</p></div>;
}

function ProjectLink({ href, label, icon, text = false }: { href: string; label: string; icon: React.ReactNode; text?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} className={`${text ? "inline-flex w-auto gap-1.5 px-2" : "grid size-9"} min-h-9 place-items-center rounded-md text-black/45 hover:bg-black/[0.05] hover:text-black/80`}>
      {icon}{text ? <span className="text-[11px] font-medium">{label}</span> : null}
    </a>
  );
}

function statusLabel(status: DevelopmentProjectStatus) {
  return statuses.find(item => item.id === status)?.label ?? status;
}

function lastSignal(value?: number) {
  if (!value) return "Waiting";
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60_000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

function folderRoot(folder?: string) {
  return folder?.split("/").filter(Boolean)[0] ?? "Unfiled";
}

function TagStatusBadge({ status }: { status?: DevelopmentProjectRow["tagStatus"] }) {
  if (!status || status === "not-needed") return null;
  const labels = {
    installed: "Tag installed",
    planned: "Tag planned",
    missing: "Tag missing",
    broken: "Tag broken",
  } as const;
  const tone = status === "installed"
    ? "bg-emerald-50 text-emerald-700"
    : status === "broken" || status === "missing"
      ? "bg-red-50 text-red-700"
      : "bg-amber-50 text-amber-800";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}><RadioTower size={10} />{labels[status]}</span>;
}
