import type { RadarFindingGroupSummary } from "@/engines/data/radar/businessRadar";

// "What kind of problem" bar (radar upgrade Stage 5). Shows the top-level
// finding buckets — Infrastructure / Commercial / Compliance / Delivery /
// Reliability / People — so the operator reads the shape of the problem before
// drilling into a specific domain. Renders nothing when the sweep is all-clear.

function tone(group: RadarFindingGroupSummary): string {
  if (group.critical) return "border-red-300/35 bg-red-400/10 text-red-200";
  if (group.warning) return "border-amber-300/30 bg-amber-300/10 text-amber-200";
  return "border-white/12 bg-white/[0.04] text-white/55";
}

export function FindingGroupBar({ groups }: { groups: RadarFindingGroupSummary[] }) {
  if (!groups.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Finding groups">
      {groups.map(group => (
        <span key={group.group} className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[9px] font-semibold uppercase ${tone(group)}`}>
          {group.label}
          <span className="tabular-nums opacity-70">
            {group.critical ? `${group.critical}!` : group.warning ? `${group.warning}△` : group.incidents}
          </span>
        </span>
      ))}
    </div>
  );
}
