"use client";
// The browsable folder tree (client). Lazy: a folder's children only MOUNT when
// it's expanded — so the ~1,800-file tree never puts more than the open branches
// in the DOM. Native chevron rotation + indent guides for a calm, scannable look.

import { useState } from "react";
import Link from "next/link";
import { relativeAge, formatUkDateTime } from "@/lib/formatDateTime";
import type { DevDocTreeNode } from "@/lib/server/devDocs";

// Folders this big (the generated reference/ tree) start collapsed; every
// top-level folder and every smaller one starts open.
const COLLAPSE_ABOVE = 100;

function docHref(relPath: string) {
  return `/portal/agency/dev-docs?doc=${encodeURIComponent(relPath)}`;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={`h-3 w-3 shrink-0 text-black/35 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3 shrink-0 text-black/25">
      <path d="M3 1.5h4L9.5 4v6.5H3V1.5Z" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M6.8 1.6V4H9.4" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

function Age({ ms, nowMs, exact }: { ms: number; nowMs: number; exact?: boolean }) {
  return (
    <span
      className="ml-auto shrink-0 pl-3 text-[11px] tabular-nums text-black/40"
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
          href={docHref(node.path)}
          className="group -mx-1 flex items-center gap-1.5 rounded px-1 py-[3px] hover:bg-black/[0.04]"
        >
          <FileGlyph />
          <span className="truncate text-sm text-black/75 group-hover:text-black/90">
            {node.entry?.title ?? node.name}
          </span>
          <Age ms={node.newestMtimeMs} nowMs={nowMs} exact />
        </Link>
      </li>
    );
  }
  return <Folder node={node} nowMs={nowMs} depth={depth} />;
}

function Folder({ node, nowMs, depth }: { node: DevDocTreeNode; nowMs: number; depth: number }) {
  const [open, setOpen] = useState(depth === 0 || node.count <= COLLAPSE_ABOVE);
  return (
    <li data-doc-folder={node.path}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="-mx-1 flex w-full items-center gap-1.5 rounded px-1 py-[3px] text-left hover:bg-black/[0.04]"
      >
        <Chevron open={open} />
        <span className="truncate text-sm font-medium text-black/85">{node.name}</span>
        <span className="text-black/25">/</span>
        <span className="ml-auto shrink-0 pl-3 text-[11px] tabular-nums text-black/35">
          {node.count} · {relativeAge(node.newestMtimeMs, nowMs)}
        </span>
      </button>
      {open && (
        <ul className="ml-[7px] border-l border-black/[0.08] pl-3">
          {node.children!.map(child => (
            <Node key={child.path} node={child} nowMs={nowMs} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function DocTree({ tree, nowMs }: { tree: DevDocTreeNode[]; nowMs: number }) {
  return (
    <ul data-testid="dev-docs-tree">
      {tree.map(node => (
        <Node key={node.path} node={node} nowMs={nowMs} depth={0} />
      ))}
    </ul>
  );
}
