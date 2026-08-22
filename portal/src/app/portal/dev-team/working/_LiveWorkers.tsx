"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, CircleDot, FileCode2, RefreshCw } from "lucide-react";

import { ago, splitCheckIns, type PanelCheckIn } from "./_liveWorkerView";

interface AreaActivity { area: string; count: number; newestMs: number; sample: string[] }
interface Payload {
  ok?: boolean;
  checkIns?: PanelCheckIn[];
  activeWindowMs?: number;
  sandboxes?: { name: string; mtimeMs: number }[];
  activity?: AreaActivity[];
  fileCount?: number;
  newestMs?: number;
  scannedAtMs?: number;
}

const POLL_MS = 10_000;
/** Fallback window when the payload predates `activeWindowMs`. */
const ACTIVE_MS = 10 * 60 * 1000;

export function LiveWorkers() {
  const [data, setData] = useState<Payload | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/portal/dev-team/workers", { cache: "no-store" });
      const payload = await response.json() as Payload;
      if (payload.ok) { setData(payload); setError(false); } else { setError(true); }
    } catch {
      setError(true);
    } finally {
      setNow(Date.now());
    }
  }, []);

  // Polling costs a full walk of src/ + scripts/ + docs/ on the server (~3.8k
  // stats), so it stops the moment nobody is looking. A tab left open in a
  // background window used to keep re-walking the tree every 10s all day.
  useEffect(() => {
    const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
    const start = () => {
      stop();
      timer.current = setInterval(() => { if (!hidden()) void load(); }, POLL_MS);
    };

    if (!hidden()) void load();
    start();

    // Coming back to the tab should show fresh numbers immediately, not in 10s.
    const onVisibility = () => { if (!hidden()) { void load(); start(); } };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [load]);

  const checkIns = data?.checkIns ?? [];
  const activity = data?.activity ?? [];
  const { active: activeCheckIns, older: olderCheckIns } =
    splitCheckIns(checkIns, now, data?.activeWindowMs ?? ACTIVE_MS);
  const shownCheckIns = showOlder ? [...activeCheckIns, ...olderCheckIns] : activeCheckIns;
  const liveNow = Boolean(data?.newestMs && now - data.newestMs < ACTIVE_MS);

  return (
    <section className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">Live right now</h2>
          <span
            className={[
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              liveNow ? "bg-[color:var(--dev-success-soft)] text-[color:var(--dev-success)]" : "bg-[color:var(--dt-hairline)] text-[color:var(--dt-faint)]",
            ].join(" ")}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${liveNow ? "animate-pulse bg-[color:var(--dev-success)]" : "bg-[color:var(--dev-faint)]"}`}
              aria-hidden
            />
            {liveNow ? "Active" : "Quiet"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { void load(); }}
          className="inline-flex items-center gap-1 text-[11px] text-[color:var(--dt-faint)] transition-colors hover:text-[color:var(--dt-muted)]"
          title="Refresh now"
        >
          <RefreshCw size={11} />
          {data?.scannedAtMs ? ago(data.scannedAtMs, now) : "…"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-[color:var(--dt-faint)]">Couldn&apos;t read worker signals.</p>
      ) : !data ? (
        <p className="text-sm text-[color:var(--dt-faint)]">Checking…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Who's checked in */}
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">Workers</h3>
            {shownCheckIns.length === 0 ? (
              <p className="text-xs leading-relaxed text-[color:var(--dt-faint)]">
                {olderCheckIns.length > 0
                  ? "Nobody working right now — every check-in is older than the live window."
                  : <>No check-ins yet. Workers appear here when they run{" "}
                      <code className="text-[color:var(--dt-faint)]">npm run worker:checkin</code> — file activity below
                      shows them either way.</>}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
                {shownCheckIns.map(worker => {
                  const active = worker.active ?? (now - worker.at < ACTIVE_MS);
                  return (
                    <li key={worker.name} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                      <CircleDot
                        size={13}
                        className={`mt-0.5 shrink-0 ${active ? "text-[color:var(--dev-success)]" : "text-[color:var(--dt-faint)]"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-[color:var(--dt-ink)]">{worker.name}</span>
                          <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--dt-faint)]">{ago(worker.at, now)}</span>
                        </div>
                        <p className="text-xs leading-snug text-[color:var(--dt-muted)]">{worker.status}</p>
                        {worker.plan || worker.phase ? (
                          <p className="mt-0.5 text-[11px] text-[color:var(--dt-faint)]">
                            {worker.plan ? <span className="font-mono">{worker.plan}</span> : null}
                            {worker.plan && worker.phase ? " · " : ""}
                            {worker.phase ? worker.phase : null}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {olderCheckIns.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowOlder(v => !v)}
                className="mt-2 text-[11px] text-[color:var(--dt-faint)] underline-offset-2 transition-colors hover:text-[color:var(--dt-muted)] hover:underline"
              >
                {showOlder
                  ? "Hide older check-ins"
                  : `Show ${olderCheckIns.length} older check-in${olderCheckIns.length === 1 ? "" : "s"}`}
              </button>
            ) : null}
          </div>

          {/* What's actually moving on disk */}
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">
              Files changing {data.fileCount ? `· ${data.fileCount} in 2h` : ""}
            </h3>
            {activity.length === 0 ? (
              <p className="text-xs text-[color:var(--dt-faint)]">Nothing changed in the last couple of hours.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
                {activity.slice(0, 6).map(area => (
                  <li key={area.area} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                    <FileCode2 size={13} className="mt-0.5 shrink-0 text-[color:var(--dt-faint)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-mono text-xs text-[color:var(--dt-ink)]">{area.area}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--dt-faint)]">
                          {ago(area.newestMs, now)}
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
          </div>
        </div>
      )}

      {activeCheckIns.length > 0 || liveNow ? (
        <p className="mt-3 flex items-center gap-1.5 border-t border-[color:var(--dt-hairline)] pt-3 text-[11px] text-[color:var(--dt-faint)]">
          <Activity size={11} />
          Updates every {POLL_MS / 1000}s while this tab is open — no need to refresh.
        </p>
      ) : null}
    </section>
  );
}
