"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, FileCode2, Folder, FolderOpen, GitPullRequest, LoaderCircle, Lock, PanelLeftClose, PanelLeftOpen, Plug, RefreshCw, Search, TriangleAlert, Users, X } from "lucide-react";

import type { TreeDirectory, TreeFile } from "@/engines/editor/server/fileTree";
import { DEV_PROJECTS_CHANGED_EVENT } from "@/app/portal/dev-team/editor/setup/_DevEditorSetup";
import { fileColour } from "./codeTheme";
import { CodeSurface } from "./CodeSurface";

// ─── DEV EDITOR — the code canvas ────────────────────────────────────────────
//
// The stripped file tree, but in the CANVAS rather than a 340px rail: tree on
// the left, the file open in the middle, the way an editor is supposed to work.
// It reads the same /api/portal/site-editor/files the Repo inspector does, so a
// selected Dev project points it at that project's repository through that
// project's own token — the browser never holds a credential.
//
// Saving is honest about where it lands: a local workspace writes to disk
// through the files route; a repository-backed project COMMITS to its draft
// branch (aqua-editor/<project>) through /api/portal/dev/repo-write, and the
// strip above the tabs says so — nothing reaches the site until the branch's
// pull request (the Publish control) is merged.

interface TreeResponse {
  ok?: boolean;
  source?: "github";
  tree?: TreeDirectory;
  count?: number;
  sha?: string;
  truncated?: boolean;
  /** Set when the tree came off the project's draft branch, not the base ref. */
  draftBranch?: string;
  needsGitHub?: boolean;
  error?: string;
  href?: string;
}

export function EditorCodeCanvas({
  projectId,
  repository,
  focus,
  onOpenFile,
}: {
  /** A Dev project — the server resolves repo, ref and token from it. */
  projectId?: string;
  /** Or a typed owner/repo. Blank means this workspace. */
  repository?: string;
  /** A file (and line) to open, e.g. from clicking an element in the preview. */
  focus?: { path: string; line?: number } | null;
  onOpenFile?: (path: string) => void;
}) {
  const [tree, setTree] = useState<TreeDirectory | null>(null);
  const [meta, setMeta] = useState<TreeResponse | null>(null);
  // Bumped to re-run the tree fetch. A refusal ("Connect GitHub") fetched once
  // on mount stayed on screen FOREVER — the live GET was answering 200 with
  // 5,546 files while the tree still showed the cached 409. The Settings tab
  // announces DEV_PROJECTS_CHANGED_EVENT when a connection lands, and Try
  // again is the same bump by hand.
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  // MANY files open at once. `openPaths` is the tab strip in order; `open` is
  // the active one. Opening a file that is already open just activates its tab.
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [open, setOpenPath] = useState<string | null>(null);

  function setOpen(path: string | null) {
    setOpenPath(path);
    if (!path) return;
    setOpenPaths(current => (current.includes(path) ? current : [...current, path]));
  }

  function closeTab(path: string) {
    setOpenPaths(current => {
      const next = current.filter(item => item !== path);
      if (path === open) {
        const index = current.indexOf(path);
        setOpenPath(next[Math.min(index, next.length - 1)] ?? null);
      }
      // Drop that file's buffer so a reopened tab is read fresh — a stale
      // buffer is exactly what the write path refuses anyway.
      setBuffers(all => { const copy = { ...all }; delete copy[path]; return copy; });
      return next;
    });
  }
  type OpenFile = { contents?: string; reason?: string; editable?: boolean; readable?: boolean; kind?: string; dataUrl?: string; truncatedContents?: boolean; fingerprint?: string };
  const [files, setFiles] = useState<Record<string, OpenFile>>({});
  const [loading, setLoading] = useState(false);
  // In split view the tree competes with the file for width; let it fold away.
  const [treeOpen, setTreeOpen] = useState(true);
  // The edit buffer. Separate from `file` so the pristine contents (and the
  // fingerprint they were read at) survive editing — a save is judged against
  // what was OPENED, which is what stops it overwriting somebody else's work.
  // One buffer per open file, keyed by path — switching tabs must not lose
  // what was typed in the last one.
  const [buffers, setBuffers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  // The draft branch's pull request, once Publish has been pressed. Held here
  // rather than re-fetched: opening the PR is the one action, and the link +
  // state it returns is what the strip shows until the target changes.
  const [pullRequest, setPullRequest] = useState<{ number: number; url: string; state: string; merged?: boolean } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishNote, setPublishNote] = useState<string | null>(null);
  // Who else is in here. Advisory only — the WRITE path is what actually
  // protects the work, by refusing a save whose fingerprint has moved.
  const [activity, setActivity] = useState<{ paths: Map<string, number>; workers: string[] }>({ paths: new Map(), workers: [] });

  useEffect(() => {
    let cancelled = false;
    const read = () => {
      fetch("/api/portal/dev/editor-activity", { cache: "no-store" })
        .then(response => response.json())
        .then(payload => {
          if (cancelled || !payload?.ok) return;
          setActivity({
            paths: new Map((payload.files ?? []).map((f: { path: string; at: number }) => [f.path, f.at])),
            workers: (payload.workers ?? []).map((w: { name: string }) => w.name),
          });
        })
        // Not available (no Dev Mode) is not an error — just no markers.
        .catch(() => {});
    };
    read();
    const timer = window.setInterval(read, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  function movedAgo(path: string): string | null {
    const at = activity.paths.get(path);
    if (!at) return null;
    const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
    return minutes < 1 ? "just now" : minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  }

  const search = projectId
    ? `?project=${encodeURIComponent(projectId)}`
    : repository ? `?repo=${encodeURIComponent(repository)}&ref=main` : "";

  // Where you were last time, per project/repository. Reopening an editor and
  // being dumped at an empty root — having to hunt back to the four files you
  // were working across — is the thing this avoids.
  const sessionKey = `mm-dev-editor-session:${projectId || repository || "workspace"}`;

  // Changing TARGET clears the pane; a mere refresh must not — it re-reads the
  // same repository, and closing the open file over it would lose your place.
  // The pull request belongs to the old target's branch, so it goes too.
  useEffect(() => {
    setTree(null);
    setOpen(null);
    setPullRequest(null);
    setPublishNote(null);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/site-editor/files${search}`, { cache: "no-store" })
      .then(response => response.json())
      .then((payload: TreeResponse) => { if (!cancelled) { setMeta(payload); setTree(payload.tree ?? null); } })
      .catch(() => { if (!cancelled) setMeta({ error: "The repository could not be read." }); });
    return () => { cancelled = true; };
  }, [search, refresh]);

  // A GitHub connection landing in Settings re-reads the tree here, so the
  // canvas never keeps showing a refusal the server has stopped giving.
  useEffect(() => {
    const onProjectsChanged = () => setRefresh(value => value + 1);
    window.addEventListener(DEV_PROJECTS_CHANGED_EVENT, onProjectsChanged);
    return () => window.removeEventListener(DEV_PROJECTS_CHANGED_EVENT, onProjectsChanged);
  }, []);

  // Clicking an element in the live preview opens its source here.
  useEffect(() => { if (focus?.path) { setOpen(focus.path); setQuery(""); } }, [focus?.path, focus?.line]);

  useEffect(() => {
    if (!open) return;
    setSaveNote(null);
    // Already open in another tab — show what is held rather than refetching
    // and discarding whatever was typed in it.
    if (files[open]) return;
    const path = open;
    setLoading(true);
    const separator = search ? "&" : "?";
    fetch(`/api/portal/site-editor/files${search}${separator}path=${encodeURIComponent(path)}`, { cache: "no-store" })
      .then(response => response.json())
      .then(payload => {
        setFiles(all => ({ ...all, [path]: payload }));
        if (typeof payload?.contents === "string") setBuffers(all => ({ ...all, [path]: payload.contents }));
      })
      .catch(() => setFiles(all => ({ ...all, [path]: { editable: false, reason: "That file could not be read." } })))
      .finally(() => setLoading(false));
  }, [open, search, files]);

  // Changing repository/project invalidates everything that was open, then
  // restores whatever was open for the NEW target last time.
  useEffect(() => {
    setFiles({});
    setBuffers({});
    try {
      const saved = JSON.parse(window.localStorage.getItem(sessionKey) ?? "null") as
        | { openPaths?: unknown; active?: unknown }
        | null;
      const paths = Array.isArray(saved?.openPaths)
        ? saved!.openPaths.filter((item): item is string => typeof item === "string").slice(0, 12)
        : [];
      setOpenPaths(paths);
      setOpenPath(typeof saved?.active === "string" && paths.includes(saved.active) ? saved.active : paths[0] ?? null);
    } catch {
      setOpenPaths([]);
      setOpenPath(null);
    }
  }, [sessionKey]);

  // …and remember it as it changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(sessionKey, JSON.stringify({ openPaths, active: open }));
    } catch {
      // Storage full or disabled — resuming is a convenience, not a contract.
    }
  }, [sessionKey, openPaths, open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !tree) return null;
    const all: TreeFile[] = [];
    (function walk(directory: TreeDirectory) {
      all.push(...directory.files);
      directory.directories.forEach(walk);
    })(tree);
    return all.filter(entry => entry.path.toLowerCase().includes(needle)).slice(0, 80);
  }, [query, tree]);

  const file = open ? files[open] : undefined;
  const draft = open ? buffers[open] ?? null : null;
  const dirty = draft != null && file?.contents != null && draft !== file.contents;
  const dirtyPaths = new Set(
    Object.keys(buffers).filter(path => files[path]?.contents != null && buffers[path] !== files[path]?.contents),
  );

  // A Dev project whose tree came from GitHub saves as COMMITS on its draft
  // branch — never to this server's disk. The strip below and the save note
  // both say so, because "Saved" alone would claim more than what happened.
  const repoBacked = Boolean(projectId && meta?.source === "github");
  const REPO_SAVED_NOTE = "On the draft branch — publish opens the pull request";

  async function save() {
    if (!open || draft == null || !file?.fingerprint) return;
    setSaving(true);
    setSaveNote(null);
    try {
      const response = await fetch(repoBacked ? "/api/portal/dev/repo-write" : "/api/portal/site-editor/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(repoBacked
          // The repository path: a confirmed commit on aqua-editor/<project>.
          // The server re-checks this fingerprint against what the branch tip
          // actually holds, so a copy that moved under us is refused, never
          // overwritten.
          ? { action: "save", project: projectId, path: open, contents: draft, fingerprint: file.fingerprint, confirm: true }
          : { path: open, contents: draft, fingerprint: file.fingerprint, project: projectId }),
      });
      const payload = await response.json();
      if (!payload.ok) {
        setSaveNote(payload.error ?? "That file could not be saved.");
        return;
      }
      // Adopt the new fingerprint so a second save is judged against what is
      // now on disk (or on the branch tip), not the version this pane opened.
      const path = open;
      setFiles(all => (all[path] ? { ...all, [path]: { ...all[path], contents: draft, fingerprint: payload.fingerprint } } : all));
      // Honesty rule: a commit on a draft branch is not "saved to the site".
      setSaveNote(repoBacked ? REPO_SAVED_NOTE : "Saved");
    } catch {
      setSaveNote("That file could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!projectId) return;
    setPublishing(true);
    setPublishNote(null);
    try {
      const response = await fetch("/api/portal/dev/repo-write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "publish", project: projectId }),
      });
      const payload = await response.json();
      if (!payload.ok || !payload.pullRequest) {
        setPublishNote(payload.error ?? "The pull request could not be opened.");
        return;
      }
      setPullRequest(payload.pullRequest);
      // Pressing it twice is boring by design — the same PR comes back.
      setPublishNote(payload.pullRequest.existing ? "Already open — that is the pull request." : null);
    } catch {
      setPublishNote("The pull request could not be opened.");
    } finally {
      setPublishing(false);
    }
  }


  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Tree */}
      {treeOpen ? (
      <div className="flex w-60 shrink-0 flex-col border-r border-white/8 bg-[#1b1e1b] xl:w-72">
        <div className="relative shrink-0 border-b border-white/8 p-2">
          <Search size={13} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Find a file"
            aria-label="Find a file"
            className="h-8 w-full rounded-md border border-white/10 bg-white/[0.04] pl-7 pr-2 text-[11px] text-white/85 outline-none placeholder:text-white/25 focus:border-cyan-300/40"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {!tree && (meta?.needsGitHub || meta?.error) ? (
            <p className="px-2 py-3 text-[11px] leading-5 text-white/45">
              {meta.needsGitHub ? "Connect GitHub in the Settings tab to browse this repository." : "Nothing could be listed."}
            </p>
          ) : !tree ? (
            <p className="flex items-center gap-2 px-2 py-3 text-[11px] text-white/45">
              <LoaderCircle size={12} className="animate-spin" aria-hidden /> Reading…
            </p>
          ) : matches ? (
            matches.length
              ? matches.map(entry => <FileRow key={entry.path} file={entry} active={entry.path === open} onOpen={path => { setOpen(path); onOpenFile?.(path); }} showPath movedAgo={movedAgo(entry.path)} />)
              : <p className="px-2 py-3 text-[11px] text-white/40">No file matches that.</p>
          ) : (
            <DirectoryRows directory={tree} depth={0} open={open} onOpen={path => { setOpen(path); onOpenFile?.(path); }} movedAgo={movedAgo} />
          )}
        </div>
        <p className="shrink-0 border-t border-white/8 px-3 py-1.5 text-[10px] text-white/30">
          {meta?.count ? `${meta.count} files` : ""}{meta?.sha ? ` · ${meta.sha.slice(0, 7)}` : ""}
        </p>
      </div>
      ) : null}

      {/* The open file */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#151815]">
        {meta?.needsGitHub ? (
          <div className="m-4 flex items-start gap-2 rounded-md border border-amber-300/25 bg-amber-300/[0.06] p-3 text-[11px] leading-5 text-amber-200/90">
            <Plug size={13} aria-hidden className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">{meta.error}</span>
            {/* The connect panel announces when it lands and this canvas
                re-fetches on the announcement — but a refusal must never be
                the LAST word on screen with no way to ask again. */}
            <button
              type="button"
              onClick={() => setRefresh(value => value + 1)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-300/40 px-2 py-0.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-300/10"
            >
              <RefreshCw size={10} aria-hidden /> Try again
            </button>
          </div>
        ) : null}
        {meta?.truncated ? (
          <p className="mx-4 mt-4 flex items-center gap-2 rounded-md border border-amber-300/25 bg-amber-300/[0.06] px-3 py-2 text-[11px] text-amber-200/90">
            <TriangleAlert size={13} aria-hidden /> The host truncated this tree — some files are missing from the list.
          </p>
        ) : null}

        {/* The draft-branch strip. Saves here are commits on the project's
            draft branch, and NOTHING reaches the site until the pull request
            is merged — said permanently, not only in a save toast, because a
            toast disappears and the claim must not. */}
        {repoBacked ? (
          <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/8 bg-[#12150f]/60 px-3 py-1.5 text-[10px] text-white/45">
            <GitPullRequest size={11} aria-hidden className="shrink-0 text-cyan-300/60" />
            <span className="min-w-0 flex-1 truncate" title="Every save and every created file is a commit on this branch. Publishing opens its pull request; merging that is what changes the site.">
              {meta?.draftBranch
                ? <>Draft branch <span className="font-mono text-white/60">{meta.draftBranch}</span> — saves commit here, not to the site.</>
                : "Saves commit to a draft branch, not to the site."}
            </span>
            {publishNote ? <span role="status" className="shrink-0 text-amber-200/80">{publishNote}</span> : null}
            {pullRequest ? (
              <a
                href={pullRequest.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-300/30 bg-emerald-300/10 px-1.5 py-0.5 font-semibold text-emerald-200 hover:bg-emerald-300/20"
                title="The pull request for this draft branch. Merging it is what puts the changes on the site."
              >
                PR #{pullRequest.number} · {pullRequest.merged ? "merged" : pullRequest.state}
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void publish()}
              disabled={publishing}
              title="Open (or find) the pull request for the draft branch. Merging stays a separate decision."
              className="inline-flex shrink-0 items-center gap-1 rounded border border-cyan-300/40 bg-cyan-300/10 px-2 py-0.5 font-semibold text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-40"
            >
              {publishing ? <LoaderCircle size={10} className="animate-spin" aria-hidden /> : <GitPullRequest size={10} aria-hidden />}
              {pullRequest ? "Re-open publish" : "Publish"}
            </button>
          </div>
        ) : null}

        {/* Tabs — many files open at once, switch without losing what was
            typed in the last one. A dot marks unsaved changes, because a tab
            you cannot see is exactly where unsaved work gets forgotten. */}
        {openPaths.length ? (
          <div role="tablist" aria-label="Open files" className="flex shrink-0 overflow-x-auto border-b border-white/8 bg-[#12150f]/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {openPaths.map(path => {
              const active = path === open;
              const name = path.split("/").pop() ?? path;
              return (
                <div
                  key={path}
                  className={`group flex shrink-0 items-center gap-1 border-r border-white/8 pl-2.5 pr-1 ${
                    active ? "bg-[#151815] text-white/85" : "text-white/45 hover:bg-white/[0.03] hover:text-white/70"
                  }`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setOpen(path)}
                    title={path}
                    className="flex max-w-[13rem] items-center gap-1.5 py-1.5 text-[11px] font-medium"
                  >
                    <FileCode2 size={11} aria-hidden className="shrink-0" style={{ color: fileColour(path) }} />
                    <span className="truncate">{name}</span>
                  </button>
                  {dirtyPaths.has(path) ? (
                    <span aria-label="Unsaved changes" title="Unsaved changes" className="size-1.5 shrink-0 rounded-full bg-amber-300" />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => closeTab(path)}
                    aria-label={`Close ${name}`}
                    title="Close"
                    className="grid size-4 shrink-0 place-items-center rounded text-white/25 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white/80"
                  >
                    <X size={10} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        {!open ? (
          <div className="grid flex-1 place-items-center px-6 text-center">
            {!treeOpen ? (
              <button type="button" onClick={() => setTreeOpen(true)} className="absolute left-2 top-2 grid size-7 place-items-center rounded text-white/35 hover:bg-white/10 hover:text-white/80" aria-label="Show the file tree" title="Show the file tree">
                <PanelLeftOpen size={14} aria-hidden />
              </button>
            ) : null}
            <div>
              <FileCode2 size={22} aria-hidden className="mx-auto text-white/20" />
              <p className="mt-2 text-xs text-white/40">Choose a file to read it.</p>
              <p className="mt-1 text-[11px] text-white/25">Or click an element in a live view to jump to its source.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-white/8 px-2 text-[11px]">
              <button
                type="button"
                onClick={() => setTreeOpen(value => !value)}
                aria-label={treeOpen ? "Hide the file tree" : "Show the file tree"}
                title={treeOpen ? "Hide the file tree" : "Show the file tree"}
                className="grid size-6 shrink-0 place-items-center rounded text-white/35 hover:bg-white/10 hover:text-white/80"
              >
                {treeOpen ? <PanelLeftClose size={13} aria-hidden /> : <PanelLeftOpen size={13} aria-hidden />}
              </button>
              <FileCode2 size={12} aria-hidden className="shrink-0" style={{ color: fileColour(open) }} />
              <span className="truncate font-mono text-white/70">{open}</span>
              {file?.editable === false ? (
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[10px] text-white/35" title={file?.reason}><Lock size={10} aria-hidden /> read-only</span>
              ) : null}
              {file?.truncatedContents ? (
                <span className="shrink-0 text-[10px] text-amber-200/70" title="Only the beginning of this file is shown.">truncated</span>
              ) : null}
              {open && movedAgo(open) ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200/90"
                  title={activity.workers.length
                    ? `Working right now: ${activity.workers.join(", ")}. Your save is refused if this file moves under you.`
                    : "Somebody or something else changed this file recently. Your save is refused if it moves under you."}
                >
                  <Users size={10} aria-hidden /> changed {movedAgo(open)}
                </span>
              ) : null}
              {saveNote ? (
                <span className={`ml-auto shrink-0 text-[10px] ${saveNote === "Saved" || saveNote === REPO_SAVED_NOTE ? "text-emerald-300/80" : "text-amber-200/80"}`} role="status">{saveNote}</span>
              ) : null}
              {file?.editable ? (
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!dirty || saving}
                  title={dirty ? "Save this file (⌘S)" : "No changes to save"}
                  className={`${saveNote ? "" : "ml-auto"} inline-flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold transition ${
                    dirty && !saving
                      ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100 hover:bg-cyan-300/25"
                      : "border-white/10 text-white/25"
                  }`}
                >
                  {saving ? <LoaderCircle size={10} className="animate-spin" aria-hidden /> : <Check size={10} aria-hidden />}
                  {dirty ? "Save" : "Saved"}
                </button>
              ) : null}
            </div>
            {loading ? (
              <p className="flex items-center gap-2 px-4 py-6 text-[11px] text-white/45"><LoaderCircle size={12} className="animate-spin" aria-hidden /> Opening…</p>
            ) : file?.kind === "image" && file.dataUrl ? (
              <div className="min-h-0 flex-1 overflow-auto p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.dataUrl} alt={open} className="mx-auto max-w-full rounded border border-white/10 bg-[#0d0f0d]" />
              </div>
            ) : file?.contents == null ? (
              <p className="px-4 py-6 text-[11px] text-white/45">{file?.reason ?? "That file could not be read."}</p>
            ) : (
              <CodeSurface
                path={open}
                value={draft ?? ""}
                editable={Boolean(file?.editable)}
                onChange={next => setBuffers(all => ({ ...all, [open]: next }))}
                onSave={() => void save()}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DirectoryRows({ directory, depth, open, onOpen, movedAgo }: {
  directory: TreeDirectory; depth: number; open: string | null; onOpen: (path: string) => void; movedAgo?: (path: string) => string | null;
}) {
  return (
    <>
      {directory.directories.map(child => <DirectoryRow key={child.path} directory={child} depth={depth} open={open} onOpen={onOpen} movedAgo={movedAgo} />)}
      {directory.files.map(file => <FileRow key={file.path} file={file} active={file.path === open} onOpen={onOpen} movedAgo={movedAgo?.(file.path)} />)}
    </>
  );
}

function DirectoryRow({ directory, depth, open, onOpen, movedAgo }: {
  directory: TreeDirectory; depth: number; open: string | null; onOpen: (path: string) => void; movedAgo?: (path: string) => string | null;
}) {
  // Open the branch that contains the current file, so jumping to source from
  // the preview reveals it rather than leaving a collapsed tree.
  const [expanded, setExpanded] = useState(() => Boolean(open && open.startsWith(`${directory.path}/`)));
  useEffect(() => { if (open && open.startsWith(`${directory.path}/`)) setExpanded(true); }, [open, directory.path]);
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        style={{ paddingLeft: `${depth * 10 + 6}px` }}
        className="flex w-full items-center gap-1.5 rounded py-1 pr-1.5 text-left text-[11px] text-white/60 hover:bg-white/[0.05] hover:text-white/90"
      >
        <ChevronRight size={11} aria-hidden className={`shrink-0 text-white/30 transition-transform ${expanded ? "rotate-90" : ""}`} />
        {expanded ? <FolderOpen size={12} aria-hidden className="shrink-0 text-cyan-300/50" /> : <Folder size={12} aria-hidden className="shrink-0 text-white/30" />}
        <span className="truncate">{directory.name}</span>
      </button>
      {expanded ? <DirectoryRows directory={directory} depth={depth + 1} open={open} onOpen={onOpen} movedAgo={movedAgo} /> : null}
    </div>
  );
}

function FileRow({ file, active, onOpen, showPath, movedAgo }: {
  file: TreeFile; active: boolean; onOpen: (path: string) => void; showPath?: boolean; movedAgo?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(file.path)}
      title={file.path}
      className={`flex w-full items-center gap-1.5 rounded py-1 pl-5 pr-1.5 text-left text-[11px] ${
        active ? "bg-cyan-300/12 text-cyan-100" : "text-white/55 hover:bg-white/[0.05] hover:text-white/85"
      }`}
    >
      <FileCode2 size={11} aria-hidden className="shrink-0" style={{ color: fileColour(file.path) }} />
      <span className="truncate">{showPath ? file.path : file.name}</span>
      {movedAgo ? (
        <span
          aria-label={`Changed ${movedAgo} by someone else`}
          title={`Changed ${movedAgo} — somebody or something else is working in here`}
          className="ml-auto size-1.5 shrink-0 rounded-full bg-amber-400"
        />
      ) : null}
    </button>
  );
}
