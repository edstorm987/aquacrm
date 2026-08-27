"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, Check, Clipboard, ExternalLink, Github, Globe, KeyRound, LoaderCircle, Map as MapIcon, Plus, SquarePen, Tag, Trash2, TriangleAlert, X } from "lucide-react";

import type { DevProject, DevProjectMapStatus, DevProjectMasterTagView } from "@/server/types";
import { formatUkDateTime } from "@/lib/shared/formatDateTime";
import { groupDevProjects } from "@/lib/shared/devProjectGrouping";

// ─── DEV EDITOR — setup ──────────────────────────────────────────────────────
//
// Where a project is configured, reconfigured and unconfigured. Repositories
// get renamed, moved between owners, pointed at a different branch, handed a
// different token, or retired — and until now the only way to change any of
// that was to make a new project.
//
// It never handles a credential: a project names an existing connection from
// the integrations vault, and the server resolves the token at call time.
//
// ── TWO exports, one file ───────────────────────────────────────────────────
//
//   `DevEditorSetup`           — the PROJECTS WORKSPACE. Every project, card
//                                by card, with creation, deletion and "Open
//                                editor". Dev-workspace `--dt-*` clothes.
//                                Mounted by /portal/dev-team/editor.
//   `DevEditorProjectSettings` — the panel the EDITOR's Settings tab mounts.
//                                ONE project — the one the editor is open on —
//                                in the editor's own dark vocabulary. No
//                                creation, no other projects, no "Open
//                                editor" (you are already inside it).
//
// The shared panels between them (Aqua Tag, Map report, GitHub connect) take a
// `skin` rather than being forked, so the flows cannot drift apart: same
// requests, same announcements, different clothes. `SETUP_SKINS` below is the
// wardrobe.

interface ConnectionOption { id: string; label: string; provider: string; status?: string }

// ─── The wardrobe ────────────────────────────────────────────────────────────
//
// The shared panels below (Map report, Aqua Tag, GitHub connect) render on two
// very different grounds: the cream dev workspace (`--dt-*` tokens) and the
// dark Dev Editor inspector, whose vocabulary is written down once in
// `editorAiSkin.ts` — dark translucent panels, `border-white/10`, ONE accent
// read from `--mode-accent`, and **no `--dt-*` tokens, not one**. Ed hit the
// alternative live: the whole cream projects screen rendered inside the dark
// editor. A skin is a parameter, not a reason to fork a panel.
//
// The `workspace` strings are the exact classes these panels have always worn
// there — the workspace's look does not change by construction.
const SETUP_SKINS = {
  workspace: {
    /** Body text on the panel ground. */
    ink: "text-[color:var(--dt-ink)]",
    muted: "text-[color:var(--dt-muted)]",
    faint: "text-[color:var(--dt-faint)]",
    accentIcon: "text-[color:var(--dev-accent)]",
    hairline: "border-[color:var(--dt-line)]",
    /** The Aqua Tag section's card. */
    tagSection: "mt-2 grid gap-3 rounded-md border border-[color:var(--dt-line)] bg-[color:var(--dt-raised)] p-3",
    /** The inverted snippet well and its furniture. */
    well: "rounded-md border border-[color:var(--dt-line)] bg-[color:var(--dev-inverse)] p-3",
    wellLabel: "text-[10px] font-medium uppercase tracking-wide text-[color:var(--dev-inverse-muted)]",
    wellCopy: "inline-flex items-center gap-1.5 rounded-md bg-[color:var(--dev-inverse-film)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--dev-inverse-ink)] hover:bg-[color:var(--dev-inverse-film-hover)]",
    wellCode: "mt-2 block break-all font-mono text-[11px] leading-5 text-[color:var(--dev-inverse-ink)]",
    warnSoft: "rounded-md bg-[color:var(--dev-warning-soft)] px-3 py-2 text-[11px] leading-5 text-[color:var(--dev-warning)]",
    field: "min-h-9 rounded-md border border-[color:var(--dt-line)] bg-[color:var(--dt-bg)] px-2.5 text-xs text-[color:var(--dt-ink)] outline-none focus:border-[color:var(--dev-accent)]",
    primary: "inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[color:var(--dev-accent)] px-3 text-xs font-bold text-[color:var(--dev-on-accent)] disabled:opacity-45",
    okText: "text-[color:var(--dev-success)]",
    warnText: "text-[color:var(--dev-warning)]",
    /** Map report rows. */
    rowOk: "text-[color:var(--dev-success)]",
    rowOff: "text-[color:var(--dt-muted)]",
    /** The tone each tag state is worded in. */
    tagTone: {
      answering: "text-[color:var(--dev-success)]",
      redirected: "text-[color:var(--dev-warning)]",
      foreign: "text-[color:var(--dev-danger)]",
      // Installed but dead: the snippet is there with the right key, and its
      // script points somewhere no visitor's browser can fetch. A warning,
      // never the success green — presence is not execution.
      "dead-snippet": "text-[color:var(--dev-warning)]",
      absent: "text-[color:var(--dev-warning)]",
      unreachable: "text-[color:var(--dev-warning)]",
      unchecked: "text-[color:var(--dt-muted)]",
      none: "text-[color:var(--dt-muted)]",
    } as Record<string, string>,
    /** GitHub connect. */
    connectOpen: "inline-flex min-h-9 w-fit items-center gap-1.5 rounded-md border border-[color:var(--dt-line)] px-3 text-xs font-semibold text-[color:var(--dt-ink)] hover:border-[color:var(--dev-accent-line)]",
    connectPanel: "grid gap-2 rounded-md border border-[color:var(--dev-accent-line)] bg-[color:var(--dt-surface)] p-3",
    connectTitle: "inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--dt-ink)]",
    connectClose: "grid size-7 place-items-center rounded-md text-[color:var(--dt-muted)] hover:text-[color:var(--dt-ink)]",
    connectLabel: "grid gap-1 text-[11px] text-[color:var(--dt-muted)]",
    connectHelp: "text-[11px] text-[color:var(--dt-muted)]",
    connectSave: "inline-flex min-h-9 w-fit items-center gap-1.5 rounded-md bg-[color:var(--dev-accent)] px-3 text-xs font-bold text-[color:var(--dev-accent-contrast)] disabled:opacity-50",
    noteOk: "border-[color:var(--dev-ok-line)] bg-[color:var(--dev-ok-soft)] text-[color:var(--dev-ok)]",
    noteBad: "border-[color:var(--dev-warning-line)] bg-[color:var(--dev-warning-soft)] text-[color:var(--dev-warning)]",
    noteInfo: "border-[color:var(--dt-line)] text-[color:var(--dt-muted)]",
  },
  editor: {
    ink: "text-white/88",
    muted: "text-white/58",
    faint: "text-white/40",
    accentIcon: "text-[color:var(--mode-accent)]",
    hairline: "border-white/10",
    tagSection: "mt-2 grid gap-3 rounded-md border border-white/10 bg-black/30 p-3",
    well: "rounded-md border border-white/10 bg-black/40 p-3",
    wellLabel: "text-[10px] font-medium uppercase tracking-wide text-white/45",
    wellCopy: "inline-flex items-center gap-1.5 rounded-md bg-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-white/85 hover:bg-white/[0.14]",
    wellCode: "mt-2 block break-all font-mono text-[11px] leading-5 text-white/85",
    warnSoft: "rounded-md bg-amber-300/[0.08] px-3 py-2 text-[11px] leading-5 text-amber-200/85",
    field: "min-h-9 rounded-md border border-white/12 bg-black/30 px-2.5 text-xs text-white/88 outline-none focus:border-[color:var(--mode-accent)]",
    primary: "inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[color:var(--mode-accent)] px-3 text-xs font-bold text-black/85 hover:brightness-110 disabled:opacity-45",
    okText: "text-emerald-300/90",
    warnText: "text-amber-200/85",
    rowOk: "text-emerald-300/90",
    rowOff: "text-white/58",
    tagTone: {
      answering: "text-emerald-300/90",
      redirected: "text-amber-200/85",
      foreign: "text-red-300/90",
      "dead-snippet": "text-amber-200/85",
      absent: "text-amber-200/85",
      unreachable: "text-amber-200/85",
      unchecked: "text-white/58",
      none: "text-white/58",
    } as Record<string, string>,
    connectOpen: "inline-flex min-h-9 w-fit items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.05] px-3 text-xs font-semibold text-white/72 hover:bg-white/10 hover:text-white",
    connectPanel: "grid gap-2 rounded-md border border-white/12 bg-black/30 p-3",
    connectTitle: "inline-flex items-center gap-1.5 text-xs font-semibold text-white/88",
    connectClose: "grid size-7 place-items-center rounded-md text-white/45 hover:text-white/85",
    connectLabel: "grid gap-1 text-[11px] text-white/58",
    connectHelp: "text-[11px] text-white/58",
    connectSave: "inline-flex min-h-9 w-fit items-center gap-1.5 rounded-md bg-[color:var(--mode-accent)] px-3 text-xs font-bold text-black/85 hover:brightness-110 disabled:opacity-50",
    noteOk: "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-200/90",
    noteBad: "border-amber-300/25 bg-amber-300/[0.06] text-amber-200/85",
    noteInfo: "border-white/12 text-white/58",
  },
} as const;

type SetupSkin = keyof typeof SETUP_SKINS;

/**
 * Fired on `window` after any mutation here SUCCEEDS (save, delete, map,
 * check-tag). This panel is rendered inside the editor's inspector, but the
 * editor fetched its own copy of the projects exactly once on mount — so a tag
 * verified right here left the editor's `tagMapped`/`browserUrl` stale and the
 * browser off until a full page reload. The editor listens for this and
 * re-fetches; nothing rides on the event but the fact that something changed.
 */
export const DEV_PROJECTS_CHANGED_EVENT = "aqua:dev-projects-changed";

function announceProjectsChanged() {
  window.dispatchEvent(new CustomEvent(DEV_PROJECTS_CHANGED_EVENT));
}


const BLANK = {
  id: "",
  name: "",
  description: "",
  repository: "",
  ref: "main",
  githubConnectionId: "",
  vercelConnectionId: "",
  aquaTagId: "",
  siteUrl: "",
  // "" means top level. The form ALWAYS sends this field, because to the
  // server an omitted parent means "carry what is stored" — right for a
  // save that doesn't know about nesting, wrong for a form that shows an
  // "Inside" select and must be able to clear it.
  parentProjectId: "",
};

type Draft = typeof BLANK;

function draftFrom(project: DevProject): Draft {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? "",
    repository: project.repository ?? "",
    ref: project.ref ?? "main",
    githubConnectionId: project.githubConnectionId ?? "",
    vercelConnectionId: project.vercelConnectionId ?? "",
    aquaTagId: project.aquaTagId ?? "",
    siteUrl: project.siteUrl ?? "",
    parentProjectId: project.parentProjectId ?? "",
  };
}

export function DevEditorSetup() {
  const [projects, setProjects] = useState<DevProject[]>([]);
  const [statuses, setStatuses] = useState<Record<string, DevProjectMapStatus>>({});
  // Per project, not one global flag: mapping one project must not grey out
  // the buttons on the others, and Ed runs several projects at once.
  const [mapping, setMapping] = useState<string | null>(null);
  const [github, setGithub] = useState<ConnectionOption[]>([]);
  const [vercel, setVercel] = useState<ConnectionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The agency's tag — created-or-fetched by the listing call, so opening this
  // screen IS "make me a tag". Public by design; there is no secret in it.
  const [masterTag, setMasterTag] = useState<DevProjectMasterTagView | null>(null);
  const [tagPanel, setTagPanel] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  // Only what the operator has TYPED. Anything not in here falls back to the
  // project's saved address, so a successful check re-syncs by forgetting the
  // draft rather than by racing the reload.
  const [addresses, setAddresses] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    fetch("/api/portal/dev/projects", { cache: "no-store" })
      .then(response => response.json())
      .then(payload => {
        if (!payload.ok) { setError(payload.error ?? "Projects could not be read."); return; }
        setError(null);
        setProjects(payload.projects ?? []);
        setStatuses(payload.statuses ?? {});
        setGithub(payload.githubConnections ?? []);
        setVercel(payload.vercelConnections ?? []);
        setMasterTag(payload.masterTag ?? null);
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
      announceProjectsChanged();
      load();
      return true;
    } catch {
      setError("That could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * MAP — walk the repository and check whether the Aqua Tag really answers.
   *
   * Separate from `post` because the outcome is the point: it reports what was
   * found ("2,914 files · tag answering"), not just "saved", and a Map that
   * finds nothing is still a successful request.
   */
  async function map(project: DevProject) {
    setMapping(project.id);
    setError(null);
    setNotice(null);
    try {
      const payload = await fetch("/api/portal/dev/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "map", id: project.id }),
      }).then(response => response.json()) as {
        ok?: boolean;
        error?: string;
        project?: DevProject;
        status?: DevProjectMapStatus;
      };
      if (!payload.ok || !payload.project) { setError(payload.error ?? "That project could not be mapped."); return; }
      setNotice(`${project.name} mapped — ${summariseMap(payload.project, payload.status)}`);
      announceProjectsChanged();
      load();
    } catch {
      setError("That project could not be mapped.");
    } finally {
      setMapping(null);
    }
  }

  /**
   * CHECK IT — the other half of the loop, and the one that runs from here.
   *
   * Sends the address and nothing else. The site key is resolved server-side
   * from the session's agency, so this screen has no way to claim a project is
   * tagged; it can only ask the server to go and look. The answer is whatever
   * the server concluded, said in the server's own words.
   */
  async function checkTag(project: DevProject) {
    setChecking(project.id);
    setError(null);
    setNotice(null);
    try {
      const payload = await fetch("/api/portal/dev/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "connect-tag",
          id: project.id,
          siteUrl: addresses[project.id] ?? project.siteUrl ?? "",
        }),
      }).then(response => response.json()) as {
        ok?: boolean;
        error?: string;
        project?: DevProject;
        status?: DevProjectMapStatus;
      };
      if (!payload.ok || !payload.project) { setError(payload.error ?? "That address could not be checked."); return; }
      // Only a tag that ANSWERED gets the success line. Everything else is not
      // a failed request — it is a true answer with its own tone, and the panel
      // below states it in that tone; a green toast saying "the snippet is not
      // on the page" would be the screen contradicting itself.
      setNotice(payload.status?.tagVerified ? payload.status.tagSentence : null);
      setAddresses(current => {
        const next = { ...current };
        delete next[project.id];
        return next;
      });
      // Whatever the check concluded — verified, absent, revoked — the record
      // changed, and the editor around this panel must re-derive its browser.
      announceProjectsChanged();
      load();
    } catch {
      setError("That address could not be checked.");
    } finally {
      setChecking(null);
    }
  }

  // One card, rendered identically at either level — a child IS a full
  // project (own repo, own tag, own AI), so it earns the full card; only its
  // position under the parent says what it is. "Add a project inside" appears
  // on TOP-LEVEL cards alone: two levels exactly, so a child never offers to
  // become a parent, and the store would refuse it anyway.
  const projectCard = (project: DevProject) => (
    <article key={project.id} className="rounded-md border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[color:var(--dt-ink)]">{project.name}</p>
          {project.description ? <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[color:var(--dt-faint)]">{project.description}</p> : null}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--dt-muted)]">
            <span className="inline-flex items-center gap-1">
              <Github size={11} aria-hidden />
              {project.repository || "this workspace"}{project.repository ? ` · ${project.ref}` : ""}
            </span>
            <span>{project.githubConnectionId ? "Own token" : "Agency token"}</span>
            {project.vercelConnectionId ? <span>Vercel</span> : null}
            {project.siteUrl ? (
              <span className="inline-flex items-center gap-1"><Globe size={11} aria-hidden />{project.siteUrl}</span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-expanded={tagPanel === project.id}
            onClick={() => { setNotice(null); setTagPanel(tagPanel === project.id ? null : project.id); }}
            title="Create the Aqua Tag, paste it in, and check that it answers"
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-bold ${
              statuses[project.id]?.tagVerified
                ? "border-[color:var(--dev-success-line)] text-[color:var(--dev-success)]"
                : "border-[color:var(--dt-line)] text-[color:var(--dt-muted)]"
            } hover:bg-[color:var(--dt-hover)]`}
          >
            <Tag size={11} aria-hidden /> Aqua Tag
          </button>
          <button
            type="button"
            disabled={mapping === project.id}
            onClick={() => void map(project)}
            title="Walk the repository and check the Aqua Tag answers"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[color:var(--dev-accent-line)] px-2.5 text-[11px] font-bold text-[color:var(--dev-accent)] hover:bg-[color:var(--dt-hover)] disabled:opacity-45"
          >
            {mapping === project.id
              ? <LoaderCircle size={11} className="animate-spin" aria-hidden />
              : <MapIcon size={11} aria-hidden />}
            Map
          </button>
          <Link
            href={`/portal/dev-team/editor/studio?project=${encodeURIComponent(project.id)}`}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-[color:var(--dev-accent)] px-2.5 text-[11px] font-bold text-[color:var(--dev-on-accent)] hover:bg-[color:var(--dev-accent-hover)]"
          >
            <SquarePen size={11} aria-hidden /> Open editor
          </Link>
          {!project.parentProjectId ? (
            <button
              type="button"
              onClick={() => { setNotice(null); setDraft({ ...BLANK, parentProjectId: project.id }); }}
              title={`Create a project inside ${project.name} — two levels, and that's it`}
              className="inline-flex min-h-8 items-center gap-1 rounded-md border border-dashed border-[color:var(--dt-line)] px-2.5 text-[11px] font-semibold text-[color:var(--dt-muted)] hover:border-[color:var(--dev-accent-line)] hover:text-[color:var(--dt-ink)]"
            >
              <Plus size={11} aria-hidden /> Add a project inside
            </button>
          ) : null}
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
      <MapReport project={project} status={statuses[project.id]} />
      {tagPanel === project.id ? (
        <AquaTagPanel
          project={project}
          status={statuses[project.id]}
          masterTag={masterTag}
          address={addresses[project.id] ?? project.siteUrl ?? ""}
          onAddress={value => setAddresses(current => ({ ...current, [project.id]: value }))}
          checking={checking === project.id}
          onCheck={() => void checkTag(project)}
        />
      ) : null}
    </article>
  );

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
        ) : groupDevProjects(projects).map(({ parent, children }) => (
          // Ed's two levels, drawn as two levels: the parent's card, then the
          // projects inside it indented beneath — never a tree, never deeper.
          <div key={parent.id} className="grid gap-2">
            {projectCard(parent)}
            {children.length > 0 ? (
              <div className="ml-5 grid gap-2 border-l-2 border-[color:var(--dt-line)] pl-3">
                {children.map(child => projectCard(child))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {draft ? (
        <ProjectForm
          draft={draft}
          setDraft={setDraft}
          github={github}
          vercel={vercel}
          busy={busy}
          // The "Inside" choices: TOP-LEVEL projects only (two levels, so a
          // child is never on offer as a parent), and never the project being
          // configured (nothing may live inside itself).
          parentOptions={projects
            .filter(project => !project.parentProjectId && project.id !== draft.id)
            .map(project => ({ id: project.id, name: project.name }))}
          hasChildren={Boolean(draft.id) && projects.some(project => project.parentProjectId === draft.id)}
          onSave={() => void post({
            action: "save",
            id: draft.id || undefined,
            name: draft.name,
            description: draft.description,
            repository: draft.repository,
            ref: draft.ref,
            githubConnectionId: draft.githubConnectionId,
            vercelConnectionId: draft.vercelConnectionId,
            // NO aquaTagId. The tag id is the browser gate, and a gate a body
            // can carry is a gate a request can forge — the server refuses it
            // outright and preserves the earned value itself. The draft still
            // holds it, but only so the form can SHOW what is connected.
            siteUrl: draft.siteUrl || undefined,
            // ALWAYS sent, even when "" — to the server an omitted parent
            // means "carry what is stored", and this form shows an "Inside"
            // select, so what it sends must be what the select says. "" is
            // how a project is moved back to the top level.
            parentProjectId: draft.parentProjectId,
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
        <p className="rounded-md border border-[color:var(--dev-warning-line)] bg-[color:var(--dev-warning-soft)] px-3 py-2 text-[11px] text-[color:var(--dev-warning)]">
          No GitHub connection saved yet, so projects fall back to the agency token. Connect one below — no other screen needed.
        </p>
      ) : null}
      <GitHubConnectPanel
        onConnected={connectionId => {
          // Re-read so the new connection appears in every project form, and
          // pre-select it into an open draft so "connect → use it" is one flow.
          load();
          setDraft(current => (current ? { ...current, githubConnectionId: connectionId } : current));
          window.dispatchEvent(new CustomEvent(DEV_PROJECTS_CHANGED_EVENT));
        }}
      />
    </div>
  );
}

/** One line for the toast: what the press actually found. */
function summariseMap(project: DevProject, status?: DevProjectMapStatus): string {
  const parts: string[] = [];
  const repo = project.map?.repo;
  if (repo?.error) parts.push(`repository could not be read (${repo.error})`);
  else if (repo) parts.push(`${repo.fileCount.toLocaleString()} files, ${repo.mappableCount.toLocaleString()} editable pages`);

  if (status?.tagVerified) parts.push("Aqua Tag answering — browser available");
  else if (project.map?.tag?.scriptUnloadableReason && project.map.tag.tagPresent && project.map.tag.keyMatches)
    parts.push("Aqua Tag installed but its script cannot load — no browser");
  else if (project.map?.tag) parts.push("Aqua Tag did not answer — no browser");
  else parts.push("no address to check, so no browser");

  return parts.join(" · ");
}

/**
 * What the last MAP found, said plainly.
 *
 * The point of the whole screen. "Mapped" and "tagged" are separate rows on
 * purpose, because they unlock different things and Ed's rule is easiest to
 * follow when both are visible at once: the repository is what Dev mode reads,
 * the tag is what the browser needs, and a project can perfectly well have one
 * without the other.
 */
function MapReport({ project, status, skin = "workspace" }: { project: DevProject; status?: DevProjectMapStatus; skin?: SetupSkin }) {
  const sk = SETUP_SKINS[skin];
  const repo = project.map?.repo;
  const tag = project.map?.tag;

  if (!project.map || !status) {
    return (
      <p className={`mt-2 flex items-center gap-1.5 border-t ${sk.hairline} pt-2 text-[11px] ${sk.muted}`}>
        <MapIcon size={11} aria-hidden /> Not mapped yet — press Map to read the repository and check the Aqua Tag.
      </p>
    );
  }

  return (
    <div className={`mt-2 grid gap-1.5 border-t ${sk.hairline} pt-2 text-[11px]`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Row
          ok={status.repoMapped}
          skin={skin}
          label={
            repo?.error
              ? `Repository not mapped — ${repo.error}`
              : repo
                ? `${repo.source === "github" ? repo.repository : "This workspace"} mapped · ${repo.fileCount.toLocaleString()} files · ${repo.mappableCount.toLocaleString()} pages${repo.commitSha ? ` · ${repo.commitSha.slice(0, 7)}` : ""}`
                : "Repository not mapped"
          }
        />
        <Row
          ok={status.tagVerified}
          skin={skin}
          label={
            status.tagVerified
              ? `Aqua Tag answering at ${tag?.finalUrl ?? tag?.url ?? project.siteUrl}`
              : tag
                ? `Aqua Tag not confirmed at ${tag.url}`
                : "Aqua Tag not checked"
          }
        />
        <span className={sk.faint}>Mapped {formatUkDateTime(project.map.lastMappedAt)}</span>
      </div>

      {repo?.truncated ? (
        <p className={sk.warnText}>
          GitHub truncated this tree, so the file count is a floor, not the total.
        </p>
      ) : null}

      {/* Said out loud rather than left as a disabled button — Ed's rule, in
          his own words, is that the tag is what turns the browser on and that
          Dev mode never needed one. */}
      {status.missing.map(sentence => (
        <p key={sentence} className={`flex items-start gap-1.5 ${sk.muted}`}>
          <TriangleAlert size={11} aria-hidden className={`mt-0.5 shrink-0 ${sk.warnText}`} />
          {sentence}
        </p>
      ))}

      <p className={status.browserAvailable ? `font-semibold ${sk.okText}` : sk.faint}>
        {status.browserAvailable
          ? "Browser available — simple, assist and visual modes can run."
          : "Dev mode only until an Aqua Tag is connected."}
      </p>
    </div>
  );
}

/**
 * MAKE AN AQUA TAG, FROM HERE.
 *
 * The whole loop in one panel, because this component is what the editor's
 * inspector Settings tab renders — so the tag can be created, pasted, bound and
 * verified without ever leaving the editor, which is the thing that could not
 * be done before.
 *
 *   create/get  the agency key is minted by the listing call and arrives as
 *               `masterTag` — permanent, never rotated, safe to show
 *   show        the snippet, exactly as `masterTagSnippet` built it, in the
 *               same inverted well the API screen uses (`_MasterTagPanel`)
 *   bind        "Check it" is the only path that sets `aquaTagId`, and it is
 *               the server that decides, from the key the page really carried
 *   say         `status.tagSentence` — the server's words, not a second
 *               opinion assembled here
 *
 * There is deliberately no field for the site key and none for the tag id. A
 * tag you can type is not a tag that answers.
 */
function AquaTagPanel({ project, status, masterTag, address, onAddress, checking, onCheck, skin = "workspace" }: {
  project: DevProject;
  status?: DevProjectMapStatus;
  masterTag: DevProjectMasterTagView | null;
  address: string;
  onAddress: (value: string) => void;
  checking: boolean;
  onCheck: () => void;
  skin?: SetupSkin;
}) {
  const sk = SETUP_SKINS[skin];
  const [copied, setCopied] = useState(false);
  const state = status?.tagState ?? "none";
  const tag = project.map?.tag;

  async function copy() {
    if (!masterTag) return;
    try {
      await navigator.clipboard.writeText(masterTag.snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={sk.tagSection}>
      <div className="grid gap-1">
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${sk.ink}`}>
          <Tag size={12} aria-hidden className={sk.accentIcon} /> Aqua Tag
        </p>
        {/* The server's sentence, verbatim. If the screen paraphrased it, the
            screen and the gate would eventually disagree about what is true. */}
        <p className={`text-[11px] leading-5 ${sk.tagTone[state] ?? sk.muted}`}>
          {status?.tagSentence ?? "No Aqua Tag yet, so there is no browser. Dev mode works without one — it reads the repository files directly."}
        </p>
      </div>

      {masterTag ? (
        <>
          {/* Same presentation as Tools → API (`_MasterTagPanel`): an inverted
              well, because --dev-ink is a TEXT token that flips to cream in the
              forge and put the snippet at 1.19:1 against it. */}
          <div className={sk.well}>
            <div className="flex items-center justify-between gap-3">
              <span className={sk.wellLabel}>
                Paste this into the site&apos;s HTML
              </span>
              <button
                type="button"
                onClick={() => void copy()}
                className={sk.wellCopy}
              >
                {copied ? <Check size={12} aria-hidden /> : <Clipboard size={12} aria-hidden />}
                {copied ? "Copied" : "Copy snippet"}
              </button>
            </div>
            <code className={sk.wellCode}>
              {masterTag.snippet}
            </code>
          </div>

          {masterTag.originIsFallback ? (
            <p className={sk.warnSoft}>
              <strong>Don&apos;t paste this one anywhere real.</strong> It points at{" "}
              <code className="font-mono">{masterTag.origin}</code>, which no visitor&apos;s browser can reach — every
              call the tag makes would fail silently. Set <code className="font-mono">NEXT_PUBLIC_PORTAL_BASE_URL</code>{" "}
              to the public portal address and copy it again.
            </p>
          ) : null}

          <p className={`text-[10px] leading-4 ${sk.faint}`}>
            One key for the whole agency (<code className="font-mono">{masterTag.siteKey}</code>) — permanent, never
            rotated, and public by design: it ships in the HTML of every site you tag.
          </p>
        </>
      ) : (
        <p className={`text-[11px] ${sk.muted}`}>The tag could not be read. Reload the screen.</p>
      )}

      <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">
        <label className={`grid gap-1 text-[11px] font-semibold ${sk.muted}`}>
          Where it is installed
          <input
            value={address}
            onChange={event => onAddress(event.target.value)}
            placeholder="example.com"
            className={sk.field}
          />
        </label>
        <button
          type="button"
          disabled={checking || !address.trim()}
          onClick={onCheck}
          className={sk.primary}
        >
          {checking ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Globe size={13} aria-hidden />}
          {checking ? "Checking…" : "Check it"}
        </button>
      </div>

      {tag ? (
        <p className={`text-[10px] ${sk.faint}`}>
          Last checked {formatUkDateTime(tag.checkedAt)}
          {tag.finalUrl ? ` · read ${tag.finalUrl}` : ""}
        </p>
      ) : null}

      <p className={`border-t ${sk.hairline} pt-2 text-[10px] leading-4 ${sk.faint}`}>
        The tag is what turns the browser on — no tag, no browser, and that is what the words, assist and visual modes
        all need. Dev mode never needed one: it reads the repository files directly.
      </p>
    </section>
  );
}

function Row({ ok, label, skin = "workspace" }: { ok: boolean; label: string; skin?: SetupSkin }) {
  const sk = SETUP_SKINS[skin];
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? sk.rowOk : sk.rowOff}`}>
      {ok ? <Check size={11} aria-hidden /> : <X size={11} aria-hidden />} {label}
    </span>
  );
}

/**
 * Connect GitHub WITHOUT leaving the projects screen.
 *
 * Ed: "connect github in company is wrong you should be connecting github in
 * the editor" — and then, blocked: "its not letting me connect it up the auth
 * and everything in the projects thats a big must". The server side needed
 * nothing: `/api/portal/settings/integrations` already saves and tests a
 * github connection (proven in-process). What was missing was any way to reach
 * it from here — the old notice linked OUT to the Company page.
 *
 * Save, then immediately TEST the token so "auth and everything" is proven on
 * the spot rather than discovered broken at first publish. The token is a
 * password input, never prefetched, never echoed, cleared on success; it goes
 * to the vault route and nowhere else.
 */
function GitHubConnectPanel({ onConnected, skin = "workspace" }: { onConnected: (connectionId: string) => void; skin?: SetupSkin }) {
  const sk = SETUP_SKINS[skin];
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("GitHub");
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "bad" | "info"; text: string } | null>(null);
  const field = sk.field;

  async function connect() {
    if (!token.trim() || busy) return;
    setBusy(true);
    setNote({ tone: "info", text: "Saving the connection…" });
    try {
      const saveResponse = await fetch("/api/portal/settings/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          provider: "github",
          label: label.trim() || "GitHub",
          values: { token: token.trim(), owner: owner.trim() },
        }),
      });
      const saved = await saveResponse.json() as { ok?: boolean; error?: string; connection?: { id: string } };
      if (!saveResponse.ok || !saved.ok || !saved.connection?.id) {
        setNote({ tone: "bad", text: saved.error ?? "The connection could not be saved." });
        return;
      }
      // Auth check on the spot: a token that saves but cannot authenticate is
      // the failure Ed hit — surface it NOW, with GitHub's answer, not at the
      // first publish.
      setNote({ tone: "info", text: "Saved. Checking the token against GitHub…" });
      const testResponse = await fetch("/api/portal/settings/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "test", connectionId: saved.connection.id }),
      });
      const tested = await testResponse.json() as { ok?: boolean; error?: string; connection?: { lastTestMessage?: string; status?: string } };
      const verdict = tested.connection?.lastTestMessage ?? tested.error ?? "";
      if (tested.ok && tested.connection?.status !== "failed") {
        setNote({ tone: "ok", text: verdict || "GitHub accepted the token." });
        setToken("");
        setOpen(false);
        onConnected(saved.connection.id);
      } else {
        // Saved but NOT authenticating — say exactly that. The connection
        // exists (it can be fixed by editing it), the auth is what failed.
        setNote({ tone: "bad", text: `Saved, but the token did not authenticate: ${verdict || "GitHub refused it."}` });
        onConnected(saved.connection.id);
      }
    } catch {
      setNote({ tone: "bad", text: "The connection could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      {!open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setNote(null); }}
          className={sk.connectOpen}
        >
          <Github size={13} aria-hidden /> Connect GitHub
        </button>
      ) : (
        <div className={sk.connectPanel}>
          <div className="flex items-center justify-between">
            <p className={sk.connectTitle}><Github size={13} aria-hidden /> Connect GitHub</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close the GitHub form" className={sk.connectClose}><X size={13} aria-hidden /></button>
          </div>
          <label className={sk.connectLabel}>
            Fine-grained token
            <input type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="github_pat_…" autoComplete="off" className={field} />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={sk.connectLabel}>
              Label
              <input value={label} onChange={event => setLabel(event.target.value)} className={field} />
            </label>
            <label className={sk.connectLabel}>
              Repository owner (optional)
              <input value={owner} onChange={event => setOwner(event.target.value)} placeholder="your user or org" className={field} />
            </label>
          </div>
          <p className={sk.connectHelp}>
            Create the token at{" "}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="font-semibold underline">github.com → fine-grained tokens</a>
            {" "}with contents read/write on the repositories this editor should publish to. It is stored encrypted and never shown again.
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={busy || !token.trim()}
            className={sk.connectSave}
          >
            {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
            Save and check auth
          </button>
        </div>
      )}
      {note ? (
        <p className={`rounded-md border px-3 py-2 text-[11px] ${note.tone === "ok" ? sk.noteOk : note.tone === "bad" ? sk.noteBad : sk.noteInfo}`}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}

function ProjectForm({ draft, setDraft, github, vercel, busy, parentOptions, hasChildren, onSave }: {
  draft: Draft;
  setDraft: (draft: Draft | null) => void;
  github: ConnectionOption[];
  vercel: ConnectionOption[];
  busy: boolean;
  /** Legal "Inside" choices: top-level projects, minus the one being edited. */
  parentOptions: { id: string; name: string }[];
  /** True when the project being edited contains projects — it stays top level. */
  hasChildren: boolean;
  onSave: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  const field = "min-h-9 rounded-md border border-[color:var(--dt-line)] bg-[color:var(--dt-bg)] px-2.5 text-xs text-[color:var(--dt-ink)] outline-none focus:border-[color:var(--dev-accent)]";
  const insideName = parentOptions.find(option => option.id === draft.parentProjectId)?.name;

  return (
    <div className="grid gap-3 rounded-md border border-[color:var(--dev-accent-line)] bg-[color:var(--dt-surface)] p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[color:var(--dt-ink)]">
          {draft.id ? "Configure project" : insideName ? `New project inside "${insideName}"` : "New project"}
        </p>
        <button type="button" onClick={() => setDraft(null)} aria-label="Cancel" className="grid size-6 place-items-center rounded text-[color:var(--dt-muted)] transition-colors hover:bg-[color:var(--dt-hairline)] hover:text-[color:var(--dt-ink)]">
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

      {/* WHERE IT LIVES — Ed's nesting, said in one control. The options are
          top-level projects only, because two levels is the whole model: a
          project inside a project, and that's it. A project that already
          contains projects can't be moved inside one (the store refuses; this
          form says why instead of offering a select that always fails). */}
      {hasChildren ? (
        <p className="rounded-md border border-dashed border-[color:var(--dt-line)] px-2.5 py-2 text-[11px] leading-4 text-[color:var(--dt-muted)]">
          This project contains projects, so it stays top level — projects go two levels deep and no further.
        </p>
      ) : (
        <label className="grid gap-1 text-[11px] font-semibold text-[color:var(--dt-muted)] md:max-w-sm">
          Inside <span className="font-normal">— optional; a project can live inside one other project</span>
          <select value={draft.parentProjectId} onChange={event => set("parentProjectId", event.target.value)} className={field}>
            <option value="">Top level — its own project</option>
            {parentOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
      )}

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

      <label className="grid gap-1 text-[11px] font-semibold text-[color:var(--dt-muted)]">
        What is it? <span className="font-normal">— in your words; a project is often several things at once</span>
        <textarea
          value={draft.description}
          onChange={event => set("description", event.target.value)}
          rows={2}
          placeholder="e.g. the CRM itself — Next.js app, its own website, and the client portals it serves"
          className={`${field} resize-y py-2 leading-5`}
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-[11px] font-semibold text-[color:var(--dt-muted)]">
          Website address <span className="font-normal">— where the Aqua Tag is installed; Map checks it</span>
          <input value={draft.siteUrl} onChange={event => set("siteUrl", event.target.value)} placeholder="example.com" className={field} />
        </label>
        {/* NOT a field. It used to be a text box, and a tag id you can type is
            a browser you can switch on without a tag ever answering. It is set
            by Map and by Check it, from the key the fetched page really
            carried. A save never sends it at all — the SERVER preserves the
            earned value, so editing the name never drops it and a crafted body
            can never plant one. The draft holds it only for display. */}
        <div className="grid gap-1 text-[11px] font-semibold text-[color:var(--dt-muted)]">
          Aqua Tag <span className="font-normal">— set by Map or Check it, never typed</span>
          <p className={`min-h-9 items-center rounded-md border border-dashed border-[color:var(--dt-line)] px-2.5 py-2 font-mono text-xs ${draft.aquaTagId ? "text-[color:var(--dev-success)]" : "text-[color:var(--dt-faint)]"}`}>
            {draft.aquaTagId || "Not connected — press Aqua Tag on the project to install and check it"}
          </p>
        </div>
      </div>
      <p className="text-[11px] leading-4 text-[color:var(--dt-faint)]">
        The Aqua Tag is what turns the browser on — no tag, no browser, whatever the project is
        written in. Dev mode works either way, because it reads the repository files directly.
      </p>

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

// ═════════════════════════════════════════════════════════════════════════════
// THE EDITOR'S SETTINGS PANEL — one project, the editor's clothes
// ═════════════════════════════════════════════════════════════════════════════
//
// `DevEditorSetup` above is the projects WORKSPACE. For a while the editor's
// Settings tab mounted that whole screen inside the dark inspector, and Ed
// walked into every consequence at once: cream `--dt-*` cards inside a dark
// editor, an "Open editor" button INSIDE the editor, "Add a project" three
// levels deep in a project, and every other project's card in a panel that is
// supposed to be about THIS one.
//
// Ed's rule: settings configure ONLY the project you are in. This panel is
// that rule, and nothing else — the open project's repository, branch and
// connections, the GitHub connect flow, the Aqua Tag loop (snippet → paste →
// Check it), Map, and where the Aqua Editor AI key lives. No creation, no
// other projects, no "Open editor" — you are already inside it. Editor
// vocabulary throughout (`SETUP_SKINS.editor` — dark translucent panels,
// `--mode-accent` highlights, **no `--dt-*` tokens**).
//
// Same requests, same announcements as the workspace: every successful
// mutation still fires `DEV_PROJECTS_CHANGED_EVENT`, which is how the editor
// around this panel re-derives its browser without a reload.

export function DevEditorProjectSettings({
  projectId,
  aiConfigured,
  canManageConnections = true,
  canRebindConnections = true,
}: {
  /** The project this editor is open ON. Empty = a door with no project. */
  projectId: string;
  /** Whether the Aqua Editor AI holds a key for this project — never the key. */
  aiConfigured?: boolean;
  /** Exact `project.connection.manage` for this project. */
  canManageConnections?: boolean;
  /** Owner/manager governance authority to replace repository credentials. */
  canRebindConnections?: boolean;
}) {
  const sk = SETUP_SKINS.editor;
  const [projects, setProjects] = useState<DevProject[]>([]);
  const [statuses, setStatuses] = useState<Record<string, DevProjectMapStatus>>({});
  const [github, setGithub] = useState<ConnectionOption[]>([]);
  const [vercel, setVercel] = useState<ConnectionOption[]>([]);
  // The agency's tag, created-or-fetched by the listing call — same as the
  // workspace, because the snippet must be COPYABLE from inside the editor.
  const [masterTag, setMasterTag] = useState<DevProjectMasterTagView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [checking, setChecking] = useState(false);
  /** Only what has been TYPED. Null falls back to the saved address. */
  const [address, setAddress] = useState<string | null>(null);
  /** The config form for THIS project, seeded once its record arrives. */
  const [draft, setDraft] = useState<Draft | null>(null);
  /** The name of a project being created INSIDE this one. */
  const [childName, setChildName] = useState("");

  function load() {
    fetch("/api/portal/dev/projects", { cache: "no-store" })
      .then(response => response.json())
      .then(payload => {
        if (!payload.ok) { setError(payload.error ?? "The project could not be read."); return; }
        setError(null);
        setProjects(payload.projects ?? []);
        setStatuses(payload.statuses ?? {});
        setGithub(payload.githubConnections ?? []);
        setVercel(payload.vercelConnections ?? []);
        setMasterTag(payload.masterTag ?? null);
      })
      .catch(() => setError("The project could not be read."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const project = projects.find(item => item.id === projectId) ?? null;
  const status = projectId ? statuses[projectId] : undefined;

  // A different project means a different form: drop everything typed for the
  // old one rather than letting project B wear project A's draft.
  useEffect(() => { setDraft(null); setAddress(null); setNotice(null); setChildName(""); }, [projectId]);
  // Seed ONCE per project — a background re-load must not clobber typing.
  useEffect(() => {
    if (project && !draft) setDraft(draftFrom(project));
  }, [project, draft]);

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
      announceProjectsChanged();
      load();
      return true;
    } catch {
      setError("That could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Create a project INSIDE this one — Ed's whole point about in-editor
   * creation: from inside a project you can make another, and it is a CHILD
   * of the project you are standing in, never a new top-level one. The
   * parent is this panel's own project id; the two-level rule itself lives
   * in the store, which refuses anything deeper however it is asked.
   * `post` announces DEV_PROJECTS_CHANGED_EVENT on success like every other
   * mutation here, so the editor around the panel re-reads its projects.
   */
  async function createChild() {
    if (!project) return;
    const name = childName.trim();
    if (!name) return;
    const created = await post({
      action: "save",
      name,
      parentProjectId: project.id,
    }, `"${name}" added inside ${project.name}.`);
    if (created) setChildName("");
  }

  /** Save THIS project's pointing config. Never a create: the id is always sent. */
  function save() {
    if (!project || !draft) return;
    void post({
      action: "save",
      id: project.id,
      name: draft.name,
      description: draft.description,
      ...(canManageConnections ? {
        repository: draft.repository,
        ref: draft.ref,
        // Empty is an explicit unbind. Omitting means carry the existing
        // binding, so `undefined` cannot represent the user's clear action.
        githubConnectionId: draft.githubConnectionId,
        vercelConnectionId: draft.vercelConnectionId,
      } : {}),
      // NO aquaTagId — the tag id is the browser gate and only Map / Check it
      // may set it, from the key the fetched page really carried. The server
      // preserves the earned value on every save.
      siteUrl: draft.siteUrl || undefined,
    }, "Project updated.");
  }

  /** MAP — walk the repository and check whether the Aqua Tag really answers. */
  async function runMap() {
    if (!project) return;
    setMapping(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await fetch("/api/portal/dev/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "map", id: project.id }),
      }).then(response => response.json()) as {
        ok?: boolean; error?: string; project?: DevProject; status?: DevProjectMapStatus;
      };
      if (!payload.ok || !payload.project) { setError(payload.error ?? "The project could not be mapped."); return; }
      setNotice(`Mapped — ${summariseMap(payload.project, payload.status)}`);
      announceProjectsChanged();
      load();
    } catch {
      setError("The project could not be mapped.");
    } finally {
      setMapping(false);
    }
  }

  /**
   * CHECK IT — sends the address and nothing else; the site key resolves
   * server-side from the session's agency, and the server's verdict is shown
   * in the server's own words. Identical contract to the workspace's checkTag.
   */
  async function checkProjectTag() {
    if (!project) return;
    setChecking(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await fetch("/api/portal/dev/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "connect-tag",
          id: project.id,
          siteUrl: address ?? project.siteUrl ?? "",
        }),
      }).then(response => response.json()) as {
        ok?: boolean; error?: string; project?: DevProject; status?: DevProjectMapStatus;
      };
      if (!payload.ok || !payload.project) { setError(payload.error ?? "That address could not be checked."); return; }
      // Only a tag that ANSWERED gets the success line — anything else is a
      // true answer the tag panel states in its own tone.
      setNotice(payload.status?.tagVerified ? payload.status.tagSentence : null);
      setAddress(null);
      announceProjectsChanged();
      load();
    } catch {
      setError("That address could not be checked.");
    } finally {
      setChecking(false);
    }
  }

  // ── A door with no project behind it ──────────────────────────────────────
  if (!projectId) {
    return (
      <section className={`grid gap-2 rounded-lg border ${sk.hairline} bg-black/30 p-3 text-[11px] leading-5 ${sk.muted}`}>
        <p className={`text-xs font-semibold ${sk.ink}`}>This editor is not open on a project.</p>
        <p>
          Settings configure only the project you are in. Open a project from the Projects
          workspace and its repository, branch, connections and Aqua Tag are all configured
          right here — without leaving the editor.
        </p>
        <Link href="/portal/dev-team/editor" className="w-fit text-[11px] font-semibold text-[color:var(--mode-accent)] hover:brightness-110">
          All projects →
        </Link>
      </section>
    );
  }

  if (loading && !project) {
    return (
      <p className={`flex items-center gap-2 text-xs ${sk.muted}`}>
        <LoaderCircle size={13} className="animate-spin" aria-hidden /> Reading this project…
      </p>
    );
  }

  if (!project) {
    return (
      <section className={`grid gap-2 rounded-lg border ${sk.hairline} bg-black/30 p-3 text-[11px] leading-5 ${sk.muted}`}>
        {error ? (
          <p role="alert" className={`flex items-start gap-2 text-xs ${sk.warnText}`}>
            <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0" /> {error}
          </p>
        ) : (
          <p className={`text-xs font-semibold ${sk.ink}`}>This project could not be found.</p>
        )}
        <Link href="/portal/dev-team/editor" className="w-fit text-[11px] font-semibold text-[color:var(--mode-accent)] hover:brightness-110">
          All projects →
        </Link>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-red-300/25 bg-red-300/[0.06] px-3 py-2 text-xs text-red-200">
          <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}
      {notice ? <p className={`text-xs ${sk.okText}`}>{notice}</p> : null}

      {/* ── What the editor is pointed at ─────────────────────────────────── */}
      <section className={`grid gap-3 rounded-lg border ${sk.hairline} bg-black/30 p-3`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`flex items-center gap-1.5 text-xs font-semibold ${sk.ink}`}>
              <Github size={12} aria-hidden className={sk.accentIcon} /> Repository &amp; connections
            </p>
            <p className={`mt-0.5 truncate text-[11px] leading-4 ${sk.faint}`}>
              {project.repository || "This workspace"}{project.repository ? ` · ${project.ref}` : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={mapping}
            onClick={() => void runMap()}
            title="Walk the repository and check the Aqua Tag answers"
            className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.05] px-2.5 text-[11px] font-bold text-white/72 hover:bg-white/10 hover:text-white disabled:opacity-45"
          >
            {mapping
              ? <LoaderCircle size={11} className="animate-spin" aria-hidden />
              : <MapIcon size={11} aria-hidden />}
            Map
          </button>
        </div>

        <MapReport project={project} status={status} skin="editor" />

        {draft ? (
          <div className={`grid gap-2 border-t ${sk.hairline} pt-3`}>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={`grid gap-1 text-[11px] font-semibold ${sk.muted}`}>
                Repository <span className="font-normal">— blank reads this workspace</span>
                <input disabled={!canRebindConnections} value={draft.repository} onChange={event => setDraft({ ...draft, repository: event.target.value })} placeholder="owner/repository" className={sk.field} />
              </label>
              <label className={`grid gap-1 text-[11px] font-semibold ${sk.muted}`}>
                Branch
                <input disabled={!canManageConnections} value={draft.ref} onChange={event => setDraft({ ...draft, ref: event.target.value })} className={sk.field} />
              </label>
            </div>
            {canRebindConnections ? <div className="grid gap-2 sm:grid-cols-2">
              <label className={`grid gap-1 text-[11px] font-semibold ${sk.muted}`}>
                GitHub connection
                <select value={draft.githubConnectionId} onChange={event => setDraft({ ...draft, githubConnectionId: event.target.value })} className={sk.field}>
                  <option value="" className="bg-neutral-900">Agency default</option>
                  {github.map(item => <option key={item.id} value={item.id} className="bg-neutral-900">{item.label}</option>)}
                </select>
              </label>
              <label className={`grid gap-1 text-[11px] font-semibold ${sk.muted}`}>
                Vercel connection
                <select value={draft.vercelConnectionId} onChange={event => setDraft({ ...draft, vercelConnectionId: event.target.value })} className={sk.field}>
                  <option value="" className="bg-neutral-900">None</option>
                  {vercel.map(item => <option key={item.id} value={item.id} className="bg-neutral-900">{item.label}</option>)}
                </select>
              </label>
            </div> : (
              <p className={`rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-2 text-[11px] leading-5 ${sk.muted}`}>
                {canManageConnections
                  ? "The repository and saved connections are governance-controlled. You can change the branch within this project's current repository."
                  : "Repository, branch and connection bindings are read-only. Request repository-connection management for this exact project to change its branch."}
              </p>
            )}
            <label className={`grid gap-1 text-[11px] font-semibold ${sk.muted}`}>
              Website address <span className="font-normal">— where the Aqua Tag is installed; Map checks it</span>
              <input value={draft.siteUrl} onChange={event => setDraft({ ...draft, siteUrl: event.target.value })} placeholder="example.com" className={sk.field} />
            </label>
            <button
              type="button"
              onClick={save}
              disabled={busy || !draft.name.trim()}
              className={`${sk.primary} w-fit`}
            >
              {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
              Save changes
            </button>
          </div>
        ) : null}
      </section>

      {/* ── The Aqua Tag — made, pasted and verified without leaving here ── */}
      <AquaTagPanel
        project={project}
        status={status}
        masterTag={masterTag}
        address={address ?? project.siteUrl ?? ""}
        onAddress={setAddress}
        checking={checking}
        onCheck={() => void checkProjectTag()}
        skin="editor"
      />

      {/* ── GitHub, connected from inside the editor ──────────────────────── */}
      {!github.length ? (
        <p className={sk.warnSoft}>
          {canRebindConnections
            ? "No dedicated GitHub connection is bound to this project. Delegated access never falls back to an agency or server token."
            : "No authorised GitHub connection metadata is available here. Ask the owner to bind a dedicated connection to this project."}
        </p>
      ) : null}
      {canRebindConnections ? <GitHubConnectPanel
        skin="editor"
        onConnected={connectionId => {
          // Re-read so the connection appears in the selects, and point THIS
          // project's form at it so "connect → use it" is one flow.
          load();
          setDraft(current => (current ? { ...current, githubConnectionId: connectionId } : current));
          window.dispatchEvent(new CustomEvent(DEV_PROJECTS_CHANGED_EVENT));
        }}
      /> : null}

      {/* ── Projects inside this one — created without leaving the editor ── */}
      <section className={`grid gap-2 rounded-lg border ${sk.hairline} bg-black/30 p-3`}>
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${sk.ink}`}>
          <Plus size={12} aria-hidden className={sk.accentIcon} /> Projects inside this one
        </p>
        {project.parentProjectId ? (
          <p className={`text-[11px] leading-5 ${sk.muted}`}>
            This project already lives inside another one, and projects go two levels deep and
            no further — so nothing can be created inside it.
          </p>
        ) : (
          <>
            {projects.filter(item => item.parentProjectId === project.id).length > 0 ? (
              <p className={`text-[11px] leading-5 ${sk.muted}`}>
                Already inside:{" "}
                {projects.filter(item => item.parentProjectId === project.id).map(child => child.name).join(", ")}.
              </p>
            ) : null}
            <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">
              <label className={`grid gap-1 text-[11px] font-semibold ${sk.muted}`}>
                Name
                <input
                  value={childName}
                  onChange={event => setChildName(event.target.value)}
                  placeholder="e.g. the software behind this site"
                  className={sk.field}
                />
              </label>
              <button
                type="button"
                disabled={busy || !childName.trim()}
                onClick={() => void createChild()}
                className={sk.primary}
              >
                {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Plus size={13} aria-hidden />}
                Add a project inside this one
              </button>
            </div>
            <p className={`text-[10px] leading-4 ${sk.faint}`}>
              It is created inside {project.name} — a project made from inside the editor is a
              child of the project you are in, never a new top-level one. Two levels, and
              that&apos;s it.
            </p>
          </>
        )}
      </section>

      {/* ── Where the Aqua Editor AI key lives ────────────────────────────── */}
      <section className={`grid gap-1.5 rounded-lg border ${sk.hairline} bg-black/30 p-3`}>
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${sk.ink}`}>
          <KeyRound size={12} aria-hidden className={sk.accentIcon} /> Aqua Editor AI key
        </p>
        <p className={`text-[11px] leading-5 ${sk.muted}`}>
          {aiConfigured === undefined
            ? "Open the Assistant tab to check or configure this project's key."
            : aiConfigured
              ? "A key is set for this project."
              : "No key on this project yet."}{" "}
          It is saved per project and managed in the{" "}
          <strong className={`font-semibold ${sk.ink}`}>Assistant</strong> tab — only whether
          one is set is ever shown, never the value.
        </p>
      </section>

      {/* ── Everything that is NOT this project lives elsewhere ───────────── */}
      <p className={`border-t ${sk.hairline} pt-3 text-[10px] leading-4 ${sk.faint}`}>
        Top-level projects, renaming, disconnecting — and every other project — live in the{" "}
        <Link href="/portal/dev-team/editor" className="font-semibold text-[color:var(--mode-accent)]">
          Projects workspace
        </Link>
        . This panel configures only the project you are in, and anything it creates lives
        inside that project.
      </p>
    </div>
  );
}
