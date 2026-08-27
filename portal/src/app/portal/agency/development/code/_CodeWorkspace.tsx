"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, FileCode2, Folder, FolderOpen, GitBranch, LoaderCircle, Lock, Plug, Search, TriangleAlert } from "lucide-react";

import type { TreeDirectory, TreeFile } from "@/engines/editor/server/fileTree";
import { apiResponseError } from "@/lib/client/apiResponseError";

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

export function CodeWorkspace({ initialRepository = "" }: { initialRepository?: string }) {
  const [repository, setRepository] = useState(initialRepository);
  const [ref, setRef] = useState("main");
  const [tree, setTree] = useState<TreeDirectory | null>(null);
  const [meta, setMeta] = useState<TreeResponse | null>(null);
  const [count, setCount] = useState(0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [file, setFile] = useState<{ contents?: string; reason?: string; fingerprint?: string; editable: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  // Recomputed whenever the repository changes so the two never disagree about
  // which tree is on screen.
  const query$ = repository ? `?repo=${encodeURIComponent(repository)}&ref=${encodeURIComponent(ref)}` : "";

  useEffect(() => {
    setTree(null);
    setOpen(null);
    fetch(`/api/portal/site-editor/files${query$}`, { cache: "no-store" })
      .then(response => response.json())
      .then((payload: TreeResponse) => {
        const visible = payload?.ok === false
          ? { ...payload, error: apiResponseError(payload, "The repository could not be read.") }
          : payload;
        setMeta(visible);
        setTree(visible.tree ?? null);
        setCount(visible.count ?? 0);
      })
      .catch(() => { setTree(null); setMeta({ error: "The repository could not be read." }); });
  }, [query$]);

  useEffect(() => {
    if (!open) { setFile(null); return; }
    setLoading(true);
    const separator = query$ ? "&" : "?";
    fetch(`/api/portal/site-editor/files${query$}${separator}path=${encodeURIComponent(open)}`, { cache: "no-store" })
      .then(response => response.json())
      .then(payload => setFile(payload?.ok === false
        ? { editable: false, reason: apiResponseError(payload, "That file could not be read.") }
        : payload))
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
    <div className="grid w-full gap-4">
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
        </div>

        {/* Said plainly, with the way to fix it, rather than an empty tree that
            looks like a broken editor. The fix lives in the EDITOR — its
            Settings tab carries the inline Connect GitHub panel — so that is
            where this links, never the Company page. */}
        {meta?.needsGitHub ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <Plug size={14} aria-hidden className="shrink-0 text-amber-700" />
            <p className="min-w-0 flex-1 leading-5">{meta.error}</p>
            <Link
              href={meta.href ?? "/portal/dev-team/editor"}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 font-semibold text-amber-900 hover:bg-amber-100"
            >
              Connect GitHub in the editor <ExternalLink size={12} aria-hidden />
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
          <div className="max-h-[82vh] overflow-y-auto p-1.5">
            {/* A spinner that never resolves reads as a hang. When the read
                failed, say so once and stop. */}
            {!tree && (meta?.needsGitHub || meta?.error) ? (
              <p className="px-2 py-3 text-xs text-black/45">
                {meta.needsGitHub ? "Connect GitHub in the editor's Settings tab to list this repository." : "Nothing could be listed."}
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
              {file?.editable === false ? (
                <p className="flex items-center gap-2 px-4 py-6 text-xs text-black/55">
                  <Lock size={13} aria-hidden className="text-black/35" />{file.reason}
                </p>
              ) : (
                <pre className="max-h-[82vh] overflow-auto px-3 py-3 text-[11px] leading-5 text-black/80">
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
