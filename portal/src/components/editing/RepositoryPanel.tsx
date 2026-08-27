"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileCode2, Folder, FolderOpen, LoaderCircle, Lock, MousePointerClick, Plug, RefreshCw, Search } from "lucide-react";

import type { TreeDirectory, TreeFile } from "@/engines/editor/server/fileTree";
import { DEV_PROJECTS_CHANGED_EVENT } from "@/app/portal/dev-team/editor/setup/_DevEditorSetup";
import { relevantFiles, type RelevanceScope } from "@/engines/editor/editing/fileRelevance";
import { apiResponseError } from "@/lib/client/apiResponseError";

/**
 * The site's source, inside the editor rather than beside it.
 *
 * Code mode began as its own page, which was the wrong shape: somebody wanting
 * the code is already looking at the thing they want to change, and sending
 * them to a separate destination loses the client, the page and the mode they
 * had selected. It belongs in the inspector next to Content and Brand, as the
 * deepest of the three modes rather than a different tool.
 *
 * Sized and coloured for the inspector column, which is narrow and dark. The
 * standalone page's layout does not survive being squeezed into 340px, so this
 * is a distinct presentation of the same data rather than the same component
 * with a theme prop — one component trying to be both would serve neither.
 */
export function RepositoryPanel({ repository, onRepositoryChange, focus, onPickElement, picking, scope, projectId }: {
  repository: string;
  onRepositoryChange: (value: string) => void;
  /**
   * A Dev Editor Engine project. When set, the SERVER resolves the repository,
   * branch and access token from that project's own bound connection — which is
   * what makes "plug in any repo" work without the browser ever holding a
   * credential. Falls back to the typed `repository` when absent.
   */
  projectId?: string;
  /** A file and line to open, set by clicking an element in the preview. */
  focus?: { path: string; line?: number } | null;
  onPickElement?: () => void;
  picking?: boolean;
  /** What is being edited, so the tree can be narrowed to it. */
  scope?: RelevanceScope;
}) {
  const [tree, setTree] = useState<TreeDirectory | null>(null);
  const [meta, setMeta] = useState<{ count?: number; sha?: string; needsGitHub?: boolean; error?: string; truncated?: boolean } | null>(null);
  // Bumped to re-run the tree fetch. The refusal used to be fetched once and
  // shown forever — "Connect GitHub" on screen while the live GET had been
  // answering 200 for hours. Settings announces DEV_PROJECTS_CHANGED_EVENT
  // when a connection lands; Try again is the same bump by hand.
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [file, setFile] = useState<{ contents?: string; reason?: string; fingerprint?: string; editable?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  // Opened by clicking the page rather than by hunting the tree, which is the
  // whole point: you already know what you want to change, you just do not
  // know which of 1,700 files renders it.
  useEffect(() => {
    if (focus?.path) { setOpen(focus.path); setQuery(""); }
  }, [focus?.path, focus?.line]);

  // A selected project wins: the server reads its repository, ref and token.
  // Otherwise fall back to a typed owner/repo (or the local workspace).
  const search = projectId
    ? `?project=${encodeURIComponent(projectId)}`
    : repository ? `?repo=${encodeURIComponent(repository)}&ref=main` : "";

  // Changing TARGET clears the pane; a mere refresh must not — it re-reads the
  // same repository, and closing the open file over it would lose your place.
  useEffect(() => {
    setTree(null);
    setOpen(null);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/site-editor/files${search}`, { cache: "no-store" })
      .then(response => response.json())
      .then(payload => {
        if (cancelled) return;
        const visible = payload?.ok === false
          ? { ...payload, error: apiResponseError(payload, "The repository could not be read.") }
          : payload;
        setMeta(visible);
        setTree(visible.tree ?? null);
      })
      .catch(() => { if (!cancelled) setMeta({ error: "The repository could not be read." }); });
    return () => { cancelled = true; };
  }, [search, refresh]);

  // A GitHub connection landing in Settings re-reads the tree here, so the
  // panel never keeps showing a refusal the server has stopped giving.
  useEffect(() => {
    const onProjectsChanged = () => setRefresh(value => value + 1);
    window.addEventListener(DEV_PROJECTS_CHANGED_EVENT, onProjectsChanged);
    return () => window.removeEventListener(DEV_PROJECTS_CHANGED_EVENT, onProjectsChanged);
  }, []);

  useEffect(() => {
    if (!open) { setFile(null); return; }
    setLoading(true);
    const separator = search ? "&" : "?";
    fetch(`/api/portal/site-editor/files${search}${separator}path=${encodeURIComponent(open)}`, { cache: "no-store" })
      .then(response => response.json())
      .then(payload => {
        if (payload?.ok === false) {
          setFile({ editable: false, reason: apiResponseError(payload, "That file could not be read.") });
          setDraft(null);
          return;
        }
        setFile(payload);
        setDraft(payload?.contents ?? null);
      })
      .catch(() => setFile({ editable: false, reason: "That file could not be read." }))
      .finally(() => setLoading(false));
  }, [open, search]);

  const allFiles = useMemo(() => {
    if (!tree) return [];
    const out: TreeFile[] = [];
    (function walk(directory: TreeDirectory) {
      out.push(...directory.files);
      directory.directories.forEach(walk);
    })(tree);
    return out;
  }, [tree]);

  // Narrowed to what renders the thing on screen, unless asked otherwise.
  // The opened file is always kept, so switching back to the filtered view
  // never hides the file the picker just sent you to.
  const scoped = useMemo(() => {
    if (!scope || showAll) return allFiles;
    return relevantFiles(allFiles, scope, open ? [open] : []);
  }, [allFiles, scope, showAll, open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return scope && !showAll ? scoped.slice(0, 60) : null;
    return scoped.filter(entry => entry.path.toLowerCase().includes(needle)).slice(0, 60);
  }, [query, scoped, scope, showAll]);

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300/65">Source</p>
        <h2 className="mt-1 text-base font-semibold text-white/88">The site&rsquo;s repository</h2>
        <p className="mt-2 text-xs leading-5 text-white/38">
          Every file, exactly as it is. Leave the repository blank to read this workspace.
          {meta?.count ? ` ${meta.count} files.` : ""}
          {meta?.sha ? ` At ${meta.sha.slice(0, 7)}.` : ""}
        </p>
      </div>

      {onPickElement ? (
        <button
          type="button"
          onClick={onPickElement}
          aria-pressed={picking}
          className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 text-[11px] font-semibold ${
            picking
              ? "bg-cyan-300 text-[#102124]"
              : "border border-white/15 bg-white/[0.04] text-white/75 hover:bg-white/[0.07]"
          }`}
        >
          <MousePointerClick size={12} aria-hidden />
          {picking ? "Now click anything in the preview" : "Find an element's code"}
        </button>
      ) : null}

      {focus?.path ? (
        <p className="rounded-md border border-cyan-300/25 bg-cyan-300/[0.07] px-2.5 py-2 text-[11px] leading-4 text-cyan-100/85">
          Rendered by <span className="font-mono">{focus.path}{focus.line ? `:${focus.line}` : ""}</span>
        </p>
      ) : null}

      <label className="grid gap-1.5 text-[11px] font-semibold text-white/58">
        Repository
        <input
          value={repository}
          onChange={event => onRepositoryChange(event.target.value)}
          placeholder="owner/repository"
          className="min-h-9 rounded-md border border-white/12 bg-white/[0.04] px-2.5 text-[11px] font-normal text-white/80 outline-none placeholder:text-white/25"
        />
      </label>

      {/* Said plainly with the way to fix it, rather than an empty tree that
          reads as a broken editor. The fix lives IN the editor — the Settings
          tab's Connect GitHub panel — so there is no link out; Try again
          re-asks once the connection has landed (and the panel also re-fetches
          by itself when Settings announces one). */}
      {meta?.needsGitHub ? (
        <div className="grid gap-2 rounded-md border border-amber-300/25 bg-amber-300/[0.06] p-3 text-[11px] leading-5 text-amber-200/80">
          <span className="flex items-center gap-1.5 font-semibold"><Plug size={12} aria-hidden />GitHub is not connected</span>
          <p>{meta.error}</p>
          <button
            type="button"
            onClick={() => setRefresh(value => value + 1)}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-amber-300/40 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-300/10"
          >
            <RefreshCw size={11} aria-hidden /> Try again
          </button>
        </div>
      ) : null}

      {meta?.truncated ? (
        <p className="rounded-md border border-amber-300/25 bg-amber-300/[0.06] p-2.5 text-[11px] leading-5 text-amber-200/80">
          GitHub truncated this tree, so some files are missing from the list.
        </p>
      ) : null}

      {meta?.error && !meta.needsGitHub ? (
        <p role="alert" className="rounded-md border border-red-400/25 bg-red-400/[0.07] p-2.5 text-[11px] leading-5 text-red-200/85">{meta.error}</p>
      ) : null}

      {scope ? (
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] p-0.5 text-[10px] font-semibold">
          {[{ id: false, label: `Just ${scope.label}` }, { id: true, label: "All files" }].map(option => (
            <button
              key={String(option.id)}
              type="button"
              onClick={() => setShowAll(option.id)}
              aria-pressed={showAll === option.id}
              className={`min-h-7 flex-1 rounded px-2 ${showAll === option.id ? "bg-white/[0.1] text-white/85" : "text-white/45 hover:text-white/70"}`}
            >
              {option.label}
            </button>
          ))}
          <span className="px-1.5 tabular-nums text-white/28">{scoped.length}</span>
        </div>
      ) : null}

      <div className="relative">
        <Search size={12} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Find a file"
          aria-label="Find a file"
          className="min-h-9 w-full rounded-md border border-white/12 bg-white/[0.04] pl-7 pr-2.5 text-[11px] text-white/80 outline-none placeholder:text-white/25"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-md border border-white/10 bg-black/20 p-1">
        {!tree && (meta?.needsGitHub || meta?.error) ? (
          <p className="px-2 py-3 text-[11px] text-white/32">Nothing to list.</p>
        ) : !tree ? (
          <p className="flex items-center gap-2 px-2 py-3 text-[11px] text-white/32">
            <LoaderCircle size={11} className="animate-spin" aria-hidden />Reading…
          </p>
        ) : matches ? (
          matches.length
            ? matches.map(entry => <Row key={entry.path} file={entry} active={entry.path === open} onOpen={setOpen} showPath />)
            : <p className="px-2 py-3 text-[11px] text-white/32">Nothing matches “{query}”.</p>
        ) : (
          <Node directory={tree} depth={0} open={open} onOpen={setOpen} />
        )}
      </div>

      {open ? (
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] font-semibold text-white/70">{open}</span>
            {file?.fingerprint ? (
              <span className="font-mono text-[9px] text-white/28" title="The fingerprint a save is checked against">{file.fingerprint}</span>
            ) : null}
          </div>
          {loading ? (
            <p className="flex items-center gap-2 text-[11px] text-white/32"><LoaderCircle size={11} className="animate-spin" aria-hidden />Opening…</p>
          ) : file?.editable === false ? (
            <p className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/20 p-2.5 text-[11px] text-white/45">
              <Lock size={11} aria-hidden />{file.reason}
            </p>
          ) : draft !== null ? (
            <div className="grid gap-1.5">
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                spellCheck={false}
                rows={18}
                aria-label={`Contents of ${open}`}
                className="w-full resize-y rounded-md border border-white/10 bg-black/30 p-2.5 font-mono text-[10px] leading-4 text-white/75 outline-none focus:border-cyan-300/40"
              />
              <div className="flex flex-wrap items-center gap-2">
                {/* Said plainly rather than shown as a disabled button with no
                    explanation: the commit path exists and is tested, but has
                    never run against a real repository, and finding out it is
                    wrong on a client's site is the wrong place. */}
                <span className="text-[10px] leading-4 text-white/32">
                  {draft === file?.contents
                    ? "No changes."
                    : "Changed — saving to GitHub is not switched on yet."}
                </span>
                {draft !== file?.contents ? (
                  <button
                    type="button"
                    onClick={() => setDraft(file?.contents ?? "")}
                    className="ml-auto inline-flex min-h-7 items-center rounded-md border border-white/15 px-2 text-[10px] font-semibold text-white/65 hover:bg-white/[0.06]"
                  >
                    Discard
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <pre className="max-h-80 overflow-auto rounded-md border border-white/10 bg-black/30 p-2.5 text-[10px] leading-4 text-white/70">
              <code>
                {(file?.contents ?? "").split("\n").map((line, index) => {
                  const number = index + 1;
                  // The located line is marked rather than merely scrolled to:
                  // an editor that jumps somewhere without saying why leaves
                  // you counting lines to check it landed correctly.
                  const located = focus?.line === number && open === focus?.path;
                  return (
                    <span
                      key={number}
                      ref={located ? node => node?.scrollIntoView({ block: "center" }) : undefined}
                      className={`block whitespace-pre ${located ? "-mx-2.5 bg-cyan-300/15 px-2.5 text-cyan-100" : ""}`}
                    >
                      <span className="mr-2.5 inline-block w-7 select-none text-right text-white/20">{number}</span>
                      {line}
                    </span>
                  );
                })}
              </code>
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Node({ directory, depth, open, onOpen }: {
  directory: TreeDirectory; depth: number; open: string | null; onOpen: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  return (
    <div>
      {depth > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded}
          className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] text-white/55 hover:bg-white/[0.05]"
          style={{ paddingLeft: `${depth * 9 + 4}px` }}
        >
          <ChevronRight size={10} aria-hidden className={`shrink-0 text-white/25 transition-transform ${expanded ? "rotate-90" : ""}`} />
          {expanded ? <FolderOpen size={11} aria-hidden className="shrink-0 text-white/35" /> : <Folder size={11} aria-hidden className="shrink-0 text-white/35" />}
          <span className="truncate">{directory.name}</span>
        </button>
      ) : null}
      {expanded ? (
        <>
          {directory.directories.map(child => <Node key={child.path} directory={child} depth={depth + 1} open={open} onOpen={onOpen} />)}
          {directory.files.map(entry => <Row key={entry.path} file={entry} active={entry.path === open} onOpen={onOpen} depth={depth + 1} />)}
        </>
      ) : null}
    </div>
  );
}

function Row({ file, active, onOpen, depth = 0, showPath = false }: {
  file: TreeFile; active: boolean; onOpen: (path: string) => void; depth?: number; showPath?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(file.path)}
      title={file.editable ? file.path : file.reason}
      className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] hover:bg-white/[0.05] ${
        active ? "bg-white/[0.08] font-medium text-white/85" : "text-white/50"
      }`}
      style={{ paddingLeft: `${depth * 9 + 16}px` }}
    >
      {/* Dimmed rather than hidden — a file that vanishes reads as a bug. */}
      <FileCode2 size={10} aria-hidden className={`shrink-0 ${file.editable ? "text-white/30" : "text-white/15"}`} />
      <span className={`truncate ${file.editable ? "" : "text-white/28"}`}>{showPath ? file.path : file.name}</span>
    </button>
  );
}
