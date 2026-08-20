// Dev Console station — the Command Centre's fourth entry point.
//
// Deliberately NOT a mount of `/portal/dev-team/page.tsx`: that route carries
// its own founder gate, its own light portal chrome, and its own header — both
// would double up inside the command shell. This is a dark HUD reading the SAME
// live sources the workspace does, in the Command Centre's visual language
// (deep `#020b11` ground, `#62e8ff` instrument frame, grid overlay) so it sits
// beside Radar rather than looking bolted on.
//
// It shows QUEUES, not just counts. A number tells you something is wrong; a
// queue tells you what, and every row here clicks through to the surface that
// can do something about it. Everything is sourced from what already exists —
// `scanDevTeamBoard`/`composeLanes` (state.md workers table + each plan's own
// status line + `scanBlockers`) and `listFindings`. If a number can't be
// sourced honestly it isn't shown.
//
// Cost note: it stays off the expensive reader on purpose. `scanWorkerSignals`
// walks src/ + scripts/ + docs/, and this station renders on EVERY dashboard
// load (it is streamed, but still built) whether or not the founder opens it.
// `readCheckIns()` is the cheap half of that module — a handful of small JSON
// files — and it is the SAME source the topbar console reads, so the two
// surfaces can never quote different worker counts at each other.
//
// Gating lives in `page.tsx` (`devDocsAccessible(session)`): this component is
// only ever constructed for a founder in Dev Mode, so it does no gating itself.

import Link from "next/link";
import {
  ArrowUpRight, ClipboardList, Hammer, NotebookPen, PackageCheck, ScanEye,
  ShieldCheck, TriangleAlert, Users,
} from "lucide-react";

import { ACTIVE_WORKER_WINDOW_MS } from "@/lib/server/devConsoleStatus";
import { composeLanes, scanDevTeamBoard } from "@/lib/server/devTeamBoard";
import { listFindings, type Finding } from "@/lib/server/devTeamFindings";
import { readCheckIns, isCheckInActive } from "@/lib/server/devTeamWorkers";

const MAX_ROWS = 4;

/**
 * The live board, addressed directly.
 *
 * `/portal/dev-team/working` is one of the 2026-08-20 restructure's
 * compatibility stubs. It still redirects correctly, but a stub exists to keep
 * old bookmarks and external links alive — not as a route for in-app
 * navigation. Going through it costs two server renders per click: the stub
 * boots the dev-team layout, runs `requireRole` + `devDocsAccessible` and
 * builds the sidebar, then 307s to the same place this constant names. Ten
 * links on the Command Centre's hottest surface were paying that.
 */
const BOARD_HREF = "/portal/dev-team/roadmap?view=now";

function docHref(relPath?: string): string | null {
  return relPath ? `/portal/dev-team/library?doc=${encodeURIComponent(relPath)}` : null;
}

function truncate(value: string, max = 110): string {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function DevTeamStation() {
  const [board, findings, checkIns] = await Promise.all([scanDevTeamBoard(), listFindings(), readCheckIns()]);
  const lanes = composeLanes(board);
  const openBlockers = board.blockers.filter(blocker => !blocker.resolved);
  const openFindings = findings.filter(finding => finding.status === "open");
  // "Working right now" means right now. There are TWO ways to stop being live —
  // go quiet past the window, OR sign off — and re-implementing only the first
  // is why this tile read "5 working" while the page it links to said "nobody
  // working right now". One predicate, in devTeamWorkers, owns the answer.
  const activeWorkers = checkIns.filter(checkIn => isCheckInActive(checkIn));

  // The Blocked lane already carries open blockers as items; list the launch
  // blockers first because they are the ones standing between here and launch.
  const blockedQueue = [
    ...lanes.blocked.filter(item => item.kind === "blocker"),
    ...lanes.blocked.filter(item => item.kind !== "blocker"),
  ];

  return (
    <section
      className="mm-command-workspace-shell relative flex min-h-[42rem] min-w-0 flex-col overflow-hidden rounded-md border border-[#62e8ff]/30 bg-[#020b11] text-white"
      aria-labelledby="dev-team-station-heading"
      data-open-blockers={openBlockers.length}
      data-open-findings={openFindings.length}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        aria-hidden="true"
        style={{ backgroundImage: "linear-gradient(rgba(98,232,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(98,232,255,.035) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
      />

      <header className="relative flex min-h-[76px] shrink-0 items-center gap-3 border-b border-[#62e8ff]/25 bg-[#020b11]/90 px-4 py-3 sm:px-6">
        <span className="grid size-10 shrink-0 place-items-center border border-[#62e8ff]/45 bg-[#62e8ff]/[0.06] text-[#62e8ff] shadow-[inset_0_0_18px_rgba(98,232,255,.08),0_0_14px_rgba(98,232,255,.08)]" aria-hidden="true">
          <Hammer size={18} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[9px] font-semibold uppercase text-[#76dff1]/58">Build command · Founder and Dev Mode only</p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id="dev-team-station-heading" className="text-base font-semibold text-white sm:text-lg">Dev Console</h2>
            <span className="text-[9px] font-semibold uppercase text-[#68f5d0]/75">Findings, queues, workers and the library</span>
          </div>
        </div>
        <span className="ml-auto hidden shrink-0 items-center gap-2 border border-[#68f5d0]/25 bg-[#68f5d0]/[0.05] px-3 py-2 text-[8px] font-semibold uppercase text-[#68f5d0] sm:inline-flex">
          <span className="size-1.5 animate-pulse bg-[#68f5d0] shadow-[0_0_8px_#68f5d0]" /> Live from the shared brain
        </span>
      </header>

      <div className="relative grid grid-cols-2 border-b border-[#62e8ff]/20 bg-[#031018]/94 sm:grid-cols-4" aria-label="Dev Console lane counts">
        <LaneStat href={BOARD_HREF} label="In flight" value={lanes.inFlight.length} basis="workers and plans building" tone="cyan" />
        <LaneStat href={BOARD_HREF} label="Shipped" value={lanes.shipped.length} basis="complete and verified" tone="mint" />
        <LaneStat href={BOARD_HREF} label="Blocked" value={lanes.blocked.length} basis="blockers and stalled work" tone={lanes.blocked.length ? "critical" : "mint"} />
        <LaneStat href={BOARD_HREF} label="Ready next" value={lanes.readyNext.length} basis="plans waiting to be assigned" tone="gold" />
      </div>

      <div className="relative grid min-w-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.9fr)]">
        <div className="grid min-w-0 content-start gap-0 sm:grid-cols-2">
          {/* Findings lead: they are the INPUT side — what Ed saw and captured
              while using the app, waiting to become a plan. */}
          <Queue
            icon={<ScanEye size={13} />}
            label="Findings awaiting review"
            count={openFindings.length}
            tone="gold"
            href="/portal/dev-team/findings"
            emptyIcon={<ScanEye size={18} className="text-[#7dd3c4]" />}
            empty="Nothing captured and waiting"
            emptyHint="Spot something while using the app and capture it from the topbar console."
          >
            {openFindings.slice(0, MAX_ROWS).map(finding => (
              <QueueRow
                key={finding.slug}
                href="/portal/dev-team/findings"
                title={finding.title}
                detail={findingDetail(finding)}
                tone={finding.severity === "blocker" ? "critical" : finding.severity === "bug" ? "gold" : "cyan"}
              />
            ))}
          </Queue>

          <Queue
            icon={<TriangleAlert size={13} />}
            label="Blocked"
            count={blockedQueue.length}
            tone="critical"
            href={BOARD_HREF}
            emptyIcon={<ShieldCheck size={18} className="text-[#7dd3c4]" />}
            empty="Nothing is blocked"
            emptyHint="No launch blockers, no stalled plans. Pick the next one and brief a worker."
          >
            {blockedQueue.slice(0, MAX_ROWS).map((item, index) => (
              <QueueRow
                key={`${item.title}-${index}`}
                href={docHref(item.relPath) ?? "/portal/dev-team"}
                title={item.title}
                detail={item.detail}
                marker={item.markers[0]}
                tone="critical"
              />
            ))}
          </Queue>

          {/* Live check-ins, not the (hand-maintained, often stale) workers table
              — so this agrees with the topbar console instead of quoting a
              different number at it. */}
          <Queue
            icon={<Users size={13} />}
            label="Working right now"
            count={activeWorkers.length}
            tone="cyan"
            href={BOARD_HREF}
            emptyIcon={<Users size={18} className="text-white/30" />}
            empty="Nobody has checked in for two hours"
            emptyHint="Write a plan and brief a worker to start the next piece."
          >
            {activeWorkers.slice(0, MAX_ROWS).map(worker => (
              <QueueRow
                key={worker.name}
                href={BOARD_HREF}
                title={worker.phase ? `${worker.name} · ${worker.phase}` : worker.name}
                detail={worker.status}
                tone="cyan"
              />
            ))}
          </Queue>

          <Queue
            icon={<PackageCheck size={13} />}
            label="Shipped recently"
            count={lanes.shipped.length}
            tone="mint"
            href={BOARD_HREF}
            emptyIcon={<PackageCheck size={18} className="text-white/30" />}
            empty="Nothing shipped yet"
            emptyHint="Completed plans and workers land here as they finish."
          >
            {lanes.shipped.slice(0, MAX_ROWS).map((item, index) => (
              <QueueRow
                key={`${item.title}-${index}`}
                href={docHref(item.relPath) ?? BOARD_HREF}
                title={item.title}
                detail={item.detail}
                marker={item.markers[0]}
                tone="mint"
              />
            ))}
          </Queue>
        </div>

        <aside className="flex min-w-0 flex-col justify-between gap-5 border-t border-[#62e8ff]/18 px-4 py-5 sm:px-6 xl:border-l xl:border-t-0" aria-label="Open the Dev Console workspace">
          <div>
            <p className="text-[9px] font-semibold uppercase text-[#76dff1]/58">Full workspace</p>
            <p className="mt-1 max-w-md text-xl font-semibold leading-tight text-white">Every plan, worker, finding and audit in one place</p>
            <p className="mt-2 max-w-md text-xs leading-5 text-[#a6cad0]/52">
              This panel is the glance and the topbar console is the capture. The workspace is where you read the plans,
              watch the workers, browse the library and run the auditor.
            </p>
            {openBlockers.length ? (
              <p className="mt-3 inline-flex items-center gap-2 border border-red-300/30 bg-red-400/10 px-2.5 py-1.5 text-[9px] font-semibold uppercase text-red-200">
                <TriangleAlert size={11} aria-hidden="true" />
                {openBlockers.length} open launch blocker{openBlockers.length === 1 ? "" : "s"}
              </p>
            ) : (
              <p className="mt-3 inline-flex items-center gap-2 border border-[#68f5d0]/25 bg-[#68f5d0]/[0.05] px-2.5 py-1.5 text-[9px] font-semibold uppercase text-[#68f5d0]">
                <ShieldCheck size={11} aria-hidden="true" /> Nothing standing between us and launch
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Link
              href="/portal/dev-team"
              className="group flex min-h-[56px] items-center gap-3 border border-[#68f5d0]/30 bg-[#68f5d0]/[0.09] px-4 text-left text-white transition hover:bg-[#68f5d0]/[0.16]"
            >
              <span className="grid size-8 shrink-0 place-items-center border border-[#68f5d0]/35 bg-[#68f5d0]/[0.08] text-[#68f5d0]"><Hammer size={15} /></span>
              <span className="min-w-0">
                <span className="block text-[8px] font-semibold uppercase text-[#68f5d0]/75">Dev Console</span>
                <span className="mt-0.5 block text-sm font-semibold">Open the workspace</span>
              </span>
              <ArrowUpRight size={15} className="ml-auto shrink-0 text-[#68f5d0] transition group-hover:translate-x-0.5" />
            </Link>

            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                href="/portal/dev-team/findings"
                className="group flex min-h-[48px] items-center gap-2.5 border border-[#e5c479]/22 bg-[#e5c479]/[0.06] px-3 text-left text-white/80 transition hover:bg-[#e5c479]/[0.12] hover:text-white"
              >
                <ScanEye size={14} className="shrink-0 text-[#e5c479]" />
                <span className="min-w-0 text-[11px] font-semibold leading-4">Review findings</span>
              </Link>
              <Link
                href={BOARD_HREF}
                className="group flex min-h-[48px] items-center gap-2.5 border border-[#62e8ff]/22 bg-[#62e8ff]/[0.055] px-3 text-left text-white/80 transition hover:bg-[#62e8ff]/[0.11] hover:text-white"
              >
                <ClipboardList size={14} className="shrink-0 text-[#62e8ff]" />
                <span className="min-w-0 text-[11px] font-semibold leading-4">What we&apos;re working on</span>
              </Link>
              <Link
                href="/portal/dev-team/plans/new"
                className="group col-span-full flex min-h-[48px] items-center gap-2.5 border border-white/12 bg-white/[0.03] px-3 text-left text-white/75 transition hover:bg-white/[0.07] hover:text-white"
              >
                <NotebookPen size={14} className="shrink-0 text-white/45" />
                <span className="min-w-0 text-[11px] font-semibold leading-4">Write a plan</span>
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

/** What a finding says about itself in one line — severity and where it was seen. */
function findingDetail(finding: Finding): string {
  const bits = [finding.severity, finding.where].filter(Boolean) as string[];
  const note = finding.note.replace(/\s+/g, " ").trim();
  return note ? `${bits.join(" · ")} — ${note}` : bits.join(" · ");
}

type Tone = "cyan" | "mint" | "gold" | "critical";

function toneText(tone: Tone): string {
  if (tone === "critical") return "text-red-300";
  if (tone === "gold") return "text-[#e5c479]";
  if (tone === "mint") return "text-[#68f5d0]";
  return "text-[#62e8ff]";
}

function toneDot(tone: Tone): string {
  if (tone === "critical") return "bg-red-400";
  if (tone === "gold") return "bg-[#e5c479]";
  if (tone === "mint") return "bg-[#68f5d0]";
  return "bg-[#62e8ff]";
}

function Queue({
  icon, label, count, tone, href, children, empty, emptyHint, emptyIcon,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: Tone;
  href: string;
  children: React.ReactNode[];
  empty: string;
  emptyHint: string;
  emptyIcon: React.ReactNode;
}) {
  const rows = children.filter(Boolean);
  return (
    <section className="min-w-0 border-b border-[#62e8ff]/12 px-4 py-4 sm:px-5 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(odd)]:border-r-[#62e8ff]/12" aria-label={label}>
      <div className="flex items-center gap-2 border-b border-[#62e8ff]/15 pb-2.5">
        <span className={`grid size-6 shrink-0 place-items-center border border-current/25 ${toneText(tone)}`} aria-hidden="true">{icon}</span>
        <p className={`min-w-0 truncate text-[9px] font-semibold uppercase ${toneText(tone)}`}>{label}</p>
        <span className={`ml-auto shrink-0 text-sm font-semibold tabular-nums ${count ? "text-white/88" : "text-white/40"}`}>{count}</span>
      </div>

      {rows.length ? (
        <>
          <ul className="mt-2 divide-y divide-[#62e8ff]/10">{rows}</ul>
          {count > rows.length ? (
            <Link href={href} className="mt-2 inline-flex items-center gap-1 text-[9px] font-semibold uppercase text-white/40 transition hover:text-white/75">
              {count - rows.length} more <ArrowUpRight size={10} />
            </Link>
          ) : null}
        </>
      ) : (
        <div className="mt-3 border border-[#62e8ff]/14 bg-[#020c12]/80 px-3 py-5 text-center">
          <span className="mx-auto block w-fit" aria-hidden="true">{emptyIcon}</span>
          <p className="mt-2 text-[11px] font-semibold text-white/65">{empty}</p>
          <p className="mt-1 text-[10px] leading-4 text-[#a6cad0]/45">{emptyHint}</p>
        </div>
      )}
    </section>
  );
}

function QueueRow({
  href, title, detail, marker, tone,
}: {
  href: string;
  title: string;
  detail?: string;
  marker?: string;
  tone: Tone;
}) {
  return (
    <li>
      <Link href={href} className="group flex items-start gap-2.5 py-2.5 transition hover:bg-[#62e8ff]/[0.04]">
        <span className={`mt-1.5 size-1.5 shrink-0 ${toneDot(tone)}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-1.5">
            {marker ? <span aria-hidden="true" className="shrink-0 text-[10px] leading-4">{marker}</span> : null}
            <strong className="min-w-0 text-[11px] font-semibold leading-4 text-white/85">{title}</strong>
          </span>
          {detail ? <span className="mt-0.5 block text-[10px] leading-4 text-[#a6cad0]/52">{truncate(detail)}</span> : null}
        </span>
        <ArrowUpRight size={11} className="mt-0.5 shrink-0 text-white/20 transition group-hover:text-white/60" aria-hidden="true" />
      </Link>
    </li>
  );
}

function LaneStat({
  href, label, value, basis, tone,
}: {
  href: string;
  label: string;
  value: number;
  basis: string;
  tone: Tone;
}) {
  return (
    <Link href={href} className="relative min-h-[88px] min-w-0 border-b border-r border-[#62e8ff]/14 px-3 py-3 transition hover:bg-[#62e8ff]/[0.05] sm:border-b-0 sm:px-4">
      <span className={`flex items-center gap-2 text-[8px] font-semibold uppercase ${toneText(tone)}`}>
        <span className="truncate">{label}</span>
        <span className="ml-auto text-[7px] text-[#8ec9d5]/32">DEV</span>
      </span>
      <strong className={`mt-1 block text-lg font-semibold tabular-nums ${value ? "text-white/88" : "text-white/45"}`}>{value}</strong>
      <span className="mt-0.5 block truncate text-[7px] uppercase text-white/27">{basis}</span>
    </Link>
  );
}
