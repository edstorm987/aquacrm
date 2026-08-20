// Dev Team Library viewer — renders one doc's live markdown in-app, with a
// last-edited stamp, the raw path, and a way back to the Library index, dressed
// in the shared Dev Team design kit. A faithful reuse of the dev-docs viewer;
// the ONLY behavioural change is the back-link target (the dev-docs original
// hardcodes /portal/agency/dev-docs). The markdown itself is the SHARED
// `DocMarkdown` client component, reused unchanged — it carries no
// route-specific links, so nothing there needed re-implementing.

import Link from "next/link";
import { ArrowLeft, Clock, FileEdit } from "lucide-react";
import type { DevDocContent } from "@/lib/server/devDocs";
import { relativeAge, formatUkDateTime } from "@/lib/formatDateTime";
import { DocMarkdown } from "@/app/portal/agency/dev-docs/_DocMarkdown";
import { LIBRARY_BASE } from "./_paths";

export function LibraryDocViewer({ doc, nowMs }: { doc: DevDocContent; nowMs: number }) {
  return (
    <div
      className="mx-auto flex max-w-3xl flex-col gap-5"
      data-testid="dev-team-library-viewer"
      data-doc-relpath={doc.relPath}
    >
      {/* Editing is an ACTION on the doc you're reading, not a separate place —
          so it lives here rather than as its own sidebar section. */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={LIBRARY_BASE}
          className="group inline-flex w-fit items-center gap-1.5 text-xs font-medium text-[color:var(--dt-muted)] transition-colors hover:text-[#0b6f6d]"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
          Library
        </Link>
        <Link
          href={`/portal/dev-team/docs?doc=${encodeURIComponent(doc.relPath)}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--dt-line)] px-3 py-1.5 text-xs font-medium text-[color:var(--dt-muted)] transition-colors hover:border-[#bfe0dd] hover:text-[#0b6f6d]"
        >
          <FileEdit size={13} />
          Edit this doc
        </Link>
      </div>

      <header className="border-b border-[color:var(--dt-line)] pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--dt-ink)]">{doc.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[color:var(--dt-faint)]">
          <span className="rounded-md bg-[color:var(--dt-hairline)] px-1.5 py-0.5 font-mono text-[color:var(--dt-muted)]">{doc.relPath}</span>
          <span className="inline-flex items-center gap-1" title={formatUkDateTime(doc.mtimeMs)}>
            <Clock size={12} className="text-[color:var(--dt-faint)]" />
            edited {relativeAge(doc.mtimeMs, nowMs)}
          </span>
        </div>
      </header>

      <article>
        <DocMarkdown content={doc.content} />
      </article>
    </div>
  );
}
