import "server-only";

import { scanBlockers } from "@/lib/server/devDocs";
import { listFindings, type FindingSeverity } from "@/lib/server/devTeamFindings";
import { groupActivity, scanWorkerSignals } from "@/lib/server/devTeamWorkers";

// Live status for the topbar Dev Console.
//
// The console is AMBIENT — its icon renders on every page a founder loads, and
// it has to answer the moment it is opened — so this is split by COST, not by
// subject. Three entry points over readers that already exist:
//
//   • `devConsoleBadge()` — the render path. Open findings + open blockers only:
//     `listFindings()` (a handful of small markdown files) and `scanBlockers()`
//     (one file). TTL-cached, so a burst of navigations pays for it once. It
//     must never grow beyond cheap reads.
//   • `devConsoleCore()`  — the same two readers, but with the LISTS. Fast
//     enough (tens of ms) to paint the popover the instant it opens.
//   • `devConsoleStatus()` — core plus `scanWorkerSignals()`, which walks src/ +
//     scripts/ + docs/ (thousands of stats, seconds when cold). Far too
//     expensive for a render path, and too slow to make the popover wait for it
//     — so the panel requests it separately and fills the worker rows in when
//     it lands. TTL-cached too, so re-opening is instant.
//
// Everything here is read-only and composed from existing readers — no new
// scanning, no new source of truth. Gating lives on the callers (the layout for
// the icon, the route for the data), mirroring `scanBlockers`.

/** How recent a check-in must be to count as "working right now". */
export const ACTIVE_WORKER_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Badge staleness. Long enough to survive a click-through, short enough to feel live. */
const BADGE_TTL_MS = 20_000;
/** The worker walk is expensive; a re-open inside this window reuses it. */
const STATUS_TTL_MS = 15_000;

export interface DevConsoleBadge {
  openFindings: number;
  openBlockers: number;
  /** What the badge shows — the single "needs attention" number. */
  attention: number;
  scannedAtMs: number;
}

export interface DevConsoleFinding {
  slug: string;
  title: string;
  severity: FindingSeverity;
  where?: string;
  createdAt: number;
}

export interface DevConsoleBlocker {
  label: string;
  detail?: string;
}

export interface DevConsoleWorker {
  name: string;
  status: string;
  plan?: string;
  phase?: string;
  at: number;
}

/** The fast half: everything readable from a few small files. */
export interface DevConsoleCore extends DevConsoleBadge {
  findings: DevConsoleFinding[];
  blockers: DevConsoleBlocker[];
}

/** The slow half, added on top: who is actually working right now. */
export interface DevConsoleStatus extends DevConsoleCore {
  /** Check-ins inside the active window. */
  workers: DevConsoleWorker[];
  /** Where files are actually changing, whether or not anyone checked in. */
  activeAreas: { area: string; count: number }[];
}

// The popover is a glance, not the workspace: everything past these caps lives
// one click away in `/portal/dev-team`.
const MAX_FINDINGS = 5;
const MAX_BLOCKERS = 4;
const MAX_WORKERS = 5;
const MAX_AREAS = 4;

// ---- shared TTL cache ------------------------------------------------------

interface Slot<T> { value?: T; pending?: Promise<T>; expiresAt: number }

function cached<T>(slot: Slot<T> | null, ttlMs: number, now: number, read: () => Promise<T>, store: (next: Slot<T> | null) => void): Promise<T> {
  if (slot?.value && slot.expiresAt > now) return Promise.resolve(slot.value);
  if (slot?.pending) return slot.pending;

  const pending = read()
    .then(value => {
      store({ value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch(error => {
      // Never cache a failure — the next open should retry, not repeat it.
      store(null);
      throw error;
    });

  store({ pending, expiresAt: now + ttlMs });
  return pending;
}

// ---- the fast half ---------------------------------------------------------

async function readCore(now: number): Promise<DevConsoleCore> {
  const [findings, blockers] = await Promise.all([listFindings(), scanBlockers()]);
  const openFindings = findings.filter(finding => finding.status === "open");
  const openBlockers = blockers.filter(blocker => !blocker.resolved);
  return {
    openFindings: openFindings.length,
    openBlockers: openBlockers.length,
    attention: openFindings.length + openBlockers.length,
    scannedAtMs: now,
    findings: openFindings.slice(0, MAX_FINDINGS).map(finding => ({
      slug: finding.slug,
      title: finding.title,
      severity: finding.severity,
      where: finding.where,
      createdAt: finding.createdAt,
    })),
    blockers: openBlockers.slice(0, MAX_BLOCKERS).map(blocker => ({
      label: blocker.label,
      detail: blocker.detail,
    })),
  };
}

let coreCache: Slot<DevConsoleCore> | null = null;
let statusCache: Slot<DevConsoleStatus> | null = null;

/** Findings + blockers, with their lists. What the popover paints on first frame. */
export function devConsoleCore(now = Date.now()): Promise<DevConsoleCore> {
  return cached(coreCache, BADGE_TTL_MS, now, () => readCore(now), next => { coreCache = next; });
}

/**
 * The cheap count for the topbar badge — the same read as `devConsoleCore()`,
 * so the icon and the panel can never disagree about how many things are open.
 */
export async function devConsoleBadge(now = Date.now()): Promise<DevConsoleBadge> {
  const { openFindings, openBlockers, attention, scannedAtMs } = await devConsoleCore(now);
  return { openFindings, openBlockers, attention, scannedAtMs };
}

/** Drop everything cached — used after a capture so the count moves immediately. */
export function invalidateDevConsoleBadge(): void {
  coreCache = null;
  statusCache = null;
}

// ---- the slow half ---------------------------------------------------------

async function readStatus(now: number): Promise<DevConsoleStatus> {
  const [core, signals] = await Promise.all([
    devConsoleCore(now),
    scanWorkerSignals(ACTIVE_WORKER_WINDOW_MS, now),
  ]);
  return {
    ...core,
    // `signals.activeCheckIns` already applies the whole rule — window AND not
    // signed off. Re-filtering `checkIns` on the window alone was listing
    // workers who had finished hours earlier.
    workers: signals.activeCheckIns
      .slice(0, MAX_WORKERS)
      .map(checkIn => ({
        name: checkIn.name,
        status: checkIn.status,
        plan: checkIn.plan,
        phase: checkIn.phase,
        at: checkIn.at,
      })),
    activeAreas: groupActivity(signals.recentFiles)
      .slice(0, MAX_AREAS)
      .map(activity => ({ area: activity.area, count: activity.count })),
  };
}

/**
 * Core plus live worker activity. Only ever reached by an explicit open, and
 * briefly cached so re-opening does not re-walk the tree.
 */
export function devConsoleStatus(now = Date.now()): Promise<DevConsoleStatus> {
  return cached(statusCache, STATUS_TTL_MS, now, () => readStatus(now), next => { statusCache = next; });
}
