import type { ReactNode } from "react";
// Dev Team Library index — the landing: a short recently-edited feed ("what
// moved") and a collapsible FOLDER TREE of every doc so ~1,800 files read as
// folders, not a flat mess. A faithful reuse of the dev-docs index presentation,
// re-pointed at the Library route (`libraryDocHref` + `LibraryTree`) so
// navigation stays inside the Dev Team hub, and dressed in the shared Dev Team
// design kit (`../_ui`). Server component, presentational.
//
// The index shows only the 5 latest edits (keeps the page fast + uncluttered);
// "View all" opens the full list at `?view=recent` (rendered by
// `LibraryRecentView`, capped for speed). The launch-blocker strip that used to
// live here was dropped — the Dev Team Home already surfaces live blockers.

import Link from "next/link";
import { Library, FileText, Clock, Folder as FolderIcon, ArrowRight, ArrowLeft } from "lucide-react";
import type { DevDocsIndex, DevDocEntry } from "@/lib/server/dev/devDocs";
import { relativeAge, formatUkDateTime } from "@/lib/shared/formatDateTime";
import { PageHeader, Panel, Pill } from "../_ui";
import { libraryDocHref } from "./_paths";
import { LibraryTree } from "./_LibraryTree";

const HERO_LIMIT = 5;
const RECENT_FULL_LIMIT = 100;

function HeroRow({ entry, nowMs }: { entry: DevDocEntry; nowMs: number }) {
  return (
    <li data-doc-relpath={entry.relPath} className="border-b border-[color:var(--dt-hairline)] last:border-b-0">
      <Link
        href={libraryDocHref(entry.relPath)}
        className="group -mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-[color:var(--dt-hover)]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color:var(--dt-hairline)] text-[color:var(--dt-faint)] transition-colors group-hover:bg-[#e6f1f0] group-hover:text-[#0b6f6d]"
          >
            <FileText size={15} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[color:var(--dt-ink)]">{entry.title}</div>
            <div className="truncate font-mono text-[11px] text-[color:var(--dt-faint)]">{entry.relPath}</div>
          </div>
        </div>
        <div
          className="flex shrink-0 items-center gap-1.5 text-xs font-medium tabular-nums text-[color:var(--dt-muted)]"
          title={formatUkDateTime(entry.mtimeMs)}
        >
          <Clock size={12} className="text-[color:var(--dt-faint)]" />
          {relativeAge(entry.mtimeMs, nowMs)}
        </div>
      </Link>
    </li>
  );
}

export function LibraryIndexView({ index, tabs }: { index: DevDocsIndex; tabs?: ReactNode }) {
  const nowMs = index.scannedAtMs;
  const recent = index.entries.slice(0, HERO_LIMIT);
  const topFolders = index.tree.filter(n => n.isDir);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6" data-testid="dev-team-library-index">
      <PageHeader
        icon={<Library size={20} />}
        title="Library"
        subtitle="Every plan, phase, feature and doc — live off disk."
        meta={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tabs}
            <Pill tone="accent">{index.total} file{index.total === 1 ? "" : "s"}</Pill>
          </div>
        }
      />

      <Panel title="Folders" hint="Top-level areas of the project.">
        <div className="flex flex-wrap gap-1.5">
          {topFolders.map(f => (
            <span
              key={f.path}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--dt-line)] bg-[color:var(--dt-raised)] py-1 pl-2 pr-2.5 text-[11px]"
            >
              <FolderIcon size={12} className="text-[#0b6f6d]" />
              <span className="font-medium text-[color:var(--dt-ink)]">{f.name}</span>
              <span className="tabular-nums text-[color:var(--dt-faint)]">{f.count}</span>
            </span>
          ))}
        </div>
      </Panel>

      <Panel
        title="Recently edited"
        hint="The latest changes across every folder."
        right={
          index.total > HERO_LIMIT ? (
            <Link
              href="/portal/dev-team/library?view=recent"
              className="inline-flex items-center gap-1 rounded-full bg-[#e6f1f0] px-2.5 py-1 text-[11px] font-medium text-[#0b6f6d] transition-colors hover:bg-[#d7ecea]"
            >
              View all
              <ArrowRight size={11} />
            </Link>
          ) : null
        }
      >
        <ul data-testid="dev-team-library-recent">
          {recent.map(entry => (
            <HeroRow key={entry.relPath} entry={entry} nowMs={nowMs} />
          ))}
        </ul>
      </Panel>

      <Panel
        title="All docs"
        hint="By folder — click to expand. Big generated folders (e.g. reference/) start collapsed and load on open."
      >
        <LibraryTree tree={index.tree} nowMs={nowMs} />
      </Panel>
    </div>
  );
}

// The full recently-edited list, reached from the index's "View all" link
// (`?view=recent`). Capped at RECENT_FULL_LIMIT so it stays fast — the folder
// tree on the index covers exhaustive browsing.
export function LibraryRecentView({ index }: { index: DevDocsIndex }) {
  const nowMs = index.scannedAtMs;
  const rows = index.entries.slice(0, RECENT_FULL_LIMIT);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5" data-testid="dev-team-library-recent-all">
      <Link
        href="/portal/dev-team/library"
        className="group inline-flex w-fit items-center gap-1 text-sm text-[color:var(--dt-muted)] transition-colors hover:text-[color:var(--dt-ink)]"
      >
        <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
        Library
      </Link>

      <PageHeader
        icon={<Clock size={20} />}
        title="Recently edited"
        subtitle="Every doc, newest first."
        meta={
          <Pill tone="muted">
            {rows.length}
            {index.total > rows.length ? ` of ${index.total}` : ""}
          </Pill>
        }
      />

      <Panel>
        <ul data-testid="dev-team-library-recent-list">
          {rows.map(entry => (
            <HeroRow key={entry.relPath} entry={entry} nowMs={nowMs} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}
