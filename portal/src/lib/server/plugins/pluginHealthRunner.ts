import "server-only";
// Running a module's `healthcheck` — the one place that asks, for every caller.
//
// ── Why this is a lib and not just the route ──────────────────────────────
//
// `/api/portal/plugins/health` (2026-08-28) was the first consumer of the
// `healthcheck` manifest field: ten of the thirteen modules implement one and
// nothing called any of them. It fixed "nobody asks", but it left the answer
// nowhere — a report that only exists while somebody has the Dev Console open
// is not evidence, and Radar's `systems:module-health` signal was counting
// failures out of a `health` field that had no writer at all, so it read a
// permanent, confident zero.
//
// So the asking lives here and has two callers with different jobs:
//
//   • the ROUTE, which asks now and shows the answer, and writes nothing (it
//     is a GET; `smoke-read-path-mutations.test.ts` is the guard that keeps
//     read paths read-only);
//   • the SWEEP, which runs on the radar cadence, persists each answer onto the
//     install record, and is what makes the health of a module true whether or
//     not anyone is looking.
//
// ── The rules a health surface has to follow ──────────────────────────────
//
// A healthcheck is third-party-ish code doing I/O, so:
//
//   • **It cannot hang its caller.** Each hook races a timeout; a slow module
//     is reported as slow rather than left to stall a page or a cron tick.
//   • **It cannot take the caller down.** A throwing hook becomes one unhealthy
//     row naming the module — "the health page is broken" is the least useful
//     possible answer to "is anything broken".
//   • **A module with no hook is not unhealthy.** It is `supported: false`:
//     absence of evidence, said out loud, which is the rule Radar already
//     follows for missing evidence.
//   • **A hook cannot write.** It runs on a read path and is handed
//     `readOnlyPluginStorage`, so polling health can never mutate module data.

import { getPlugin } from "@/built-ins/runtime/_registry";
import { makeCtx } from "@/built-ins/runtime/_runtime";
import type { HealthStatus } from "@/built-ins/runtime/_types";
import { readOnlyPluginStorage } from "@/lib/server/plugins/readOnlyPluginStorage";
import { listInstallsForAgency, recordInstallHealth } from "@/server/pluginInstalls";
import type { PluginInstall } from "@/server/types";

const HOUR = 3_600_000;

/** Long enough for a real check, short enough that a page can wait for it. */
export const HEALTHCHECK_TIMEOUT_MS = 5_000;

/**
 * Minimum gap between two persisted checks of the same install.
 *
 * Deliberately shorter than the daily sweep that drives it: a gate set AT the
 * cadence makes a daily job skip itself on the first tick that runs a minute
 * early, which is how a "daily" check silently becomes a two-daily one.
 */
export const PLUGIN_HEALTH_CADENCE_MS = 6 * HOUR;

/**
 * How long a recorded answer counts as current evidence.
 *
 * Matches Radar's default freshness guardrail (48h). Past this the answer is
 * not wrong, it is simply no longer proof — which is a blind spot, not a pass.
 */
// Moved to lib/plugins/pluginHealthConstants (dependency-free) so consumers
// of the NUMBER stop paying for the runtime. Re-exported for existing callers.
export { PLUGIN_HEALTH_STALE_MS } from "@/lib/plugins/pluginHealthConstants";

export interface PluginHealthRow {
  pluginId: string;
  installId: string;
  /** False when the module ships no healthcheck at all. Not a failure. */
  supported: boolean;
  /** Absent when unsupported. */
  status?: HealthStatus;
  /** Set when the hook threw or timed out — never silently folded into `ok`. */
  error?: string;
  durationMs: number;
}

/**
 * Ask one install's module how it is.
 *
 * Never throws: every failure mode the hook can produce comes back as a row.
 */
export async function runInstallHealthcheck(install: PluginInstall, actor: string): Promise<PluginHealthRow> {
  const started = Date.now();
  const base = { pluginId: install.pluginId, installId: install.id };
  const plugin = getPlugin(install.pluginId);

  if (!plugin?.healthcheck) {
    return { ...base, supported: false, durationMs: 0 };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // `makeCtx` is inside the try on purpose: a context that cannot be built is
    // this module's failure to report, not the whole sweep's.
    const ctx = makeCtx(install, actor);
    const status = await Promise.race([
      plugin.healthcheck({ ...ctx, storage: readOnlyPluginStorage(ctx.storage, `${install.pluginId} healthcheck`) }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${HEALTHCHECK_TIMEOUT_MS}ms`)), HEALTHCHECK_TIMEOUT_MS);
      }),
    ]);
    return { ...base, supported: true, status, durationMs: Date.now() - started };
  } catch (error) {
    // A module that cannot answer is unhealthy, and says why. It does not take
    // the other nine down with it.
    return {
      ...base,
      supported: true,
      status: { ok: false, message: "This module could not report its health." },
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface PluginHealthSweepResult {
  agencyId: string;
  /** Installs asked on this run (the rest were inside the cadence window). */
  checked: number;
  /** Enabled installs skipped because their recorded answer is still current. */
  skipped: number;
  /** Asked, but ship no healthcheck: recorded as "asked, cannot answer". */
  unsupported: number;
  /** Ran and said no. */
  unhealthy: number;
  rows: PluginHealthRow[];
}

/**
 * Ask every enabled install in an agency and PERSIST the answers.
 *
 * Runs agency-scoped and client-scoped installs alike, because that is the set
 * Radar's `systems:module-health` counts over. Each answer is written with
 * `recordInstallHealth` — a host-only writer; see the note there for why a
 * module may not write its own health.
 *
 * An unsupported module records `healthCheckedAt` with NO `health`: the host
 * asked and the module has nothing to say. That is a different fact from
 * "never asked", and Radar reads the two differently — neither is a pass.
 */
export async function runPluginHealthSweep(
  agencyId: string,
  options: { now?: number; force?: boolean; actor?: string } = {},
): Promise<PluginHealthSweepResult> {
  const now = options.now ?? Date.now();
  const actor = options.actor ?? "system:plugin-health-sweep";
  const enabled = listInstallsForAgency(agencyId).filter(install => install.enabled);
  const due = enabled.filter(install =>
    options.force === true
    || install.healthCheckedAt === undefined
    || now - install.healthCheckedAt >= PLUGIN_HEALTH_CADENCE_MS);

  // Concurrent: each hook is already individually bounded, and a cron tick that
  // runs them in series is a tick that grows with the module count.
  const rows = await Promise.all(due.map(install => runInstallHealthcheck(install, actor)));

  rows.forEach((row, index) => {
    const install = due[index]!;
    recordInstallHealth(
      { agencyId: install.agencyId, clientId: install.clientId },
      install.pluginId,
      {
        healthCheckedAt: now,
        // The module's own verdict, unmodified. A failing sub-component with a
        // green headline stays green here for the same reason the panel calls
        // it "degraded" for display only: re-scoring a module's answer in the
        // recorder would make the stored number disagree with the module.
        health: row.supported && row.status
          ? { ok: row.status.ok, message: row.error ?? row.status.message }
          : undefined,
      },
    );
  });

  return {
    agencyId,
    checked: rows.length,
    skipped: enabled.length - due.length,
    unsupported: rows.filter(row => !row.supported).length,
    unhealthy: rows.filter(row => row.supported && row.status?.ok === false).length,
    rows,
  };
}
