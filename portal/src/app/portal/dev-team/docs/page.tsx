import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileEdit, UserRound, Bot } from "lucide-react";

import { requireRole } from "@/lib/server/auth";
import { devDocsAccessible, listDevDocs, readDevDoc } from "@/lib/server/devDocs";
import { docHistory, recentDocEdits } from "@/lib/server/devDocEdits";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { relativeAge } from "@/lib/formatDateTime";
import { PageHeader, Panel, Pill, EmptyState } from "../_ui";
import { DocEditor } from "./_DocEditor";

// Edit docs from inside the app, with attribution.
//
// The docs are the project's memory and two parties write them: Ed here, and
// workers straight on disk. `?doc=<relPath>` opens the editor for one file; the
// index lists what recently moved plus who last edited it in the app.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function DevDocsEditPage({ searchParams }: { searchParams: SearchParams }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devDocsAccessible(session)) notFound();

  const params = await searchParams;
  const docParam = typeof params.doc === "string" ? params.doc : undefined;
  const nowMs = Date.now();

  // ?doc=<relPath> → the editor for that file.
  if (docParam) {
    let doc;
    try {
      doc = await readDevDoc(session, docParam);
    } catch {
      notFound();
    }
    // Canonical path from here on: `readDevDoc` resolved `?doc=` to one
    // spelling, and the ledger is keyed by that. Handing `docParam` on instead
    // would file a hand-typed `./docs/a.md` under its own separate history.
    const history = await docHistory(doc.relPath);
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <Link
          href="/portal/dev-team/docs"
          className="group inline-flex w-fit items-center gap-1 text-sm text-[color:var(--dt-muted)] transition-colors hover:text-[color:var(--dt-ink)]"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
          Edit docs
        </Link>
        <PageHeader
          icon={<FileEdit size={20} />}
          accent="docs"
          title={doc.title}
          subtitle={doc.relPath}
          meta={<Pill tone="muted">{Math.round(doc.sizeBytes / 1024)} KB</Pill>}
        />
        <DocEditor
          relPath={doc.relPath}
          title={doc.title}
          initialContent={doc.content}
          mtimeMs={doc.mtimeMs}
          edits={history.edits}
          changedOutsideApp={history.changedOutsideApp}
          nowMs={nowMs}
        />
      </div>
    );
  }

  // Index: what moved recently + who edited what in the app.
  const [index, recent] = await Promise.all([listDevDocs(session), recentDocEdits(15)]);
  const recentFiles = index.entries.slice(0, 12);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        icon={<FileEdit size={20} />}
        accent="docs"
        title="Edit docs"
        subtitle="Change any doc here and it saves straight to the file — with your name on it."
        meta={<Pill tone="accent">{index.total} files</Pill>}
      />

      <Panel title="Recently changed" hint="Newest first. Open one to edit it.">
        <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
          {recentFiles.map(entry => (
            <li key={entry.relPath}>
              <Link
                href={`/portal/dev-team/docs?doc=${encodeURIComponent(entry.relPath)}`}
                className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-[color:var(--dt-hover)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[color:var(--dt-ink)]">{entry.title}</span>
                  <span className="block truncate font-mono text-[11px] text-[color:var(--dt-faint)]">{entry.relPath}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-[color:var(--dt-muted)]">
                  {relativeAge(entry.mtimeMs, nowMs)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Edits made here"
        hint="Changes saved from the app, with who made them."
        right={<Pill tone="muted">{recent.length}</Pill>}
      >
        {recent.length === 0 ? (
          <EmptyState>
            Nothing edited from the app yet. Worker edits go straight to disk — those show as
            &ldquo;changed outside the app&rdquo; when you open a doc.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
            {recent.map((edit, i) => (
              <li key={`${edit.at}-${i}`} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/portal/dev-team/docs?doc=${encodeURIComponent(edit.relPath)}`}
                    className="min-w-0 truncate font-mono text-xs text-[#0b6f6d] hover:underline"
                  >
                    {edit.relPath}
                  </Link>
                  <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--dt-faint)]">
                    {relativeAge(edit.at, nowMs)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[color:var(--dt-muted)]">
                  <UserRound size={11} className="text-[#0b6f6d]" />
                  {edit.author}
                  {edit.note ? <span className="text-[color:var(--dt-faint)]">— {edit.note}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[color:var(--dt-faint)]">
        <Bot size={12} className="mt-0.5 shrink-0" />
        Workers edit these files directly, so their changes can&apos;t be signed. When a file moves
        after your last edit here, the editor tells you it changed outside the app — and refuses to
        save over it until you reload, so a worker&apos;s work can&apos;t be silently erased.
      </p>
    </div>
  );
}
