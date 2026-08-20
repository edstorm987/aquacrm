"use client";

import { ArrowLeft, ChevronRight, Database, RotateCcw } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AdvisorDomain, RadarDomainSummary } from "@/lib/radar/businessRadar";
import type { CommandDeckInspectorTarget } from "./_CommandDeckPopup";
import { RadarScanControl } from "./_RadarScanControl";

export type DynamicRadarStatus = "critical" | "warning" | "watch" | "blind" | "clear";

export type DynamicRadarDomain = {
  domain: AdvisorDomain;
  label: string;
  signals: number;
  criticalSignals: number;
  warningSignals: number;
  watchSignals: number;
  status: DynamicRadarStatus;
  summary: RadarDomainSummary;
};

type DynamicRadarSummary = {
  critical: number;
  warning: number;
  totalChecks: number;
};

type RadarFocus =
  | { kind: "all" }
  | { kind: "sector"; id: string }
  | { kind: "domain"; id: AdvisorDomain };

type RadarSector = {
  id: string;
  code: string;
  label: string;
  domains: DynamicRadarDomain[];
  signals: number;
  criticalSignals: number;
  warningSignals: number;
  watchSignals: number;
  status: DynamicRadarStatus;
};

type PlotNode = {
  id: string;
  label: string;
  short: string;
  value?: string;
  status: DynamicRadarStatus;
  domain?: AdvisorDomain;
  target?: CommandDeckInspectorTarget;
};

const SECTOR_DEFINITIONS = [
  { id: "commercial", code: "A", label: "Commercial", domains: ["sales", "marketing", "company"] },
  { id: "experience", code: "B", label: "Client experience", domains: ["clients", "delivery", "inbox"] },
  { id: "stewardship", code: "C", label: "Stewardship", domains: ["finance", "operations", "compliance"] },
  { id: "capability", code: "D", label: "Capability", domains: ["development", "systems", "team"] },
] as const;

const DOMAIN_DESCRIPTIONS: Record<AdvisorDomain, string> = {
  company: "Targets, company health, objectives, capacity and operating readiness",
  sales: "Lead flow, response speed, pipeline value, attribution and conversion",
  inbox: "Messages, reply commitments, channel health and unresolved conversations",
  clients: "Client health, retention, contact cadence, churn and relationship risk",
  finance: "Cash, revenue, invoices, budgets, tax, runway and profitability",
  delivery: "Onboarding, fulfilment, deadlines, blockers, quality and capacity",
  marketing: "Campaigns, traffic, forms, attribution, audiences and conversion",
  operations: "Process reliability, workload, handoffs, automation and continuity",
  compliance: "Legal duties, insurance, audits, records, policy and renewal dates",
  development: "Projects, deployments, performance, defects, telemetry and releases",
  team: "Workload, hours, staffing, departments, contractors and wellbeing",
  systems: "Infrastructure, integrations, sources, probes, freshness and resilience",
};

const MAIN_RADAR_POSITIONS = [
  { top: "8%", left: "50%" },
  { top: "14%", left: "70%" },
  { top: "30%", left: "86%" },
  { top: "50%", left: "92%" },
  { top: "70%", left: "86%" },
  { top: "86%", left: "70%" },
  { top: "92%", left: "50%" },
  { top: "86%", left: "30%" },
  { top: "70%", left: "14%" },
  { top: "50%", left: "8%" },
  { top: "30%", left: "14%" },
  { top: "14%", left: "30%" },
] as const;

const DOMAIN_RADAR_POSITIONS = [
  { top: "9%", left: "50%" },
  { top: "20%", left: "78%" },
  { top: "50%", left: "91%" },
  { top: "80%", left: "78%" },
  { top: "91%", left: "50%" },
  { top: "80%", left: "22%" },
  { top: "50%", left: "9%" },
  { top: "20%", left: "22%" },
] as const;

const SECTOR_DOMAIN_POSITIONS = [
  { top: "10%", left: "50%" },
  { top: "76%", left: "82%" },
  { top: "76%", left: "18%" },
] as const;

const SECTOR_RADAR_POSITIONS = [
  { top: "29%", left: "68%" },
  { top: "68%", left: "68%" },
  { top: "68%", left: "32%" },
  { top: "29%", left: "32%" },
] as const;

const MINI_RADAR_POSITIONS = [
  { top: "24%", left: "50%" },
  { top: "68%", left: "73%" },
  { top: "68%", left: "27%" },
] as const;

const STATUS_RANK: Record<DynamicRadarStatus, number> = { critical: 0, warning: 1, watch: 2, blind: 3, clear: 4 };

export function DynamicRadarConsole({
  domains,
  summary,
  initialLastRunAt,
  onOpenCommandCentre,
  unifiedSectorPlot = false,
}: {
  domains: DynamicRadarDomain[];
  summary: DynamicRadarSummary;
  initialLastRunAt?: number;
  onOpenCommandCentre?: () => void;
  unifiedSectorPlot?: boolean;
}) {
  const sectors = useMemo<RadarSector[]>(() => SECTOR_DEFINITIONS.map(definition => {
    const allowedDomains = new Set<AdvisorDomain>(definition.domains as readonly AdvisorDomain[]);
    const sectorDomains = domains.filter(domain => allowedDomains.has(domain.domain));
    return {
      ...definition,
      domains: sectorDomains,
      signals: sectorDomains.reduce((total, domain) => total + domain.signals, 0),
      criticalSignals: sectorDomains.reduce((total, domain) => total + domain.criticalSignals, 0),
      warningSignals: sectorDomains.reduce((total, domain) => total + domain.warningSignals, 0),
      watchSignals: sectorDomains.reduce((total, domain) => total + domain.watchSignals, 0),
      status: sectorDomains.reduce<DynamicRadarStatus>((current, domain) => STATUS_RANK[domain.status] < STATUS_RANK[current] ? domain.status : current, "clear"),
    };
  }), [domains]);
  const [focus, setFocus] = useState<RadarFocus>({ kind: "all" });

  useEffect(() => {
    const syncFromUrl = () => setFocus(parseRadarFocus(new URL(window.location.href).searchParams.get("radar"), domains, sectors));
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [domains, sectors]);

  const selectedSector = focus.kind === "sector"
    ? sectors.find(sector => sector.id === focus.id)
    : focus.kind === "domain"
      ? sectors.find(sector => sector.domains.some(domain => domain.domain === focus.id))
      : undefined;
  const selectedDomain = focus.kind === "domain" ? domains.find(domain => domain.domain === focus.id) : undefined;
  const focusDomains = selectedDomain ? [selectedDomain] : selectedSector ? selectedSector.domains : domains;
  const metrics = selectedDomain
    ? domainMetrics(selectedDomain)
    : selectedSector
      ? sectorMetrics(selectedSector)
      : { critical: summary.critical, warning: summary.warning, watch: domains.reduce((total, domain) => total + domain.watchSignals, 0), checks: summary.totalChecks, signals: summary.critical + summary.warning };
  const focusStatus = selectedDomain?.status ?? selectedSector?.status ?? (metrics.critical ? "critical" : metrics.warning ? "warning" : metrics.watch ? "watch" : focusDomains.some(domain => domain.summary.blindChecks) ? "blind" : "clear");
  const focusKey = focus.kind === "all" ? "all" : `${focus.kind}:${focus.id}`;
  const title = selectedDomain ? `${selectedDomain.label} radar · Domain plot` : selectedSector ? `${selectedSector.label} radar · Sector plot` : "Business radar · Executive plot";
  const eyebrow = selectedDomain ? `PPI-01${selectedSector?.code ?? ""} · ${selectedDomain.domain.toUpperCase()} domain focus` : selectedSector ? `PPI-01${selectedSector.code} · Promoted sector plot` : "PPI-01 · Live command plot · Primary plotting indicator";
  const detail = selectedDomain ? DOMAIN_DESCRIPTIONS[selectedDomain.domain] : selectedSector ? `${selectedSector.domains.map(domain => domain.label).join(" · ")} · linked operational sector` : `${domains.length} domains · ${metrics.signals} contacts held · North-up`;
  const plotNodes: PlotNode[] = selectedDomain ? domainInstrumentNodes(selectedDomain) : focusDomains.map(domain => ({
    id: domain.domain,
    label: domain.label,
    short: domain.label.slice(0, 3).toUpperCase(),
    status: domain.status,
    domain: domain.domain,
  }));
  const plotPositions = selectedDomain ? DOMAIN_RADAR_POSITIONS : selectedSector ? SECTOR_DOMAIN_POSITIONS : MAIN_RADAR_POSITIONS;

  function selectFocus(nextFocus: RadarFocus) {
    setFocus(nextFocus);
    const url = new URL(window.location.href);
    const value = radarFocusParam(nextFocus);
    if (value) url.searchParams.set("radar", value);
    else url.searchParams.delete("radar");
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function inspect(target: CommandDeckInspectorTarget) {
    window.dispatchEvent(new CustomEvent("aqua-radar-inspector:open", { detail: target }));
  }

  return <>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-[210px] flex-1">
        <p className="text-[9px] font-semibold uppercase text-[#76dff1]/58">{eyebrow}</p>
        <h2 className={`aqua-hud-radar-title mt-1 text-sm font-semibold drop-shadow-[0_0_8px_rgba(98,232,255,.2)] ${focusStatus === "critical" ? "text-red-300" : "text-[#62e8ff]"}`}>{title}</h2>
        <p className="mt-0.5 text-[8px] font-semibold uppercase text-[#a6cad0]/36">{detail}</p>
      </div>
      <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
        <span className={`aqua-hud-radar-state hidden items-center gap-2 border px-2.5 py-1.5 text-[8px] font-semibold uppercase min-[1600px]:inline-flex ${focusStatus === "critical" ? "border-red-300/35 bg-red-400/10 text-red-300" : focusStatus === "warning" ? "border-amber-300/30 bg-amber-300/10 text-amber-200" : "border-[#68f5d0]/25 bg-[#68f5d0]/[0.05] text-[#68f5d0]"}`}><span className="size-1.5 animate-pulse bg-current shadow-[0_0_8px_currentColor]" /> {focusStatus === "critical" ? `Red alert · ${metrics.critical} critical` : focusStatus === "warning" ? metrics.warning ? `${metrics.warning} contacts on watch` : `${selectedDomain?.summary.firingChecks ?? metrics.watch} checks firing` : "Sweep live"}</span>
        <RadarScanControl initialLastRunAt={initialLastRunAt} criticalCount={summary.critical} />
      </div>
    </div>

    <div className="mt-3 flex min-h-8 flex-wrap items-center justify-between gap-2 border-y border-[#62e8ff]/12 py-1.5">
      <nav className="flex min-w-0 flex-wrap items-center gap-1 text-[8px] font-semibold uppercase" aria-label="Radar scope">
        <button type="button" onClick={() => selectFocus({ kind: "all" })} aria-current={focus.kind === "all" ? "page" : undefined} className={`px-2 py-1 ${focus.kind === "all" ? "bg-[#62e8ff]/12 text-[#8ef1ff]" : "text-[#8ec9d5]/45 hover:text-white"}`}>All systems</button>
        {selectedSector ? <><ChevronRight size={10} className="text-white/20" /><button type="button" onClick={() => selectFocus({ kind: "sector", id: selectedSector.id })} aria-current={focus.kind === "sector" ? "page" : undefined} className={`px-2 py-1 ${focus.kind === "sector" ? "bg-[#62e8ff]/12 text-[#8ef1ff]" : "text-[#8ec9d5]/45 hover:text-white"}`}>{selectedSector.label}</button></> : null}
        {selectedDomain ? <><ChevronRight size={10} className="text-white/20" /><span className="px-2 py-1 text-[#e5c479]" aria-current="page">{selectedDomain.label}</span></> : null}
      </nav>
      {focus.kind !== "all" ? <button type="button" onClick={() => selectFocus(focus.kind === "domain" && selectedSector ? { kind: "sector", id: selectedSector.id } : { kind: "all" })} className="inline-flex min-h-7 items-center gap-1.5 border border-[#62e8ff]/15 px-2 text-[8px] font-semibold uppercase text-[#8ec9d5]/55 hover:bg-[#62e8ff]/[0.06] hover:text-white"><ArrowLeft size={11} /> Back one level</button> : <span className="inline-flex items-center gap-1.5 text-[7px] font-semibold uppercase text-[#68f5d0]/60"><RotateCcw size={10} /> Select a contact or sector to refocus</span>}
    </div>

    <div className={`mt-4 items-start gap-4 ${unifiedSectorPlot ? "block" : "grid min-[1500px]:grid-cols-[minmax(300px,1.35fr)_minmax(220px,.82fr)]"}`}>
      <div className="min-w-0">
        <div key={focusKey} className="mm-radar-focus-transition">
          <div className={`relative mx-auto aspect-square w-[calc(100%-3rem)] ${unifiedSectorPlot ? "max-w-[640px]" : "max-w-[520px]"}`} aria-label={`${title} with ${metrics.signals} contacts`}>
            <div className={`aqua-hud-radar-disc absolute inset-[6%] ${focusStatus === "critical" ? "aqua-hud-radar-disc--critical" : ""}`} />
            <div className="aqua-hud-radar-terrain absolute inset-[12%]" aria-hidden="true"><span /><span /><span /></div>
            <div className="aqua-hud-radar-axis absolute inset-x-[6%] top-1/2 h-px bg-[#62e8ff]/18" />
            <div className="aqua-hud-radar-axis absolute inset-y-[6%] left-1/2 w-px bg-[#62e8ff]/18" />
            <div className="aqua-hud-radar-axis absolute inset-x-[19%] top-1/2 h-px rotate-45 bg-[#62e8ff]/10" />
            <div className="aqua-hud-radar-axis absolute inset-x-[19%] top-1/2 h-px -rotate-45 bg-[#62e8ff]/10" />
            <div className="aqua-hud-radar-perimeter absolute inset-[3%] rounded-full border border-dashed border-[#62e8ff]/14" />
            <span className="aqua-hud-bearing absolute left-1/2 top-0 -translate-x-1/2 text-[8px] font-bold text-[#e5c479]">N · 000</span>
            <span className="aqua-hud-bearing absolute right-0 top-1/2 -translate-y-1/2 text-[8px] font-bold text-[#e5c479]">E · 090</span>
            <span className="aqua-hud-bearing absolute bottom-0 left-1/2 -translate-x-1/2 text-[8px] font-bold text-[#e5c479]">S · 180</span>
            <span className="aqua-hud-bearing absolute left-0 top-1/2 -translate-y-1/2 text-[8px] font-bold text-[#e5c479]">W · 270</span>
            <span className="absolute left-[14%] top-[14%] text-[7px] font-semibold text-[#62e8ff]/40">315</span><span className="absolute right-[14%] top-[14%] text-[7px] font-semibold text-[#62e8ff]/40">045</span><span className="absolute bottom-[14%] right-[14%] text-[7px] font-semibold text-[#62e8ff]/40">135</span><span className="absolute bottom-[14%] left-[14%] text-[7px] font-semibold text-[#62e8ff]/40">225</span>
            <button type="button" onClick={() => onOpenCommandCentre ? onOpenCommandCentre() : inspect(selectedDomain ? { tab: "incidents", domain: selectedDomain.domain } : { tab: "incidents" })} className="aqua-hud-radar-core absolute left-1/2 top-1/2 z-[7] grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#62e8ff]/45 bg-[#03141c]/95 text-center shadow-[inset_0_0_22px_rgba(98,232,255,.11),0_0_28px_rgba(98,232,255,.16)] hover:border-[#68f5d0]/70 hover:bg-[#08202a]" aria-label={onOpenCommandCentre ? "Open the full Command Centre plot" : `Inspect ${title}`}>
              <span><strong className="block text-3xl tabular-nums text-white drop-shadow-[0_0_8px_rgba(98,232,255,.28)]">{metrics.signals}</strong><span className="aqua-hud-radar-core-label text-[7px] font-semibold uppercase text-[#62e8ff]/75">{selectedDomain ? "domain contacts" : selectedSector ? "sector contacts" : "command contacts"}</span></span>
            </button>
            {plotNodes.map((node, index) => <button key={node.id} type="button" onClick={() => node.domain ? selectFocus({ kind: "domain", id: node.domain }) : inspect(node.target ?? { tab: "checks", domain: selectedDomain?.domain })} className={`absolute z-10 grid ${selectedDomain ? "size-9" : "size-7"} -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-center transition hover:scale-125 ${radarNodeClass(node.status)}`} style={plotPositions[index] as CSSProperties} aria-label={node.domain ? `Focus ${node.label} radar` : `Inspect ${selectedDomain?.label ?? "domain"} ${node.label}`} title={node.label}>
              {node.value ? <span className="text-[7px] font-bold tabular-nums">{node.value}</span> : <span className="size-1.5 rounded-full bg-current shadow-[0_0_7px_currentColor]" />}
              <span className="pointer-events-none absolute left-1/2 top-[calc(100%+3px)] -translate-x-1/2 whitespace-nowrap text-[6px] font-bold text-[#a9e7f2]/55">{node.short}</span>
            </button>)}
            {unifiedSectorPlot && focus.kind === "all" ? sectors.map((sector, index) => <button key={sector.id} type="button" onClick={() => selectFocus({ kind: "sector", id: sector.id })} className={`absolute z-[9] grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-center transition hover:scale-110 ${radarNodeClass(sector.status)}`} style={SECTOR_RADAR_POSITIONS[index] as CSSProperties} aria-label={`Focus ${sector.label} sector with ${sector.signals} signals`} title={`${sector.label} · ${sector.signals} signals`}>
              <span><strong className="block text-[11px] font-bold tabular-nums">{sector.signals}</strong><span className="block text-[5px] font-semibold uppercase opacity-70">PPI-01{sector.code}</span></span><span className="pointer-events-none absolute left-1/2 top-[calc(100%+4px)] -translate-x-1/2 whitespace-nowrap text-[6px] font-bold text-[#a9e7f2]/70">{sector.label}</span>
            </button>) : null}
          </div>
          <SignalTrace strength={metrics.signals + metrics.warning + metrics.checks} />
        </div>
        {unifiedSectorPlot && focus.kind === "all" ? <div className="mt-2 grid grid-cols-2 gap-px border border-[#62e8ff]/14 bg-[#62e8ff]/14 sm:grid-cols-4" aria-label="Integrated radar sector key">{sectors.map(sector => <button key={sector.id} type="button" onClick={() => selectFocus({ kind: "sector", id: sector.id })} className="grid min-h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 bg-[#020b11] px-2.5 text-left hover:bg-[#62e8ff]/[0.055]" aria-label={`Focus ${sector.label} sector`}><span className={`size-1.5 shadow-[0_0_7px_currentColor] ${radarStatusDot(sector.status)}`} /><span className="truncate text-[8px] font-semibold uppercase text-white/48">{sector.label}</span><strong className={`text-[9px] tabular-nums ${radarStatusTone(sector.status)}`}>{sector.signals}</strong></button>)}</div> : null}
        <div className="mt-2 grid grid-cols-3 gap-px border border-[#62e8ff]/16 bg-[#62e8ff]/16 text-center text-[8px] font-semibold uppercase">
          <button type="button" onClick={() => inspect({ tab: "incidents", domain: selectedDomain?.domain, status: "critical" })} className="bg-[#031019] px-2 py-2 text-red-300 hover:bg-[#62e8ff]/[0.06]">{metrics.critical} critical</button>
          <button type="button" onClick={() => inspect({ tab: "incidents", domain: selectedDomain?.domain, status: "warning" })} className="bg-[#031019] px-2 py-2 text-amber-300 hover:bg-[#62e8ff]/[0.06]">{metrics.warning} warning</button>
          <button type="button" onClick={() => inspect({ tab: "checks", domain: selectedDomain?.domain })} className="bg-[#031019] px-2 py-2 text-[#62e8ff] hover:bg-[#62e8ff]/[0.06]">{metrics.checks.toLocaleString()} checks</button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[8px] font-semibold uppercase text-[#8ec9d5]/38"><span>PPI synchronised · {focus.kind === "all" ? "All sectors" : selectedDomain?.label ?? selectedSector?.label} · Sweep 06.0s</span><button type="button" onClick={() => inspect(selectedDomain ? { tab: "incidents", domain: selectedDomain.domain } : { tab: "incidents" })} className="inline-flex items-center gap-1 text-[#e5c479] hover:text-white"><Database size={10} /> Open detailed plot</button></div>
      </div>

      {!unifiedSectorPlot ? <aside className="mm-command-sector-array min-w-0 border border-[#62e8ff]/16 bg-[#020b11]/72" aria-label="Four-sector radar switcher">
        <div className="border-b border-[#62e8ff]/16 px-3 py-2.5">
          <p className="text-[8px] font-semibold uppercase text-[#76dff1]/58">PPI-01A–D · Linked sensor switcher</p>
          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2"><h3 className="text-[10px] font-semibold text-[#62e8ff]">Promote a sector into the main plot</h3><button type="button" onClick={() => selectFocus({ kind: "all" })} className="text-[7px] font-semibold uppercase text-[#e5c479] hover:text-white">All systems</button></div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-[#62e8ff]/16" aria-label={`${metrics.signals} contacts across four linked business radars`}>
          {sectors.map(sector => {
            const active = selectedSector?.id === sector.id;
            return <article key={sector.id} data-active={active} className={`aqua-hud-panel min-w-0 px-2.5 py-2.5 transition ${active ? "bg-[#62e8ff]/[0.08] shadow-[inset_0_0_0_1px_rgba(98,232,255,.28)]" : ""}`} aria-label={`${sector.label} radar with ${sector.signals} signals`}>
              <div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-[7px] font-semibold uppercase text-[#76dff1]/52">PPI-01{sector.code}</p><h4 className="truncate text-[9px] font-semibold text-white/72">{sector.label}</h4></div><span className={`shrink-0 text-[10px] font-semibold tabular-nums ${radarStatusTone(sector.status)}`}>{sector.signals}</span></div>
              <div className="relative mx-auto mt-1.5 aspect-square w-full max-w-[112px]">
                <div className="aqua-hud-radar-disc absolute inset-[7%]" style={{ "--hud-sweep-delay": `${-sectors.indexOf(sector) * 1.2}s` } as CSSProperties} /><div className="absolute inset-x-[7%] top-1/2 h-px bg-[#62e8ff]/12" /><div className="absolute inset-y-[7%] left-1/2 w-px bg-[#62e8ff]/12" /><span className="absolute left-1/2 top-0 -translate-x-1/2 text-[6px] font-bold text-[#e5c479]/75">N</span>
                <button type="button" onClick={() => selectFocus({ kind: "sector", id: sector.id })} className={`absolute left-1/2 top-1/2 z-[5] grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-center shadow-[0_0_14px_rgba(98,232,255,.1)] ${active ? "border-[#68f5d0]/70 bg-[#0a2831]" : "border-[#62e8ff]/28 bg-[#03141c]/95 hover:border-[#68f5d0]/55 hover:bg-[#08202a]"}`} aria-label={`Promote ${sector.label} radar to the main plot`}><span><strong className="block text-sm tabular-nums text-white">{sector.signals}</strong><span className="block text-[5px] font-semibold uppercase text-[#62e8ff]/65">signals</span></span></button>
                {sector.domains.map((domain, index) => <button key={domain.domain} type="button" onClick={() => selectFocus({ kind: "domain", id: domain.domain })} className={`absolute z-10 grid size-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border transition hover:scale-125 ${radarNodeClass(domain.status)}`} style={MINI_RADAR_POSITIONS[index] as CSSProperties} aria-label={`Focus ${domain.label} radar`} title={domain.label}><span className="size-1 rounded-full bg-current" /></button>)}
              </div>
              <div className="flex items-center justify-between gap-1 border-t border-[#62e8ff]/10 pt-1 text-[6px] font-semibold uppercase text-[#8ec9d5]/38"><span>{sector.domains.length} domains</span><span className={radarStatusTone(sector.status)}>{radarStatusLabel(sector.status)}</span></div>
            </article>;
          })}
        </div>
      </aside> : null}
    </div>
  </>;
}

function parseRadarFocus(value: string | null, domains: DynamicRadarDomain[], sectors: RadarSector[]): RadarFocus {
  if (!value) return { kind: "all" };
  if (value.startsWith("sector-")) {
    const id = value.slice(7);
    return sectors.some(sector => sector.id === id) ? { kind: "sector", id } : { kind: "all" };
  }
  const domain = domains.find(item => item.domain === value)?.domain;
  return domain ? { kind: "domain", id: domain } : { kind: "all" };
}

function radarFocusParam(focus: RadarFocus): string | null {
  if (focus.kind === "all") return null;
  return focus.kind === "sector" ? `sector-${focus.id}` : focus.id;
}

function domainMetrics(domain: DynamicRadarDomain) {
  return {
    critical: domain.criticalSignals,
    warning: domain.warningSignals,
    watch: domain.watchSignals,
    checks: domain.summary.totalChecks,
    signals: domain.signals,
  };
}

function sectorMetrics(sector: RadarSector) {
  return {
    critical: sector.criticalSignals,
    warning: sector.warningSignals,
    watch: sector.watchSignals,
    checks: sector.domains.reduce((total, domain) => total + domain.summary.totalChecks, 0),
    signals: sector.signals,
  };
}

function domainInstrumentNodes(domain: DynamicRadarDomain): PlotNode[] {
  const summary = domain.summary;
  return [
    { id: "alerts", label: "Alerts", short: "ALT", value: String(domain.signals), status: domain.status, target: { tab: "incidents", domain: domain.domain } },
    { id: "firing", label: "Firing checks", short: "FIR", value: String(summary.firingChecks), status: summary.firingChecks ? domain.criticalSignals ? "critical" : "warning" : "clear", target: { tab: "checks", domain: domain.domain, status: domain.criticalSignals ? "critical" : "warning" } },
    { id: "blind", label: "Blind checks", short: "BLD", value: String(summary.blindChecks), status: summary.blindChecks ? "warning" : "clear", target: { tab: "checks", domain: domain.domain, status: "blind" } },
    { id: "coverage", label: "Coverage", short: "COV", value: `${summary.coveragePercent}%`, status: percentageStatus(summary.coveragePercent), target: { tab: "sources", domain: domain.domain } },
    { id: "confidence", label: "Confidence", short: "CNF", value: `${summary.confidencePercent}%`, status: percentageStatus(summary.confidencePercent), target: { tab: "kpis", domain: domain.domain } },
    { id: "readiness", label: "Readiness", short: "RDY", value: `${summary.readinessPercent}%`, status: percentageStatus(summary.readinessPercent), target: { tab: "checks", domain: domain.domain, status: "applicable" } },
    { id: "assured", label: "Assured checks", short: "ASR", value: String(summary.assuredChecks), status: summary.assuredChecks ? "clear" : "blind", target: { tab: "checks", domain: domain.domain, status: "pass" } },
    { id: "learning", label: "Learning checks", short: "LRN", value: String(summary.learningChecks), status: summary.learningChecks ? "watch" : "clear", target: { tab: "checks", domain: domain.domain, status: "learning" } },
  ];
}

function percentageStatus(value: number): DynamicRadarStatus {
  if (value < 40) return "critical";
  if (value < 70) return "warning";
  return "clear";
}

function radarNodeClass(status: DynamicRadarStatus): string {
  if (status === "critical") return "border-red-300/45 bg-red-400/20 text-red-200 shadow-[0_0_10px_rgba(248,113,113,.35)]";
  if (status === "warning") return "border-amber-300/45 bg-amber-400/20 text-amber-200";
  if (status === "watch") return "border-sky-300/40 bg-sky-400/15 text-sky-200 shadow-[0_0_9px_rgba(56,189,248,.18)]";
  if (status === "blind") return "border-white/20 bg-white/10 text-white/45";
  return "border-[#62e8ff]/45 bg-[#62e8ff]/10 text-[#62e8ff] shadow-[0_0_9px_rgba(98,232,255,.2)]";
}

function radarStatusTone(status: DynamicRadarStatus): string {
  if (status === "critical") return "text-red-300";
  if (status === "warning") return "text-amber-300";
  if (status === "watch") return "text-sky-300";
  if (status === "blind") return "text-white/42";
  return "text-[#62e8ff]";
}

function radarStatusDot(status: DynamicRadarStatus): string {
  if (status === "critical") return "bg-red-300 text-red-300";
  if (status === "warning") return "bg-amber-300 text-amber-300";
  if (status === "watch") return "bg-sky-300 text-sky-300";
  if (status === "blind") return "bg-white/35 text-white/35";
  return "bg-[#68f5d0] text-[#68f5d0]";
}

function radarStatusLabel(status: DynamicRadarStatus): string {
  if (status === "clear") return "Clear";
  if (status === "blind") return "Evidence gap";
  return status;
}

function SignalTrace({ strength }: { strength: number }) {
  return <div className="border-y border-[#62e8ff]/10 py-2" aria-hidden="true">
    <div className="aqua-hud-signal-trace">{Array.from({ length: 42 }, (_, index) => {
      const height = 3 + ((index * 11 + strength * 7 + (index % 5) * strength) % 20);
      return <span key={index} style={{ height }} />;
    })}</div>
    <div className="mt-1 flex justify-between text-[6px] font-semibold uppercase text-[#8ec9d5]/30"><span>0.00</span><span>Scoped signal response spectrum</span><span>6.00s</span></div>
  </div>;
}
