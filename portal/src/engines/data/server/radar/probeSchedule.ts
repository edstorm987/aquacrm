// Persistent-instance radar probe self-scheduler (issues #170).
//
// The Vercel deploy fired the probe cadence with a platform cron. On the Railway
// persistent instance there is no external scheduler, so the probe evidence went
// stale — the live inbox showed "scheduled probe sweep hasn't run" for weeks
// (BLOCKERS-FOR-ED, Infra). This restores a sub-daily cadence from inside the one
// long-lived Node process, which is exactly what a persistent server can do that
// a serverless one cannot.
//
// OFF BY DEFAULT AND SAFE. It schedules NOTHING unless `RADAR_PROBE_INTERVAL_MINUTES`
// is set to a positive number, and even then only on the single persistent
// instance. Never in tests, never during a build, never on Edge, and never on a
// multi-instance deployment (which would double-fire the same sweep against the
// shared datastore). The timer is `unref`'d so it cannot hold the process open,
// overlap-guarded so a slow tick cannot stack, and error-swallowing so a failed
// sweep is logged rather than thrown into the event loop.
//
// This is the MECHANISM half of #170. It does not shorten the radar freshness
// window (`RADAR_PROBE_CADENCE_MS`, still a conservative day): running probes
// more often only makes evidence fresher than that window requires. Tightening
// the window to match a chosen cadence is a separate, deliberate decision to make
// once the deployed cadence is set (see the note on `RADAR_SWEEP_DEFINITIONS`).

/** Synthetic probes self-gate at 5 min; never schedule below a sane floor. */
const MIN_MINUTES = 15;
/** Above a day, the daily `cron/inbox` rollup is the right tool, not this. */
const MAX_MINUTES = 1440;

/**
 * The scheduling decision as a PURE function of the environment, so the whole
 * gate is testable without a live server. Returns the interval in milliseconds,
 * or `null` when the self-scheduler must not run in this process.
 */
export function resolveProbeScheduleMs(env: NodeJS.ProcessEnv): number | null {
  // Edge has no long-lived process or Node timers worth scheduling on.
  if (env.NEXT_RUNTIME === "edge") return null;
  // Never during `node --test` or `next build`.
  if (env.NODE_ENV === "test") return null;
  if (env.NEXT_PHASE === "phase-production-build") return null;
  // Only the ONE long-lived instance. A serverless / horizontally-scaled deploy
  // would run this tick N times over against the shared datastore.
  if (env.PORTAL_SINGLE_INSTANCE !== "true") return null;

  const raw = Number(env.RADAR_PROBE_INTERVAL_MINUTES);
  if (!Number.isFinite(raw) || raw <= 0) return null; // unset / 0 / invalid = OFF
  const minutes = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(raw)));
  return minutes * 60_000;
}

let started = false;

/** Reset the once-only guard. Test-only — never called in production paths. */
export function __resetProbeSchedulerForTest(): void {
  started = false;
}

/**
 * Start the probe self-scheduler once, if this process is the persistent
 * instance and the interval is configured. Idempotent: a second call is a no-op,
 * so a repeated `register()` (Next may call the instrumentation hook more than
 * once) cannot stack timers. Returns whether a timer was actually started.
 *
 * The heavy radar code is imported lazily inside the tick, so importing this
 * module — which instrumentation does on both runtimes — pulls in no
 * `server-only` graph until a tick actually fires on Node.
 */
export function startProbeSchedulerIfEnabled(
  env: NodeJS.ProcessEnv = process.env,
  log: (message: string) => void = defaultLog,
): boolean {
  if (started) return false;
  const intervalMs = resolveProbeScheduleMs(env);
  if (intervalMs === null) return false;
  started = true;

  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return; // overlap guard — a slow sweep must not stack ticks
    running = true;
    try {
      const { runScheduledProbeSweep } = await import("@/engines/data/server/radar/radarSweeps");
      const result = await runScheduledProbeSweep();
      log(`[radar-probe] swept: infra=${result.infra}, agencies=${result.probes.length}`);
    } catch (error) {
      log(`[radar-probe] sweep failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => { void tick(); }, intervalMs);
  // The scheduler must never be the reason the process stays alive.
  if (typeof timer.unref === "function") timer.unref();
  log(`[radar-probe] self-scheduler on — every ${Math.round(intervalMs / 60_000)}m`);
  return true;
}

function defaultLog(message: string): void {
  // eslint-disable-next-line no-console
  console.info(message);
}
