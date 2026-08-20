"use client";
// The Dev Team Library folder tree (client) — a faithful reuse of the dev-docs
// `DocTree` presentation, re-pointed at the Library route (via `libraryDocHref`)
// so a click stays inside the Dev Team hub, and dressed in the shared Dev Team
// design kit palette. The dev-docs original hardcodes `/portal/agency/dev-docs`
// in a module-local `docHref` and can't be parameterised without editing it
// (off-limits), so the tree body is re-implemented here; the data + types come
// straight from `@/lib/server/dev/devDocs`. Lazy: a folder's children only MOUNT
// when it's expanded — so the ~1,800-file tree never puts more than the open
// branches in the DOM.

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { relativeAge, formatUkDateTime } from "@/lib/shared/formatDateTime";
import type { DevDocTreeNode } from "@/lib/server/dev/devDocs";
import { libraryDocHref } from "./_paths";

// Folders this big (the generated reference/ tree) start collapsed; every
// top-level folder and every smaller one starts open.
const COLLAPSE_ABOVE = 100;

function Age({ ms, nowMs, exact }: { ms: number; nowMs: number; exact?: boolean }) {
  return (
    <span
      className="ml-auto shrink-0 pl-3 text-[11px] tabular-nums text-[color:var(--dt-faint)]"
      title={exact ? formatUkDateTime(ms) : undefined}
    >
      {relativeAge(ms, nowMs)}
    </span>
  );
}

function Node({ node, nowMs, depth }: { node: DevDocTreeNode; nowMs: number; depth: number }) {
  if (!node.isDir) {
    return (
      <li data-doc-relpath={node.path}>
        <Link
          href={libraryDocHref(node.path)}
          className="group -mx-1 flex items-center gap-2 rounded-md px-1.5 py-[3px] transition-colors hover:bg-[color:var(--dt-hover)]"
        >
          <FileText size={13} className="shrink-0 text-[color:var(--dt-faint)] transition-colors group-hover:text-[color:var(--dev-accent)]" />
          <span className="truncate text-sm text-[color:var(--dt-muted)] group-hover:text-[color:var(--dt-ink)]">
            {node.entry?.title ?? node.name}
          </span>
          <Age ms={node.newestMtimeMs} nowMs={nowMs} exact />
        </Link>
      </li>
    );
  }
  return <FolderNode node={node} nowMs={nowMs} depth={depth} />;
}

function FolderNode({ node, nowMs, depth }: { node: DevDocTreeNode; nowMs: number; depth: number }) {
  const [open, setOpen] = useState(depth === 0 || node.count <= COLLAPSE_ABOVE);
  return (
    <li data-doc-folder={node.path}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="group -mx-1 flex w-full items-center gap-1.5 rounded-md px-1.5 py-[3px] text-left transition-colors hover:bg-[color:var(--dt-hover)]"
      >
        <ChevronRight
          size={13}
          className={`shrink-0 text-[color:var(--dt-faint)] transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        {open ? (
          <FolderOpen size={14} className="shrink-0 text-[color:var(--dev-accent)]" />
        ) : (
          <Folder size={14} className="shrink-0 text-[color:var(--dt-faint)]" />
        )}
        <span className="truncate text-sm font-medium text-[color:var(--dt-ink)]">{node.name}</span>
        <span className="ml-auto shrink-0 pl-3 text-[11px] tabular-nums text-[color:var(--dt-faint)]">
          {node.count} · {relativeAge(node.newestMtimeMs, nowMs)}
        </span>
      </button>
      {open && (
        <ul className="ml-[6px] border-l border-[color:var(--dt-line)] pl-3">
          {node.children!.map(child => (
            <Node key={child.path} node={child} nowMs={nowMs} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function LibraryTree({ tree, nowMs }: { tree: DevDocTreeNode[]; nowMs: number }) {
  return (
    <ul data-testid="dev-team-library-tree">
      {tree.map(node => (
        <Node key={node.path} node={node} nowMs={nowMs} depth={0} />
      ))}
    </ul>
  );
}
