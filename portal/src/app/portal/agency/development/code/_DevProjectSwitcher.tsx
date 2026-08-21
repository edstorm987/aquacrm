"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, Check, ExternalLink, Github, LoaderCircle, Plus, Trash2, X } from "lucide-react";

import type { DevProject, DevProjectKind } from "@/server/types";

// Dev Editor Engine — the project switcher.
//
// A project binds {repo, ref, github/vercel connection, aqua tag, kind}. This is
// the surface that makes the engine multi-project: pick the project you're
// working on and the whole editor reads THAT repo through THAT project's token.
// Connections come from the existing integrations vault — this never handles a
// credential itself, it only names one.

interface ConnectionOption { id: string; label: string; provider: string; status?: string }

interface ProjectsResponse {
  ok?: boolean;
  projects?: DevProject[];
  githubConnections?: ConnectionOption[];
  vercelConnections?: ConnectionOption[];
  error?: string;
}

const KINDS: { id: DevProjectKind; label: string; hint: string }[] = [
  { id: "software", label: "Software", hint: "Code only — the full editor." },
  { id: "website", label: "Website", hint: "Visual editing unlocks with an Aqua Tag." },
  { id: "portal", label: "Portal", hint: "An Aqua-hosted client workspace." },
];

export function DevProjectSwitcher({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (project: DevProject | null) => void;
}) {
  const [projects, setProjects] = useState<DevProject[]>([]);
  const [github, setGithub] = useState<ConnectionOption[]>([]);
  const [vercel, setVercel] = useState<ConnectionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/portal/dev/projects", { cache: "no-store" })
      .then(r => r.json())
      .then((payload: ProjectsResponse) => {
        if (!payload.ok) { setError(payload.error ?? "Projects could not be read."); return; }
        setError(null);
        setProjects(payload.projects ?? []);
        setGithub(payload.githubConnections ?? []);
        setVercel(payload.vercelConnections ?? []);
      })
      .catch(() => setError("Projects could not be read."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const selected = projects.find(p => p.id === selectedId) ?? null;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-black/55">
          <Boxes size={14} aria-hidden className="text-black/35" /> Project
        </span>

        {/* The workspace itself is always available — blank repo reads the local tree. */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition ${
            !selectedId ? "border-brand/45 bg-brand/10 text-brand" : "border-black/12 bg-white text-black/65 hover:border-black/25"
          }`}
        >
          {!selectedId ? <Check size={12} aria-hidden /> : null} This workspace
        </button>

        {projects.map(project => (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelect(project)}
            title={project.repository || "Reads this workspace"}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition ${
              selectedId === project.id ? "border-brand/45 bg-brand/10 text-brand" : "border-black/12 bg-white text-black/65 hover:border-black/25"
            }`}
          >
            {selectedId === project.id ? <Check size={12} aria-hidden /> : null}
            {project.name}
            <span className="text-[10px] font-normal text-black/35">{project.kind}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => setFormOpen(v => !v)}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-dashed border-black/20 px-2.5 text-xs font-medium text-black/55 transition hover:border-black/35 hover:text-black"
        >
          {formOpen ? <X size={12} aria-hidden /> : <Plus size={12} aria-hidden />} {formOpen ? "Cancel" : "New project"}
        </button>

        {loading ? <LoaderCircle size={13} className="animate-spin text-black/30" aria-hidden /> : null}
      </div>

      {selected ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-black/45">
          <span className="inline-flex items-center gap-1"><Github size={11} aria-hidden />{selected.repository || "this workspace"}{selected.repository ? ` · ${selected.ref}` : ""}</span>
          <span>{selected.githubConnectionId ? "Own GitHub token" : "Agency token"}</span>
          {selected.vercelConnectionId ? <span>Vercel connected</span> : null}
          {selected.aquaTagId ? <span className="text-brand">Aqua Tag mapped — visual editing available</span> : null}
        </p>
      ) : null}

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p> : null}

      {formOpen ? (
        <ProjectForm
          github={github}
          vercel={vercel}
          onCancel={() => setFormOpen(false)}
          onSaved={project => { setFormOpen(false); load(); onSelect(project); }}
        />
      ) : null}

      {formOpen && !github.length ? (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          No GitHub connection saved yet — a project can still be created, and it will use the agency token.
          <Link href="/portal/agency/company?view=connections&integration=github" className="inline-flex items-center gap-1 font-semibold underline">
            Connect GitHub <ExternalLink size={10} aria-hidden />
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function ProjectForm({ github, vercel, onCancel, onSaved }: {
  github: ConnectionOption[];
  vercel: ConnectionOption[];
  onCancel: () => void;
  onSaved: (project: DevProject) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DevProjectKind>("software");
  const [repository, setRepository] = useState("");
  const [ref, setRef] = useState("main");
  const [githubConnectionId, setGithubConnectionId] = useState("");
  const [vercelConnectionId, setVercelConnectionId] = useState("");
  const [aquaTagId, setAquaTagId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) { setError("Name the project."); return; }
    setBusy(true);
    setError(null);
    fetch("/api/portal/dev/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save", name, kind, repository, ref,
        githubConnectionId: githubConnectionId || undefined,
        vercelConnectionId: vercelConnectionId || undefined,
        aquaTagId: aquaTagId || undefined,
      }),
    })
      .then(r => r.json())
      .then(payload => {
        if (!payload.ok) { setError(payload.error ?? "That project could not be saved."); return; }
        onSaved(payload.project as DevProject);
      })
      .catch(() => setError("That project could not be saved."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="grid gap-3 rounded-lg border border-black/10 bg-white p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs">
          <span className="font-semibold text-black/65">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="AquaCRM" className="h-9 rounded-md border border-black/12 px-2.5 outline-none focus:border-brand" />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-semibold text-black/65">Repository</span>
          <input value={repository} onChange={e => setRepository(e.target.value)} placeholder="owner/repository — blank reads this workspace" className="h-9 rounded-md border border-black/12 px-2.5 outline-none focus:border-brand" />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs">
          <span className="font-semibold text-black/65">Branch</span>
          <input value={ref} onChange={e => setRef(e.target.value)} className="h-9 rounded-md border border-black/12 px-2.5 outline-none focus:border-brand" />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-semibold text-black/65">GitHub connection</span>
          <select value={githubConnectionId} onChange={e => setGithubConnectionId(e.target.value)} className="h-9 rounded-md border border-black/12 bg-white px-2 outline-none focus:border-brand">
            <option value="">Agency default</option>
            {github.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-semibold text-black/65">Vercel connection</span>
          <select value={vercelConnectionId} onChange={e => setVercelConnectionId(e.target.value)} className="h-9 rounded-md border border-black/12 bg-white px-2 outline-none focus:border-brand">
            <option value="">None</option>
            {vercel.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="text-xs font-semibold text-black/65">What is it?</legend>
        <div className="flex flex-wrap gap-2">
          {KINDS.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => setKind(option.id)}
              title={option.hint}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition ${
                kind === option.id ? "border-brand/45 bg-brand/10 text-brand" : "border-black/12 bg-white text-black/65 hover:border-black/25"
              }`}
            >
              {kind === option.id ? <Check size={12} aria-hidden /> : null}{option.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-black/40">{KINDS.find(k => k.id === kind)?.hint}</p>
      </fieldset>

      {kind !== "software" ? (
        <label className="grid gap-1 text-xs">
          <span className="font-semibold text-black/65">Aqua Tag id <span className="font-normal text-black/40">— mapping a tag unlocks the visual editor</span></span>
          <input value={aquaTagId} onChange={e => setAquaTagId(e.target.value)} placeholder="Optional" className="h-9 rounded-md border border-black/12 px-2.5 outline-none focus:border-brand" />
        </label>
      ) : null}

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p> : null}

      <div className="flex items-center gap-2">
        <button type="button" onClick={submit} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white transition hover:bg-black/85 disabled:opacity-50">
          {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Plus size={13} aria-hidden />} Create project
        </button>
        <button type="button" onClick={onCancel} className="inline-flex min-h-9 items-center rounded-md border border-black/12 px-3 text-xs font-medium text-black/65 hover:border-black/25">Cancel</button>
      </div>
    </div>
  );
}

/** Delete control, kept separate so the switcher stays a picker. */
export function DeleteDevProject({ project, onDeleted }: { project: DevProject; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        fetch("/api/portal/dev/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "delete", id: project.id }),
        }).then(() => onDeleted()).finally(() => setBusy(false));
      }}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-black/12 px-2.5 text-xs text-black/55 hover:border-red-300 hover:text-red-700"
    >
      <Trash2 size={12} aria-hidden /> Remove
    </button>
  );
}
