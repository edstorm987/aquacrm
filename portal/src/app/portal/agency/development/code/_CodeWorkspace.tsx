"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, FileCode2, Folder, FolderOpen, FolderGit2, GitBranch, LoaderCircle, Lock, Paintbrush, Plug, Plus, Search, TriangleAlert, X } from "lucide-react";

import type { TreeDirectory, TreeFile } from "@/engines/editor/server/fileTree";

import { visualEditorDoor } from "./visualEditorDoor";

/**
 * Code mode — the repository, browsed and read like an editor.
 *
 * Deliberately read-only for now. The engine behind it dry-runs by default and
 * commits only on an explicit confirmation, and wiring a save button before
 * that path has ever run against a real repository would be the wrong order to
 * find out it is wrong.
 */
interface TreeResponse {
  ok?: boolean;
  tree?: TreeDirectory;
  count?: number;
  sha?: string;
  truncated?: boolean;
  needsGitHub?: boolean;
  error?: string;
  href?: string;
}

export interface DevProjectRow {
  id: string;
  name: string;
  type: "software" | "website" | "portal";
  repository: string;
  ref: string;
  githubConnectionId?: string;
  vercelConnectionId?: string;
  aquaTagSiteId?: string;
}

interface ConnectionRow {
  id: string;
  provider: string;
  label: string;
}

export interface AquaTagSiteRow {
  id: string;
  label: string;
  host: string;
  destinationClientId?: string;
  builderReady?: boolean;
}

export function CodeWorkspace({ initialRepository = "" }: { initialRepository?: string }) {
  const [repository, setRepository] = useState(initialRepository);
  const [ref, setRef] = useState("main");
  const [projects, setProjects] = useState<DevProjectRow[]>([]);
  const [aquaTagSites, setAquaTagSites] = useState<AquaTagSiteRow[]>([]);
  const [projectId, setProjectId] = useState("");
  const [tree, setTree] = useState<TreeDirectory | null>(null);
  const [meta, setMeta] = useState<TreeResponse | null>(null);
  const [count, setCount] = useState(0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [file, setFile] = useState<{ contents?: string; reason?: string; fingerprint?: string; editable: boolean; preview?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [projectError, setProjectError] = useState("");

  const project = projects.find(entry => entry.id === projectId) ?? null;

  useEffect(() => {
    fetch("/api/portal/dev/projects", { cache: "no-store" })
      .then(response => response.json())
      .then((payload: { ok?: boolean; projects?: DevProjectRow[]; aquaTagSites?: AquaTagSiteRow[] }) => {
        setProjects(payload.projects ?? []);
        setAquaTagSites(payload.aquaTagSites ?? []);
      })
      .catch(() => setProjects([]));
  }, []);

  // Type and Aqua Tag are edited in place on the selected project — the
  // switcher IS the project update, not a separate settings screen.
  const patchProject = (patch: Partial<Pick<DevProjectRow, "type" | "aquaTagSiteId">>) => {
    if (!project) return;
    setProjectError("");
    fetch("/api/portal/dev/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        projectId: project.id,
        name: project.name,
        type: project.type,
        repository: project.repository,
        ref: project.ref,
        githubConnectionId: project.githubConnectionId,
        vercelConnectionId: project.vercelConnectionId,
        aquaTagSiteId: project.aquaTagSiteId,
        ...patch,
      }),
    })
      .then(response => response.json())
      .then((payload: { ok?: boolean; error?: string; projects?: DevProjectRow[] }) => {
        if (!payload.ok) { setProjectError(payload.error || "The project could not be updated."); return; }
        setProjects(payload.projects ?? []);
      })
      .catch(() => setProjectError("The project could not be updated."));
  };

  // Recomputed whenever the selection changes so the two never disagree about
  // which tree is on screen. A selected project carries its repository, ref,
  // AND which connection's token reads it — the server resolves all three.
  const query$ = project
    ? `?project=${encodeURIComponent(project.id)}`
    : repository ? `?repo=${encodeURIComponent(repository)}&ref=${encodeURIComponent(ref)}` : "";

  useEffect(() => {
    setTree(null);
    setOpen(null);
    fetch(`/api/portal/site-editor/files${query$}`, { cache: "no-store" })
      .then(response => response.json())
      .then((payload: TreeResponse) => {
        setMeta(payload);
        setTree(payload.tree ?? null);
        setCount(payload.count ?? 0);
      })
      .catch(() => { setTree(null); setMeta({ error: "The repository could not be read." }); });
  }, [query$]);

  useEffect(() => {
    if (!open) { setFile(null); return; }
    setLoading(true);
    const separator = query$ ? "&" : "?";
    fetch(`/api/portal/site-editor/files${query$}${separator}path=${encodeURIComponent(open)}`, { cache: "no-store" })
      .then(response => response.json())
      .then(payload => setFile(payload))
      .catch(() => setFile({ editable: false, reason: "That file could not be read." }))
      .finally(() => setLoading(false));
  }, [open, query$]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !tree) return null;
    const all: TreeFile[] = [];
    (function walk(directory: TreeDirectory) {
      all.push(...directory.files);
      directory.directories.forEach(walk);
    })(tree);
    return all.filter(entry => entry.path.toLowerCase().includes(needle)).slice(0, 60);
  }, [query, tree]);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4">
      <header className="grid gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Development</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-black/90">Code</h1>
          <p className="mt-2 text-sm text-black/50">
            The whole repository, exactly as it is. {count ? `${count} files.` : ""}
            {meta?.sha ? ` At ${meta.sha.slice(0, 7)}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {projects.length ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-black/12 bg-white px-2.5 py-1.5 text-xs">
              <FolderGit2 size={13} aria-hidden className="shrink-0 text-black/35" />
              <select
                value={projectId}
                onChange={event => setProjectId(event.target.value)}
                aria-label="Project"
                className="max-w-56 bg-transparent outline-none"
              >
                <option value="">Ad-hoc repository…</option>
                {projects.map(entry => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
              </select>
            </span>
          ) : null}
          {project ? (
            // The project pins repository and branch; shown, not editable —
            // changing them is editing the project, not this screen. Type and
            // Aqua Tag ARE switchable here: the type adapts the engine, the
            // tag opens the door to the visual editor.
            <>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-black/12 bg-black/[0.03] px-2.5 py-1.5 text-xs text-black/60">
                <GitBranch size={13} aria-hidden className="shrink-0 text-black/35" />
                {project.repository} · {project.ref}
              </span>
              <select
                value={project.type}
                onChange={event => patchProject({ type: event.target.value as DevProjectRow["type"] })}
                aria-label="Project type"
                className="rounded-md border border-black/12 bg-white px-2 py-1.5 text-xs outline-none"
              >
                <option value="software">Software</option>
                <option value="website">Website</option>
                <option value="portal">Portal</option>
              </select>
              <select
                value={project.aquaTagSiteId ?? ""}
                onChange={event => patchProject({ aquaTagSiteId: event.target.value || undefined })}
                aria-label="Aqua Tag site"
                className="max-w-44 rounded-md border border-black/12 bg-white px-2 py-1.5 text-xs outline-none"
              >
                <option value="">Aqua Tag: none</option>
                {aquaTagSites.map(site => (
                  <option key={site.id} value={site.id}>Aqua Tag: {site.label}</option>
                ))}
              </select>
              <VisualEditorDoor project={project} site={aquaTagSites.find(site => site.id === project.aquaTagSiteId) ?? null} />
            </>
          ) : (
            <>
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-black/12 bg-white px-2.5 py-1.5 text-xs">
                <GitBranch size={13} aria-hidden className="shrink-0 text-black/35" />
                <input
                  value={repository}
                  onChange={event => setRepository(event.target.value)}
                  placeholder="owner/repository — blank reads this workspace"
                  aria-label="Repository"
                  className="w-72 max-w-full outline-none placeholder:text-black/30"
                />
              </span>
              {repository ? (
                <input
                  value={ref}
                  onChange={event => setRef(event.target.value)}
                  aria-label="Branch"
                  className="w-28 rounded-md border border-black/12 bg-white px-2.5 py-1.5 text-xs outline-none"
                />
              ) : null}
            </>
          )}
          <button
            type="button"
            onClick={() => setCreating(value => !value)}
            className="inline-flex items-center gap-1.5 rounded-md border border-black/12 bg-white px-2.5 py-1.5 text-xs font-semibold text-black/70 hover:bg-black/[0.04]"
          >
            {creating ? <X size={13} aria-hidden /> : <Plus size={13} aria-hidden />}
            {creating ? "Close" : "New project"}
          </button>
        </div>

        {projectError ? <p role="alert" className="text-xs text-red-700">{projectError}</p> : null}

        {creating ? (
          <NewProjectForm
            aquaTagSites={aquaTagSites}
            onSaved={saved => {
              setProjects(saved.projects);
              setProjectId(saved.project.id);
              setCreating(false);
            }}
          />
        ) : null}

        {/* Said plainly, with the way to fix it, rather than an empty tree that
            looks like a broken editor. */}
        {meta?.needsGitHub ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <Plug size={14} aria-hidden className="shrink-0 text-amber-700" />
            <p className="min-w-0 flex-1 leading-5">{meta.error}</p>
            <Link
              href={meta.href ?? "/portal/agency/company?view=connections&integration=github"}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 font-semibold text-amber-900 hover:bg-amber-100"
            >
              Connect GitHub <ExternalLink size={12} aria-hidden />
            </Link>
          </div>
        ) : null}

        {meta?.truncated ? (
          <p className="flex items-center gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <TriangleAlert size={14} aria-hidden className="shrink-0 text-amber-700" />
            GitHub truncated this tree, so some files are missing from the list. Open them by path instead.
          </p>
        ) : null}

        {meta?.error && !meta.needsGitHub ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">{meta.error}</p>
        ) : null}
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-lg border border-black/10 bg-white">
          <div className="relative border-b border-black/10 p-2">
            <Search size={14} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-black/30" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Find a file"
              aria-label="Find a file"
              className="h-9 w-full rounded-md border border-black/10 pl-7 pr-2 text-xs outline-none focus:border-brand"
            />
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-1.5">
            {/* A spinner that never resolves reads as a hang. When the read
                failed, say so once and stop. */}
            {!tree && (meta?.needsGitHub || meta?.error) ? (
              <p className="px-2 py-3 text-xs text-black/45">
                {meta.needsGitHub ? "Connect GitHub to list this repository." : "Nothing could be listed."}
              </p>
            ) : !tree ? (
              <p className="flex items-center gap-2 px-2 py-3 text-xs text-black/45">
                <LoaderCircle size={13} className="animate-spin" aria-hidden />Reading the repository…
              </p>
            ) : matches ? (
              matches.length
                ? matches.map(entry => <FileRow key={entry.path} file={entry} active={entry.path === open} onOpen={setOpen} showPath />)
                : <p className="px-2 py-3 text-xs text-black/45">Nothing matches “{query}”.</p>
            ) : (
              <Directory directory={tree} depth={0} open={open} onOpen={setOpen} defaultOpen />
            )}
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-lg border border-black/10 bg-white">
          {!open ? (
            <p className="px-4 py-16 text-center text-xs text-black/45">Choose a file to read it.</p>
          ) : loading ? (
            <p className="flex items-center gap-2 px-4 py-6 text-xs text-black/45">
              <LoaderCircle size={13} className="animate-spin" aria-hidden />Opening {open}…
            </p>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-black/70">
                  <FileCode2 size={14} aria-hidden className="shrink-0 text-black/35" />
                  <span className="truncate">{open}</span>
                </span>
                {file?.fingerprint ? (
                  <span className="font-mono text-[10px] text-black/35" title="The fingerprint a save is checked against">
                    {file.fingerprint}
                  </span>
                ) : null}
              </header>
              {file?.preview ? (
                <div className="grid gap-2 p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL from the repo, not an optimizable asset */}
                  <img
                    src={file.preview}
                    alt={open ?? "Image preview"}
                    className="max-h-[65vh] w-auto max-w-full justify-self-start rounded border border-black/10 bg-[conic-gradient(#0000000a_90deg,transparent_90deg_180deg,#0000000a_180deg_270deg,transparent_270deg)] bg-[length:16px_16px]"
                  />
                  <p className="text-[11px] text-black/45">{file.reason}</p>
                </div>
              ) : file?.editable === false ? (
                <p className="flex items-center gap-2 px-4 py-6 text-xs text-black/55">
                  <Lock size={13} aria-hidden className="text-black/35" />{file.reason}
                </p>
              ) : (
                <pre className="max-h-[70vh] overflow-auto px-3 py-3 text-[11px] leading-5 text-black/80">
                  <code>{file?.contents}</code>
                </pre>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function VisualEditorDoor({ project, site }: { project: DevProjectRow; site: AquaTagSiteRow | null }) {
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState("");
  if (project.type === "software") return null;
  const door = visualEditorDoor(project, site);

  if (door?.kind === "open") {
    return (
      <Link
        href={door.href}
        className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/[0.06] px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-brand/10"
      >
        <Paintbrush size={13} aria-hidden />
        Visual editor
      </Link>
    );
  }

  if (door?.kind === "activate") {
    // The WebsiteBuilderLauncher flow, verbatim: install the website-editor
    // plugin for the tag's client, then walk through the same door.
    const activate = () => {
      setActivating(true);
      setError("");
      fetch("/api/portal/fulfillment/marketplace/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: door.clientId, pluginId: "website-editor" }),
      })
        .then(response => response.json().then((body: { ok?: boolean; error?: string } | null) => {
          if (!response.ok || !body?.ok) throw new Error(body?.error ?? "The visual builder could not be activated.");
          window.location.assign(door.href);
        }))
        .catch(caught => {
          setError(caught instanceof Error ? caught.message : "The visual builder could not be activated.");
          setActivating(false);
        });
    };
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={activate}
          disabled={activating}
          className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/[0.06] px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-brand/10 disabled:opacity-55"
        >
          {activating ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Paintbrush size={13} aria-hidden />}
          {activating ? "Preparing builder…" : "Activate visual builder"}
        </button>
        {error ? <span role="alert" className="text-[11px] text-red-700">{error}</span> : null}
      </span>
    );
  }

  // No routed tag, no door — and the reason said in place, not a dead button.
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-black/15 px-2.5 py-1.5 text-[11px] text-black/45">
      <Paintbrush size={12} aria-hidden className="text-black/30" />
      {site ? "Route this Aqua Tag site to a client to unlock the visual editor" : "Bind an Aqua Tag site to unlock the visual editor"}
    </span>
  );
}

function NewProjectForm({
  aquaTagSites,
  onSaved,
}: {
  aquaTagSites: AquaTagSiteRow[];
  onSaved: (saved: { project: DevProjectRow; projects: DevProjectRow[] }) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<DevProjectRow["type"]>("software");
  const [repository, setRepository] = useState("");
  const [ref, setRef] = useState("main");
  const [githubConnectionId, setGithubConnectionId] = useState("");
  const [vercelConnectionId, setVercelConnectionId] = useState("");
  const [aquaTagSiteId, setAquaTagSiteId] = useState("");
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/portal/settings/integrations", { cache: "no-store" })
      .then(response => response.json())
      .then((payload: { connections?: ConnectionRow[] }) => setConnections(payload.connections ?? []))
      .catch(() => setConnections([]));
  }, []);

  const githubConnections = connections.filter(entry => entry.provider === "github");
  const vercelConnections = connections.filter(entry => entry.provider === "vercel");

  const save = () => {
    setSaving(true);
    setError("");
    fetch("/api/portal/dev/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        name,
        type,
        repository,
        ref,
        githubConnectionId: githubConnectionId || undefined,
        vercelConnectionId: vercelConnectionId || undefined,
        aquaTagSiteId: aquaTagSiteId || undefined,
      }),
    })
      .then(response => response.json())
      .then((payload: { ok?: boolean; error?: string; project?: DevProjectRow; projects?: DevProjectRow[] }) => {
        if (!payload.ok || !payload.project) {
          setError(payload.error || "The project could not be saved.");
          return;
        }
        onSaved({ project: payload.project, projects: payload.projects ?? [] });
      })
      .catch(() => setError("The project could not be saved."))
      .finally(() => setSaving(false));
  };

  const field = "h-9 rounded-md border border-black/12 bg-white px-2.5 text-xs outline-none focus:border-brand";

  return (
    <div className="grid gap-2 rounded-lg border border-black/10 bg-white p-3">
      <p className="text-xs font-semibold text-black/70">New project</p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={event => setName(event.target.value)} placeholder="Name" aria-label="Project name" className={`${field} w-44`} />
        <select value={type} onChange={event => setType(event.target.value as DevProjectRow["type"])} aria-label="Project type" className={`${field} w-28`}>
          <option value="software">Software</option>
          <option value="website">Website</option>
          <option value="portal">Portal</option>
        </select>
        <input value={repository} onChange={event => setRepository(event.target.value)} placeholder="owner/repository" aria-label="Project repository" className={`${field} w-56`} />
        <input value={ref} onChange={event => setRef(event.target.value)} placeholder="main" aria-label="Project branch" className={`${field} w-24`} />
        <select value={githubConnectionId} onChange={event => setGithubConnectionId(event.target.value)} aria-label="GitHub connection" className={`${field} w-44`}>
          <option value="">GitHub: workspace default</option>
          {githubConnections.map(entry => (
            <option key={entry.id} value={entry.id}>GitHub: {entry.label}</option>
          ))}
        </select>
        <select value={vercelConnectionId} onChange={event => setVercelConnectionId(event.target.value)} aria-label="Vercel connection" className={`${field} w-44`}>
          <option value="">Vercel: none</option>
          {vercelConnections.map(entry => (
            <option key={entry.id} value={entry.id}>Vercel: {entry.label}</option>
          ))}
        </select>
        <select value={aquaTagSiteId} onChange={event => setAquaTagSiteId(event.target.value)} aria-label="Aqua Tag site (new project)" className={`${field} w-44`}>
          <option value="">Aqua Tag: none</option>
          {aquaTagSites.map(site => (
            <option key={site.id} value={site.id}>Aqua Tag: {site.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={saving || !name.trim() || !repository.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : null}
          Save project
        </button>
      </div>
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

function Directory({
  directory, depth, open, onOpen, defaultOpen = false,
}: {
  directory: TreeDirectory;
  depth: number;
  open: string | null;
  onOpen: (path: string) => void;
  defaultOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen || depth < 1);
  const isRoot = depth === 0;

  return (
    <div>
      {!isRoot ? (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded}
          className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-black/65 hover:bg-black/[0.04]"
          style={{ paddingLeft: `${depth * 10 + 6}px` }}
        >
          <ChevronRight size={12} aria-hidden className={`shrink-0 text-black/30 transition-transform ${expanded ? "rotate-90" : ""}`} />
          {expanded ? <FolderOpen size={13} aria-hidden className="shrink-0 text-black/40" /> : <Folder size={13} aria-hidden className="shrink-0 text-black/40" />}
          <span className="truncate">{directory.name}</span>
        </button>
      ) : null}
      {expanded ? (
        <>
          {directory.directories.map(child => (
            <Directory key={child.path} directory={child} depth={depth + 1} open={open} onOpen={onOpen} />
          ))}
          {directory.files.map(entry => (
            <FileRow key={entry.path} file={entry} active={entry.path === open} onOpen={onOpen} depth={depth + 1} />
          ))}
        </>
      ) : null}
    </div>
  );
}

function FileRow({
  file, active, onOpen, depth = 0, showPath = false,
}: {
  file: TreeFile;
  active: boolean;
  onOpen: (path: string) => void;
  depth?: number;
  showPath?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(file.path)}
      className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-black/[0.04] ${
        active ? "bg-black/[0.06] font-medium text-black/85" : "text-black/60"
      }`}
      style={{ paddingLeft: `${depth * 10 + 20}px` }}
      title={file.editable ? file.path : file.reason}
    >
      {/* Listed but dimmed rather than hidden — a file that vanishes from the
          tree reads as a bug in the editor. */}
      <FileCode2 size={12} aria-hidden className={`shrink-0 ${file.editable ? "text-black/30" : "text-black/15"}`} />
      <span className={`truncate ${file.editable ? "" : "text-black/35"}`}>{showPath ? file.path : file.name}</span>
    </button>
  );
}
