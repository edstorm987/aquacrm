// My Radar — which of your departments is starving.
//
// Ed, 2026-08-29: *"if the owner is a one-man band it will just have the 5 or so
// department profiles as the staff, so you see what areas are good and bad…
// you see your skillset where you need to improve."*
//
// ── Why this is not a radar CHART ─────────────────────────────────────────
//
// The name follows the product's existing Radar, which is a health system, not
// a shape. The data's job here is "a ratio against a limit, per department",
// and the right form for that is a METER, not a polygon. Spider charts encode
// magnitude as area, which grows quadratically — a department on half its
// baseline looks like a quarter — and their axis order silently changes the
// shape's meaning. For the one question this screen answers, "is sales getting
// its hours", a meter is readable at a glance and a polygon is not.
//
// ── Status is never colour alone ──────────────────────────────────────────
//
// Every state carries an icon and a word as well as a tint. The statuses are
// also genuinely different KINDS of thing, and flattening them is how this
// screen would start lying:
//
//   • starved / short — planned, and it did not happen. Actionable.
//   • on-track / over — planned, and it did.
//   • unplanned — no baseline. NOT a failure, and deliberately given a neutral
//     grey rather than a status colour, because a permanently amber row for a
//     department nobody planned is a row people learn to ignore.
//
// ── Unattributed hours are shown, never distributed ───────────────────────
//
// Time worked with no hat on gets its own line. Spreading it across departments
// would invent evidence; hiding it would understate the week.

import { AlertTriangle, CircleAlert, CheckCircle2, Circle, TrendingUp } from "lucide-react";

import type { AllocationSummary, DepartmentAllocation } from "@/lib/intelligence/departmentAllocation";
import { departmentProfile } from "@/lib/access/departmentProfiles";

export interface MyRadarPanelProps {
  allocation: AllocationSummary;
  wellbeing: { mean?: number; days: number };
  daysWorked: number;
  /** Whose week this is. Omitted for the whole agency / the solo view. */
  personLabel?: string;
  headline: string;
  /**
   * Where baselines are set.
   *
   * Optional because the baselines editor's own page already has the form —
   * showing a link back to the page you are standing on would be noise. On any
   * OTHER surface a radar that says "no baseline" five times with no way to fix
   * it is a dead end, so the link appears there.
   */
  baselinesHref?: string;
  /**
   * How the section dresses itself. "page" is the standalone card; "popover"
   * drops the border/radius/shadow because the topbar quick-look's container
   * already supplies them, and a card inside a card would double every edge.
   * Presentation only — the meters and every honesty rule are identical.
   */
  variant?: "page" | "popover";
}

const STATUS: Record<DepartmentAllocation["status"], {
  label: string;
  icon: typeof AlertTriangle;
  text: string;
  fill: string;
}> = {
  starved:    { label: "Starved",     icon: AlertTriangle, text: "text-red-700",     fill: "bg-red-600" },
  short:      { label: "Behind",      icon: CircleAlert,   text: "text-amber-700",   fill: "bg-amber-500" },
  "on-track": { label: "On track",    icon: CheckCircle2,  text: "text-emerald-700", fill: "bg-[#0b6f6d]" },
  over:       { label: "Over",        icon: TrendingUp,    text: "text-amber-700",   fill: "bg-amber-500" },
  unplanned:  { label: "No baseline", icon: Circle,        text: "text-black/40",    fill: "bg-black/25" },
};

export function MyRadarPanel({ allocation, wellbeing, daysWorked, personLabel, headline, baselinesHref, variant = "page" }: MyRadarPanelProps) {
  // Nothing planned at all is the state worth acting on: every row reads "no
  // baseline", which is honest and useless until somebody states an intention.
  const nothingPlanned = allocation.departments.every(entry => entry.status === "unplanned");
  return (
    <section
      aria-label={personLabel ? `My Radar — ${personLabel}` : "My Radar"}
      className={variant === "popover"
        ? "border-t border-black/[0.07] bg-white p-4"
        : "rounded-xl border border-black/10 bg-white p-4 shadow-sm"}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">My Radar</p>
          <h2 className="mt-0.5 text-sm font-semibold text-black/85">{personLabel ?? "Your departments"}</h2>
          {/* The one sentence worth reading first — and silent rather than
              confident when nothing is planned. */}
          <p className="mt-1 text-xs text-black/55">{headline}</p>
        </div>
        <Wellbeing mean={wellbeing.mean} days={wellbeing.days} daysWorked={daysWorked} />
      </header>

      {allocation.departments.length ? (
        <ul className="divide-y divide-black/[0.07] border-t border-black/[0.07]">
          {allocation.departments.map(entry => <DepartmentRow key={entry.departmentId} entry={entry} />)}
        </ul>
      ) : (
        <p className="border-t border-black/[0.07] py-4 text-xs text-black/45">
          No hours recorded and no baselines set — set a weekly baseline per department to start judging them.
        </p>
      )}

      {baselinesHref && nothingPlanned ? (
        <p className="mt-3 rounded-md border border-black/10 bg-black/[0.02] px-3 py-2 text-[11px] leading-4 text-black/55">
          Nothing is planned yet, so nothing can be starved.{" "}
          {/* Inherits the paragraph's colour rather than hardcoding the brand
              teal. `#0b6f6d` reads 5.98:1 on white but only 2.47:1 on the dark
              workspace surface this panel also renders on, and an arbitrary
              Tailwind value has no theme override to correct it. Weight plus
              underline is the affordance; the colour follows whatever the
              surrounding text already proved legible. */}
          <a href={baselinesHref} className="font-semibold text-current underline underline-offset-2">
            Set a weekly baseline per department
          </a>{" "}
          and this starts answering which area is short.
        </p>
      ) : null}

      {allocation.unattributedHours > 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-black/[0.025] px-3 py-2 text-[11px] leading-4 text-black/50">
          <Circle size={11} className="mt-0.5 shrink-0 text-black/30" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-black/65">{allocation.unattributedHours}h</strong> worked with no
            department set. Not counted against any of them — switch &ldquo;Working as&rdquo; before you start and it
            lands where it belongs.
          </span>
        </p>
      ) : null}
    </section>
  );
}

function DepartmentRow({ entry }: { entry: DepartmentAllocation }) {
  const status = STATUS[entry.status];
  const Icon = status.icon;
  const profile = departmentProfile(entry.departmentId);
  // The track is the BASELINE, so every meter is read against its own target
  // rather than against the busiest department. Capped at 100% so an
  // over-served department does not draw outside its row; the number beside it
  // still says 30 of 20.
  const filled = entry.baselineHours && entry.baselineHours > 0
    ? Math.min(100, Math.round((entry.actualHours / entry.baselineHours) * 100))
    : 0;

  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-black/80">{profile?.label ?? entry.departmentId}</span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-black/50">
            {entry.actualHours}h{entry.baselineHours !== undefined ? ` of ${entry.baselineHours}h` : ""}
          </span>
          {/* Icon + word, so state never rests on colour alone. */}
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase ${status.text}`}>
            <Icon size={11} aria-hidden="true" />
            {status.label}
          </span>
        </span>
      </div>

      {entry.baselineHours !== undefined && entry.baselineHours > 0 ? (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.07]" role="presentation">
          {/* A worked-but-tiny department keeps a 2% sliver, so "barely any" and
              "none at all" are not drawn identically. */}
          <div className={`h-full rounded-full ${status.fill}`} style={{ width: `${Math.max(filled, entry.actualHours > 0 ? 2 : 0)}%` }} />
        </div>
      ) : (
        // No track for an unplanned department: a meter with no limit would be
        // a bar chart of one number pretending to be a ratio.
        <p className="mt-1 text-[10px] text-black/35">Set a weekly baseline to judge this one.</p>
      )}
    </li>
  );
}

/**
 * Wellbeing, with its denominator attached.
 *
 * `dayScore` is a single self-rating out of five. A mean of one day is not a
 * trend, and a bare "3.4" reads as one — so the sample size is part of the
 * value, not a footnote, and the whole thing is absent rather than zero when
 * nobody has clocked out.
 */
function Wellbeing({ mean, days, daysWorked }: { mean?: number; days: number; daysWorked: number }) {
  return (
    <div className="shrink-0 text-right">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Day score</p>
      {mean === undefined ? (
        <p className="mt-0.5 text-xs text-black/40">Not rated yet</p>
      ) : (
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-black/80">
          {mean}<span className="text-xs font-normal text-black/40">/5</span>
          <span className="ml-1.5 text-[10px] font-normal text-black/40">from {days} {days === 1 ? "day" : "days"}</span>
        </p>
      )}
      <p className="mt-0.5 text-[10px] text-black/35">{daysWorked} {daysWorked === 1 ? "day" : "days"} worked</p>
    </div>
  );
}
