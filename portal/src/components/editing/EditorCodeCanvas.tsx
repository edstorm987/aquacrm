"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileCode2, Folder, FolderOpen, LoaderCircle, Lock, Plug, Search, TriangleAlert } from "lucide-react";

import type { TreeDirectory, TreeFile } from "@/engines/editor/server/fileTree";

// ─── DEV EDITOR — the code canvas ────────────────────────────────────────────
//
// The stripped file tree, but in the CANVAS rather than a 340px rail: tree on
// the left, the file open in the middle, the way an editor is supposed to work.
// It reads the same /api/portal/site-editor/files the Repo inspector does, so a
// selected Dev project points it at that project's repository through that
// project's own token — the browser never holds a credential.
//
// Read-first by design: the engine's write path (patch + publish) is a separate,
// confirmed step, so this shows exactly what is there and never silently edits.

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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [file, setFile] = useState<{ contents?: string; reason?: string; editable?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const search = projectId
    ? `?project=${encodeURIComponent(projectId)}`
    : repository ? `?repo=${encodeURIComponent(repository)}&ref=main` : "";

  useEffect(() => {
    setTree(null);
    setOpen(null);
    fetch(`/api/portal/site-editor/files${search}`, { cache: "no-store" })
      .then(response => response.json())
      .then((payload: TreeResponse) => { setMeta(payload); setTree(payload.tree ?? null); })
      .catch(() => setMeta({ error: "The repository could not be read." }));
  }, [search]);

  // Clicking an element in the live preview opens its source here.
  useEffect(() => { if (focus?.path) { setOpen(focus.path); setQuery(""); } }, [focus?.path, focus?.line]);

  useEffect(() => {
    if (!open) { setFile(null); return; }
    setLoading(true);
    const separator = search ? "&" : "?";
    fetch(`/api/portal/site-editor/files${search}${separator}path=${encodeURIComponent(open)}`, { cache: "no-store" })
      .then(response => response.json())
      .then(payload => setFile(payload))
      .catch(() => setFile({ editable: false, reason: "That file could not be read." }))
      .finally(() => setLoading(false));
  }, [open, search]);

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

  const lines = file?.contents ? file.contents.split("\n") : null;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Tree */}
      <div className="flex w-64 shrink-0 flex-col border-r border-white/8 bg-[#1b1e1b] xl:w-72">
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
              {meta.needsGitHub ? "Connect GitHub to browse this repository." : "Nothing could be listed."}
            </p>
          ) : !tree ? (
            <p className="flex items-center gap-2 px-2 py-3 text-[11px] text-white/45">
              <LoaderCircle size={12} className="animate-spin" aria-hidden /> Reading…
            </p>
          ) : matches ? (
            matches.length
              ? matches.map(entry => <FileRow key={entry.path} file={entry} active={entry.path === open} onOpen={path => { setOpen(path); onOpenFile?.(path); }} showPath />)
              : <p className="px-2 py-3 text-[11px] text-white/40">No file matches that.</p>
          ) : (
            <DirectoryRows directory={tree} depth={0} open={open} onOpen={path => { setOpen(path); onOpenFile?.(path); }} />
          )}
        </div>
        <p className="shrink-0 border-t border-white/8 px-3 py-1.5 text-[10px] text-white/30">
          {meta?.count ? `${meta.count} files` : ""}{meta?.sha ? ` · ${meta.sha.slice(0, 7)}` : ""}
        </p>
      </div>

      {/* The open file */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#151815]">
        {meta?.needsGitHub ? (
          <div className="m-4 flex items-start gap-2 rounded-md border border-amber-300/25 bg-amber-300/[0.06] p-3 text-[11px] leading-5 text-amber-200/90">
            <Plug size={13} aria-hidden className="mt-0.5 shrink-0" />
            <span>{meta.error}</span>
          </div>
        ) : null}
        {meta?.truncated ? (
          <p className="mx-4 mt-4 flex items-center gap-2 rounded-md border border-amber-300/25 bg-amber-300/[0.06] px-3 py-2 text-[11px] text-amber-200/90">
            <TriangleAlert size={13} aria-hidden /> The host truncated this tree — some files are missing from the list.
          </p>
        ) : null}

        {!open ? (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div>
              <FileCode2 size={22} aria-hidden className="mx-auto text-white/20" />
              <p className="mt-2 text-xs text-white/40">Choose a file to read it.</p>
              <p className="mt-1 text-[11px] text-white/25">Or click an element in the live view to jump to its source.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-white/8 px-3 text-[11px]">
              <FileCode2 size={12} aria-hidden className="shrink-0 text-white/35" />
              <span className="truncate font-mono text-white/70">{open}</span>
              {file?.editable === false ? (
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[10px] text-white/35"><Lock size={10} aria-hidden /> read-only</span>
              ) : null}
            </div>
            {loading ? (
              <p className="flex items-center gap-2 px-4 py-6 text-[11px] text-white/45"><LoaderCircle size={12} className="animate-spin" aria-hidden /> Opening…</p>
            ) : file?.contents == null ? (
              <p className="px-4 py-6 text-[11px] text-white/45">{file?.reason ?? "That file could not be read."}</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full border-collapse font-mono text-[11px] leading-5">
                  <tbody>
                    {lines!.map((text, index) => {
                      const number = index + 1;
                      const highlighted = focus?.line === number && focus.path === open;
                      return (
                        <tr key={number} className={highlighted ? "bg-cyan-300/10" : undefined}>
                          <td className="w-12 select-none border-r border-white/5 px-2 text-right align-top text-white/22">{number}</td>
                          <td className="whitespace-pre px-3 align-top text-white/80">{text || " "}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DirectoryRows({ directory, depth, open, onOpen }: {
  directory: TreeDirectory; depth: number; open: string | null; onOpen: (path: string) => void;
}) {
  return (
    <>
      {directory.directories.map(child => <DirectoryRow key={child.path} directory={child} depth={depth} open={open} onOpen={onOpen} />)}
      {directory.files.map(file => <FileRow key={file.path} file={file} active={file.path === open} onOpen={onOpen} />)}
    </>
  );
}

function DirectoryRow({ directory, depth, open, onOpen }: {
  directory: TreeDirectory; depth: number; open: string | null; onOpen: (path: string) => void;
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
      {expanded ? <DirectoryRows directory={directory} depth={depth + 1} open={open} onOpen={onOpen} /> : null}
    </div>
  );
}

function FileRow({ file, active, onOpen, showPath }: {
  file: TreeFile; active: boolean; onOpen: (path: string) => void; showPath?: boolean;
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
      <FileCode2 size={11} aria-hidden className="shrink-0 opacity-50" />
      <span className="truncate">{showPath ? file.path : file.name}</span>
    </button>
  );
}
