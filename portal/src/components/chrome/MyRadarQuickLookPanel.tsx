"use client";

import Link from "next/link";
import { ArrowUpRight, CircleSlash, Clock, LoaderCircle, Pause, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { DepartmentSwitcher } from "@/components/chrome/DepartmentSwitcher";
import { MyRadarPanel } from "@/components/intelligence/MyRadarPanel";
import type { MyRadarTopbarSnapshot } from "@/components/chrome/MyRadarButton";
import type { MyRadarReading } from "@/lib/server/intelligence/myRadar";
import type { DashboardPlanningSnapshot } from "@/server/dashboardPlanning";
import type { DashboardWorkSession } from "@/server/types";

// The My Radar popover body — lazily loaded, so none of this ships until the
// modal is first opened.
//
// The reading STATE lives in the button (the Dev Console draft precedent): a
// stray outside click unmounts this panel, and reopening must not refetch just
// to redraw what was already known. This panel's job on open is the fresh half:
// today's clock, your open Actions, and a newer reading than the one the server
// rendered the button with.
//
// The "Working as" row MOUNTS `DepartmentSwitcher` — the same component the
// topbar renders, never a copy. Its one POST keeps the cookie write and the
// session stamp together (see the comment in DepartmentSwitcher), its
// "View only — you are not clocked in" note keeps working, and its
// `router.refresh()` re-renders the server control so a fresh reading flows
// back into the button through the generatedAt guard. Forking any of that
// would split the feature exactly the way the switcher's own header comment
// records it once split.

/** The nudge threshold. Coarse on purpose — this is a nudge, not a compliance timer. */
const BREAK_NUDGE_MS = 90 * 60 * 1000;

interface MyOpenTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt?: number;
}

/**
 * Hours actually worked today, live block counted to now.
 *
 * Excludes "break" AND "unconfirmed" — the same `NON_WORK_MODES` judgement the
 * radar itself makes. The design note said only "not break", but counting
 * unconfirmed idle as worked-today here while the meters below refuse to would
 * have the panel disagreeing with itself about the same hours.
 */
function todayWorkedMs(sessions: DashboardWorkSession[], today: string, now: number): number {
  let total = 0;
  for (const session of sessions) {
    if (session.date !== today) continue;
    for (const block of session.activityBlocks ?? []) {
      if (block.mode === "break" || block.mode === "unconfirmed") continue;
      total += Math.max(0, (block.endedAt ?? now) - block.startedAt);
    }
  }
  return total;
}

/**
 * The trailing stretch since the last break.
 *
 * A running break suppresses the nudge and reports its own length instead.
 * Unconfirmed blocks neither extend nor end the run — they are unresolved
 * evidence, and both counting them as work and treating them as a rest would
 * be inventing an answer the person has not given yet.
 */
function trailingRun(active: DashboardWorkSession | null, now: number): { onBreakForMs: number | null; workRunMs: number } {
  const blocks = active?.activityBlocks ?? [];
  const last = blocks[blocks.length - 1];
  if (last && last.mode === "break" && !last.endedAt) {
    return { onBreakForMs: Math.max(0, now - last.startedAt), workRunMs: 0 };
  }
  let run = 0;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.mode === "break") break;
    if (block.mode !== "unconfirmed") run += Math.max(0, (block.endedAt ?? now) - block.startedAt);
  }
  return { onBreakForMs: null, workRunMs: run };
}

function hoursMinutes(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function clockTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function dueLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function MyRadarQuickLookPanel({
  activeDepartment,
  snapshot,
  onSnapshot,
  onClose,
}: {
  activeDepartment?: string;
  snapshot: MyRadarTopbarSnapshot;
  onSnapshot: (snapshot: MyRadarTopbarSnapshot) => void;
  onClose: () => void;
}) {
  const [planning, setPlanning] = useState<DashboardPlanningSnapshot | null>(null);
  const [tasks, setTasks] = useState<MyOpenTask[] | null>(null);
  // Access can be revoked MID-SESSION: the server rendered this control while
  // the person could see the staff overview, then somebody turned it off. The
  // gated routes answer 403, and the honest response is a closed door with a
  // sentence on it — not an error toast over meters that are no longer theirs
  // to read.
  const [noAccess, setNoAccess] = useState(false);
  const [radarError, setRadarError] = useState("");
  const [planningError, setPlanningError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    // Two reads, fired together — the fresh reading + own Actions from the
    // gated my-radar route, and the planning snapshot today derives from.
    // Each fails on its own: losing today's clock must not blank the meters.
    await Promise.all([
      (async () => {
        try {
          const response = await fetch("/api/portal/intelligence/my-radar", { cache: "no-store" });
          if (response.status === 403) {
            setNoAccess(true);
            return;
          }
          const result = await response.json().catch(() => null) as {
            ok?: boolean; generatedAt?: number; reading?: MyRadarReading; headline?: string; myOpenTasks?: MyOpenTask[];
          } | null;
          if (!response.ok || !result?.ok || !result.reading) throw new Error("radar read failed");
          onSnapshot({
            generatedAt: result.generatedAt ?? Date.now(),
            reading: result.reading,
            headline: result.headline ?? "",
          });
          setTasks(result.myOpenTasks ?? []);
          setRadarError("");
        } catch {
          setRadarError("Couldn't load your radar.");
        }
      })(),
      (async () => {
        try {
          const response = await fetch("/api/portal/dashboard-planning", { cache: "no-store" });
          if (response.status === 403) {
            setNoAccess(true);
            return;
          }
          const result = await response.json().catch(() => null) as { ok?: boolean; planning?: DashboardPlanningSnapshot } | null;
          if (!response.ok || !result?.ok || !result.planning) throw new Error("planning read failed");
          setPlanning(result.planning);
          setPlanningError("");
        } catch {
          setPlanningError("Couldn't load today's clock.");
        }
      })(),
    ]);
  }, [onSnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // The worked-today line and the nudge count live time; a panel left open
    // through a meeting should not still claim the minute it was opened.
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const planningAction = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch("/api/portal/dashboard-planning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (response.status === 403) {
        setNoAccess(true);
        return;
      }
      const result = await response.json().catch(() => null) as { ok?: boolean; planning?: DashboardPlanningSnapshot; error?: string } | null;
      if (!response.ok || !result?.ok || !result.planning) {
        setPlanningError(result?.error || "Could not update.");
        return;
      }
      // The POST answers with the same snapshot the GET would, so this IS the
      // re-read — and the event is what wakes or clears the persistent work
      // monitor immediately, the same bridge the Team clock uses.
      setPlanning(result.planning);
      setPlanningError("");
      setNow(Date.now());
      window.dispatchEvent(new CustomEvent("aqua-work-session:updated", { detail: result.planning }));
    } catch {
      setPlanningError("Could not update.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (noAccess) {
    return (
      <>
        <header className="flex items-start justify-between gap-3 border-b border-black/10 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-black/85">My Radar</h2>
            <p className="mt-0.5 text-[11px] text-black/45">Last 7 days</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close My Radar" className="grid size-8 shrink-0 place-items-center rounded-md text-black/45 hover:bg-black/[0.04] hover:text-black/70">
            <X size={15} aria-hidden="true" />
          </button>
        </header>
        <div className="px-5 py-8 text-center">
          <CircleSlash className="mx-auto text-black/30" size={22} aria-hidden="true" />
          <p className="mt-2 text-xs font-semibold text-black/65">Your access to the staff overview is turned off</p>
          <p className="mt-1 text-[11px] leading-4 text-black/42">
            These meters read the same data as the staff overview, so they follow its access. Ask whoever runs your
            workspace if you need it back.
          </p>
        </div>
      </>
    );
  }

  const today = planning?.today ?? "";
  const active = planning?.activeSession ?? null;
  const workedMs = planning ? todayWorkedMs(planning.sessions, today, now) : 0;
  const { onBreakForMs, workRunMs } = trailingRun(active, now);
  const reading = snapshot.reading;

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-black/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-black/85">My Radar</h2>
          <p className="mt-0.5 text-[11px] text-black/45">Last 7 days</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close My Radar" className="grid size-8 shrink-0 place-items-center rounded-md text-black/45 hover:bg-black/[0.04] hover:text-black/70">
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      {/* Outside the scroll area on purpose: the switcher's menu is absolutely
          positioned, and an overflow-y-auto ancestor would clip it. */}
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.07] px-4 py-2.5">
        <span className="text-[11px] font-medium text-black/50">Hat-then-clock-in, all in one place.</span>
        <DepartmentSwitcher active={activeDepartment} />
      </div>

      <div className="border-b border-black/[0.07] px-4 py-2.5 text-[11px]">
        {planning === null && !planningError ? (
          <span className="inline-flex items-center gap-2 text-black/40"><LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> Loading today…</span>
        ) : planningError ? (
          <p role="alert" className="text-red-700">{planningError}</p>
        ) : onBreakForMs !== null ? (
          <span className="inline-flex items-center gap-2 font-medium text-black/58">
            <Pause size={13} aria-hidden="true" /> On a break · {Math.floor(onBreakForMs / 60_000)} min
          </span>
        ) : active && workRunMs > BREAK_NUDGE_MS ? (
          // Icon + word, never colour alone — the same rule the meters follow.
          <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-800">
            <span className="inline-flex items-center gap-2 font-medium">
              <Pause size={13} aria-hidden="true" /> You&rsquo;ve worked {Math.floor(workRunMs / 60_000)} min straight — take a break.
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void planningAction({ action: "resolve-activity", activityMode: "break" })}
              className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              Take a break
            </button>
          </div>
        ) : active ? (
          <span className="inline-flex items-center gap-2 font-medium text-black/58">
            <Clock size={13} aria-hidden="true" />
            <span><strong className="font-semibold text-black/75">{hoursMinutes(workedMs)}</strong> worked today · clocked in since {clockTime(active.startedAt)}</span>
          </span>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-black/50">
              <Clock size={13} aria-hidden="true" /> Not clocked in — today&rsquo;s hours aren&rsquo;t being attributed.
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void planningAction({ action: "clock-in", currentPath: window.location.pathname })}
              className="shrink-0 rounded-md bg-black px-2.5 py-1 font-semibold text-white hover:bg-black/85 disabled:opacity-50"
            >
              Clock in
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <p className="text-[10px] font-semibold uppercase text-black/45">My open tasks</p>
          <Link href="/portal/agency/actions" onClick={onClose} className="inline-flex items-center gap-1 text-[10px] font-semibold text-black/50 hover:text-black">
            All actions <ArrowUpRight size={11} aria-hidden="true" />
          </Link>
        </div>
        {radarError ? (
          <p role="alert" className="px-4 py-2 text-[11px] text-red-700">{radarError}</p>
        ) : tasks === null ? (
          <p className="px-4 py-2 text-[11px] text-black/40">Loading…</p>
        ) : tasks.length ? (
          <div className="divide-y divide-black/[0.05] pb-1">
            {tasks.slice(0, 5).map(task => (
              <Link key={task.id} href="/portal/agency/actions" onClick={onClose} className="group flex items-baseline gap-3 px-4 py-2 hover:bg-black/[0.02]">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-black/75 group-hover:text-black">{task.title}</span>
                {task.dueAt ? <span className="shrink-0 text-[10px] tabular-nums text-black/40">due {dueLabel(task.dueAt)}</span> : null}
                <span className="shrink-0 text-[10px] font-semibold uppercase text-black/45">{task.priority}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-4 py-2 text-[11px] text-black/40">Nothing open assigned to you.</p>
        )}

        <MyRadarPanel
          variant="popover"
          allocation={reading.allocation}
          wellbeing={reading.wellbeing}
          daysWorked={reading.daysWorked}
          headline={snapshot.headline}
          baselinesHref="/portal/agency/my-radar"
        />
      </div>

      <footer className="border-t border-black/10 bg-black/[0.018] p-3">
        <Link href="/portal/agency/my-radar" onClick={onClose} className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85">
          Open full My Radar <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      </footer>
    </>
  );
}
