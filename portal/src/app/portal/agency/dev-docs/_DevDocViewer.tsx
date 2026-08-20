// Dev Docs viewer (Phase 2) — renders one doc's live markdown in-app, with a
// last-edited stamp, the raw path, and a way back to the index. Server
// component; the markdown itself renders in the client `DocMarkdown`.

import Link from "next/link";
import type { DevDocContent } from "@/lib/server/dev/devDocs";
import { relativeAge, formatUkDateTime } from "@/lib/shared/formatDateTime";
import { DocMarkdown } from "./_DocMarkdown";

export function DevDocViewer({ doc, nowMs }: { doc: DevDocContent; nowMs: number }) {
  return (
    <div className="flex flex-col gap-4" data-testid="dev-doc-viewer" data-doc-relpath={doc.relPath}>
      <Link
        href="/portal/agency/dev-docs"
        className="w-fit text-xs font-medium text-black/50 hover:text-black/80"
      >
        ← All docs
      </Link>

      <header className="border-b border-black/10 pb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-black/90">{doc.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-black/50">
          <span className="font-mono text-black/45">{doc.relPath}</span>
          <span title={formatUkDateTime(doc.mtimeMs)}>edited {relativeAge(doc.mtimeMs, nowMs)}</span>
        </div>
      </header>

      <article className="max-w-3xl">
        <DocMarkdown content={doc.content} />
      </article>
    </div>
  );
}
