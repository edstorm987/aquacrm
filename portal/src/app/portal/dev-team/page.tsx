import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache, Suspense, type ReactNode } from "react";
import {
  CalendarClock, CircleDot, Hammer, Library as LibraryIcon, MessageSquare,
  NotebookPen, Route, ScanEye, Wrench,
} from "lucide-react";

import { requireRole } from "@/lib/server/auth/auth";
import { PortalViewportLoading } from "@/components/ui/PortalViewportLoading";
import { AGENCY_ROLES } from "@/server/types";
import { devTeamAccessible } from "@/lib/server/dev/devTeamAccess";
import type { DevTeamHomeSnapshot } from "@/lib/server/dev/devTeamHomeSnapshot";
import { ensureHydrated } from "@/server/storage";
import { devTeamLinkPrefetch } from "@/lib/chrome/devTeamLinkPrefetch";
import { PageHeader, Panel, NavCard, Pill, EmptyState } from "./_ui";

// Dev Team home — the dashboard.
//
// The authenticated shell and workspace destinations stream first. All live
// status readers sit behind one Suspense boundary and one compact snapshot, so
// an authored-file walk or a cold scanner module can never hold back the first
// useful frame. The snapshot adds no new TTL: each underlying reader keeps its
// existing freshness/invalidation contract.
export const dynamic = "force-dynamic";

const SECTIONS: { href: string; label: string; hint: string; icon: ReactNode; accent: string }[] = [
  { href: "/portal/dev-team/roadmap", label: "Roadmap", hint: "What's coming · what's moving now · every task", icon: <Route size={18} />, accent: "roadmap" },
  { href: "/portal/dev-team/findings", label: "Findings", hint: "What I spotted · what the auditor spotted", icon: <ScanEye size={18} />, accent: "findings" },
  { href: "/portal/dev-team/library", label: "Library", hint: "Docs · logs · updates", icon: <LibraryIcon size={18} />, accent: "library" },
  { href: "/portal/dev-team/tools", label: "Tools", hint: "Inspector · editor · API & MCP", icon: <Wrench size={18} />, accent: "tools" },
  { href: "/portal/dev-team/notes", label: "Notes", hint: "Working notes and scratch", icon: <NotebookPen size={18} />, accent: "notes" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtTarget(target?: string): string {
  if (!target) return "";
  const month = MONTHS[Number(target.slice(5, 7)) - 1] ?? target.slice(5, 7);
  return target.length === 7 ? `end of ${month}` : `${Number(target.slice(8, 10))} ${month}`;
}

function dueText(days: number | undefined): string {
  if (days === undefined) return "";
  if (days < 0) return `${-days}d past target`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return days <= 21 ? `in ${days} days` : `in ${Math.round(days / 7)} weeks`;
}

/** One headline number, and where to go to act on it. */
function Stat({
  label, value, hint, href, tone = "muted",
}: {
  label: string;
  value: string | number;
  hint?: string;
  href: string;
  tone?: "muted" | "danger" | "ok" | "accent" | "warn";
}) {
  const colour: Record<string, string> = {
    muted: "var(--dt-ink)",
    danger: "var(--dev-danger)",
    ok: "var(--dev-success)",
    accent: "var(--dev-success)",
    warn: "var(--dev-warning)",
  };
  return (
    <Link
      href={href}
      prefetch={devTeamLinkPrefetch(href)}
      className="group rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(0,0,0,0.28)]"
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--dt-faint)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: colour[tone] }}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] leading-snug text-[color:var(--dt-muted)]">{hint}</div> : null}
    </Link>
  );
}

// React request memoisation lets the header badge and dashboard body share the
// exact same in-flight snapshot without introducing a cross-request stale copy.
const homeSnapshot = cache(async (): Promise<DevTeamHomeSnapshot> => {
  const { readDevTeamHomeSnapshot } = await import("@/lib/server/dev/devTeamHomeSnapshot");
  return readDevTeamHomeSnapshot();
});

async function LaunchMeta() {
  const { openBlockers } = await homeSnapshot();
  return openBlockers.length > 0
    ? <Pill tone="danger">{openBlockers.length} open launch blocker{openBlockers.length === 1 ? "" : "s"}</Pill>
    : <Pill tone="ok">On track</Pill>;
}

function DashboardFallback() {
  return <PortalViewportLoading label="Preparing Dev Team status…" />;
}

async function LiveDashboard() {
  const [snapshot, readinessModule] = await Promise.all([
    homeSnapshot(),
    import("@/lib/server/productionReadiness"),
  ]);

  let readiness: ReturnType<typeof readinessModule.inspectProductionReadiness> | null = null;
  try {
    readiness = readinessModule.inspectProductionReadiness();
  } catch {
    readiness = null;
  }

  const {
    openBlockers: open,
    inFlight: live,
    upcoming,
    tasksDone,
    tasksTotal,
    openFindings,
    activeWorkers: active,
    waitingThoughts: waiting,
  } = snapshot;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="In flight" value={live.length}
          hint={live.length ? live.map(item => item.title).join(" · ").slice(0, 60) : "nothing being built"}
          href="/portal/dev-team/roadmap" tone="accent"
        />
        <Stat
          label="Workers" value={active.length}
          hint={active.length ? active.map(worker => worker.name).join(", ") : "none checked in"}
          href="/portal/dev-team/roadmap?view=now" tone={active.length ? "ok" : "muted"}
        />
        <Stat
          label="Tasks done" value={tasksTotal ? `${tasksDone}/${tasksTotal}` : "—"}
          hint="phases across every roadmap item"
          href="/portal/dev-team/roadmap?view=tasks"
        />
        <Stat
          label="Open findings" value={openFindings}
          hint={openFindings ? "waiting to be turned into plans" : "all reviewed"}
          href="/portal/dev-team/findings" tone={openFindings ? "warn" : "ok"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Next up" hint="Everything with a date, soonest first">
          {upcoming.length === 0 ? (
            <EmptyState>Nothing is dated yet — put a target on a roadmap item.</EmptyState>
          ) : (
            <ol className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
              {upcoming.map(item => {
                const late = (item.dueInDays ?? 0) < 0;
                return (
                  <li key={item.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <span className={`flex w-20 shrink-0 items-center gap-1 text-[11px] tabular-nums ${late ? "font-medium text-[color:var(--dev-danger)]" : "text-[color:var(--dt-muted)]"}`}>
                      <CalendarClock size={11} />{fmtTarget(item.target)}
                    </span>
                    <Link
                      href="/portal/dev-team/roadmap"
                      className="min-w-0 flex-1 truncate text-sm text-[color:var(--dt-ink)] hover:text-[color:var(--dev-success)]"
                    >
                      {item.title}
                    </Link>
                    <span className={`shrink-0 text-[10px] ${late ? "text-[color:var(--dev-danger)]" : "text-[color:var(--dt-faint)]"}`}>
                      {dueText(item.dueInDays)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel
          title="Who's working"
          hint="Live check-ins"
          right={waiting > 0 ? (
            <Link href="/portal/dev-team/roadmap?view=tasks" className="inline-flex items-center gap-1 text-[11px] text-[color:var(--dev-warning)] hover:underline">
              <MessageSquare size={11} />{waiting} thought{waiting === 1 ? "" : "s"} waiting
            </Link>
          ) : null}
        >
          {active.length === 0 ? (
            <EmptyState>
              No worker is checked in. One appears here the moment it runs{" "}
              <code className="text-[color:var(--dt-faint)]">npm run worker:checkin</code>.
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
              {active.map(worker => (
                <li key={worker.name} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
                  <CircleDot size={11} className="mt-1 shrink-0 animate-pulse text-[color:var(--dev-info)]" />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-[color:var(--dt-ink)]">{worker.name}</span>
                      {worker.phase ? (
                        <span className="text-[11px] text-[color:var(--dt-faint)]">{worker.phase}</span>
                      ) : null}
                    </div>
                    {worker.status ? (
                      <p className="line-clamp-2 text-[11px] leading-snug text-[color:var(--dt-muted)]">{worker.status}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Launch readiness"
        hint="Checked against this environment, not the notes"
        right={readiness ? (
          <Link href="/portal/dev-team/findings?view=auditor" prefetch={false} className="text-[11px] text-[color:var(--dt-faint)] hover:text-[color:var(--dev-danger)]">
            full audit →
          </Link>
        ) : null}
      >
        {readiness ? (
          <ul className="mb-4 flex flex-col divide-y divide-[color:var(--dt-hairline)]">
            {readiness.items.filter(item => item.required || item.status === "needs-setup").map(item => {
              const ok = item.status === "ready";
              return (
                <li key={item.id} className="flex items-start gap-3 py-2 first:pt-0">
                  <span
                    aria-hidden
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: ok ? "var(--dev-success)" : item.required ? "var(--dev-danger)" : "var(--dev-warning)" }}
                  />
                  <span className="min-w-0 text-sm">
                    <span className="font-medium text-[color:var(--dt-ink)]">{item.label}</span>
                    {!ok ? <span className="text-[color:var(--dt-muted)]"> — {item.action}</span> : null}
                  </span>
                  {!item.required ? (
                    <span className="ml-auto shrink-0 text-[10px] text-[color:var(--dt-faint)]">optional</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">
          Also noted in state.md
        </h3>
        <p className="mb-2 text-[11px] text-[color:var(--dt-faint)]">
          Hand-written, so treat it as a reminder rather than a verdict — the list above is the measured one.
        </p>
        {open.length === 0 ? (
          <EmptyState>No open blockers in the current status documents.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
            {open.map((blocker, index) => (
              <li key={index} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--dev-danger)]" />
                <span className="text-sm">
                  <span className="font-medium text-[color:var(--dt-ink)]">{blocker.label}</span>
                  {blocker.detail ? <span className="text-[color:var(--dt-muted)]"> — {blocker.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function WorkspaceNav() {
  return (
    <div>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">Workspace</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(section => (
          <NavCard key={section.href} href={section.href} icon={section.icon} label={section.label} hint={section.hint} accent={section.accent} />
        ))}
      </div>
    </div>
  );
}

export default async function DevTeamHomePage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devTeamAccessible(session)) notFound();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        icon={<Hammer size={20} />}
        title="Dev Team"
        subtitle="Where the build stands right now."
        meta={
          <Suspense fallback={<Pill tone="muted">Refreshing status…</Pill>}>
            <LaunchMeta />
          </Suspense>
        }
      />

      <Suspense fallback={<DashboardFallback />}>
        <LiveDashboard />
      </Suspense>

      <WorkspaceNav />
    </div>
  );
}
