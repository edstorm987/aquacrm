import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import type { ReactNode } from "react";

import { formatUkDate } from "@/lib/shared/formatDateTime";
import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import {
  MAX_ENTRIES,
  UPDATES_DOC_REL,
  groupUpdateBlocks,
  scanUpdates,
  todayIsoDay,
  type DevUpdateEntry,
} from "@/lib/server/dev/devTeamUpdates";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

import { libraryDocHref } from "../library/_paths";
import { EmptyState, PageHeader, Pill } from "../_ui";
import { UpdateComposer } from "./_UpdateComposer";

// Dev Team → Updates — the dev changelog. Read LIVE off the project's own
// running record (docs/development/updates.md), newest first, grouped by day —
// plus a composer so Ed can check in an entry without opening an editor.
// Founder + Dev Mode only: the same layered gate as the layout/home/working.

// The updates doc lives here, so its relative links resolve from this dir.
const DOC_DIR = "docs/development";

/**
 * Resolve a doc-relative href to a repo-relative posix path — pure string maths
 * (never touches the filesystem, so it cannot escape). Mirrors the helper the
 * board uses for plan links.
 */
function resolveDocHref(fromDir: string, href: string): string {
  const clean = href.split("#")[0].split("?")[0].trim();
  const stack = clean.startsWith("/") ? [] : fromDir.split("/").filter(Boolean);
  for (const seg of clean.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join("/");
}

// Inline markdown the entries actually use: **bold**, *emphasis*, `code`,
// [text](href). Bold is listed first so `**` never reads as an empty emphasis;
// underscores are deliberately NOT emphasis (the entries are full of
// snake_case identifiers).
const INLINE = /\*\*([\s\S]+?)\*\*|\*([^*\n]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]*)\)/g;

/**
 * Render one line of entry markdown as React nodes. Deliberately small — these
 * are hand-written changelog lines, not arbitrary documents: bold lead-ins,
 * emphasis, inline code, and links. A link to another `.md` doc opens in the
 * Library; a link to source (or anywhere else) keeps its text, dropping the URL
 * noise.
 */
function renderInline(text: string, depth = 0): ReactNode[] {
  const out: ReactNode[] = [];
  if (depth > 3) return [text];
  let last = 0;
  let key = 0;
  const re = new RegExp(INLINE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <strong key={key++} className="font-semibold text-[color:var(--dt-ink)]">
          {renderInline(m[1], depth + 1)}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      out.push(
        <em key={key++} className="italic">
          {renderInline(m[2], depth + 1)}
        </em>,
      );
    } else if (m[3] !== undefined) {
      out.push(
        <code key={key++} className="rounded bg-[#f2f4f0] px-1 py-px text-[12px] text-[color:var(--dt-muted)]">
          {m[3]}
        </code>,
      );
    } else if (m[4] !== undefined) {
      const label = m[4];
      const href = m[5] ?? "";
      const isDoc = /\.md(#|$)/i.test(href) && !/^https?:/i.test(href);
      out.push(
        isDoc ? (
          <Link
            key={key++}
            href={libraryDocHref(resolveDocHref(DOC_DIR, href))}
            className="text-[#0b6f6d] underline decoration-[#bcd9d7] underline-offset-2 transition hover:decoration-[#0b6f6d]"
          >
            {renderInline(label, depth + 1)}
          </Link>
        ) : (
          <span key={key++} className="text-[#3f6f6c]">
            {renderInline(label, depth + 1)}
          </span>
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Group consecutive entries by their date — the file is already newest-first. */
function groupByDate(entries: DevUpdateEntry[]): { date: string; entries: DevUpdateEntry[] }[] {
  const groups: { date: string; entries: DevUpdateEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.date) last.entries.push(entry);
    else groups.push({ date: entry.date, entries: [entry] });
  }
  return groups;
}

function prettyDate(isoDay: string, todayIso: string): string {
  if (isoDay === todayIso) return "Today";
  const formatted = formatUkDate(`${isoDay}T12:00:00Z`, { day: "numeric", month: "long", year: "numeric" }, "");
  return formatted || isoDay;
}

function EntryCard({ entry }: { entry: DevUpdateEntry }) {
  const runs = groupUpdateBlocks(entry.blocks);
  return (
    <article className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5">
      <h3 className="text-sm font-semibold leading-snug text-[color:var(--dt-ink)]">{renderInline(entry.title)}</h3>
      {runs.length === 0 ? (
        <p className="mt-2 text-xs text-[color:var(--dt-faint)]">No detail written for this one.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {runs.map((run, r) =>
            run.kind === "paragraph" ? (
              <p key={r} className="break-words text-sm leading-relaxed text-[color:var(--dt-muted)]">
                {renderInline(run.text)}
              </p>
            ) : (
              <ul key={r} className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
                {run.items.map((bullet, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 py-2.5 text-sm leading-relaxed text-[color:var(--dt-muted)] first:pt-0 last:pb-0"
                  >
                    <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#cfd8d3]" />
                    <span className="min-w-0 break-words">{renderInline(bullet)}</span>
                  </li>
                ))}
              </ul>
            ),
          )}
        </div>
      )}
    </article>
  );
}

export async function UpdatesSection({ tabs }: { tabs?: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  // Founder + Dev Mode, or this section does not exist.
  if (!devDocsAccessible(session)) notFound();

  const entries = await scanUpdates();
  const groups = groupByDate(entries);
  const today = todayIsoDay();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        icon={<Megaphone size={20} />}
        title="Updates"
        subtitle="The dev changelog — what shipped, newest first."
        meta={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tabs}
            <Pill tone="accent">
              {entries.length >= MAX_ENTRIES ? `latest ${MAX_ENTRIES}` : `${entries.length} entries`}
            </Pill>
          </div>
        }
      />

      <UpdateComposer today={today} />

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5">
          <EmptyState>
            Nothing in the log yet — or the running record could not be read. Check{" "}
            <code className="text-[color:var(--dt-faint)]">{UPDATES_DOC_REL}</code>.
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {groups.map(group => (
            <section key={group.date} className="flex flex-col gap-3">
              <div className="flex items-center gap-3 px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">
                  {prettyDate(group.date, today)}
                </h2>
                <span aria-hidden className="h-px flex-1 bg-[#e6e9e2]" />
                <span className="text-[11px] tabular-nums text-[color:var(--dt-faint)]">
                  {group.entries.length} update{group.entries.length === 1 ? "" : "s"}
                </span>
              </div>
              {group.entries.map((entry, i) => (
                <EntryCard key={`${entry.date}-${i}`} entry={entry} />
              ))}
            </section>
          ))}
        </div>
      )}

      <p className="text-[11px] text-[color:var(--dt-faint)]">
        Live from{" "}
        <Link href={libraryDocHref(UPDATES_DOC_REL)} className="underline decoration-[#d8ded9] underline-offset-2 hover:text-[color:var(--dt-faint)]">
          <code className="text-[color:var(--dt-faint)]">{UPDATES_DOC_REL}</code>
        </Link>{" "}
        — the same running record every worker writes to. New entries are inserted at the top; existing ones are never rewritten.
      </p>
    </div>
  );
}
