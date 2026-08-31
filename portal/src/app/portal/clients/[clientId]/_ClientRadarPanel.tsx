"use client";

import Link from "next/link";
import { useMemo, useState, useRef } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  DatabaseZap,
  EyeOff,
  Layers3,
  Radar,
  RefreshCw,
  ScanSearch,
  X,
} from "lucide-react";
import type { BusinessRadarCheck, ClientRadarSnapshot, RadarCheckStatus } from "@/engines/data/radar/businessRadar";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

type Filter = "attention" | "all" | "blind" | "learning";

export function ClientRadarPanel({ initialRadar }: { initialRadar: ClientRadarSnapshot }) {
  const [radar, setRadar] = useState(initialRadar);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("attention");
  const [packId, setPackId] = useState("all");
  // Modal keyboard contract: focus enters the drawer, Tab stays inside it, Escape closes it, focus returns to the control that opened it.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, { onEscape: () => setOpen(false) });
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const tone = radar.healthState === "risk" ? "risk" : radar.healthState === "strong" ? "strong" : radar.healthState === "learning" ? "learning" : "watch";
  const filteredChecks = useMemo(() => radar.checks.filter(check => {
    if (packId !== "all" && !check.id.includes(`:${packId}:`)) return false;
    if (filter === "attention") return check.status === "critical" || check.status === "warning" || check.status === "watch";
    if (filter === "blind") return check.status === "blind";
    if (filter === "learning") return check.status === "learning";
    return check.status !== "inactive";
  }), [filter, packId, radar.checks]);

  async function runScan() {
    setScanning(true);
    setError("");
    try {
      const response = await fetch(`/api/portal/clients/${encodeURIComponent(radar.clientId)}/radar`, { method: "POST" });
      const payload = await response.json() as { ok?: boolean; radar?: ClientRadarSnapshot; error?: string };
      if (!response.ok || !payload.ok || !payload.radar) throw new Error(payload.error || "Client Radar scan failed.");
      setRadar(payload.radar);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Client Radar scan failed.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <>
      <section className={`mm-client-radar-panel mm-client-radar-panel--${tone}`} aria-labelledby="client-radar-heading">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.08] px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mm-client-radar-icon"><Radar size={18} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#315b85]">Client Radar · adaptive scope</p>
                <span className={`mm-client-radar-state mm-client-radar-state--${tone}`}>{readable(radar.healthState)}</span>
              </div>
              <h2 id="client-radar-heading" className="mt-1 text-lg font-semibold text-black/85">Every assigned system on one watch</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-black/48">{radar.summary}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={runScan} disabled={scanning} title="Refresh every applicable check and retain fresh evidence for this client" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03] disabled:opacity-50"><RefreshCw size={14} className={scanning ? "animate-spin" : ""} /> {scanning ? "Scanning" : "Refresh client"}</button>
            <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[#112f50] px-3 text-xs font-semibold text-white hover:bg-[#173c64]"><ScanSearch size={14} /> Inspect Radar</button>
          </div>
        </header>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <RadarMetric label="Client system health" value={radar.healthScore === null ? "Learning" : `${radar.healthScore}/100`} detail="Outcomes across relationship, delivery, money and connected systems" tone={tone} help="Health measures retained outcomes. Missing evidence lowers confidence instead of falsely passing." />
          <RadarMetric label="Evidence confidence" value={`${radar.confidencePercent}%`} detail={`${radar.totals.blind} blind · ${radar.totals.learning} learning`} tone={radar.confidencePercent >= 75 ? "strong" : radar.confidencePercent >= 50 ? "watch" : "risk"} help="Confidence measures how much of the client conclusion is backed by usable evidence." />
          <RadarMetric label="System readiness" value={`${radar.readinessPercent}%`} detail={`${radar.packs.length} adaptive detector packs`} tone={radar.readinessPercent >= 80 ? "strong" : radar.readinessPercent >= 55 ? "watch" : "risk"} help="Readiness shows how many applicable checks have moved beyond blind or learning state." />
          <RadarMetric label="Checks live" value={String(radar.totals.live)} detail={`${radar.totals.critical} critical · ${radar.totals.warning} warning`} tone={radar.totals.critical ? "risk" : radar.totals.warning ? "watch" : "strong"} help="Checks are generated from the client lifecycle, assigned products and connected properties." />
        </div>

        <div className="grid border-t border-black/[0.08] lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="divide-y divide-black/[0.07]">
            {radar.issues.length ? radar.issues.slice(0, 3).map((issue, index) => (
              <Link key={issue.id} href={issue.href} className="group flex items-start gap-3 px-5 py-3 hover:bg-black/[0.02]">
                <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-md text-[10px] font-bold ${issue.severity === "critical" ? "bg-red-50 text-red-700" : issue.severity === "warning" ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-700"}`}>{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-wide text-black/38">{issue.severity} · {readable(issue.domain)}</p><p className="mt-1 text-sm font-semibold text-black/72">{issue.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-black/45">{issue.detail}</p></div>
                <ChevronRight size={15} className="mt-2 shrink-0 text-black/25 group-hover:text-black/55" />
              </Link>
            )) : <div className="flex min-h-28 items-center gap-3 px-5 py-4"><span className="grid size-9 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={17} /></span><div><p className="text-sm font-semibold text-black/68">No exact finding needs attention</p><p className="mt-1 text-xs text-black/42">Learning and blind checks remain visible in the full ledger.</p></div></div>}
          </div>
          <aside className="border-t border-black/[0.08] bg-black/[0.018] px-4 py-3 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/38">Detector packs</p><Layers3 size={14} className="text-black/30" /></div>
            <div className="mt-3 space-y-2">
              {radar.packs.slice(0, 4).map(pack => <button key={pack.id} type="button" onClick={() => { setPackId(pack.id); setOpen(true); }} className="flex w-full items-center justify-between gap-3 rounded-md border border-black/[0.08] bg-white px-3 py-2 text-left hover:border-[#315b85]/30"><span className="min-w-0"><span className="block truncate text-xs font-semibold text-black/65">{pack.label}</span><span className="mt-0.5 block text-[10px] text-black/38">{pack.liveChecks} live checks</span></span><span className={`size-2 shrink-0 rounded-full ${pack.critical ? "bg-red-500" : pack.warning ? "bg-amber-400" : pack.blind ? "bg-sky-400" : "bg-emerald-500"}`} /></button>)}
            </div>
          </aside>
        </div>
        {error ? <p className="border-t border-red-100 bg-red-50 px-5 py-2 text-xs font-medium text-red-700">{error}</p> : null}
      </section>

      {open ? (
        <div className="fixed inset-0 z-[110] bg-black/35 backdrop-blur-[1px]" role="dialog" ref={dialogRef} aria-modal="true" aria-labelledby="client-radar-drawer-heading" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <aside className="ml-auto flex h-full w-full max-w-3xl flex-col bg-[#f7f9fb] shadow-2xl">
            <header className="border-b border-black/10 bg-[#0e2946] px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-cyan-300/10 text-cyan-200 ring-1 ring-cyan-200/20"><Radar size={19} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/70">Client scope · exact evidence</p><h2 id="client-radar-drawer-heading" className="mt-1 text-lg font-semibold">{radar.clientName} Radar</h2><p className="mt-1 text-xs text-white/55">{radar.totals.live} applicable checks · {radar.packs.length} adaptive packs · last sweep {formatTime(radar.generatedAt)}</p></div></div>
                <button type="button" onClick={() => setOpen(false)} title="Close client Radar" className="grid size-9 shrink-0 place-items-center rounded-md border border-white/15 text-white/70 hover:bg-white/10"><X size={17} /></button>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-md bg-white/10 text-center">
                <DrawerMetric label="Health" value={radar.healthScore === null ? "—" : String(radar.healthScore)} />
                <DrawerMetric label="Confidence" value={`${radar.confidencePercent}%`} />
                <DrawerMetric label="Readiness" value={`${radar.readinessPercent}%`} />
                <DrawerMetric label="Attention" value={String(radar.totals.critical + radar.totals.warning)} />
              </div>
            </header>

            <div className="border-b border-black/10 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {(["attention", "all", "blind", "learning"] as Filter[]).map(option => <button key={option} type="button" onClick={() => setFilter(option)} className={`min-h-8 rounded-md px-3 text-xs font-semibold ${filter === option ? "bg-[#112f50] text-white" : "bg-black/[0.045] text-black/55 hover:bg-black/[0.075]"}`}>{readable(option)} <span className="ml-1 opacity-65">{filterCount(radar, option)}</span></button>)}
                </div>
                <button type="button" onClick={runScan} disabled={scanning} className="inline-flex min-h-8 items-center gap-2 rounded-md border border-black/12 px-3 text-xs font-semibold text-black/60 disabled:opacity-50"><RefreshCw size={13} className={scanning ? "animate-spin" : ""} /> Refresh client</button>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                <button type="button" onClick={() => setPackId("all")} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold ${packId === "all" ? "bg-[#dcebed] text-[#0c6872]" : "bg-black/[0.04] text-black/45"}`}>All packs</button>
                {radar.packs.map(pack => <button key={pack.id} type="button" onClick={() => setPackId(pack.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold ${packId === pack.id ? "bg-[#dcebed] text-[#0c6872]" : "bg-black/[0.04] text-black/45"}`}>{pack.label} · {pack.liveChecks}</button>)}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredChecks.length ? <div className="divide-y divide-black/[0.07]">{filteredChecks.map(check => <RadarCheckRow key={check.id} check={check} />)}</div> : <div className="grid min-h-64 place-items-center px-6 text-center"><div><CheckCircle2 size={24} className="mx-auto text-emerald-600" /><p className="mt-3 text-sm font-semibold text-black/65">Nothing in this view</p><p className="mt-1 text-xs text-black/42">Choose another state or detector pack.</p></div></div>}
            </div>
            <footer className="border-t border-black/10 bg-white px-5 py-3 text-[10px] text-black/42">Evidence histories and scan controls remain scoped to this exact client.</footer>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function RadarMetric({ label, value, detail, tone, help }: { label: string; value: string; detail: string; tone: "risk" | "watch" | "strong" | "learning"; help: string }) {
  return <div className="border-b border-black/[0.07] px-5 py-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0"><div className="flex items-center gap-1.5"><span className="text-[10px] font-semibold uppercase tracking-wide text-black/38">{label}</span><span title={help}><CircleHelp size={12} className="text-black/25" /></span></div><div className="mt-2 flex items-end justify-between gap-3"><strong className={`text-2xl font-semibold tabular-nums ${tone === "risk" ? "text-red-700" : tone === "watch" ? "text-amber-700" : tone === "strong" ? "text-emerald-700" : "text-sky-700"}`}>{value}</strong><span className={`mb-1 size-2 rounded-full ${tone === "risk" ? "bg-red-500" : tone === "watch" ? "bg-amber-400" : tone === "strong" ? "bg-emerald-500" : "bg-sky-400"}`} /></div><p className="mt-1 text-[11px] leading-4 text-black/40">{detail}</p></div>;
}

function DrawerMetric({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#102f50] px-2 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-wide text-white/40">{label}</p><p className="mt-1 text-base font-semibold tabular-nums text-white/90">{value}</p></div>;
}

function RadarCheckRow({ check }: { check: BusinessRadarCheck }) {
  const icon = check.status === "critical" || check.status === "warning" ? AlertTriangle : check.status === "blind" ? EyeOff : check.status === "learning" ? Activity : check.status === "pass" ? CheckCircle2 : DatabaseZap;
  const Icon = icon;
  return <article className="bg-white px-5 py-4"><div className="flex items-start gap-3"><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${statusClass(check.status)}`}><Icon size={15} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-black/72">{check.title}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${statusClass(check.status)}`}>{readable(check.status)}</span>{check.entity?.type !== "client" ? <span className="rounded-full bg-black/[0.045] px-2 py-0.5 text-[9px] font-semibold text-black/40">{check.entity?.label}</span> : null}</div><p className="mt-1 text-xs leading-5 text-black/48">{check.detail}</p><div className="mt-2 flex flex-wrap gap-1.5">{check.evidence.slice(0, 5).map((evidence, index) => <span key={`${check.id}:${index}`} className="rounded-md bg-black/[0.035] px-2 py-1 text-[10px] text-black/46">{evidence}</span>)}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-black/35"><span>{check.historySamples ?? 0} retained samples{check.lastSeenAt ? ` · source seen ${formatTime(check.lastSeenAt)}` : ""}</span><Link href={check.href} className="font-semibold text-[#087f8c]">Open exact source <ChevronRight size={11} className="inline" /></Link></div></div></div></article>;
}

function filterCount(radar: ClientRadarSnapshot, filter: Filter): number {
  if (filter === "attention") return radar.totals.critical + radar.totals.warning + radar.totals.watch;
  if (filter === "blind") return radar.totals.blind;
  if (filter === "learning") return radar.totals.learning;
  return radar.totals.live;
}

function statusClass(status: RadarCheckStatus): string {
  if (status === "critical") return "bg-red-50 text-red-700";
  if (status === "warning" || status === "watch") return "bg-amber-50 text-amber-800";
  if (status === "blind" || status === "learning") return "bg-sky-50 text-sky-700";
  if (status === "pass") return "bg-emerald-50 text-emerald-700";
  return "bg-black/[0.045] text-black/45";
}

function readable(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}
