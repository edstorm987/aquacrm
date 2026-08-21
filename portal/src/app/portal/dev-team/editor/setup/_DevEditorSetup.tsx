"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, Check, ExternalLink, Github, LoaderCircle, Plus, SquarePen, Trash2, TriangleAlert, X } from "lucide-react";

import type { DevProject, DevProjectKind } from "@/server/types";

// ─── DEV EDITOR — setup ──────────────────────────────────────────────────────
//
// Where a project is configured, reconfigured and unconfigured. Repositories
// get renamed, moved between owners, pointed at a different branch, handed a
// different token, or retired — and until now the only way to change any of
// that was to make a new project.
//
// It never handles a credential: a project names an existing connection from
// the integrations vault, and the server resolves the token at call time.

interface ConnectionOption { id: string; label: string; provider: string; status?: string }

const KINDS: { id: DevProjectKind; label: string; hint: string }[] = [
  { id: "software", label: "Software", hint: "Code only — the full editor." },
  { id: "website", label: "Website", hint: "Visual editing unlocks with an Aqua Tag." },
  { id: "portal", label: "Portal", hint: "An Aqua-hosted client workspace." },
];

const BLANK = {
  id: "",
  name: "",
  kind: "software" as DevProjectKind,
  repository: "",
  ref: "main",
  githubConnectionId: "",
  vercelConnectionId: "",
  aquaTagId: "",
};

type Draft = typeof BLANK;

function draftFrom(project: DevProject): Draft {
  return {
    id: project.id,
    name: project.name,
    kind: project.kind,
    repository: project.repository ?? "",
    ref: project.ref ?? "main",
    githubConnectionId: project.githubConnectionId ?? "",
    vercelConnectionId: project.vercelConnectionId ?? "",
    aquaTagId: project.aquaTagId ?? "",
  };
}

export function DevEditorSetup() {
  const [projects, setProjects] = useState<DevProject[]>([]);
  const [github, setGithub] = useState<ConnectionOption[]>([]);
  const [vercel, setVercel] = useState<ConnectionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/portal/dev/projects", { cache: "no-store" })
      .then(response => response.json())
      .then(payload => {
        if (!payload.ok) { setError(payload.error ?? "Projects could not be read."); return; }
        setError(null);
        setProjects(payload.projects ?? []);
        setGithub(payload.githubConnections ?? []);
        setVercel(payload.vercelConnections ?? []);
      })
      .catch(() => setError("Projects could not be read."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function post(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      const payload = await fetch("/api/portal/dev/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then(response => response.json());
      if (!payload.ok) { setError(payload.error ?? "That could not be saved."); return false; }
      setNotice(done);
      setDraft(null);
      load();
      return true;
    } catch {
      setError("That could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[color:var(--dt-ink)]">
          <Boxes size={16} aria-hidden className="text-[color:var(--dev-accent)]" /> Projects
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-[color:var(--dt-muted)]">
          What the editor can be pointed at. A project binds a repository and branch to the
          connections that reach them — change any of it here when a repo moves, a branch
          changes, or a token is replaced. Credentials themselves live in the vault; a project
          only names one.
        </p>
      </header>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-[color:var(--dev-danger-line)] bg-[color:var(--dev-danger-soft)] px-3 py-2 text-xs text-[color:var(--dev-danger)]">
          <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}
      {notice ? <p className="text-xs text-[color:var(--dev-success)]">{notice}</p> : null}

      <div className="grid gap-2">
        {loading ? (
          <p className="flex items-center gap-2 text-xs text-[color:var(--dt-muted)]">
            <LoaderCircle size={13} className="animate-spin" aria-hidden /> Reading projects…
          </p>
        ) : projects.length === 0 ? (
          <p className="rounded-md border border-dashed border-[color:var(--dt-line)] px-3 py-4 text-xs text-[color:var(--dt-muted)]">
            No projects yet. Add one to point the editor at a repository.
          </p>
        ) : projects.map(project => (
          <article key={project.id} className="rounded-md border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[color:var(--dt-ink)]">{project.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--dt-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Github size={11} aria-hidden />
                    {project.repository || "this workspace"}{project.repository ? ` · ${project.ref}` : ""}
                  </span>
                  <span className="capitalize">{project.kind}</span>
                  <span>{project.githubConnectionId ? "Own token" : "Agency token"}</span>
                  {project.vercelConnectionId ? <span>Vercel</span> : null}
                  {project.aquaTagId ? <span className="text-[color:var(--dev-accent)]">Aqua Tag mapped</span> : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link
                  href={`/portal/dev-team/editor/studio?project=${encodeURIComponent(project.id)}`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-[color:var(--dev-accent)] px-2.5 text-[11px] font-bold text-[color:var(--dev-on-accent)] hover:bg-[color:var(--dev-accent-hover)]"
                >
                  <SquarePen size={11} aria-hidden /> Open editor
                </Link>
                <button
                  type="button"
                  onClick={() => { setNotice(null); setDraft(draftFrom(project)); }}
                  className="inline-flex min-h-8 items-center rounded-md border border-[color:var(--dt-line)] px-2.5 text-[11px] font-semibold text-[color:var(--dt-ink)] hover:bg-[color:var(--dt-hover)]"
                >
                  Configure
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(`Disconnect "${project.name}"? The repository is untouched — only this project record is removed.`)) return;
                    void post({ action: "delete", id: project.id }, `${project.name} disconnected.`);
                  }}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[color:var(--dt-line)] px-2.5 text-[11px] font-semibold text-[color:var(--dt-muted)] hover:border-[color:var(--dev-danger-line)] hover:text-[color:var(--dev-danger)]"
                >
                  <Trash2 size={11} aria-hidden /> Disconnect
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {draft ? (
        <ProjectForm
          draft={draft}
          setDraft={setDraft}
          github={github}
          vercel={vercel}
          busy={busy}
          onSave={() => void post({
            action: "save",
            id: draft.id || undefined,
            name: draft.name,
            kind: draft.kind,
            repository: draft.repository,
            ref: draft.ref,
            githubConnectionId: draft.githubConnectionId || undefined,
            vercelConnectionId: draft.vercelConnectionId || undefined,
            aquaTagId: draft.aquaTagId || undefined,
          }, draft.id ? "Project updated." : "Project added.")}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setNotice(null); setDraft({ ...BLANK }); }}
          className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded-md border border-dashed border-[color:var(--dt-line)] px-3 text-xs font-semibold text-[color:var(--dt-muted)] hover:border-[color:var(--dev-accent-line)] hover:text-[color:var(--dt-ink)]"
        >
          <Plus size={13} aria-hidden /> Add a project
        </button>
      )}

      {!github.length ? (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--dev-warning-line)] bg-[color:var(--dev-warning-soft)] px-3 py-2 text-[11px] text-[color:var(--dev-warning)]">
          No GitHub connection saved yet, so projects fall back to the agency token.
          <Link href="/portal/agency/company?view=connections&integration=github" className="inline-flex items-center gap-1 font-semibold underline">
            Connect GitHub <ExternalLink size={10} aria-hidden />
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function ProjectForm({ draft, setDraft, github, vercel, busy, onSave }: {
  draft: Draft;
  setDraft: (draft: Draft | null) => void;
  github: ConnectionOption[];
  vercel: ConnectionOption[];
  busy: boolean;
  onSave: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  const field = "min-h-9 rounded-md border border-[color:var(--dt-line)] bg-[color:var(--dt-bg)] px-2.5 text-xs text-[color:var(--dt-ink)] outline-none focus:border-[color:var(--dev-accent-line)]";

  return (
    <div className="grid gap-3 rounded-md border border-[color:var(--dev-accent-line)] bg-[color:var(--dt-surface)] p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[color:var(--dt-ink)]">{draft.id ? "Configure project" : "New project"}</p>
        <button type="button" onClick={() => setDraft(null)} aria-label="Cancel" className="grid size-6 place-items-center rounded text-[color:var(--dt-muted)] hover:bg-[color:var(--dt-hover)]">
          <X size={12} aria-hidden />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-[11px] font-semibold text-[color:var(--dt-muted)]">
          Name
          <input value={draft.name} onChange={event => set("name", event.target.value)} placeholder="AquaCRM" className={field} />
        </label>
        <label className="grid gap-1 text-[11px] font-semibold text-[color:var(--dt-muted)]">
          Repository <span className="font-normal">— blank reads this workspace</span>
          <input value={draft.repository} onChange={event => set("repository", event.target.value)} placeholder="owner/repository" className={field} />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-[11px] font-semibold text-[color:var(--dt-muted)]">
          Branch
          <input value={draft.ref} onChange={event => set("ref", event.target.value)} className={field} />
        </label>
        <label className="grid gap-1 text-[11px] font-semibold text-[color:var(--dt-muted)]">
          GitHub connection
          <select value={draft.githubConnectionId} onChange={event => set("githubConnectionId", event.target.value)} className={field}>
            <option value="">Agency default</option>
            {github.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-semibold text-[color:var(--dt-muted)]">
          Vercel connection
          <select value={draft.vercelConnectionId} onChange={event => set("vercelConnectionId", event.target.value)} className={field}>
            <option value="">None</option>
            {vercel.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="text-[11px] font-semibold text-[color:var(--dt-muted)]">What is it?</legend>
        <div className="flex flex-wrap gap-2">
          {KINDS.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => set("kind", option.id)}
              title={option.hint}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold ${
                draft.kind === option.id
                  ? "border-[color:var(--dev-accent-line)] bg-[color:var(--dev-accent-soft)] text-[color:var(--dev-accent)]"
                  : "border-[color:var(--dt-line)] text-[color:var(--dt-muted)] hover:text-[color:var(--dt-ink)]"
              }`}
            >
              {draft.kind === option.id ? <Check size={11} aria-hidden /> : null}{option.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[color:var(--dt-faint)]">{KINDS.find(item => item.id === draft.kind)?.hint}</p>
      </fieldset>

      {draft.kind !== "software" ? (
        <label className="grid gap-1 text-[11px] font-semibold text-[color:var(--dt-muted)]">
          Aqua Tag id <span className="font-normal">— mapping a tag unlocks the visual editor</span>
          <input value={draft.aquaTagId} onChange={event => set("aquaTagId", event.target.value)} placeholder="Optional" className={field} />
        </label>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !draft.name.trim()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[color:var(--dev-accent)] px-3 text-xs font-bold text-[color:var(--dev-on-accent)] disabled:opacity-45"
        >
          {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
          {draft.id ? "Save changes" : "Add project"}
        </button>
        <button type="button" onClick={() => setDraft(null)} className="inline-flex min-h-9 items-center rounded-md border border-[color:var(--dt-line)] px-3 text-xs font-semibold text-[color:var(--dt-muted)] hover:text-[color:var(--dt-ink)]">
          Cancel
        </button>
      </div>
    </div>
  );
}
