// Dev Docs index — the landing: launch blockers (parsed from state.md), a
// recently-edited feed ("what moved"), and a collapsible FOLDER TREE of every
// doc so 1,800 files read as folders, not a flat mess. Server component,
// presentational; the tree collapses natively via <details> (no client JS).

import Link from "next/link";
import type { DevDocsIndex, DevDocEntry, DevDocBlocker } from "@/lib/server/dev/devDocs";
import { relativeAge, formatUkDateTime } from "@/lib/shared/formatDateTime";
import { DocTree } from "./_DocTree";

const HERO_LIMIT = 24;

function docHref(relPath: string) {
  return `/portal/agency/dev-docs?doc=${encodeURIComponent(relPath)}`;
}

function HeroRow({ entry, nowMs }: { entry: DevDocEntry; nowMs: number }) {
  return (
    <li data-doc-relpath={entry.relPath} className="border-b border-black/5 last:border-b-0">
      <Link
        href={docHref(entry.relPath)}
        className="-mx-2 flex items-baseline justify-between gap-4 rounded px-2 py-2 hover:bg-black/[0.03]"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-black/90">{entry.title}</div>
          <div className="truncate font-mono text-[11px] text-black/40">{entry.relPath}</div>
        </div>
        <div
          className="shrink-0 text-xs font-medium text-black/60"
          title={formatUkDateTime(entry.mtimeMs)}
        >
          {relativeAge(entry.mtimeMs, nowMs)}
        </div>
      </Link>
    </li>
  );
}

function BlockerStrip({ blockers }: { blockers: DevDocBlocker[] }) {
  const open = blockers.filter(b => !b.resolved);
  const cleared = blockers.filter(b => b.resolved);
  return (
    <section
      data-testid="dev-docs-blockers"
      className="rounded-lg border border-amber-300/60 bg-amber-50/70 p-4"
    >
      <h2 className="text-sm font-semibold text-amber-900">
        Launch blockers <span className="font-normal text-amber-700/70">· live from state.md</span>
      </h2>
      {open.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {open.map((b, i) => (
            <li key={i} className="flex gap-2 text-sm text-amber-950/90">
              <span aria-hidden>🔴</span>
              <span>
                <span className="font-medium">{b.label}</span>
                {b.detail && <span className="text-amber-800/70"> — {b.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-amber-800/70">No open blockers.</p>
      )}
      {cleared.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-amber-800/60">{cleared.length} recently cleared</summary>
          <ul className="mt-1 space-y-1">
            {cleared.map((b, i) => (
              <li key={i} className="text-xs text-amber-800/50 line-through">{b.label}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function DevDocsIndexView({ index, blockers = [] }: { index: DevDocsIndex; blockers?: DevDocBlocker[] }) {
  const nowMs = index.scannedAtMs;
  const recent = index.entries.slice(0, HERO_LIMIT);
  const topFolders = index.tree.filter(n => n.isDir);

  return (
    <div className="flex flex-col gap-6" data-testid="dev-docs-index">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black/90">Dev Docs</h1>
          <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-black/50">
            Dev only
          </span>
        </div>
        <p className="mt-1 text-sm text-black/60">
          Every markdown doc in the project, read live off disk — always current. {index.total} file
          {index.total === 1 ? "" : "s"}.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topFolders.map(f => (
            <span
              key={f.path}
              className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/60"
            >
              <span className="font-medium text-black/75">{f.name}/</span>{" "}
              <span className="text-black/40">{f.count}</span>
            </span>
          ))}
        </div>
      </header>

      {blockers.length > 0 && <BlockerStrip blockers={blockers} />}

      <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-black/80">Recently edited</h2>
        <p className="mt-0.5 text-xs text-black/50">What moved, across every folder.</p>
        <ul className="mt-3" data-testid="dev-docs-recent">
          {recent.map(entry => (
            <HeroRow key={entry.relPath} entry={entry} nowMs={nowMs} />
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-black/80">All docs</h2>
        <p className="mt-0.5 text-xs text-black/50">
          By folder — click to expand. Big generated folders (e.g.{" "}
          <span className="font-mono">reference/</span>) start collapsed and load on open.
        </p>
        <div className="mt-3">
          <DocTree tree={index.tree} nowMs={nowMs} />
        </div>
      </section>
    </div>
  );
}
