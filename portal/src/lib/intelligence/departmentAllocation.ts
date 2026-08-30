// Where the hours actually went — the arithmetic behind My Radar.
//
// Ed, 2026-08-29: *"as a freelancer one-man band you have to judge the
// departments not the person, since if you judge the departments you'll see if
// enough is allocated or not or whether expansion is needed. But if you judge
// it as a whole it may look alright."*
//
// This is that sentence as a function. Blocks carry a department; this totals
// them and compares the total against what was meant to be allocated.
//
// ── Pure, and taking blocks rather than reading storage ───────────────────
//
// The judgement is the part that has to be right, and a judgement that reads
// its own inputs cannot be driven by a test. So the caller gathers sessions and
// this decides what they mean.
//
// ── The three answers that must stay distinct ─────────────────────────────
//
// A department can be quiet for three completely different reasons, and folding
// them together is how a dashboard starts lying:
//
//   • **starved** — hours were allocated and did not happen. Actionable.
//   • **unplanned** — no baseline was ever set, so "behind" is meaningless.
//     Absence of a target, not absence of work.
//   • **unattributed** — hours were worked with no hat on. They belong to
//     somebody, and quietly spreading them across departments would invent
//     evidence.
//
// Radar already insists on this distinction for missing evidence, and the same
// rule applies here: absence of evidence, said out loud.

export interface AllocationBlock {
  startedAt: number;
  endedAt?: number;
  departmentId?: string;
  /** Break and idle time must not count as work in any department. */
  mode?: string;
}

export interface DepartmentBaseline {
  departmentId: string;
  /** Hours a week this department is meant to receive. */
  weeklyHours: number;
}

export interface DepartmentAllocation {
  departmentId: string;
  actualMs: number;
  actualHours: number;
  baselineHours?: number;
  /** actual ÷ baseline, or undefined when nothing was planned. */
  ratio?: number;
  status: "starved" | "short" | "on-track" | "over" | "unplanned";
}

export interface AllocationSummary {
  departments: DepartmentAllocation[];
  /** Worked, but with no hat on. Reported, never distributed. */
  unattributedMs: number;
  unattributedHours: number;
  totalWorkedMs: number;
}

/** Modes that are not work in any department. */
const NON_WORK_MODES = new Set(["break", "unconfirmed"]);

const HOUR_MS = 60 * 60 * 1000;

function blockMs(block: AllocationBlock, now: number): number {
  // An open block counts up to NOW, which is what makes a live view honest —
  // a department you are working in right now should be climbing on screen.
  const end = block.endedAt ?? now;
  const span = end - block.startedAt;
  return span > 0 ? span : 0;
}

function round(hours: number): number {
  return Math.round(hours * 100) / 100;
}

/**
 * How does the actual compare with what was planned?
 *
 * The bands are deliberately coarse. Hour-counting invites false precision, and
 * the decision this feeds — reallocate, or hire — does not turn on five per
 * cent.
 */
function statusFor(actualHours: number, baselineHours: number | undefined): DepartmentAllocation["status"] {
  if (baselineHours === undefined || baselineHours <= 0) return "unplanned";
  const ratio = actualHours / baselineHours;
  if (ratio < 0.4) return "starved";
  if (ratio < 0.8) return "short";
  if (ratio <= 1.25) return "on-track";
  return "over";
}

/**
 * Total the hours by department and grade them against their baselines.
 *
 * `baselines` decides which departments APPEAR: a department with a baseline
 * and no hours must show as starved rather than vanish, which is precisely the
 * case Ed cares about — the one you keep meaning to get to.
 */
export function summariseDepartmentAllocation(
  blocks: readonly AllocationBlock[],
  baselines: readonly DepartmentBaseline[],
  now: number,
): AllocationSummary {
  const worked = new Map<string, number>();
  let unattributedMs = 0;
  let totalWorkedMs = 0;

  for (const block of blocks) {
    if (block.mode && NON_WORK_MODES.has(block.mode)) continue;
    const ms = blockMs(block, now);
    if (ms <= 0) continue;
    totalWorkedMs += ms;
    if (!block.departmentId) {
      unattributedMs += ms;
      continue;
    }
    worked.set(block.departmentId, (worked.get(block.departmentId) ?? 0) + ms);
  }

  const baselineFor = new Map(baselines.map(baseline => [baseline.departmentId, baseline.weeklyHours]));
  // Every department that was planned OR worked. A planned department with no
  // hours is the finding, so it cannot be omitted for having no rows.
  const ids = new Set<string>([...worked.keys(), ...baselineFor.keys()]);

  const departments = [...ids].sort().map<DepartmentAllocation>(departmentId => {
    const actualMs = worked.get(departmentId) ?? 0;
    const actualHours = round(actualMs / HOUR_MS);
    const baselineHours = baselineFor.get(departmentId);
    return {
      departmentId,
      actualMs,
      actualHours,
      ...(baselineHours !== undefined ? { baselineHours } : {}),
      ...(baselineHours !== undefined && baselineHours > 0
        ? { ratio: round(actualHours / baselineHours) }
        : {}),
      status: statusFor(actualHours, baselineHours),
    };
  });

  return {
    departments,
    unattributedMs,
    unattributedHours: round(unattributedMs / HOUR_MS),
    totalWorkedMs,
  };
}

/**
 * The one line worth putting at the top of My Radar.
 *
 * Names the worst-off PLANNED department, because "which of my departments is
 * starving" is the question the whole model exists to answer. Silent when
 * nothing is planned — a confident sentence built on no baseline would be the
 * macro view wearing a department's name.
 */
export function allocationHeadline(summary: AllocationSummary): string {
  const planned = summary.departments.filter(entry => entry.status !== "unplanned");
  if (!planned.length) return "No department baselines set yet.";
  const worst = [...planned].sort((left, right) => (left.ratio ?? 0) - (right.ratio ?? 0))[0];
  if (worst.status === "starved") return `${worst.departmentId} is starved — ${worst.actualHours}h of ${worst.baselineHours}h.`;
  if (worst.status === "short") return `${worst.departmentId} is behind — ${worst.actualHours}h of ${worst.baselineHours}h.`;
  return "Every planned department is on track.";
}
