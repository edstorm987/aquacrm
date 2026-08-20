import Link from "next/link";

import {
  composeLanes,
  scanDevTeamBoard,
  type BoardItem,
  type BoardLanes,
} from "@/lib/server/devTeamBoard";
import { LiveWorkers } from "./_LiveWorkers";

// The "right now" board — live worker status plus every plan sorted into lanes,
// parsed off the shared docs (state.md's in-flight table, each plan's
// `**Status:` line, the launch blockers).
//
// It lives here as a component rather than a page because it is one VIEW of the
// Roadmap section, not a place of its own: the roadmap is the outer altitude
// (outcomes and dates), this is the inner one (what is moving today). Gating
// belongs to whichever page mounts it.

const LANES: { key: keyof BoardLanes; label: string; hint: string; dot: string; ring: string }[] = [
  { key: "inFlight", label: "In flight", hint: "Being built now", dot: "#2f6f8f", ring: "#cfe0e8" },
  { key: "shipped", label: "Shipped", hint: "Built + landed", dot: "#2f7d4f", ring: "#cfe6d6" },
  { key: "blocked", label: "Blocked", hint: "Needs a fix or a decision", dot: "#b4443a", ring: "#eed3cf" },
  { key: "readyNext", label: "Ready next", hint: "Planned, ready to assign", dot: "#8a7b4f", ring: "#e7e0cd" },
];

function truncate(s: string, n = 150): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

function docHref(relPath: string): string {
  return `/portal/dev-team/library?doc=${encodeURIComponent(relPath)}`;
}

function Card({ item }: { item: BoardItem }) {
  const lead = item.markers[0];
  const inner = (
    <>
      <div className="flex items-start gap-2">
        {lead ? <span aria-hidden className="shrink-0 leading-5">{lead}</span> : null}
        <span className="min-w-0 font-medium text-[color:var(--dt-ink)]">{item.title}</span>
      </div>
      {item.detail ? (
        <p className="mt-1 text-xs leading-snug text-[color:var(--dt-muted)]">{truncate(item.detail)}</p>
      ) : null}
    </>
  );
  const base = "block rounded-xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-3 text-sm";
  return item.relPath ? (
    <Link href={docHref(item.relPath)} className={`${base} transition hover:border-[color:var(--dt-line)] hover:shadow-sm`}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

/** How many cards the board is showing — for the section header's count. */
export async function boardItemCount(): Promise<number> {
  const lanes = composeLanes(await scanDevTeamBoard());
  return LANES.reduce((sum, lane) => sum + lanes[lane.key].length, 0);
}

export async function Board() {
  const lanes = composeLanes(await scanDevTeamBoard());

  return (
    <div className="flex flex-col gap-6">
      <LiveWorkers />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {LANES.map(lane => {
          const items = lanes[lane.key];
          return (
            <section
              key={lane.key}
              className="flex min-w-0 flex-col rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-raised)] p-3"
              style={{ boxShadow: `inset 0 2px 0 ${lane.ring}` }}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: lane.dot }} />
                  <h2 className="text-sm font-semibold text-[color:var(--dt-ink)]">{lane.label}</h2>
                </div>
                <span className="text-xs tabular-nums text-[color:var(--dt-faint)]">{items.length}</span>
              </div>
              <p className="mb-3 px-1 text-[11px] text-[color:var(--dt-faint)]">{lane.hint}</p>
              {items.length === 0 ? (
                <p className="px-1 pb-2 text-xs text-[color:var(--dt-faint)]">Nothing here right now.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {items.map((item, i) => (
                    <Card key={`${item.relPath ?? item.title}-${i}`} item={item} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className="text-[11px] text-[color:var(--dt-faint)]">
        Live from <code className="text-[color:var(--dt-faint)]">docs/context/state.md</code> and{" "}
        <code className="text-[color:var(--dt-faint)]">docs/development/plans/</code>. Cards open the plan in the Library.
      </p>
    </div>
  );
}
