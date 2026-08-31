"use client";

import Link from "next/link";
import { useMemo, useState, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  Filter,
  GitBranch,
  Info,
  Search,
  ShieldCheck,
  Target,
  UsersRound,
  X,
} from "lucide-react";

import type {
  CommercialFormulaMetric,
  CommercialMetricCategory,
  CommercialPersonRow,
  CommercialRecordState,
  CommandKpiStatus,
} from "@/lib/intelligence/commandIntelligence";
import type { CommercialIntelligenceSnapshotWithMeasurement } from "@/lib/intelligence/commercialIntelligence";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

/**
 * The lineage honesty flags are optional on the wire, so a snapshot built
 * before they existed still renders. Only an explicit `false` downgrades a
 * stage to "not monitored" — see `commercialIntelligence.ts`.
 */
type CommercialIntelligenceSnapshot = Omit<CommercialIntelligenceSnapshotWithMeasurement, "lineage"> & {
  lineage: Omit<CommercialIntelligenceSnapshotWithMeasurement["lineage"], "pageviewsMeasured" | "formsMeasured">
    & { pageviewsMeasured?: boolean; formsMeasured?: boolean };
};

type FormulaFilter = CommercialMetricCategory | "all";
type RecordStateFilter = CommercialRecordState | "all";

export function CommercialIntelligenceWorkspace({ snapshot, currency, initialMetricId = "", initialRecordId = "", initialSourceId = "", initialStageId = "" }: { snapshot: CommercialIntelligenceSnapshot; currency: string; initialMetricId?: string; initialRecordId?: string; initialSourceId?: string; initialStageId?: string }) {
  const [formulaFilter, setFormulaFilter] = useState<FormulaFilter>("all");
  const [formulaQuery, setFormulaQuery] = useState("");
  const [selectedFormula, setSelectedFormula] = useState<CommercialFormulaMetric | null>(snapshot.formulas.find(metric => metric.id === initialMetricId) ?? null);
  const [recordQuery, setRecordQuery] = useState(initialRecordId);
  const [sourceFilter, setSourceFilter] = useState(snapshot.sources.find(source => source.id === initialSourceId)?.label ?? "all");
  const [stageFilter, setStageFilter] = useState(snapshot.stages.some(stage => stage.id === initialStageId) ? initialStageId : "all");
  const [stateFilter, setStateFilter] = useState<RecordStateFilter>("all");

  const formulas = useMemo(() => snapshot.formulas.filter(metric => {
    const query = formulaQuery.trim().toLowerCase();
    return (formulaFilter === "all" || metric.category === formulaFilter)
      && (!query || `${metric.label} ${metric.detail} ${metric.formula} ${metric.source} ${metric.target}`.toLowerCase().includes(query));
  }), [formulaFilter, formulaQuery, snapshot.formulas]);
  const records = useMemo(() => snapshot.people.filter(row => {
    const query = recordQuery.trim().toLowerCase();
    return (sourceFilter === "all" || row.source === sourceFilter)
      && (stageFilter === "all" || row.stageId === stageFilter)
      && (stateFilter === "all" || row.state === stateFilter)
      && (!query || `${row.id} ${row.name} ${row.email} ${row.company} ${row.source} ${row.campaignName ?? ""} ${row.stageLabel} ${row.tags.join(" ")}`.toLowerCase().includes(query));
  }), [recordQuery, snapshot.people, sourceFilter, stageFilter, stateFilter]);

  return <div className="bg-[#020b11]">
    <LifecycleHeader snapshot={snapshot} />
    <LineagePlot snapshot={snapshot} onState={setStateFilter} />

    <section className="border-b border-[#62e8ff]/16" aria-labelledby="commercial-formula-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#62e8ff]/12 px-4 py-4 sm:px-5">
        <Heading eyebrow="FORMULA CONTROL · CI-02" title="Commercial metric register" detail="Every result exposes its calculation, evidence, sample, guardrail and operating route." icon={<Calculator size={15} />} id="commercial-formula-heading" />
        <div className="text-right"><strong className="block text-lg text-[#62e8ff]">{snapshot.formulas.length}</strong><span className="text-[8px] font-semibold uppercase text-white/30">source-backed formulas</span></div>
      </div>
      <div className="grid border-b border-[#62e8ff]/12 lg:grid-cols-[minmax(260px,1fr)_auto]">
        <label className="flex min-h-11 items-center gap-2 border-b border-[#62e8ff]/12 px-3 lg:border-b-0 lg:border-r"><Search size={14} className="text-[#62e8ff]/55" /><input value={formulaQuery} onChange={event => setFormulaQuery(event.target.value)} placeholder="Search formula, source, target or definition" className="h-10 min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/25" /></label>
        <div className="flex min-w-0 overflow-x-auto" aria-label="Metric categories">{(["all", "outcome", "driver", "efficiency", "quality"] as const).map(category => <button key={category} onClick={() => setFormulaFilter(category)} className={`min-h-11 shrink-0 border-r border-[#62e8ff]/12 px-3 text-[8px] font-semibold uppercase ${formulaFilter === category ? "bg-[#62e8ff]/[0.09] text-[#8ef1ff]" : "text-white/38 hover:text-white"}`}>{category}</button>)}</div>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3">
        {formulas.map(metric => <button key={metric.id} onClick={() => setSelectedFormula(metric)} className="group min-h-[126px] border-b border-r border-[#62e8ff]/12 p-4 text-left hover:bg-[#62e8ff]/[0.045]">
          <div className="flex items-start justify-between gap-3"><span className={`text-[8px] font-semibold uppercase ${statusText(metric.status)}`}>{metric.category} · {metric.status}</span><Info size={12} className="text-white/20 group-hover:text-[#62e8ff]" /></div>
          <div className="mt-2 flex items-end justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-white/72">{metric.label}</p><p className="mt-1 line-clamp-2 text-[9px] leading-4 text-white/28">{metric.formula}</p></div><strong className={`shrink-0 text-lg tabular-nums ${statusText(metric.status)}`}>{metric.display}</strong></div>
          <p className="mt-2 truncate text-[8px] text-[#8ec9d5]/35">Target · {metric.target}</p>
        </button>)}
      </div>
    </section>

    <div className="grid border-b border-[#62e8ff]/16 xl:grid-cols-[minmax(340px,.8fr)_minmax(520px,1.2fr)]">
      <StageWatch snapshot={snapshot} onStage={setStageFilter} />
      <SourceMatrix snapshot={snapshot} currency={currency} onSource={setSourceFilter} />
    </div>

    <RecordLedger snapshot={snapshot} rows={records} query={recordQuery} sourceFilter={sourceFilter} stageFilter={stageFilter} stateFilter={stateFilter} onQuery={setRecordQuery} onSource={setSourceFilter} onStage={setStageFilter} onState={setStateFilter} />
    {selectedFormula ? <FormulaInspector metric={selectedFormula} currency={currency} onClose={() => setSelectedFormula(null)} /> : null}
  </div>;
}

function LifecycleHeader({ snapshot }: { snapshot: CommercialIntelligenceSnapshot }) {
  const quality = snapshot.quality;
  return <section className="grid border-b border-[#62e8ff]/16 xl:grid-cols-[minmax(320px,1fr)_repeat(5,minmax(110px,.22fr))]">
    <div className="border-b border-r border-[#62e8ff]/12 p-4 sm:p-5 xl:border-b-0"><Heading eyebrow="CUSTOMER & LEAD INTELLIGENCE · CI-01" title="Marketing-to-client control" detail="Estate-wide acquisition lineage. No aggregate is detached from its people, stages or source evidence." icon={<GitBranch size={15} />} /></div>
    <QualityReadout label="Exact records" value={String(quality.exactRecords)} status="healthy" />
    <QualityReadout label="Source trace" value={percent(quality.sourceCoveragePercent)} status={coverageStatus(quality.sourceCoveragePercent)} />
    <QualityReadout label="Campaign link" value={percent(quality.campaignCoveragePercent)} status={coverageStatus(quality.campaignCoveragePercent)} />
    <QualityReadout label="Stage link" value={percent(quality.stageCoveragePercent)} status={coverageStatus(quality.stageCoveragePercent)} />
    <QualityReadout label="Client link" value={percent(quality.conversionLinkCoveragePercent)} status={coverageStatus(quality.conversionLinkCoveragePercent)} />
  </section>;
}

function LineagePlot({ snapshot, onState }: { snapshot: CommercialIntelligenceSnapshot; onState: (value: RecordStateFilter) => void }) {
  // A Radar `value: 0` is not a measurement. When the tag is not monitoring the
  // estate the funnel must say so rather than assert that nobody visited.
  const pageviewsMeasured = snapshot.lineage.pageviewsMeasured !== false && snapshot.lineage.pageviews !== null;
  const formsMeasured = snapshot.lineage.formsMeasured !== false && snapshot.lineage.forms !== null;
  const points = [
    { label: "Pageviews", value: snapshot.lineage.pageviews, state: "all" as const, evidence: pageviewsMeasured ? "Aqua Tag" : "Not monitored", measured: pageviewsMeasured },
    { label: "Forms", value: snapshot.lineage.forms, state: "all" as const, evidence: formsMeasured ? "Tracked forms" : "Not monitored", measured: formsMeasured },
    { label: "Leads", value: snapshot.lineage.leads, state: "all" as const, evidence: "Retained people", measured: true },
    { label: "Contacted", value: snapshot.lineage.contacted, state: "contacted" as const, evidence: "Touches or progress", measured: true },
    { label: "Meetings", value: snapshot.lineage.meetings, state: "meeting" as const, evidence: "Meeting or later", measured: true },
    { label: "Proposals", value: snapshot.lineage.proposals, state: "proposal" as const, evidence: "Proposal or later", measured: true },
    { label: "Won", value: snapshot.lineage.won, state: "won" as const, evidence: "Conversion record", measured: true },
    { label: "Active clients", value: snapshot.lineage.activeClients, state: "client" as const, evidence: "Active portfolio", measured: true },
    { label: "Churned", value: snapshot.lineage.churnedClients, state: "churned" as const, evidence: "Closed portfolio", measured: true },
  ];
  return <section className="border-b border-[#62e8ff]/16 p-4 sm:p-5" aria-labelledby="lineage-heading">
    <Heading eyebrow="ACQUISITION LINEAGE · CI-01A" title="Attention to retained relationship" detail="Select a stage to filter the exact record ledger below. Ratios between adjacent stages are directional where sources use different windows." icon={<Target size={15} />} id="lineage-heading" />
    <div className="mt-4 grid grid-cols-2 border-l border-t border-[#62e8ff]/14 sm:grid-cols-3 xl:grid-cols-9">
      {points.map((point, index) => {
        const previous = points[index - 1];
        const progression = point.measured && point.value !== null && previous?.measured && previous.value ? point.value / previous.value * 100 : null;
        const detail = index === 0
          ? point.measured ? "Estate exposure" : "Nothing monitored yet"
          : !point.measured ? "Not measured — no Aqua Tag reading"
          : previous && !previous.measured ? "Prior stage not monitored"
          : progression === null ? "No prior sample" : `${Math.round(progression)}% from prior`;
        return <button key={point.label} onClick={() => onState(point.state)} className="group relative min-h-[112px] border-b border-r border-[#62e8ff]/14 p-3 text-left hover:bg-[#62e8ff]/[0.06]">
          <span className="text-[7px] font-semibold uppercase text-white/28">{String(index + 1).padStart(2, "0")} · {point.evidence}</span><strong className={`mt-2 block text-2xl tabular-nums ${point.measured ? "text-white/82" : "text-white/38"}`}>{point.measured && point.value !== null ? point.value.toLocaleString() : "—"}</strong><span className="mt-1 block text-[10px] font-semibold text-[#8ef1ff]">{point.label}</span><span className="mt-2 block text-[8px] text-white/26">{detail}</span>
          {index < points.length - 1 ? <ArrowRight size={12} className="absolute right-[-7px] top-1/2 z-10 hidden -translate-y-1/2 bg-[#020b11] text-[#62e8ff]/40 xl:block" /> : null}
        </button>;
      })}
    </div>
  </section>;
}

function StageWatch({ snapshot, onStage }: { snapshot: CommercialIntelligenceSnapshot; onStage: (value: string) => void }) {
  return <section className="border-b border-[#62e8ff]/16 p-4 sm:p-5 xl:border-b-0 xl:border-r" aria-labelledby="stage-watch-heading">
    <Heading eyebrow="PIPELINE OCCUPANCY · CI-03" title="Stage pressure and ageing" detail="Current card position, share, progression and records stationary for fourteen days." icon={<GitBranch size={15} />} id="stage-watch-heading" />
    <div className="mt-4 border border-[#62e8ff]/14">{snapshot.stages.map(stage => <button key={stage.id} onClick={() => onStage(stage.id)} className="grid min-h-[66px] w-full grid-cols-[minmax(0,1fr)_52px_64px_64px] items-center border-b border-[#62e8ff]/10 px-3 text-left last:border-b-0 hover:bg-[#62e8ff]/[0.055]">
      <span className="min-w-0"><strong className="block truncate text-[11px] text-white/68">{String(stage.order + 1).padStart(2, "0")} · {stage.label}</strong><span className="mt-1 block h-1 bg-white/[0.04]"><span className="block h-full bg-[#62e8ff]/70" style={{ width: `${Math.min(100, stage.sharePercent ?? 0)}%` }} /></span></span>
      <span className="text-right text-xs font-semibold tabular-nums text-[#62e8ff]">{stage.leadCount}</span>
      <span className="text-right text-[8px] text-white/38">{stage.conversionToNextPercent === null ? "terminal" : `${stage.conversionToNextPercent}% next`}</span>
      <span className={`text-right text-[8px] ${stage.staleCount ? "text-red-300" : "text-white/30"}`}>{stage.staleCount} stale</span>
    </button>)}</div>
    {!snapshot.stages.length ? <p className="mt-4 border border-amber-300/20 bg-amber-300/[0.04] p-4 text-[10px] text-amber-100/60">The lead pipeline is not connected, so occupancy cannot be proven.</p> : null}
  </section>;
}

function SourceMatrix({ snapshot, currency, onSource }: { snapshot: CommercialIntelligenceSnapshot; currency: string; onSource: (value: string) => void }) {
  return <section className="min-w-0 p-4 sm:p-5" aria-labelledby="source-matrix-heading">
    <Heading eyebrow="SOURCE ECONOMICS · CI-04" title="Acquisition source matrix" detail="Lead flow, decisions, client retention and recorded campaign economics on one comparable ledger." icon={<Database size={15} />} id="source-matrix-heading" />
    <div className="mt-4 overflow-x-auto border border-[#62e8ff]/14"><table className="w-full min-w-[910px] border-collapse text-left text-[9px]"><thead><tr className="border-b border-[#62e8ff]/14 bg-[#62e8ff]/[0.035] text-[7px] uppercase text-white/30"><th className="px-3 py-3">Source / campaign</th><th>Leads</th><th>Open</th><th>Won</th><th>Lost</th><th>Conversion</th><th>Win rate</th><th>Retention</th><th>CPL</th><th>CAC</th><th>ROAS</th><th /></tr></thead><tbody>{snapshot.sources.map(source => <tr key={source.id} className="border-b border-[#62e8ff]/10 text-white/55 hover:bg-[#62e8ff]/[0.045]"><td className="px-3 py-3"><button onClick={() => onSource(source.label)} className="max-w-[180px] text-left"><strong className="block truncate text-[10px] text-white/72">{source.label}</strong><span className="block truncate text-[8px] text-[#8ec9d5]/35">{source.campaignName ?? source.channel ?? "Source cohort"}</span></button></td><td>{source.leads}</td><td>{source.open}</td><td>{source.won}</td><td>{source.lost}</td><td>{percent(source.conversionRatePercent)}</td><td>{percent(source.decisionWinRatePercent)}</td><td>{percent(source.retentionRatePercent)}</td><td>{moneyOrDash(source.costPerLeadCents, currency)}</td><td>{moneyOrDash(source.acquisitionCostCents, currency)}</td><td>{source.roas === null ? "—" : `${source.roas.toFixed(2)}×`}</td><td><Link href={source.href} title="Open source record" className="grid size-7 place-items-center text-[#62e8ff]/45 hover:text-white"><ArrowUpRight size={12} /></Link></td></tr>)}</tbody></table></div>
    {!snapshot.sources.length ? <p className="mt-4 text-[10px] text-white/35">No retained lead sources or campaign source keys are available yet.</p> : null}
  </section>;
}

function RecordLedger({ snapshot, rows, query, sourceFilter, stageFilter, stateFilter, onQuery, onSource, onStage, onState }: { snapshot: CommercialIntelligenceSnapshot; rows: CommercialPersonRow[]; query: string; sourceFilter: string; stageFilter: string; stateFilter: RecordStateFilter; onQuery: (value: string) => void; onSource: (value: string) => void; onStage: (value: string) => void; onState: (value: RecordStateFilter) => void }) {
  const sources = [...new Set(snapshot.people.map(row => row.source))].sort();
  const states = [...new Set(snapshot.people.map(row => row.state))].sort() as CommercialRecordState[];
  return <section aria-labelledby="record-ledger-heading">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#62e8ff]/12 px-4 py-4 sm:px-5"><Heading eyebrow="PERSON-LEVEL EVIDENCE · CI-05" title="Customer and lead ledger" detail="Who entered, where they came from, their exact stage, response clock, touches and client outcome." icon={<UsersRound size={15} />} id="record-ledger-heading" /><div className="text-right"><strong className="block text-lg text-[#62e8ff]">{rows.length}/{snapshot.people.length}</strong><span className="text-[8px] uppercase text-white/30">records shown</span></div></div>
    <div className="grid border-b border-[#62e8ff]/12 xl:grid-cols-[minmax(260px,1fr)_repeat(3,minmax(150px,.35fr))]">
      <label className="flex min-h-11 items-center gap-2 border-b border-r border-[#62e8ff]/12 px-3 xl:border-b-0"><Search size={14} className="text-[#62e8ff]/50" /><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Search person, message identity, company, source or tag" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/25" /></label>
      <SelectFilter label="Source" value={sourceFilter} onChange={onSource} options={[{ value: "all", label: "All sources" }, ...sources.map(value => ({ value, label: value }))]} />
      <SelectFilter label="Stage" value={stageFilter} onChange={onStage} options={[{ value: "all", label: "All stages" }, ...snapshot.stages.map(stage => ({ value: stage.id, label: stage.label }))]} />
      <SelectFilter label="State" value={stateFilter} onChange={value => onState(value as RecordStateFilter)} options={[{ value: "all", label: "All outcomes" }, ...states.map(value => ({ value, label: titleCase(value) }))]} />
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[1080px] border-collapse text-left text-[9px]"><thead><tr className="border-b border-[#62e8ff]/14 bg-[#62e8ff]/[0.025] text-[7px] uppercase text-white/28"><th className="px-4 py-3">Person</th><th>Source lineage</th><th>Pipeline</th><th>Entered</th><th>Response</th><th>Touches</th><th>Enquiries</th><th>Conversion</th><th>Client status</th><th /></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-[#62e8ff]/10 text-white/52 hover:bg-[#62e8ff]/[0.04]"><td className="px-4 py-3"><strong className="block max-w-[190px] truncate text-[10px] text-white/75">{row.name}</strong><span className="block max-w-[190px] truncate text-[8px] text-white/27">{row.email} · {row.company}</span></td><td><span className="block max-w-[160px] truncate">{row.source}</span><span className="block max-w-[160px] truncate text-[8px] text-[#8ec9d5]/35">{row.campaignName ?? "No campaign link"}</span></td><td><span className={`inline-flex border px-2 py-1 text-[7px] font-semibold uppercase ${stateClass(row.state)}`}>{row.stageLabel}</span></td><td>{formatAge(row.capturedAt)}</td><td>{row.responseMs === null ? <span className="text-amber-300/65">No sample</span> : formatDuration(row.responseMs)}</td><td>{row.touchCount}</td><td>{row.enquiryCount}</td><td>{row.timeToConversionMs === null ? "—" : formatDuration(row.timeToConversionMs)}</td><td>{row.clientStatus ?? titleCase(row.state)}</td><td><Link href={row.href} title={`Open ${row.name}`} className="grid size-7 place-items-center text-[#62e8ff]/45 hover:text-white"><ArrowUpRight size={12} /></Link></td></tr>)}</tbody></table></div>
    {!rows.length ? <div className="p-10 text-center"><Filter className="mx-auto text-[#62e8ff]/35" size={20} /><p className="mt-2 text-xs text-white/55">No exact records match these filters.</p><button onClick={() => { onQuery(""); onSource("all"); onStage("all"); onState("all"); }} className="mt-3 border border-[#62e8ff]/18 px-3 py-2 text-[8px] font-semibold uppercase text-[#8ef1ff]">Clear filters</button></div> : null}
  </section>;
}

function FormulaInspector({ metric, currency, onClose }: { metric: CommercialFormulaMetric; currency: string; onClose: () => void }) {
  // Modal keyboard contract: focus enters the inspector, Tab stays inside, Escape closes, focus returns to the metric that opened it.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: onClose });
  return <div className="fixed inset-0 z-[90] bg-black/55 backdrop-blur-[2px]" role="dialog" ref={dialogRef} aria-modal="true" aria-labelledby="formula-inspector-title" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><aside className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-[#62e8ff]/24 bg-[#020b11] shadow-[-24px_0_60px_rgba(0,0,0,.45)]">
    <div className="flex items-start justify-between gap-3 border-b border-[#62e8ff]/16 p-4 sm:p-5"><div><p className={`text-[8px] font-semibold uppercase ${statusText(metric.status)}`}>{metric.category} · {metric.status}</p><h3 id="formula-inspector-title" className="mt-1 text-lg font-semibold text-white">{metric.label}</h3><p className="mt-1 text-[10px] leading-4 text-white/38">{metric.detail}</p></div><button onClick={onClose} title="Close formula inspector" className="grid size-9 shrink-0 place-items-center border border-[#62e8ff]/18 text-white/50 hover:text-white"><X size={15} /></button></div>
    <div className="flex-1 overflow-y-auto p-4 sm:p-5">
      <div className="grid grid-cols-2 border-l border-t border-[#62e8ff]/14"><InspectorValue label="Current result" value={metric.unit === "currency" && metric.value !== null ? moneyOrDash(metric.value, currency) : metric.display} tone={statusText(metric.status)} /><InspectorValue label="Target / guardrail" value={metric.target} tone="text-[#e5c479]" /><InspectorValue label="Numerator" value={metric.numerator === undefined ? "Direct measurement" : metric.numerator.toLocaleString()} tone="text-white/72" /><InspectorValue label="Denominator" value={metric.denominator === undefined ? "Not applicable" : metric.denominator.toLocaleString()} tone="text-white/72" /></div>
      <InspectorSection icon={<Calculator size={14} />} label="Exact formula"><p className="text-sm font-semibold leading-6 text-white/78">{metric.formula}</p></InspectorSection>
      <InspectorSection icon={<Database size={14} />} label="Evidence source"><p className="text-xs leading-5 text-white/55">{metric.source}</p><ul className="mt-3 space-y-2">{metric.evidence.map(item => <li key={item} className="flex gap-2 text-[10px] leading-4 text-white/38"><CheckCircle2 size={12} className="mt-0.5 shrink-0 text-[#68f5d0]" />{item}</li>)}</ul></InspectorSection>
      <InspectorSection icon={<ShieldCheck size={14} />} label="Interpretation"><p className="text-xs leading-5 text-white/55">{metric.status === "learning" ? "The formula is installed, but its minimum evidence or required monetary values are not present yet. Learning is not a pass." : metric.status === "critical" ? "This result is outside the critical guardrail and needs a named action or approved exception." : metric.status === "warning" ? "This result is outside the target range and should remain on watch." : "The current measured result satisfies its configured guardrail."}</p></InspectorSection>
    </div>
    <div className="grid grid-cols-2 border-t border-[#62e8ff]/16"><button onClick={onClose} className="min-h-12 border-r border-[#62e8ff]/14 text-[9px] font-semibold uppercase text-white/45 hover:text-white">Close</button><Link href={metric.href} className="flex min-h-12 items-center justify-center gap-2 bg-[#62e8ff]/[0.07] text-[9px] font-semibold uppercase text-[#8ef1ff] hover:bg-[#62e8ff]/[0.12]">Open operating record <ArrowUpRight size={12} /></Link></div>
  </aside></div>;
}

function Heading({ eyebrow, title, detail, icon, id }: { eyebrow: string; title: string; detail: string; icon: React.ReactNode; id?: string }) { return <div className="flex min-w-0 items-start gap-2.5"><span className="grid size-8 shrink-0 place-items-center border border-[#62e8ff]/18 bg-[#62e8ff]/[0.055] text-[#62e8ff]">{icon}</span><div className="min-w-0"><p className="text-[7px] font-semibold uppercase text-[#76dff1]/50">{eyebrow}</p><h3 id={id} className="mt-0.5 text-sm font-semibold text-white/82">{title}</h3><p className="mt-0.5 text-[9px] leading-4 text-white/30">{detail}</p></div></div>; }
function QualityReadout({ label, value, status }: { label: string; value: string; status: CommandKpiStatus }) { return <div className="min-h-[92px] border-b border-r border-[#62e8ff]/12 p-3 xl:border-b-0"><p className="text-[7px] font-semibold uppercase text-white/28">{label}</p><p className={`mt-2 text-xl font-semibold tabular-nums ${statusText(status)}`}>{value}</p><p className="mt-1 text-[7px] uppercase text-white/22">{status}</p></div>; }
function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <label className="flex min-h-11 items-center gap-2 border-b border-r border-[#62e8ff]/12 px-3 xl:border-b-0"><span className="shrink-0 text-[7px] font-semibold uppercase text-white/25">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="min-w-0 flex-1 bg-[#020b11] text-[10px] font-semibold text-white/65 outline-none">{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function InspectorValue({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="min-h-[92px] border-b border-r border-[#62e8ff]/14 p-3"><p className="text-[7px] font-semibold uppercase text-white/28">{label}</p><p className={`mt-2 text-lg font-semibold tabular-nums ${tone}`}>{value}</p></div>; }
function InspectorSection({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) { return <section className="border-b border-[#62e8ff]/14 py-5"><h4 className="flex items-center gap-2 text-[8px] font-semibold uppercase text-[#8ec9d5]/55">{icon}{label}</h4><div className="mt-3">{children}</div></section>; }
function coverageStatus(value: number | null): CommandKpiStatus { if (value === null) return "learning"; if (value >= 95) return "healthy"; if (value >= 70) return "warning"; return "critical"; }
function statusText(status: CommandKpiStatus): string { if (status === "critical") return "text-red-300"; if (status === "warning") return "text-amber-300"; if (status === "healthy") return "text-[#68f5d0]"; if (status === "learning") return "text-sky-300"; return "text-white/38"; }
function stateClass(state: CommercialRecordState): string { if (state === "lost" || state === "churned") return "border-red-300/20 bg-red-300/[0.05] text-red-200"; if (state === "won" || state === "client") return "border-[#68f5d0]/20 bg-[#68f5d0]/[0.05] text-[#91f4dc]"; if (state === "proposal" || state === "meeting") return "border-amber-300/20 bg-amber-300/[0.05] text-amber-200"; return "border-[#62e8ff]/20 bg-[#62e8ff]/[0.05] text-[#8ef1ff]"; }
function percent(value: number | null): string { return value === null ? "No sample" : `${Math.round(value * 10) / 10}%`; }
function moneyOrDash(value: number | null, currency: string): string { return value === null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(value / 100); }
function formatDuration(value: number): string { if (value < 60_000) return `${Math.round(value / 1_000)}s`; if (value < 3_600_000) return `${Math.round(value / 60_000)}m`; if (value < 86_400_000) return `${Math.round(value / 3_600_000 * 10) / 10}h`; return `${Math.round(value / 86_400_000 * 10) / 10}d`; }
function formatAge(value: number): string { const elapsed = Math.max(0, Date.now() - value); return elapsed < 60_000 ? "Now" : elapsed < 3_600_000 ? `${Math.floor(elapsed / 60_000)}m` : elapsed < 86_400_000 ? `${Math.floor(elapsed / 3_600_000)}h` : `${Math.floor(elapsed / 86_400_000)}d`; }
function titleCase(value: string): string { return value.replace(/[-_]/g, " ").replace(/\b\w/g, match => match.toUpperCase()); }
