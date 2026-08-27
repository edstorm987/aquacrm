import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ScrollText, UserRound, Bot, FileCode2, CircleDot } from "lucide-react";

import { requireRole } from "@/lib/server/auth/auth";
import { devTeamAccessible } from "@/lib/server/dev/devTeamAccess";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { relativeAge } from "@/lib/shared/formatDateTime";
import { PageHeader, Panel, Pill, EmptyState } from "../_ui";
import { changesPillLabel, changesPillTitle } from "./_changesLabel";

// Logs — everything happening, in one place.
//
// The board answers "what are we building"; this answers "what just happened".
// Three streams that between them cover both parties working on this repo:
//   • worker check-ins  — what an agent SAYS it's doing
//   • file activity     — what actually changed on disk (needs no cooperation)
//   • doc edits         — signed changes made from inside the app

export async function LogsSection({ tabs }: { tabs?: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devTeamAccessible(session)) notFound();

  return <LiveLogsSection tabs={tabs} />;
}

async function LiveLogsSection({ tabs }: { tabs?: ReactNode }) {
  const { readDevTeamLogsSnapshot } = await import("@/lib/server/dev/devTeamLogsSnapshot");
  const snapshot = await readDevTeamLogsSnapshot();

  const nowMs = Date.now();
  const { activity, checkIns, edits, recentFiles } = snapshot;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        icon={<ScrollText size={20} />}
        accent="docs"
        title="Logs"
        subtitle="Everything happening — who checked in, what changed on disk, what was edited here."
        meta={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tabs}
            <span title={changesPillTitle(snapshot.changeCount)}>
              <Pill tone="muted">{changesPillLabel(snapshot.changeCount)}</Pill>
            </span>
          </div>
        }
      />

      <Panel title="Worker check-ins" hint="What each agent says it's doing.">
        {checkIns.length === 0 ? (
          <EmptyState>
            No check-ins yet. A worker appears here the moment it runs{" "}
            <code className="text-[color:var(--dt-faint)]">npm run worker:checkin</code>.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
            {checkIns.map(worker => (
              <li key={worker.name} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
                <CircleDot size={13} className="mt-0.5 shrink-0" style={{ color: "var(--dev-success)" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-[color:var(--dt-ink)]">{worker.name}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--dt-faint)]">
                      {relativeAge(worker.at, nowMs)}
                    </span>
                  </div>
                  <p className="text-xs leading-snug text-[color:var(--dt-muted)]">{worker.status}</p>
                  {worker.plan || worker.phase ? (
                    <p className="mt-0.5 text-[11px] text-[color:var(--dt-faint)]">
                      {worker.plan ? <span className="font-mono">{worker.plan}</span> : null}
                      {worker.plan && worker.phase ? " · " : ""}
                      {worker.phase}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Where work is happening" hint="Grouped by area, newest first.">
        {activity.length === 0 ? (
          <EmptyState>Nothing changed in the last couple of hours.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
            {activity.map(area => (
              <li key={area.area} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                <FileCode2 size={13} className="mt-0.5 shrink-0 text-[color:var(--dt-faint)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-xs text-[color:var(--dt-ink)]">{area.area}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--dt-faint)]">
                      {relativeAge(area.newestMs, nowMs)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[color:var(--dt-faint)]">
                    {area.count} file{area.count === 1 ? "" : "s"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Doc edits made here" hint="Signed changes from inside the app." right={<Pill tone="muted">{edits.length}</Pill>}>
        {edits.length === 0 ? (
          <EmptyState>
            Nothing edited from the app yet. Worker edits go straight to disk — they show in the
            file stream above instead.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
            {edits.map((edit, i) => (
              <li key={`${edit.at}-${i}`} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/portal/dev-team/library?doc=${encodeURIComponent(edit.relPath)}`}
                    className="min-w-0 truncate font-mono text-xs text-[color:var(--dev-accent)] hover:underline"
                  >
                    {edit.relPath}
                  </Link>
                  <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--dt-faint)]">
                    {relativeAge(edit.at, nowMs)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[color:var(--dt-muted)]">
                  <UserRound size={11} className="text-[color:var(--dev-accent)]" />
                  {edit.author}
                  {edit.note ? <span className="text-[color:var(--dt-faint)]">— {edit.note}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Latest files" hint="The raw stream, newest first.">
        {recentFiles.length === 0 ? (
          <EmptyState>Quiet.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
            {recentFiles.map(file => (
              <li key={file.relPath} className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                <span className="min-w-0 truncate font-mono text-[11px] text-[color:var(--dt-muted)]">{file.relPath}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--dt-faint)]">
                  {relativeAge(file.mtimeMs, nowMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[color:var(--dt-faint)]">
        <Bot size={12} className="mt-0.5 shrink-0" />
        Check-ins are what an agent <em>says</em>; the file stream is what actually happened. When
        they disagree, trust the files.
      </p>
    </div>
  );
}
