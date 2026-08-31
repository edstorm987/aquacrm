"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  AreaChart,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Crosshair,
  Database,
  Gauge,
  Globe2,
  Info,
  LineChart,
  MapPin,
  Megaphone,
  Radar,
  Route,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import type {
  CommandAudienceSignal,
  CommandAudienceDemographic,
  CommandAudienceProfileSummary,
  CommandIntelligenceCampaign,
  CommandIntelligenceScope,
  CommandIntelligenceSnapshot,
  CommandKpi,
  CommandKpiFormat,
  CommandKpiStatus,
} from "@/lib/intelligence/commandIntelligence";
import { dateInputValue, formatUkDate } from "@/lib/shared/formatDateTime";
import { describeCommandKpis, describeCommercialFormulas, describeCustomKpis, searchKpiDescriptors, suggestKpiTarget, type KpiDescriptor } from "@/lib/performance/kpiRegistry";
import {
  KpiTargetRequestError,
  kpiPlanOverridesFromConfig,
  submitKpiTargetMutation,
  type KpiPlanOverride,
  type KpiPlanOverrides,
} from "@/lib/performance/kpiTargetClient";
import type { CustomKpiDefinition, CustomKpiOp, KpiTargetsConfig } from "@/server/types";
import { applyIntelligenceScope } from "./commandIntelligenceScope";
import { PortalViewportLoading } from "@/components/ui/PortalViewportLoading";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

export { applyIntelligenceScope };

const CommercialIntelligenceWorkspace = dynamic(
  () => import("./_CommercialIntelligenceWorkspace").then(module => module.CommercialIntelligenceWorkspace),
  { loading: () => <PortalViewportLoading label="Preparing commercial intelligence…" /> },
);

export type IntelligenceView = "overview" | "lifecycle" | "campaigns" | "audiences" | "kpis" | "compare";
type KpiDomainFilter = string;
type KpiSort = "rank" | "attention" | "name" | "freshness";

export function CommandIntelligenceWorkspace({ snapshot, initialView = "overview", initialKpiIds = [], initialScopeId = "ecosystem", initialCommercialFocus }: { snapshot: CommandIntelligenceSnapshot; initialView?: IntelligenceView; initialKpiIds?: string[]; initialScopeId?: string; initialCommercialFocus?: { metricId?: string; recordId?: string; sourceId?: string; stageId?: string } }) {
  const [view, setView] = useState<IntelligenceView>(initialView);
  const [selectedKpi, setSelectedKpi] = useState<CommandKpi | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<CommandAudienceProfileSummary | null>(null);
  const [domainFilter, setDomainFilter] = useState<KpiDomainFilter>("all");
  const [statusFilter, setStatusFilter] = useState<CommandKpiStatus | "all">("all");
  const [kpiQuery, setKpiQuery] = useState("");
  const [kpiSort, setKpiSort] = useState<KpiSort>("rank");
  const [scopeId, setScopeId] = useState(snapshot.scopes.some(scope => scope.id === initialScopeId) ? initialScopeId : "ecosystem");
  const selectedScope = snapshot.scopes.find(scope => scope.id === scopeId) ?? snapshot.scopes[0] ?? fallbackIntelligenceScope();
  const scopedSnapshot = useMemo(() => applyIntelligenceScope(snapshot, selectedScope), [selectedScope, snapshot]);
  const filteredKpis = useMemo(() => scopedSnapshot.kpis.filter(kpi => {
    const query = kpiQuery.trim().toLowerCase();
    return (domainFilter === "all" || kpi.domain === domainFilter)
      && (statusFilter === "all" || kpi.status === statusFilter)
      && (!query || `${kpi.label} ${kpi.shortLabel} ${kpi.detail} ${kpi.sourceId} ${kpi.scope.label} ${kpi.measurement.unit} ${kpi.measurement.basis} ${kpi.measurement.window} ${kpi.measurement.formula}`.toLowerCase().includes(query));
  }).sort((left, right) => kpiSort === "attention"
    ? statusSort(left.status) - statusSort(right.status) || left.rank - right.rank
    : kpiSort === "name"
      ? left.label.localeCompare(right.label)
      : kpiSort === "freshness"
        ? right.measuredAt - left.measuredAt
        : left.rank - right.rank), [domainFilter, kpiQuery, kpiSort, scopedSnapshot.kpis, statusFilter]);

  useEffect(() => {
    setSelectedKpi(null);
    setDomainFilter("all");
    setStatusFilter("all");
  }, [scopeId]);

  return <div className="mm-intelligence-workspace min-h-full text-white">
    <div className="border-b border-[#62e8ff]/16 bg-[#031018] px-3 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center border border-[#62e8ff]/28 bg-[#62e8ff]/[0.07] text-[#62e8ff]"><BarChart3 size={16} /></span>
          <div className="min-w-0"><p className="text-[8px] font-semibold uppercase text-[#76dff1]/55">INT-20 · Decision intelligence array</p><h2 className="truncate text-sm font-semibold text-white">Twenty KPIs, campaigns and customer intelligence</h2></div>
        </div>
        <div className="flex items-center gap-4 text-[8px] font-semibold uppercase text-[#8ec9d5]/50">
          <span><strong className="block text-right text-[11px] text-[#62e8ff]">{scopedSnapshot.summary.connectedKpis}/{scopedSnapshot.kpis.length}</strong>KPIs connected</span>
          <span><strong className="block text-right text-[11px] text-[#68f5d0]">{formatShortTime(scopedSnapshot.generatedAt)}</strong>Last computed</span>
        </div>
      </div>
    </div>

    <IntelligenceScopeBar scopes={snapshot.scopes} selected={selectedScope} availableKpis={scopedSnapshot.kpis.length} onSelect={setScopeId} />

    <nav className="grid grid-cols-2 border-b border-[#62e8ff]/16 bg-[#020b11] sm:grid-cols-3 xl:grid-cols-6" aria-label="KPI Intelligence views">
      <ViewButton active={view === "overview"} icon={<Radar size={14} />} label="Overview" detail="Decision picture" onClick={() => setView("overview")} />
      <ViewButton active={view === "lifecycle"} icon={<Route size={14} />} label="Lifecycle" detail={`${snapshot.commercialIntelligence.people.length} people traced`} onClick={() => setView("lifecycle")} />
      <ViewButton active={view === "campaigns"} icon={<Megaphone size={14} />} label="Campaigns" detail={`${scopedSnapshot.campaigns.length} tracked`} onClick={() => setView("campaigns")} />
      <ViewButton active={view === "audiences"} icon={<Globe2 size={14} />} label="Audiences" detail={`${scopedSnapshot.summary.audienceProfiles} profiles`} onClick={() => setView("audiences")} />
      <ViewButton active={view === "kpis"} icon={<Gauge size={14} />} label="Top 20" detail={`${scopedSnapshot.summary.criticalKpis + scopedSnapshot.summary.warningKpis} need attention`} onClick={() => setView("kpis")} />
      <ViewButton active={view === "compare"} icon={<LineChart size={14} />} label="Compare" detail="Custom multi-KPI graph" onClick={() => setView("compare")} />
    </nav>

    {view === "overview" ? <OverviewView snapshot={scopedSnapshot} onInspect={setSelectedKpi} onOpenView={setView} /> : null}
    {view === "lifecycle" ? <CommercialIntelligenceWorkspace snapshot={snapshot.commercialIntelligence} currency={snapshot.currency} initialMetricId={initialCommercialFocus?.metricId} initialRecordId={initialCommercialFocus?.recordId} initialSourceId={initialCommercialFocus?.sourceId} initialStageId={initialCommercialFocus?.stageId} /> : null}
    {view === "campaigns" ? <CampaignsView snapshot={scopedSnapshot} /> : null}
    {view === "audiences" ? <AudiencesView snapshot={scopedSnapshot} onInspectProfile={setSelectedProfile} /> : null}
    {view === "kpis" ? <TopKpisView snapshot={scopedSnapshot} rows={filteredKpis} domainFilter={domainFilter} statusFilter={statusFilter} query={kpiQuery} sort={kpiSort} onDomainFilter={setDomainFilter} onStatusFilter={setStatusFilter} onQuery={setKpiQuery} onSort={setKpiSort} onInspect={setSelectedKpi} /> : null}
    {view === "compare" ? <KpiComparisonWorkspace snapshot={scopedSnapshot} initialKpiIds={initialKpiIds} onInspect={setSelectedKpi} /> : null}
    {selectedKpi ? <KpiInspector kpi={selectedKpi} currency={scopedSnapshot.currency} onClose={() => setSelectedKpi(null)} /> : null}
    {selectedProfile ? <AudienceProfileInspector profile={selectedProfile} onClose={() => setSelectedProfile(null)} /> : null}
  </div>;
}

function IntelligenceScopeBar({ scopes, selected, availableKpis, onSelect }: { scopes: CommandIntelligenceScope[]; selected: CommandIntelligenceScope; availableKpis: number; onSelect: (id: string) => void }) {
  const grouped = [
    { label: "Whole estate", kinds: ["ecosystem"] },
    { label: "Workspace", kinds: ["workspace"] },
    { label: "Owned companies", kinds: ["company"] },
    { label: "Clients", kinds: ["client"] },
    { label: "Websites and properties", kinds: ["property"] },
  ] as const;
  const isExactScope = !selected.inheritGlobalKpis;
  return <section className="grid border-b border-[#62e8ff]/16 bg-[#020b11] lg:grid-cols-[minmax(270px,.72fr)_minmax(0,1.28fr)_auto] lg:items-stretch" aria-labelledby="intelligence-scope-heading">
    <label className="border-b border-[#62e8ff]/12 p-3 lg:border-b-0 lg:border-r sm:p-4">
      <span className="flex items-center gap-2 text-[8px] font-semibold uppercase text-[#76dff1]/55"><Crosshair size={12} /> Intelligence scope</span>
      <select aria-label="Intelligence scope" value={selected.id} onChange={event => onSelect(event.target.value)} className="mt-2 min-h-10 w-full border border-[#62e8ff]/22 bg-[#031018] px-3 text-xs font-semibold text-white outline-none focus:border-[#62e8ff]/60">
        {grouped.map(group => {
          const options = scopes.filter(scope => (group.kinds as readonly string[]).includes(scope.kind));
          return options.length ? <optgroup key={group.label} label={group.label}>{options.map(scope => <option key={scope.id} value={scope.id}>{scope.label}</option>)}</optgroup> : null;
        })}
      </select>
    </label>
    <div className="min-w-0 border-b border-[#62e8ff]/12 px-3 py-3 lg:border-b-0 lg:border-r sm:px-4">
      <div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center border border-[#68f5d0]/22 bg-[#68f5d0]/[0.055] text-[#68f5d0]">{selected.kind === "property" ? <Globe2 size={14} /> : <Database size={14} />}</span><div className="min-w-0"><p id="intelligence-scope-heading" className="truncate text-xs font-semibold text-white/82">{selected.label}</p><p className="mt-1 text-[9px] leading-4 text-white/35">{selected.detail}</p></div></div>
    </div>
    <div className="flex min-w-[220px] items-center justify-between gap-4 px-3 py-3 sm:px-4">
      <div><p className="text-[7px] font-semibold uppercase text-white/26">Measurable here</p><p className={`mt-1 text-lg font-semibold tabular-nums ${availableKpis ? "text-[#62e8ff]" : "text-amber-300"}`}>{availableKpis}/20 KPIs</p><p className="mt-0.5 text-[8px] text-white/28">{selected.propertyCount} {selected.propertyCount === 1 ? "property" : "properties"} · {isExactScope ? "exact evidence only" : "connected estate view"}</p></div>
      <div className="flex shrink-0 gap-1.5"><Link href={selected.href} title="Open this scope's operating record" className="grid size-8 place-items-center border border-[#62e8ff]/18 text-[#62e8ff]/60 hover:bg-[#62e8ff]/[0.07] hover:text-white"><ArrowUpRight size={13} /></Link>{selected.publicUrl ? <a href={selected.publicUrl} target="_blank" rel="noreferrer" title="Open the public website" className="grid size-8 place-items-center border border-[#68f5d0]/18 text-[#68f5d0]/60 hover:bg-[#68f5d0]/[0.07] hover:text-white"><Globe2 size={13} /></a> : null}</div>
    </div>
    {!availableKpis ? <div className="border-t border-amber-300/15 bg-amber-300/[0.035] px-4 py-2 text-[9px] leading-4 text-amber-100/60 lg:col-span-3">No KPI evidence is linked to this scope yet. Its company or client record is real, but Radar will not borrow Aqua-wide figures and present them as local truth.</div> : null}
  </section>;
}

function fallbackIntelligenceScope(): CommandIntelligenceScope {
  return { id: "ecosystem", label: "Whole Aqua ecosystem", kind: "ecosystem", detail: "All connected Aqua business systems combined.", href: "/portal/agency", propertyCount: 0, inheritGlobalKpis: true, readings: [] };
}

function OverviewView({ snapshot, onInspect, onOpenView }: { snapshot: CommandIntelligenceSnapshot; onInspect: (kpi: CommandKpi) => void; onOpenView: (view: IntelligenceView) => void }) {
  return <div>
    <section className="grid grid-cols-2 border-b border-[#62e8ff]/16 bg-[#031018] sm:grid-cols-5" aria-label="KPI watch summary">
      <SummaryReadout label="Connected" value={`${snapshot.summary.connectedKpis}/20`} tone="cyan" />
      <SummaryReadout label="Critical" value={String(snapshot.summary.criticalKpis)} tone={snapshot.summary.criticalKpis ? "red" : "green"} />
      <SummaryReadout label="Warning" value={String(snapshot.summary.warningKpis)} tone={snapshot.summary.warningKpis ? "amber" : "green"} />
      <SummaryReadout label="Learning" value={String(snapshot.summary.learningKpis)} tone="blue" />
      <SummaryReadout label="Blind" value={String(snapshot.summary.blindKpis)} tone={snapshot.summary.blindKpis ? "amber" : "green"} />
    </section>

    <div className="grid border-b border-[#62e8ff]/16 xl:grid-cols-[minmax(340px,.92fr)_minmax(380px,1.08fr)]">
      <section className="min-w-0 border-b border-[#62e8ff]/16 p-4 sm:p-5 xl:border-b-0 xl:border-r" aria-labelledby="intelligence-compass-heading">
        <SectionHeading titleId="intelligence-compass-heading" eyebrow="NORTH STAR ARRAY · INT-20A" title="Decision compass" detail="Status-normalised command readiness across the core business systems." icon={<Crosshair size={15} />} />
        <BusinessCompass kpis={snapshot.kpis} />
      </section>
      <section className="min-w-0 p-4 sm:p-5" aria-labelledby="demand-flow-heading">
        <SectionHeading titleId="demand-flow-heading" eyebrow="DEMAND FLOW · INT-20B" title="Attention to retained customer" detail="Current acquisition evidence from monitored traffic through to active clients." icon={<Route size={15} />} />
        <DemandFlow snapshot={snapshot} />
        <div className="mt-4 grid grid-cols-2 gap-px border border-[#62e8ff]/15 bg-[#62e8ff]/15 sm:grid-cols-4">
          {snapshot.kpis.filter(kpi => ["speed-to-lead", "lead-conversion", "source-attribution", "website-conversion"].includes(kpi.id)).map(kpi => <button key={kpi.id} onClick={() => onInspect(kpi)} className="min-w-0 bg-[#020b11] px-3 py-3 text-left hover:bg-[#62e8ff]/[0.055]"><span className="block truncate text-[8px] font-semibold uppercase text-[#8ec9d5]/45">{kpi.shortLabel}</span><span className={`mt-1 block text-lg font-semibold tabular-nums ${statusText(kpi.status)}`}>{kpi.display}</span></button>)}
        </div>
      </section>
    </div>

    <section className="border-b border-[#62e8ff]/16" aria-labelledby="priority-kpis-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#62e8ff]/12 px-4 py-3 sm:px-5">
        <SectionHeading titleId="priority-kpis-heading" eyebrow="PRIMARY INSTRUMENTS" title="Highest-signal KPIs" detail="Open an instrument for its target, evidence, source and retained history." icon={<Target size={15} />} compact />
        <button onClick={() => onOpenView("kpis")} className="inline-flex min-h-8 items-center gap-1.5 border border-[#62e8ff]/18 px-2.5 text-[9px] font-semibold uppercase text-[#8ef1ff] hover:bg-[#62e8ff]/[0.06]">All twenty <ArrowUpRight size={11} /></button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        {snapshot.kpis.slice(0, 10).map(kpi => <KpiInstrument key={kpi.id} kpi={kpi} onClick={() => onInspect(kpi)} />)}
      </div>
    </section>

    <div className="grid xl:grid-cols-2">
      <section className="min-w-0 border-b border-[#62e8ff]/16 p-4 sm:p-5 xl:border-b-0 xl:border-r">
        <div className="flex items-start justify-between gap-3"><SectionHeading eyebrow="CAMPAIGN WATCH" title="Marketing mission control" detail="Spend, attributed return and current campaign activity." icon={<Megaphone size={15} />} /><button onClick={() => onOpenView("campaigns")} className="shrink-0 text-[8px] font-semibold uppercase text-[#e5c479] hover:text-white">Open station</button></div>
        <CampaignPortfolioSummary snapshot={snapshot} />
      </section>
      <section className="min-w-0 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3"><SectionHeading eyebrow="AUDIENCE WATCH" title="Customer intelligence" detail="Validated profiles, mapped markets and leading interest signals." icon={<UsersRound size={15} />} /><button onClick={() => onOpenView("audiences")} className="shrink-0 text-[8px] font-semibold uppercase text-[#e5c479] hover:text-white">Open station</button></div>
        <AudienceMiniSummary snapshot={snapshot} />
      </section>
    </div>
  </div>;
}

function CampaignsView({ snapshot }: { snapshot: CommandIntelligenceSnapshot }) {
  const maximumSpend = Math.max(1, ...snapshot.campaigns.map(campaign => Math.max(campaign.budgetCents, campaign.spendCents)));
  return <div>
    <div className="grid grid-cols-2 border-b border-[#62e8ff]/16 sm:grid-cols-4">
      <SummaryReadout label="Active" value={String(snapshot.summary.activeCampaigns)} tone="cyan" />
      <SummaryReadout label="Spend" value={money(snapshot.summary.campaignSpendCents, snapshot.currency)} tone="amber" />
      <SummaryReadout label="Attributed revenue" value={money(snapshot.summary.campaignRevenueCents, snapshot.currency)} tone="green" />
      <SummaryReadout label="Portfolio ROAS" value={snapshot.summary.portfolioRoas === null ? "Learning" : `${snapshot.summary.portfolioRoas.toFixed(2)}x`} tone={snapshot.summary.portfolioRoas === null ? "blue" : snapshot.summary.portfolioRoas >= 3 ? "green" : snapshot.summary.portfolioRoas >= 1 ? "amber" : "red"} />
    </div>
    <section className="grid border-b border-[#62e8ff]/16 xl:grid-cols-[minmax(340px,.8fr)_minmax(420px,1.2fr)]">
      <div className="border-b border-[#62e8ff]/16 p-4 sm:p-5 xl:border-b-0 xl:border-r">
        <SectionHeading eyebrow="CAMPAIGN RANGE PLOT" title="Spend and return" detail="Each track compares recorded spend with attributed revenue." icon={<CircleDollarSign size={15} />} />
        <div className="mt-5 space-y-4">
          {snapshot.campaigns.slice(0, 8).map(campaign => <CampaignRange key={campaign.id} campaign={campaign} maximum={Math.max(maximumSpend, campaign.attributedRevenueCents)} currency={snapshot.currency} />)}
          {!snapshot.campaigns.length ? <EmptyEvidence title="No campaigns recorded" detail="Create a campaign and connect its audience, budget and source key to activate this plot." href="/portal/agency/marketing?view=campaigns" linkLabel="Open campaigns" /> : null}
        </div>
      </div>
      <div className="min-w-0 p-4 sm:p-5">
        <SectionHeading eyebrow="MISSION LEDGER" title="Campaign readiness and outcomes" detail="Budget, execution steps, audiences and acquisition results stay together." icon={<Database size={15} />} />
        <div className="mt-4 divide-y divide-[#62e8ff]/12 border-y border-[#62e8ff]/12">
          {snapshot.campaigns.map(campaign => <CampaignLedgerRow key={campaign.id} campaign={campaign} currency={snapshot.currency} />)}
          {!snapshot.campaigns.length ? <p className="py-10 text-center text-xs text-white/35">Campaign records will appear here as soon as the first draft is saved.</p> : null}
        </div>
      </div>
    </section>
    <section className="p-4 sm:p-5">
      <SectionHeading eyebrow="SOURCE OUTCOME MATRIX" title="Acquisition cohorts" detail="Conversion is only ranked once a source has enough retained evidence." icon={<BarChart3 size={15} />} />
      <SourceCohortChart snapshot={snapshot} />
    </section>
  </div>;
}

function AudiencesView({ snapshot, onInspectProfile }: { snapshot: CommandIntelligenceSnapshot; onInspectProfile: (profile: CommandAudienceProfileSummary) => void }) {
  const [signalCategory, setSignalCategory] = useState<CommandAudienceSignal["category"] | "all">("all");
  const signals = snapshot.audienceSignals.filter(signal => signalCategory === "all" || signal.category === signalCategory).slice(0, 12);
  return <div>
    <div className="grid grid-cols-2 border-b border-[#62e8ff]/16 sm:grid-cols-4">
      <SummaryReadout label="Profiles" value={String(snapshot.summary.audienceProfiles)} tone="cyan" />
      <SummaryReadout label="Validated" value={String(snapshot.summary.validatedProfiles)} tone="green" />
      <SummaryReadout label="Mapped markets" value={String(snapshot.summary.mappedLocations)} tone="blue" />
      <SummaryReadout label="Unmapped labels" value={String(snapshot.summary.unmappedLocations)} tone={snapshot.summary.unmappedLocations ? "amber" : "green"} />
    </div>
    <div className="grid border-b border-[#62e8ff]/16 xl:grid-cols-[minmax(420px,1.18fr)_minmax(330px,.82fr)]">
      <section className="min-w-0 border-b border-[#62e8ff]/16 p-4 sm:p-5 xl:border-b-0 xl:border-r">
        <SectionHeading eyebrow="GEO-DEMOGRAPHIC PLOT · AUD-01" title="Customer market map" detail="Locations come directly from saved customer profiles. Unknown labels remain visibly unmapped." icon={<Globe2 size={15} />} />
        <AudienceMap snapshot={snapshot} />
      </section>
      <section className="min-w-0 p-4 sm:p-5">
        <SectionHeading eyebrow="INTEREST SIGNAL BANK · AUD-02" title="What audiences care about" detail="Industries, goals, motivations, channels, content preferences and pain points." icon={<Target size={15} />} />
        <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
          {(["all", "industry", "goal", "motivation", "channel", "content", "pain"] as const).map(category => <button key={category} onClick={() => setSignalCategory(category)} className={`min-h-8 shrink-0 border px-2.5 text-[8px] font-semibold uppercase ${signalCategory === category ? "border-[#62e8ff]/45 bg-[#62e8ff]/12 text-[#8ef1ff]" : "border-[#62e8ff]/12 text-white/35 hover:text-white"}`}>{category}</button>)}
        </div>
        <SignalBank signals={signals} />
      </section>
    </div>
    <section className="border-b border-[#62e8ff]/16 p-4 sm:p-5">
      <SectionHeading eyebrow="DEMOGRAPHIC COMPOSITION · AUD-03" title="Who the profiles describe" detail="Age, language, life stage, income, company size, business stage and decision roles from saved evidence." icon={<UsersRound size={15} />} />
      <DemographicBank demographics={snapshot.audienceDemographics} />
    </section>
    <section className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><SectionHeading eyebrow="AUDIENCE PROFILES · AUD-04" title="Saved customer segments" detail="Open any profile to inspect every demographic, interest, objection and buying field." icon={<UsersRound size={15} />} /><Link href="/portal/agency/marketing?view=customer-profiles" className="inline-flex min-h-8 items-center gap-1.5 border border-[#62e8ff]/18 px-2.5 text-[9px] font-semibold uppercase text-[#8ef1ff] hover:bg-[#62e8ff]/[0.06]">Manage profiles <ArrowUpRight size={11} /></Link></div>
      <div className="mt-4 grid gap-px border border-[#62e8ff]/15 bg-[#62e8ff]/15 md:grid-cols-2 xl:grid-cols-3">
        {snapshot.audienceProfiles.map(profile => <button type="button" key={profile.id} onClick={() => onInspectProfile(profile)} className="group min-w-0 bg-[#020b11] p-4 text-left hover:bg-[#62e8ff]/[0.05]" aria-label={`Inspect audience profile ${profile.name}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-white/85">{profile.name}</p><p className="mt-1 truncate text-[9px] uppercase text-[#8ec9d5]/45">{profile.segment} · {profile.audienceType}</p></div><span className={`shrink-0 border px-2 py-1 text-[7px] font-semibold uppercase ${confidenceClass(profile.confidence)}`}>{profile.confidence}</span></div><div className="mt-3 flex flex-wrap gap-1.5">{profile.locations.slice(0, 3).map(value => <span key={value} className="border border-white/10 px-2 py-1 text-[8px] text-white/45">{value}</span>)}{profile.preferredChannels.slice(0, 2).map(value => <span key={value} className="border border-[#62e8ff]/12 px-2 py-1 text-[8px] text-[#8ec9d5]/60">{value}</span>)}</div><p className="mt-3 line-clamp-2 min-h-8 text-[10px] leading-4 text-white/38">{profile.topSignals.join(" · ") || "Add goals, motivations and content preferences to deepen this profile."}</p><span className="mt-3 inline-flex items-center gap-1 text-[8px] font-semibold uppercase text-[#62e8ff]/50 group-hover:text-[#8ef1ff]">Inspect full profile <ArrowUpRight size={9} /></span></button>)}
        {!snapshot.audienceProfiles.length ? <div className="md:col-span-2 xl:col-span-3"><EmptyEvidence title="No customer profiles yet" detail="Audience diagrams activate from the locations, industries, motivations and channel preferences you record." href="/portal/agency/marketing?view=customer-profiles" linkLabel="Create a customer profile" /></div> : null}
      </div>
    </section>
  </div>;
}

function TopKpisView({ snapshot, rows, domainFilter, statusFilter, query, sort, onDomainFilter, onStatusFilter, onQuery, onSort, onInspect }: { snapshot: CommandIntelligenceSnapshot; rows: CommandKpi[]; domainFilter: KpiDomainFilter; statusFilter: CommandKpiStatus | "all"; query: string; sort: KpiSort; onDomainFilter: (filter: KpiDomainFilter) => void; onStatusFilter: (filter: CommandKpiStatus | "all") => void; onQuery: (value: string) => void; onSort: (value: KpiSort) => void; onInspect: (kpi: CommandKpi) => void }) {
  const domains = [...new Set(snapshot.kpis.map(kpi => kpi.domain))];
  return <div>
    <div className="border-b border-[#62e8ff]/16 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[8px] font-semibold uppercase text-[#76dff1]/55">INT-20 · Authoritative instrument ledger</p><h2 className="mt-1 text-sm font-semibold text-white">Top twenty decision KPIs</h2></div><span className="inline-flex items-center gap-1.5 text-[8px] font-semibold uppercase text-[#62e8ff]/48"><SlidersHorizontal size={11} /> {rows.length} visible</span></div>
      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(120px,auto))_auto]">
        <label className="relative min-w-0"><span className="sr-only">Search KPIs</span><Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#62e8ff]/45" /><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Search names, units, formulas or sources" className="min-h-9 w-full border border-[#62e8ff]/15 bg-[#031018] pl-9 pr-3 text-[10px] text-white outline-none focus:border-[#62e8ff]/45" /></label>
        <label className="flex items-center gap-2 text-[8px] font-semibold uppercase text-white/35">System<select value={domainFilter} onChange={event => onDomainFilter(event.target.value as KpiDomainFilter)} className="min-h-9 min-w-0 flex-1 border border-[#62e8ff]/15 bg-[#031018] px-2 text-[10px] normal-case text-white"><option value="all">All systems</option>{domains.map(domain => <option key={domain} value={domain}>{domainLabel(domain)}</option>)}</select></label>
        <label className="flex items-center gap-2 text-[8px] font-semibold uppercase text-white/35">State<select value={statusFilter} onChange={event => onStatusFilter(event.target.value as CommandKpiStatus | "all")} className="min-h-8 border border-[#62e8ff]/15 bg-[#031018] px-2 text-[10px] normal-case text-white"><option value="all">All states</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="healthy">Healthy</option><option value="learning">Learning</option><option value="blind">Blind</option></select></label>
        <label className="flex items-center gap-2 text-[8px] font-semibold uppercase text-white/35">Sort<select value={sort} onChange={event => onSort(event.target.value as KpiSort)} className="min-h-9 border border-[#62e8ff]/15 bg-[#031018] px-2 text-[10px] normal-case text-white"><option value="rank">Executive rank</option><option value="attention">Attention first</option><option value="freshness">Freshest first</option><option value="name">Name</option></select></label>
        <button type="button" onClick={() => { onQuery(""); onDomainFilter("all"); onStatusFilter("all"); onSort("rank"); }} title="Reset KPI filters" className="grid size-9 place-items-center border border-[#62e8ff]/15 text-white/38 hover:bg-[#62e8ff]/[0.06] hover:text-white"><Trash2 size={13} /></button>
      </div>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {rows.map(kpi => <KpiInstrument key={kpi.id} kpi={kpi} onClick={() => onInspect(kpi)} expanded />)}
    </div>
    {!rows.length ? <div className="p-10 text-center text-xs text-white/35">No KPI matches the current system and state filters.</div> : null}
    <div className="border-t border-[#62e8ff]/16 px-4 py-3 text-[9px] leading-4 text-white/30 sm:px-5">Computed {formatDateTime(snapshot.generatedAt)}. Learning means the source is connected but the sample is immature. Blind means the source cannot currently prove the metric.</div>
  </div>;
}

type ComparisonMode = "plan" | "indexed" | "change" | "raw";
type KpiChartType = "line" | "area" | "bar";
export type ComparisonRange = "24h" | "7d" | "30d" | "90d" | "quarter" | "ytd" | "12m" | "all" | "custom";
type SavedComparisonView = { id: string; name: string; kpiIds: string[]; mode: ComparisonMode; range: ComparisonRange; start: string; end: string };
/** The shared half of saved views — agency-scoped rows from `/api/portal/kpi-registry/views`. */
type SharedKpiViewRow = { id: string; name: string; kpiIds: string[]; mode: ComparisonMode; range: ComparisonRange; start?: string; end?: string };
type KpiPlanDraft = {
  operationId: string;
  expectedUpdatedAt: number;
  action: "set" | "clear";
  override?: KpiPlanOverride;
  status: "pending" | "error";
  error?: string;
};

const COMPARISON_COLOURS = ["#62e8ff", "#68f5d0", "#fcd34d", "#f87171", "#a78bfa", "#fb7185", "#38bdf8", "#4ade80", "#f59e0b", "#c084fc", "#2dd4bf", "#fda4af", "#93c5fd", "#bef264", "#fdba74", "#e879f9", "#67e8f9", "#86efac", "#fde047", "#fca5a5"];
const SAVED_COMPARISON_KEY = "aqua:kpi-comparison-views:v1";

function kpiPlanOperationId(kpiId: string): string {
  const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `kpi-plan:${kpiId}:${nonce}`;
}

export function KpiComparisonWorkspace({ snapshot, initialKpiIds = [], initialRange = "30d", context = "operational", onInspect }: { snapshot: CommandIntelligenceSnapshot; initialKpiIds?: string[]; initialRange?: ComparisonRange; context?: "operational" | "strategic"; onInspect: (kpi: CommandKpi) => void }) {
  const [evidenceDescriptors, setEvidenceDescriptors] = useState<KpiDescriptor[]>([]);
  const [evidenceState, setEvidenceState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [customDefinitions, setCustomDefinitions] = useState<CustomKpiDefinition[]>([]);
  const [customForm, setCustomForm] = useState<{ label: string; numeratorId: string; denominatorId: string; op: CustomKpiOp }>({ label: "", numeratorId: "", denominatorId: "", op: "rate" });
  const baseDescriptors = useMemo(() => [...describeCommandKpis(snapshot), ...describeCommercialFormulas(snapshot), ...evidenceDescriptors], [snapshot, evidenceDescriptors]);
  const descriptors = useMemo(() => [...baseDescriptors, ...describeCustomKpis(customDefinitions, baseDescriptors)], [baseDescriptors, customDefinitions]);
  const defaultIds = initialKpiIds.filter(id => descriptors.some(descriptor => descriptor.id === id));
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultIds.length ? defaultIds : ["business-health", "revenue-target", "lead-conversion", "traffic-7d"]);
  const [mode, setMode] = useState<ComparisonMode>("plan");
  const [chartType, setChartType] = useState<KpiChartType>("line");
  const [range, setRange] = useState<ComparisonRange>(initialRange);
  const [customStart, setCustomStart] = useState(dateInput(snapshot.generatedAt - 30 * 86_400_000));
  const [customEnd, setCustomEnd] = useState(dateInput(snapshot.generatedAt));
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerDomain, setPickerDomain] = useState<KpiDomainFilter>("all");
  const [savedViews, setSavedViews] = useState<SavedComparisonView[]>([]);
  // Saved views are private AND shared by decision: private stays in this
  // browser's localStorage; shared persists agency-wide via kpi-registry/views.
  const [sharedViews, setSharedViews] = useState<SharedKpiViewRow[]>([]);
  const [savedScope, setSavedScope] = useState<"private" | "shared">("private");
  const [planOverrides, setPlanOverrides] = useState<KpiPlanOverrides>({});
  const [planConfigUpdatedAt, setPlanConfigUpdatedAt] = useState(0);
  const [planDrafts, setPlanDrafts] = useState<Record<string, KpiPlanDraft>>({});
  const [planLoadState, setPlanLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [planReloadToken, setPlanReloadToken] = useState(0);
  const [planMessage, setPlanMessage] = useState("");
  const [viewName, setViewName] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const availableKpiKey = descriptors.map(descriptor => descriptor.id).join("|");

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(SAVED_COMPARISON_KEY) || "[]") as SavedComparisonView[];
      if (Array.isArray(parsed)) setSavedViews(parsed.filter(view => view && typeof view.name === "string" && Array.isArray(view.kpiIds)));
    } catch {
      setSavedViews([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPlanLoadState("loading");
    setPlanMessage("");
    void fetch("/api/portal/kpi-registry/targets")
      .then(async response => {
        const data = await response.json() as { ok?: boolean; config?: KpiTargetsConfig };
        if (!response.ok || !data.ok || !data.config || !Number.isFinite(data.config.updatedAt)) {
          throw new Error("targets unavailable");
        }
        if (cancelled) return;
        setPlanOverrides(kpiPlanOverridesFromConfig(data.config));
        setPlanConfigUpdatedAt(data.config.updatedAt);
        setPlanDrafts({});
        setPlanLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setPlanLoadState("error");
          setPlanMessage("The agency KPI plan could not be loaded. Existing targets are unavailable until you retry.");
        }
      });
    return () => { cancelled = true; };
  }, [planReloadToken]);

  useEffect(() => {
    setSelectedIds(current => {
      const valid = current.filter(id => descriptors.some(descriptor => descriptor.id === id));
      return valid.length ? valid : descriptors.slice(0, 4).map(descriptor => descriptor.id);
    });
  }, [availableKpiKey, descriptors]);

  const selectedDescriptors = selectedIds.map(id => descriptors.find(descriptor => descriptor.id === id)).filter((descriptor): descriptor is KpiDescriptor => Boolean(descriptor));
  const availableDescriptors = useMemo(() => searchKpiDescriptors(pickerDomain === "all" ? descriptors : descriptors.filter(descriptor => descriptor.category === pickerDomain), pickerQuery), [descriptors, pickerDomain, pickerQuery]);

  async function loadEvidence() {
    if (evidenceState === "loading" || evidenceState === "loaded") return;
    setEvidenceState("loading");
    try {
      const response = await fetch("/api/portal/kpi-registry/evidence");
      const data = await response.json() as { ok?: boolean; descriptors?: KpiDescriptor[] };
      if (data.ok && Array.isArray(data.descriptors)) {
        setEvidenceDescriptors(data.descriptors);
        setEvidenceState("loaded");
      } else {
        setEvidenceState("error");
      }
    } catch {
      setEvidenceState("error");
    }
  }
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/portal/kpi-registry/custom").then(response => response.json()).then((data: { ok?: boolean; definitions?: CustomKpiDefinition[] }) => {
      if (!cancelled && data.ok && Array.isArray(data.definitions)) setCustomDefinitions(data.definitions);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/portal/kpi-registry/views").then(response => response.json()).then((data: { ok?: boolean; views?: SharedKpiViewRow[] }) => {
      if (!cancelled && data.ok && Array.isArray(data.views)) setSharedViews(data.views);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function createCustom() {
    if (!customForm.label.trim() || !customForm.numeratorId) return;
    try {
      const response = await fetch("/api/portal/kpi-registry/custom", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: customForm.label, numeratorId: customForm.numeratorId, denominatorId: customForm.denominatorId || undefined, op: customForm.op }) });
      const data = await response.json() as { ok?: boolean; definitions?: CustomKpiDefinition[] };
      if (data.ok && Array.isArray(data.definitions)) { setCustomDefinitions(data.definitions); setCustomForm({ label: "", numeratorId: "", denominatorId: "", op: "rate" }); }
    } catch { /* keep the form open */ }
  }

  async function deleteCustom(id: string) {
    try {
      const response = await fetch(`/api/portal/kpi-registry/custom?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json() as { ok?: boolean; definitions?: CustomKpiDefinition[] };
      if (data.ok && Array.isArray(data.definitions)) setCustomDefinitions(data.definitions);
    } catch { /* ignore */ }
  }

  const bounds = comparisonBounds(snapshot, range, customStart, customEnd, mode);

  function toggleKpi(id: string) {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  async function saveView() {
    const name = viewName.trim();
    if (!name || !selectedIds.length) {
      setSaveMessage("Name the view and select at least one KPI.");
      return;
    }
    if (savedScope === "shared") {
      try {
        const response = await fetch("/api/portal/kpi-registry/views", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, kpiIds: selectedIds, mode, range, start: customStart, end: customEnd }) });
        const data = await response.json() as { ok?: boolean; views?: SharedKpiViewRow[] };
        if (!response.ok || !data.ok || !Array.isArray(data.views)) throw new Error("save failed");
        setSharedViews(data.views);
        setViewName("");
        setSaveMessage("Comparison view shared with the whole agency workspace.");
      } catch {
        setSaveMessage("The shared view could not be saved. Try again.");
      }
      return;
    }
    const next = [...savedViews.filter(view => view.name.toLowerCase() !== name.toLowerCase()), { id: `comparison-${Date.now()}`, name, kpiIds: selectedIds, mode, range, start: customStart, end: customEnd }];
    setSavedViews(next);
    window.localStorage.setItem(SAVED_COMPARISON_KEY, JSON.stringify(next));
    setViewName("");
    setSaveMessage("Comparison view saved in this browser only.");
  }

  function loadView(view: SavedComparisonView | SharedKpiViewRow) {
    setSelectedIds(view.kpiIds.filter(id => snapshot.kpis.some(kpi => kpi.id === id)));
    setMode(view.mode);
    setRange(view.range);
    setCustomStart(view.start ?? customStart);
    setCustomEnd(view.end ?? customEnd);
    setSaveMessage(`Loaded ${view.name}.`);
  }

  async function deleteSharedView(id: string) {
    try {
      const response = await fetch(`/api/portal/kpi-registry/views?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json() as { ok?: boolean; views?: SharedKpiViewRow[] };
      if (data.ok && Array.isArray(data.views)) setSharedViews(data.views);
    } catch { /* keep the row; nothing was deleted */ }
  }

  function deleteView(id: string) {
    const next = savedViews.filter(view => view.id !== id);
    setSavedViews(next);
    window.localStorage.setItem(SAVED_COMPARISON_KEY, JSON.stringify(next));
  }

  const planMutationPending = Object.values(planDrafts).some(draft => draft.status === "pending");

  function adoptPlanConfig(config: KpiTargetsConfig) {
    setPlanOverrides(kpiPlanOverridesFromConfig(config));
    setPlanConfigUpdatedAt(config.updatedAt);
  }

  async function commitPlanDraft(kpiId: string, draft: KpiPlanDraft) {
    if (planLoadState !== "ready" || planMutationPending) return;
    const pending = { ...draft, status: "pending" as const, error: undefined };
    setPlanDrafts(current => ({ ...current, [kpiId]: pending }));
    setPlanMessage(`Saving ${kpiId} to the agency plan…`);
    try {
      const result = await submitKpiTargetMutation({
        operationId: pending.operationId,
        expectedUpdatedAt: pending.expectedUpdatedAt,
        kpiId,
        action: pending.action,
        baselineValue: pending.action === "set" ? pending.override?.baselineValue ?? null : undefined,
        targetValue: pending.action === "set" ? pending.override?.targetValue ?? null : undefined,
      });
      adoptPlanConfig(result.config);
      setPlanDrafts(current => {
        const next = { ...current };
        delete next[kpiId];
        return next;
      });
      setPlanMessage(result.replayed ? "The saved agency plan was recovered from the original operation." : "Agency KPI plan saved.");
    } catch (error) {
      const requestError = error instanceof KpiTargetRequestError ? error : null;
      if (requestError?.config) adoptPlanConfig(requestError.config);
      const conflict = requestError?.status === 409;
      setPlanDrafts(current => ({
        ...current,
        [kpiId]: {
          ...pending,
          expectedUpdatedAt: requestError?.config?.updatedAt ?? pending.expectedUpdatedAt,
          status: "error",
          error: conflict
            ? "The agency plan changed in another session. Review this unsaved edit, then retry or discard it."
            : "This edit was not confirmed. The agency plan is unchanged here; retry the same operation.",
        },
      }));
      setPlanMessage(conflict
        ? "A newer agency plan was loaded. Your edit remains unsaved for review."
        : "The KPI edit was not confirmed. It remains visible as an unsaved draft.");
    }
  }

  function updatePlan(kpi: KpiDescriptor, field: keyof KpiPlanOverride, displayValue: string) {
    if (planLoadState !== "ready" || planMutationPending) return;
    const rawValue = displayValue.trim() === "" ? undefined : planningStoredValue(Number(displayValue), kpi.format);
    const priorDraft = planDrafts[kpi.id];
    const base = priorDraft?.action === "set" ? priorDraft.override ?? {} : planOverrides[kpi.id] ?? {};
    const override = { ...base, [field]: Number.isFinite(rawValue) ? rawValue : undefined };
    const empty = override.baselineValue === undefined && override.targetValue === undefined;
    void commitPlanDraft(kpi.id, {
      operationId: kpiPlanOperationId(kpi.id),
      expectedUpdatedAt: planConfigUpdatedAt,
      action: empty ? "clear" : "set",
      override: empty ? undefined : override,
      status: "pending",
    });
  }

  function resetPlan(kpiId: string) {
    if (planLoadState !== "ready" || planMutationPending) return;
    void commitPlanDraft(kpiId, {
      operationId: kpiPlanOperationId(kpiId),
      expectedUpdatedAt: planConfigUpdatedAt,
      action: "clear",
      status: "pending",
    });
  }

  function applySuggestion(kpi: KpiDescriptor) {
    if (planLoadState !== "ready" || planMutationPending) return;
    const suggestion = suggestKpiTarget(kpi);
    if (!suggestion) return;
    void commitPlanDraft(kpi.id, {
      operationId: kpiPlanOperationId(kpi.id),
      expectedUpdatedAt: planConfigUpdatedAt,
      action: "set",
      override: { baselineValue: suggestion.baseline, targetValue: suggestion.target },
      status: "pending",
    });
  }

  function retryPlan(kpiId: string) {
    const draft = planDrafts[kpiId];
    if (draft?.status === "error") void commitPlanDraft(kpiId, draft);
  }

  function discardPlanDraft(kpiId: string) {
    setPlanDrafts(current => {
      const next = { ...current };
      delete next[kpiId];
      return next;
    });
    setPlanMessage("Unsaved KPI edit discarded. The agency plan was not changed.");
  }

  return <div>
    <header className={`border-b px-4 py-4 sm:px-5 ${context === "strategic" ? "border-[#d7b56d]/18 bg-[#d7b56d]/[0.025]" : "border-[#62e8ff]/16"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className={`text-[8px] font-semibold uppercase ${context === "strategic" ? "text-[#e4c783]/60" : "text-[#76dff1]/55"}`}>{context === "strategic" ? "BT-INT · Strategic trajectory laboratory" : "INT-COMP · Multi-instrument analysis"} · {snapshot.kpis[0]?.scope.label ?? "Unlinked scope"}</p><h2 className="mt-1 text-sm font-semibold">{context === "strategic" ? "KPI trends, required pace and projections" : "Dynamic KPI comparison"}</h2><p className="mt-1 max-w-2xl text-[10px] leading-4 text-white/32">Compare actual evidence with approved baselines, required pace, period projections and native-unit target gaps.</p></div><span className="inline-flex items-center gap-2 border border-[#68f5d0]/18 bg-[#68f5d0]/[0.05] px-2.5 py-1.5 text-[8px] font-semibold uppercase text-[#68f5d0]"><span className="size-1.5 bg-current shadow-[0_0_7px_currentColor]" /> {selectedDescriptors.length} instruments linked</span></div></header>

    <div className="grid xl:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="min-w-0 border-b border-[#62e8ff]/16 bg-[#031018]/60 xl:border-b-0 xl:border-r" aria-label="KPI comparison controls">
        <div className="border-b border-[#62e8ff]/12 p-3"><div className="flex items-center justify-between gap-2"><p className="text-[8px] font-semibold uppercase text-[#76dff1]/52">INSTRUMENT SELECTOR</p><div className="flex gap-2"><button type="button" onClick={() => setSelectedIds([...new Set([...selectedIds, ...availableDescriptors.map(descriptor => descriptor.id)])])} className="text-[7px] font-semibold uppercase text-[#62e8ff]/60 hover:text-white">All visible</button><button type="button" onClick={() => setSelectedIds([])} className="text-[7px] font-semibold uppercase text-red-300/60 hover:text-red-200">Clear</button></div></div><label className="relative mt-3 block"><span className="sr-only">Search comparison KPIs</span><Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#62e8ff]/40" /><input value={pickerQuery} onChange={event => setPickerQuery(event.target.value)} placeholder="Find a KPI" className="min-h-8 w-full border border-[#62e8ff]/14 bg-[#020b11] pl-8 pr-2 text-[9px] text-white outline-none focus:border-[#62e8ff]/45" /></label><select value={pickerDomain} onChange={event => setPickerDomain(event.target.value as KpiDomainFilter)} aria-label="Filter comparison KPIs by system" className="mt-2 min-h-8 w-full border border-[#62e8ff]/14 bg-[#020b11] px-2 text-[9px] text-white"><option value="all">All systems</option>{[...new Set(descriptors.map(descriptor => descriptor.category))].map(domain => <option key={domain} value={domain}>{domainLabel(domain)}</option>)}</select><button type="button" onClick={loadEvidence} disabled={evidenceState === "loading" || evidenceState === "loaded"} className="mt-2 flex min-h-8 w-full items-center justify-center gap-1.5 border border-[#62e8ff]/14 bg-[#62e8ff]/[0.04] px-2 text-[8px] font-semibold uppercase text-[#8ef1ff] hover:bg-[#62e8ff]/[0.09] disabled:opacity-60">{evidenceState === "loading" ? "Loading radar evidence…" : evidenceState === "loaded" ? `${evidenceDescriptors.length.toLocaleString()} evidence series added` : evidenceState === "error" ? "Retry radar evidence" : "＋ Add radar evidence series"}</button></div>
        <div className="max-h-[390px] overflow-y-auto divide-y divide-white/7">{availableDescriptors.slice(0, 200).map((kpi, index) => { const selected = selectedIds.includes(kpi.id); return <button key={kpi.id} type="button" onClick={() => toggleKpi(kpi.id)} aria-pressed={selected} className={`grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 text-left ${selected ? "bg-[#62e8ff]/[0.07]" : "hover:bg-white/[0.025]"}`}><span className={`grid size-4 place-items-center border ${selected ? "border-[#68f5d0]/50 bg-[#68f5d0]/12 text-[#68f5d0]" : "border-white/14 text-transparent"}`}>{selected ? <Check size={10} /> : null}</span><span className="min-w-0"><span className="block truncate text-[9px] font-semibold text-white/58">{kpi.shortLabel}</span><span className="block truncate text-[7px] uppercase text-white/22">{kpi.category} · {kpi.status}</span></span><span className="size-1.5" style={{ backgroundColor: COMPARISON_COLOURS[(selectedIds.indexOf(kpi.id) >= 0 ? selectedIds.indexOf(kpi.id) : index) % COMPARISON_COLOURS.length] }} /></button>; })}{availableDescriptors.length > 200 ? <p className="px-3 py-2 text-center text-[8px] uppercase text-white/28">+{(availableDescriptors.length - 200).toLocaleString()} more · refine your search</p> : null}</div>
      </aside>

      <div className="min-w-0">
        <div className="grid gap-3 border-b border-[#62e8ff]/14 p-3 sm:p-4 2xl:grid-cols-[auto_auto_minmax(230px,1fr)] 2xl:items-end">
          <fieldset><legend className="mb-1.5 text-[7px] font-semibold uppercase text-white/28">Comparison mode</legend><div className="flex overflow-x-auto">{(["plan", "indexed", "change", "raw"] as const).map(value => <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value} className={`min-h-8 shrink-0 border px-3 text-[8px] font-semibold uppercase ${mode === value ? "border-[#62e8ff]/40 bg-[#62e8ff]/12 text-[#8ef1ff]" : "border-[#62e8ff]/12 text-white/34"}`}>{value === "plan" ? "Plan gap" : value === "indexed" ? "Index 100" : value === "change" ? "% change" : "Raw values"}</button>)}</div></fieldset>
          <fieldset><legend className="mb-1.5 text-[7px] font-semibold uppercase text-white/28">{mode === "plan" ? "Planning horizon" : "Evidence range"}</legend><div className="flex overflow-x-auto">{(["24h", "7d", "30d", "90d", "quarter", "ytd", "12m", "all", "custom"] as const).map(value => <button key={value} type="button" onClick={() => setRange(value)} aria-pressed={range === value} className={`min-h-8 shrink-0 border px-2.5 text-[8px] font-semibold uppercase ${range === value ? "border-[#e5c479]/35 bg-[#e5c479]/10 text-[#f4dda9]" : "border-[#62e8ff]/12 text-white/34"}`}>{comparisonRangeLabel(value, mode)}</button>)}</div></fieldset>
          <div className={`grid grid-cols-2 gap-2 ${range === "custom" ? "opacity-100" : "pointer-events-none opacity-30"}`}><label className="text-[7px] font-semibold uppercase text-white/28">From<input type="date" value={customStart} onChange={event => setCustomStart(event.target.value)} className="mt-1 min-h-8 w-full border border-[#62e8ff]/14 bg-[#020b11] px-2 text-[9px] normal-case text-white" /></label><label className="text-[7px] font-semibold uppercase text-white/28">To<input type="date" value={customEnd} onChange={event => setCustomEnd(event.target.value)} className="mt-1 min-h-8 w-full border border-[#62e8ff]/14 bg-[#020b11] px-2 text-[9px] normal-case text-white" /></label></div>
        </div>

        <section className="p-3 sm:p-5" aria-labelledby="comparison-chart-heading"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[8px] font-semibold uppercase text-[#76dff1]/50">TIME PLOT · {formatDateTime(bounds.start)} TO {formatDateTime(bounds.end)}</p><h3 id="comparison-chart-heading" className="mt-1 text-sm font-semibold">{mode === "plan" ? "Actual progress against required pace and forecast" : mode === "indexed" ? "Relative movement from index 100" : mode === "change" ? "Change from each KPI's first retained point" : "Raw values on a shared scale"}</h3></div><div className="flex items-center gap-2">{mode !== "plan" ? <fieldset className="flex" aria-label="Chart type"><legend className="sr-only">Chart type</legend>{([["line", LineChart], ["area", AreaChart], ["bar", BarChart3]] as const).map(([value, Icon]) => <button key={value} type="button" onClick={() => setChartType(value)} aria-pressed={chartType === value} title={`${value} chart`} className={`grid size-7 place-items-center border ${chartType === value ? "border-[#62e8ff]/40 bg-[#62e8ff]/12 text-[#8ef1ff]" : "border-[#62e8ff]/12 text-white/34 hover:text-white/60"}`}><Icon size={12} /></button>)}</fieldset> : null}<span className="inline-flex items-center gap-1.5 text-[8px] text-white/30"><CalendarRange size={11} /> {comparisonDuration(bounds.start, bounds.end)}</span></div></div><ComparisonChart kpis={selectedDescriptors} mode={mode} chartType={chartType} start={bounds.start} end={bounds.end} planOverrides={planOverrides} /></section>

        {mode === "plan" ? <PlanningAssumptions kpis={selectedDescriptors} overrides={planOverrides} drafts={planDrafts} loadState={planLoadState} mutationPending={planMutationPending} message={planMessage} start={bounds.start} end={bounds.end} currency={snapshot.currency} onChange={updatePlan} onReset={resetPlan} onSuggest={applySuggestion} onRetry={retryPlan} onDiscard={discardPlanDraft} onReload={() => setPlanReloadToken(value => value + 1)} /> : null}

        <section className="border-t border-[#62e8ff]/14"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#62e8ff]/10 px-4 py-3 sm:px-5"><div><p className="text-[8px] font-semibold uppercase text-[#76dff1]/50">SELECTED INSTRUMENTS</p><h3 className="mt-1 text-xs font-semibold">Range statistics, projected gaps and evidence coverage</h3></div><span className="text-[8px] uppercase text-white/24">Click one to inspect its source</span></div><div className="grid sm:grid-cols-2 2xl:grid-cols-4">{selectedDescriptors.map((kpi, index) => <ComparisonStatistic key={kpi.id} kpi={kpi} currency={snapshot.currency} colour={COMPARISON_COLOURS[index % COMPARISON_COLOURS.length]} start={bounds.start} end={bounds.end} mode={mode} planOverride={planOverrides[kpi.id]} onClick={() => { const command = snapshot.kpis.find(item => item.id === kpi.id); if (command) onInspect(command); }} />)}{!selectedDescriptors.length ? <div className="p-10 text-center text-xs text-white/32 sm:col-span-2 2xl:col-span-4">Select at least one KPI from the instrument bank.</div> : null}</div></section>
      </div>
    </div>

    <section className="border-t border-[#62e8ff]/16 bg-[#031018]/55 p-4 sm:p-5"><div className="grid gap-4 xl:grid-cols-[minmax(250px,.65fr)_minmax(320px,1.35fr)]"><div><p className="text-[8px] font-semibold uppercase text-[#76dff1]/50">SAVED COMPARISON VIEWS</p><h3 className="mt-1 text-xs font-semibold">Return to a monitoring configuration</h3><div className="mt-3 flex"><input value={viewName} onChange={event => setViewName(event.target.value)} placeholder="View name" className="min-h-9 min-w-0 flex-1 border border-[#62e8ff]/14 bg-[#020b11] px-3 text-[10px] text-white outline-none focus:border-[#62e8ff]/45" /><button type="button" onClick={() => void saveView()} title="Save KPI comparison view" className="grid size-9 place-items-center border border-l-0 border-[#62e8ff]/20 bg-[#62e8ff]/[0.07] text-[#8ef1ff]"><Save size={13} /></button></div><div className="mt-2 grid grid-cols-2 border border-[#62e8ff]/14" role="group" aria-label="Where this view is saved"><button type="button" aria-pressed={savedScope === "private"} onClick={() => setSavedScope("private")} className={`min-h-8 px-2 text-[8px] font-semibold uppercase transition ${savedScope === "private" ? "bg-[#62e8ff]/[0.12] text-[#8ef1ff]" : "text-white/35 hover:text-white/60"}`}>Only me · this browser</button><button type="button" aria-pressed={savedScope === "shared"} onClick={() => setSavedScope("shared")} className={`min-h-8 border-l border-[#62e8ff]/14 px-2 text-[8px] font-semibold uppercase transition ${savedScope === "shared" ? "bg-[#68f5d0]/[0.1] text-[#68f5d0]" : "text-white/35 hover:text-white/60"}`}>Shared · whole agency</button></div>{saveMessage ? <p className="mt-2 text-[8px] text-[#68f5d0]/70">{saveMessage}</p> : null}</div><div className="grid gap-px border border-[#62e8ff]/12 bg-[#62e8ff]/12 sm:grid-cols-2">{sharedViews.map(view => <div key={view.id} className="flex min-w-0 items-center gap-2 bg-[#020b11] p-3"><button type="button" onClick={() => loadView(view)} className="min-w-0 flex-1 text-left"><span className="flex items-center gap-1.5"><span className="block truncate text-[10px] font-semibold text-white/62">{view.name}</span><span className="shrink-0 border border-[#68f5d0]/25 bg-[#68f5d0]/[0.07] px-1.5 py-0.5 text-[6px] font-semibold uppercase text-[#68f5d0]">Shared</span></span><span className="mt-1 block truncate text-[7px] uppercase text-white/24">{view.kpiIds.length} KPIs · {view.range} · {view.mode} · whole agency</span></button><button type="button" onClick={() => void deleteSharedView(view.id)} title={`Delete the shared view ${view.name} for everyone`} className="grid size-7 shrink-0 place-items-center text-white/25 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={11} /></button></div>)}{savedViews.map(view => <div key={view.id} className="flex min-w-0 items-center gap-2 bg-[#020b11] p-3"><button type="button" onClick={() => loadView(view)} className="min-w-0 flex-1 text-left"><span className="block truncate text-[10px] font-semibold text-white/62">{view.name}</span><span className="mt-1 block truncate text-[7px] uppercase text-white/24">{view.kpiIds.length} KPIs · {view.range} · {view.mode}</span></button><button type="button" onClick={() => deleteView(view.id)} title={`Delete ${view.name}`} className="grid size-7 shrink-0 place-items-center text-white/25 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={11} /></button></div>)}{!savedViews.length && !sharedViews.length ? <p className="p-5 text-center text-[10px] text-white/28 sm:col-span-2">Private views stay in this browser; shared views are stored with the agency workspace and visible to everyone in it.</p> : null}</div></div></section>

    <section className="border-t border-[#62e8ff]/16 p-4 sm:p-5" aria-labelledby="custom-kpi-heading"><div><p className="text-[8px] font-semibold uppercase text-[#76dff1]/50">CUSTOM KPIS</p><h3 id="custom-kpi-heading" className="mt-1 text-xs font-semibold">Build a KPI from two metrics</h3><p className="mt-1 max-w-2xl text-[10px] leading-4 text-white/32">Pick a numerator and, optionally, a denominator and an operation. Guided — not a formula language — so it only wires existing registry metrics together. New custom KPIs plot in the bank like any other.</p></div>
      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_92px_minmax(140px,1fr)_auto] lg:items-end">
        <label className="text-[7px] font-semibold uppercase text-white/28">Name<input value={customForm.label} onChange={event => setCustomForm(form => ({ ...form, label: event.target.value }))} placeholder="e.g. Form to lead" className="mt-1 min-h-8 w-full border border-[#62e8ff]/14 bg-[#020b11] px-2 text-[9px] normal-case text-white outline-none focus:border-[#62e8ff]/45" /></label>
        <label className="text-[7px] font-semibold uppercase text-white/28">Numerator<select value={customForm.numeratorId} onChange={event => setCustomForm(form => ({ ...form, numeratorId: event.target.value }))} className="mt-1 min-h-8 w-full border border-[#62e8ff]/14 bg-[#020b11] px-2 text-[9px] text-white"><option value="">Select…</option>{baseDescriptors.map(descriptor => <option key={descriptor.id} value={descriptor.id}>{descriptor.shortLabel}</option>)}</select></label>
        <label className="text-[7px] font-semibold uppercase text-white/28">Op<select value={customForm.op} onChange={event => setCustomForm(form => ({ ...form, op: event.target.value as CustomKpiOp }))} className="mt-1 min-h-8 w-full border border-[#62e8ff]/14 bg-[#020b11] px-2 text-[9px] text-white">{(["rate", "ratio", "sum", "diff"] as const).map(op => <option key={op} value={op}>{op}</option>)}</select></label>
        <label className="text-[7px] font-semibold uppercase text-white/28">Denominator<select value={customForm.denominatorId} onChange={event => setCustomForm(form => ({ ...form, denominatorId: event.target.value }))} className="mt-1 min-h-8 w-full border border-[#62e8ff]/14 bg-[#020b11] px-2 text-[9px] text-white"><option value="">None</option>{baseDescriptors.map(descriptor => <option key={descriptor.id} value={descriptor.id}>{descriptor.shortLabel}</option>)}</select></label>
        <button type="button" onClick={createCustom} disabled={!customForm.label.trim() || !customForm.numeratorId} className="inline-flex min-h-8 items-center justify-center gap-1.5 border border-[#68f5d0]/25 bg-[#68f5d0]/[0.07] px-3 text-[8px] font-semibold uppercase text-[#68f5d0] enabled:hover:bg-[#68f5d0]/[0.13] disabled:opacity-40">Create</button>
      </div>
      {customDefinitions.length ? <div className="mt-3 flex flex-wrap gap-2">{customDefinitions.map(definition => <span key={definition.id} className="inline-flex items-center gap-2 border border-[#62e8ff]/14 bg-[#020b11] px-2.5 py-1.5 text-[9px] text-white/55"><Sparkles size={10} className="text-[#8ef1ff]/70" />{definition.label}<button type="button" onClick={() => deleteCustom(definition.id)} title={`Delete ${definition.label}`} className="text-white/30 hover:text-red-300"><X size={10} /></button></span>)}</div> : null}
    </section>
  </div>;
}

function ComparisonChart({ kpis, mode, chartType, start, end, planOverrides }: { kpis: KpiDescriptor[]; mode: ComparisonMode; chartType: KpiChartType; start: number; end: number; planOverrides: KpiPlanOverrides }) {
  if (mode === "plan") return <PlanGapChart kpis={kpis} start={start} end={end} overrides={planOverrides} />;
  const series = kpis.map((kpi, index) => ({ kpi, colour: COMPARISON_COLOURS[index % COMPARISON_COLOURS.length], points: comparisonPoints(kpi, mode, start, end) }));
  const values = series.flatMap(item => item.points.map(point => point.value));
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 100;
  const low = minimum === maximum ? minimum - 1 : minimum;
  const high = minimum === maximum ? maximum + 1 : maximum;
  const width = 1000;
  const height = 360;
  const left = 58;
  const right = 18;
  const top = 20;
  const bottom = 42;
  const x = (at: number) => left + (at - start) / Math.max(1, end - start) * (width - left - right);
  const y = (value: number) => top + (high - value) / Math.max(1e-9, high - low) * (height - top - bottom);
  return <div className="mt-4"><div className="relative h-[280px] w-full overflow-hidden border border-[#62e8ff]/16 bg-[#020b11] sm:h-[360px]"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="size-full" role="img" aria-label={`${kpis.length} KPI comparison chart`}>
    {[0, 1, 2, 3, 4].map(index => { const value = high - index / 4 * (high - low); const rowY = top + index / 4 * (height - top - bottom); return <g key={index}><line x1={left} y1={rowY} x2={width - right} y2={rowY} stroke="rgba(98,232,255,.10)" /><text x={left - 8} y={rowY + 3} fill="rgba(166,218,227,.38)" fontSize="9" textAnchor="end">{compactNumber(value)}</text></g>; })}
    {[0, 1, 2, 3, 4].map(index => { const at = start + index / 4 * (end - start); const colX = left + index / 4 * (width - left - right); return <g key={index}><line x1={colX} y1={top} x2={colX} y2={height - bottom} stroke="rgba(98,232,255,.055)" /><text x={colX} y={height - 16} fill="rgba(166,218,227,.35)" fontSize="9" textAnchor={index === 0 ? "start" : index === 4 ? "end" : "middle"}>{chartTimeLabel(at, end - start)}</text></g>; })}
    {mode === "indexed" && low <= 100 && high >= 100 ? <line x1={left} y1={y(100)} x2={width - right} y2={y(100)} stroke="rgba(229,196,121,.45)" strokeDasharray="6 6" /> : null}
    {mode === "change" && low <= 0 && high >= 0 ? <line x1={left} y1={y(0)} x2={width - right} y2={y(0)} stroke="rgba(229,196,121,.45)" strokeDasharray="6 6" /> : null}
    {series.map((item, seriesIndex) => {
      const line = item.points.map((point, index) => `${index ? "L" : "M"}${x(point.at).toFixed(2)} ${y(point.value).toFixed(2)}`).join(" ");
      const floor = height - bottom;
      if (chartType === "bar") {
        const slot = (width - left - right) / Math.max(1, item.points.length);
        const barWidth = Math.max(2, Math.min(16, slot / Math.max(1, series.length) - 1));
        return <g key={item.kpi.id}>{item.points.map(point => { const cx = x(point.at) + (seriesIndex - (series.length - 1) / 2) * barWidth; const topY = y(point.value); return <rect key={point.at} x={(cx - barWidth / 2).toFixed(2)} y={Math.min(topY, floor).toFixed(2)} width={barWidth.toFixed(2)} height={Math.abs(floor - topY).toFixed(2)} fill={item.colour} opacity=".72" />; })}</g>;
      }
      if (chartType === "area" && item.points.length > 1) {
        return <g key={item.kpi.id}><path d={`${line} L${x(item.points.at(-1)!.at).toFixed(2)} ${floor.toFixed(2)} L${x(item.points[0]!.at).toFixed(2)} ${floor.toFixed(2)} Z`} fill={item.colour} opacity=".12" /><path d={line} fill="none" stroke={item.colour} strokeWidth="2.25" vectorEffect="non-scaling-stroke" /></g>;
      }
      return item.points.length > 1
        ? <path key={item.kpi.id} d={line} fill="none" stroke={item.colour} strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
        : <g key={item.kpi.id}>{item.points.map(point => <circle key={point.at} cx={x(point.at)} cy={y(point.value)} r="4" fill={item.colour} />)}</g>;
    })}
  </svg>{!values.length ? <div className="absolute inset-0 grid place-items-center p-6 text-center"><div><LineChart className="mx-auto text-[#62e8ff]/35" size={22} /><p className="mt-2 text-xs font-semibold text-white/52">No retained points in this range</p><p className="mt-1 max-w-md text-[10px] leading-4 text-white/28">Choose a wider window or allow Radar to gather more evidence. The chart will not fabricate missing history.</p></div></div> : null}</div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{series.map(item => <span key={item.kpi.id} className="inline-flex items-center gap-1.5 text-[8px] text-white/42"><span className="size-2" style={{ backgroundColor: item.colour }} />{item.kpi.shortLabel} · {item.points.length} points</span>)}</div>{mode === "raw" && new Set(kpis.map(kpi => kpi.format)).size > 1 ? <p className="mt-3 border-l-2 border-amber-300/45 pl-3 text-[9px] leading-4 text-amber-200/62">Raw mode is sharing one axis across different units. Use Index 100 or % change for a fair cross-unit comparison.</p> : null}</div>;
}

interface ResolvedKpiPlan {
  baselineValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  currentAt: number;
  expectedValue: number | null;
  actualProgress: number | null;
  expectedProgress: number | null;
  paceGap: number | null;
  targetGap: number | null;
  forecastValue: number | null;
  forecastProgress: number | null;
  forecastGap: number | null;
  points: Array<{ at: number; value: number; progress: number }>;
}

function PlanGapChart({ kpis, start, end, overrides }: { kpis: KpiDescriptor[]; start: number; end: number; overrides: KpiPlanOverrides }) {
  const series = kpis.map((kpi, index) => ({ kpi, colour: COMPARISON_COLOURS[index % COMPARISON_COLOURS.length], plan: resolveKpiPlan(kpi, overrides[kpi.id], start, end) }));
  const chartSeries = series.filter(item => item.plan.baselineValue !== null && item.plan.targetValue !== null);
  const values = chartSeries.flatMap(item => [...item.plan.points.map(point => point.progress), item.plan.forecastProgress].filter((value): value is number => value !== null && Number.isFinite(value)));
  const low = Math.min(-20, ...values, 0);
  const high = Math.max(120, ...values, 100);
  const width = 1000;
  const height = 360;
  const left = 58;
  const right = 18;
  const top = 20;
  const bottom = 42;
  const x = (at: number) => left + (at - start) / Math.max(1, end - start) * (width - left - right);
  const y = (value: number) => top + (high - value) / Math.max(1e-9, high - low) * (height - top - bottom);
  return <div className="mt-4">
    <div className="relative h-[300px] w-full overflow-hidden border border-[#62e8ff]/16 bg-[#020b11] sm:h-[380px]">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="size-full" role="img" aria-label={`${chartSeries.length} KPIs plotted against baseline, target pace and forecast`}>
        {[-20, 0, 25, 50, 75, 100, 120].filter(value => value >= low && value <= high).map(value => <g key={value}><line x1={left} y1={y(value)} x2={width - right} y2={y(value)} stroke={value === 100 ? "rgba(104,245,208,.35)" : value === 0 ? "rgba(98,232,255,.28)" : "rgba(98,232,255,.08)"} strokeDasharray={value === 0 || value === 100 ? "5 5" : undefined} /><text x={left - 8} y={y(value) + 3} fill={value === 100 ? "rgba(104,245,208,.65)" : "rgba(166,218,227,.38)"} fontSize="9" textAnchor="end">{value}%</text></g>)}
        {[0, 1, 2, 3, 4].map(index => { const at = start + index / 4 * (end - start); const colX = x(at); return <g key={index}><line x1={colX} y1={top} x2={colX} y2={height - bottom} stroke="rgba(98,232,255,.055)" /><text x={colX} y={height - 16} fill="rgba(166,218,227,.35)" fontSize="9" textAnchor={index === 0 ? "start" : index === 4 ? "end" : "middle"}>{chartTimeLabel(at, end - start)}</text></g>; })}
        <path d={`M${x(start)} ${y(0)} L${x(end)} ${y(100)}`} fill="none" stroke="#e5c479" strokeWidth="1.5" strokeDasharray="7 6" vectorEffect="non-scaling-stroke" aria-label="Required pace from baseline to target" />
        {chartSeries.map(item => {
          const points = item.plan.points;
          const last = points.at(-1);
          return <g key={item.kpi.id}>
            {points.length > 1 ? <path d={points.map((point, index) => `${index ? "L" : "M"}${x(point.at).toFixed(2)} ${y(point.progress).toFixed(2)}`).join(" ")} fill="none" stroke={item.colour} strokeWidth="2.4" vectorEffect="non-scaling-stroke" aria-label={`${item.kpi.label} actual progress`} /> : null}
            {points.length === 1 ? <circle cx={x(points[0]!.at)} cy={y(points[0]!.progress)} r="4" fill={item.colour} aria-label={`${item.kpi.label} actual progress`} /> : null}
            {last && item.plan.forecastProgress !== null && last.at < end ? <path d={`M${x(last.at)} ${y(last.progress)} L${x(end)} ${y(item.plan.forecastProgress)}`} fill="none" stroke={item.colour} strokeWidth="1.8" strokeDasharray="4 5" opacity=".7" vectorEffect="non-scaling-stroke" aria-label={`${item.kpi.label} period-end forecast`} /> : null}
            {last ? <circle cx={x(last.at)} cy={y(last.progress)} r="3.5" fill={item.colour} stroke="#020b11" strokeWidth="2" aria-label={`${item.kpi.label}: ${roundNumber(last.progress, 1)}% of plan`} /> : null}
          </g>;
        })}
      </svg>
      {!chartSeries.length ? <div className="absolute inset-0 grid place-items-center p-6 text-center"><div><Target className="mx-auto text-[#62e8ff]/35" size={22} /><p className="mt-2 text-xs font-semibold text-white/52">No numeric plan connected</p><p className="mt-1 max-w-md text-[10px] leading-4 text-white/28">Add a baseline and target below. The chart will not infer a success threshold from a vague label.</p></div></div> : null}
    </div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2"><span className="inline-flex items-center gap-1.5 text-[8px] text-[#f4dda9]/70"><span className="h-px w-4 border-t border-dashed border-[#e5c479]" />Required pace</span>{series.map(item => <span key={item.kpi.id} className="inline-flex items-center gap-1.5 text-[8px] text-white/42"><span className="size-2" style={{ backgroundColor: item.colour }} />{item.kpi.shortLabel}{item.plan.forecastValue !== null ? " · forecast armed" : " · collecting trend"}</span>)}</div>
    <p className="mt-3 border-l-2 border-[#62e8ff]/35 pl-3 text-[9px] leading-4 text-white/36">Baseline is 0% of the plan and target is 100%. Solid lines are recorded evidence; dotted coloured extensions are period-end forecasts; gold is the pace required to land on target.</p>
  </div>;
}

function PlanningAssumptions({ kpis, overrides, drafts, loadState, mutationPending, message, start, end, currency, onChange, onReset, onSuggest, onRetry, onDiscard, onReload }: { kpis: KpiDescriptor[]; overrides: KpiPlanOverrides; drafts: Record<string, KpiPlanDraft>; loadState: "loading" | "ready" | "error"; mutationPending: boolean; message: string; start: number; end: number; currency: string; onChange: (kpi: KpiDescriptor, field: keyof KpiPlanOverride, value: string) => void; onReset: (kpiId: string) => void; onSuggest: (kpi: KpiDescriptor) => void; onRetry: (kpiId: string) => void; onDiscard: (kpiId: string) => void; onReload: () => void }) {
  const disabled = loadState !== "ready" || mutationPending;
  return <section className="border-t border-[#62e8ff]/14" aria-labelledby="planning-assumptions-heading">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#62e8ff]/10 px-4 py-3 sm:px-5"><div><p className="text-[8px] font-semibold uppercase text-[#76dff1]/50">PLAN CONTROL · BASELINE TO OBJECTIVE</p><h3 id="planning-assumptions-heading" className="mt-1 text-xs font-semibold">Planning assumptions and target sources</h3><p className={`mt-1 text-[9px] ${loadState === "error" ? "text-red-300/80" : "text-white/30"}`}>{message || (loadState === "loading" ? "Loading the agency-approved plan…" : "Values become authoritative only after the agency store confirms them.")}</p></div><div className="flex items-center gap-2"><span className={`text-[8px] uppercase ${loadState === "error" ? "text-red-300/70" : mutationPending ? "text-amber-200/70" : "text-white/24"}`}>{loadState === "error" ? "Plan unavailable" : mutationPending ? "Saving confirmation…" : loadState === "loading" ? "Loading…" : "Agency plan confirmed"}</span>{loadState === "error" ? <button type="button" onClick={onReload} className="min-h-8 border border-red-300/25 px-2.5 text-[8px] font-semibold uppercase text-red-200 hover:bg-red-300/10">Retry load</button> : null}</div></div>
    <div className="divide-y divide-[#62e8ff]/10">{kpis.map(kpi => {
      const draft = drafts[kpi.id];
      const visibleOverride = draft ? draft.action === "set" ? draft.override : undefined : overrides[kpi.id];
      const plan = resolveKpiPlan(kpi, visibleOverride, start, end);
      const overridden = Boolean(overrides[kpi.id]);
      const suggestion = suggestKpiTarget(kpi);
      const authority = draft?.status === "pending"
        ? "Pending confirmation · agency plan not promoted yet"
        : draft?.status === "error"
          ? draft.error ?? "Unsaved edit · agency plan unchanged"
          : overridden ? `Agency override · ${kpi.planSource}` : kpi.planSource;
      return <div key={kpi.id} className="grid gap-3 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(150px,1fr)_130px_130px_minmax(180px,.8fr)_auto] lg:items-end"><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-white/65">{kpi.shortLabel}</p><p className="mt-1 truncate text-[7px] uppercase text-white/24">{kpi.direction} is better · {kpi.cadence}</p></div><PlanNumberInput label={`Baseline${kpi.format === "currency" ? ` (${currency})` : ""}`} value={plan.baselineValue} kpi={kpi} disabled={disabled} onCommit={value => onChange(kpi, "baselineValue", value)} /><PlanNumberInput label={`Target${kpi.format === "currency" ? ` (${currency})` : ""}`} value={plan.targetValue} kpi={kpi} disabled={disabled} onCommit={value => onChange(kpi, "targetValue", value)} /><div className="min-w-0"><p className="text-[7px] font-semibold uppercase text-white/25">Authority</p><p className={`mt-1 text-[9px] leading-4 ${draft?.status === "error" ? "text-red-300/80" : draft?.status === "pending" ? "text-amber-200/70" : "truncate text-[#8ec9d5]/52"}`} title={authority}>{authority}</p></div><div className="flex items-center gap-1">{draft?.status === "error" ? <><button type="button" onClick={() => onRetry(kpi.id)} disabled={disabled} title={`Retry the unsaved ${kpi.shortLabel} edit`} aria-label={`Retry the unsaved ${kpi.shortLabel} edit`} className="grid size-8 place-items-center border border-amber-200/25 text-amber-200/80 enabled:hover:bg-amber-200/10 disabled:opacity-25"><Save size={11} /></button><button type="button" onClick={() => onDiscard(kpi.id)} disabled={mutationPending} title={`Discard the unsaved ${kpi.shortLabel} edit`} aria-label={`Discard the unsaved ${kpi.shortLabel} edit`} className="grid size-8 place-items-center border border-white/12 text-white/45 enabled:hover:bg-white/[0.06] disabled:opacity-25"><X size={11} /></button></> : <><button type="button" onClick={() => onSuggest(kpi)} disabled={disabled || !suggestion} title={suggestion ? `Suggest a target — ${suggestion.basis}` : "Not enough retained history to suggest a target yet"} aria-label={`Suggest a target for ${kpi.shortLabel}`} className="grid size-8 place-items-center border border-[#62e8ff]/12 text-[#8ef1ff]/70 enabled:hover:bg-[#62e8ff]/[0.06] enabled:hover:text-white disabled:opacity-25"><Sparkles size={11} /></button><button type="button" onClick={() => onReset(kpi.id)} disabled={disabled || !overridden} title={`Reset ${kpi.shortLabel} planning assumptions`} className="grid size-8 place-items-center border border-[#62e8ff]/12 text-white/30 enabled:hover:bg-[#62e8ff]/[0.06] enabled:hover:text-white disabled:opacity-25"><Trash2 size={11} /></button></>}</div></div>;
    })}{!kpis.length ? <p className="p-8 text-center text-[10px] text-white/28">Select KPIs to configure their planning assumptions.</p> : null}</div>
  </section>;
}

function PlanNumberInput({ label, value, kpi, disabled, onCommit }: { label: string; value: number | null; kpi: KpiDescriptor; disabled: boolean; onCommit: (value: string) => void }) {
  return <label className="text-[7px] font-semibold uppercase text-white/25">{label}<input key={`${kpi.id}:${label}:${value ?? "empty"}`} type="number" step={kpi.format === "number" ? "1" : "0.1"} defaultValue={value === null ? "" : planningDisplayValue(value, kpi.format)} disabled={disabled} onBlur={event => onCommit(event.currentTarget.value)} placeholder="Not set" className="mt-1 min-h-8 w-full border border-[#62e8ff]/14 bg-[#020b11] px-2 text-[9px] normal-case text-white outline-none focus:border-[#62e8ff]/45 disabled:cursor-not-allowed disabled:opacity-45" /></label>;
}

function resolveKpiPlan(kpi: KpiDescriptor, override: KpiPlanOverride | undefined, start: number, end: number): ResolvedKpiPlan {
  const rawPoints = comparisonPoints(kpi, "raw", start, end);
  const currentValue = rawPoints.at(-1)?.value ?? kpi.value;
  const currentAt = Math.min(end, Math.max(start, rawPoints.at(-1)?.at ?? kpi.measuredAt));
  const baselineValue = finiteValue(override?.baselineValue) ?? finiteValue(kpi.baseline) ?? rawPoints[0]?.value ?? currentValue;
  const targetValue = finiteValue(override?.targetValue) ?? finiteValue(kpi.target);
  if (baselineValue === null || targetValue === null) return { baselineValue, targetValue, currentValue, currentAt, expectedValue: null, actualProgress: null, expectedProgress: null, paceGap: null, targetGap: null, forecastValue: null, forecastProgress: null, forecastGap: null, points: [] };
  const progress = (value: number) => planProgress(value, baselineValue, targetValue, kpi.direction);
  const points = rawPoints.map(point => ({ ...point, progress: progress(point.value) }));
  if (!points.length && currentValue !== null) points.push({ at: currentAt, value: currentValue, progress: progress(currentValue) });
  const elapsed = Math.min(1, Math.max(0, (currentAt - start) / Math.max(1, end - start)));
  const expectedProgress = baselineValue === targetValue ? 100 : elapsed * 100;
  const expectedValue = baselineValue === targetValue ? targetValue : baselineValue + (targetValue - baselineValue) * elapsed;
  const actualProgress = currentValue === null ? null : progress(currentValue);
  const paceGap = currentValue === null ? null : directionalDifference(currentValue, expectedValue, kpi.direction);
  const targetGap = currentValue === null ? null : directionalShortfall(currentValue, targetValue, kpi.direction);
  const trend = rawPoints.length >= 2 ? rawPoints : kpi.series.filter(point => point.at <= currentAt && Number.isFinite(point.value)).slice(-8);
  const first = trend[0];
  const last = trend.at(-1);
  const forecastValue = first && last && last.at > first.at ? last.value + (last.value - first.value) / (last.at - first.at) * Math.max(0, end - last.at) : null;
  const forecastProgress = forecastValue === null ? null : progress(forecastValue);
  const forecastGap = forecastValue === null ? null : directionalShortfall(forecastValue, targetValue, kpi.direction);
  return { baselineValue, targetValue, currentValue, currentAt, expectedValue, actualProgress, expectedProgress, paceGap, targetGap, forecastValue, forecastProgress, forecastGap, points };
}

function ComparisonStatistic({ kpi, currency, colour, start, end, mode, planOverride, onClick }: { kpi: KpiDescriptor; currency: string; colour: string; start: number; end: number; mode: ComparisonMode; planOverride?: KpiPlanOverride; onClick: () => void }) {
  if (mode === "plan") {
    const plan = resolveKpiPlan(kpi, planOverride, start, end);
    const paceTone = plan.paceGap === null ? "text-white/30" : plan.paceGap < 0 ? "text-red-300" : "text-[#68f5d0]";
    const forecastTone = plan.forecastGap === null ? "text-sky-300/55" : plan.forecastGap > 0 ? "text-red-300" : "text-[#68f5d0]";
    return <button type="button" onClick={onClick} className="min-w-0 border-b border-r border-[#62e8ff]/12 p-3 text-left hover:bg-[#62e8ff]/[0.045]"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-white/62">{kpi.shortLabel}</p><p className="mt-1 truncate text-[7px] uppercase text-white/22">{kpi.cadence} · {kpi.planSource}</p></div><span className="mt-1 size-2 shrink-0" style={{ backgroundColor: colour }} /></div><div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[7px] uppercase text-white/24"><span>Actual / expected<strong className="mt-1 block truncate text-[10px] normal-case text-white/62">{plan.currentValue === null ? "No data" : formatKpiValue(plan.currentValue, kpi.format, currency)} / {plan.expectedValue === null ? "-" : formatKpiValue(plan.expectedValue, kpi.format, currency)}</strong></span><span>Pace variance<strong className={`mt-1 block truncate text-[10px] normal-case ${paceTone}`}>{plan.paceGap === null ? "No plan" : signedKpiValue(plan.paceGap, kpi.format, currency)}</strong></span><span>Target gap<strong className={`mt-1 block truncate text-[10px] normal-case ${plan.targetGap === null ? "text-white/30" : plan.targetGap > 0 ? "text-red-300" : "text-[#68f5d0]"}`}>{plan.targetGap === null ? "Not set" : gapLabel(plan.targetGap, kpi.format, currency)}</strong></span><span>Period forecast<strong className={`mt-1 block truncate text-[10px] normal-case ${forecastTone}`}>{plan.forecastValue === null ? "Building trend" : `${formatKpiValue(plan.forecastValue, kpi.format, currency)} · ${gapLabel(plan.forecastGap ?? 0, kpi.format, currency)}`}</strong></span></div></button>;
  }
  const points = comparisonPoints(kpi, "raw", start, end);
  const values = points.map(point => point.value);
  const first = values[0];
  const last = values.at(-1);
  const change = first === undefined || last === undefined ? null : first === 0 ? last - first : (last - first) / Math.abs(first) * 100;
  return <button type="button" onClick={onClick} className="min-w-0 border-b border-r border-[#62e8ff]/12 p-3 text-left hover:bg-[#62e8ff]/[0.045]"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-white/62">{kpi.shortLabel}</p><p className="mt-1 text-[7px] uppercase text-white/22">{kpi.category} · {points.length} points</p></div><span className="mt-1 size-2 shrink-0" style={{ backgroundColor: colour }} /></div><div className="mt-3 grid grid-cols-3 gap-2 text-[7px] uppercase text-white/24"><span>Latest<strong className="mt-1 block truncate text-[10px] normal-case text-white/62">{last === undefined ? "No data" : formatKpiValue(last, kpi.format, currency)}</strong></span><span>Movement<strong className={`mt-1 block truncate text-[10px] normal-case ${change === null ? "text-white/30" : change < 0 ? "text-red-300" : "text-[#68f5d0]"}`}>{change === null ? "-" : `${change > 0 ? "+" : ""}${roundNumber(change, 1)}${first === 0 ? "" : "%"}`}</strong></span><span>Range<strong className="mt-1 block truncate text-[10px] normal-case text-white/62">{values.length ? `${compactNumber(Math.min(...values))}–${compactNumber(Math.max(...values))}` : "-"}</strong></span></div></button>;
}

function comparisonPoints(kpi: KpiDescriptor, mode: Exclude<ComparisonMode, "plan">, start: number, end: number): Array<{ at: number; value: number }> {
  const raw = kpi.series.filter(point => point.at >= start && point.at <= end && Number.isFinite(point.value));
  if (!raw.some(point => point.at === kpi.measuredAt) && kpi.value !== null && kpi.measuredAt >= start && kpi.measuredAt <= end) raw.push({ at: kpi.measuredAt, value: kpi.value });
  raw.sort((left, right) => left.at - right.at);
  if (mode === "raw" || !raw.length) return raw;
  const baseline = raw[0]!.value;
  const denominator = Math.abs(baseline) || Math.max(1, ...raw.map(point => Math.abs(point.value)));
  return raw.map(point => ({ at: point.at, value: mode === "indexed" ? 100 + (point.value - baseline) / denominator * 100 : (point.value - baseline) / denominator * 100 }));
}

function comparisonBounds(snapshot: CommandIntelligenceSnapshot, range: ComparisonRange, customStart: string, customEnd: string, mode: ComparisonMode) {
  if (mode === "plan" && range !== "all") return planningBounds(snapshot.generatedAt, range, customStart, customEnd);
  const end = range === "custom" ? endOfInputDay(customEnd, snapshot.generatedAt) : snapshot.generatedAt;
  const earliest = Math.min(...snapshot.kpis.flatMap(kpi => kpi.history.map(point => point.at)), snapshot.generatedAt);
  const current = new Date(end);
  const start = range === "24h" ? end - 86_400_000
    : range === "7d" ? end - 7 * 86_400_000
      : range === "30d" ? end - 30 * 86_400_000
        : range === "90d" ? end - 90 * 86_400_000
          : range === "quarter" ? new Date(current.getFullYear(), Math.floor(current.getMonth() / 3) * 3, 1).getTime()
            : range === "ytd" ? new Date(current.getFullYear(), 0, 1).getTime()
              : range === "12m" ? new Date(current.getFullYear() - 1, current.getMonth(), current.getDate()).getTime()
                : range === "all" ? earliest
                  : startOfInputDay(customStart, end - 30 * 86_400_000);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function planningBounds(now: number, range: Exclude<ComparisonRange, "all">, customStart: string, customEnd: string) {
  if (range === "custom") {
    const start = startOfInputDay(customStart, now);
    const end = endOfInputDay(customEnd, now);
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }
  const current = new Date(now);
  if (range === "24h") {
    const start = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
    return { start, end: start + 86_400_000 - 1 };
  }
  if (range === "7d") {
    const weekday = (current.getDay() + 6) % 7;
    const start = new Date(current.getFullYear(), current.getMonth(), current.getDate() - weekday).getTime();
    return { start, end: start + 7 * 86_400_000 - 1 };
  }
  if (range === "90d") {
    const start = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
    return { start, end: start + 90 * 86_400_000 - 1 };
  }
  if (range === "quarter") {
    const quarterMonth = Math.floor(current.getMonth() / 3) * 3;
    const start = new Date(current.getFullYear(), quarterMonth, 1).getTime();
    return { start, end: new Date(current.getFullYear(), quarterMonth + 3, 1).getTime() - 1 };
  }
  if (range === "ytd") {
    const start = new Date(current.getFullYear(), 0, 1).getTime();
    return { start, end: new Date(current.getFullYear() + 1, 0, 1).getTime() - 1 };
  }
  if (range === "12m") {
    const start = new Date(current.getFullYear(), current.getMonth(), 1).getTime();
    return { start, end: new Date(current.getFullYear(), current.getMonth() + 12, 1).getTime() - 1 };
  }
  const start = new Date(current.getFullYear(), current.getMonth(), 1).getTime();
  const end = new Date(current.getFullYear(), current.getMonth() + 1, 1).getTime() - 1;
  return { start, end };
}

function BusinessCompass({ kpis }: { kpis: CommandKpi[] }) {
  const axes = [
    { label: "Commercial", ids: ["revenue-target", "mrr", "revenue-gap", "lead-conversion"] },
    { label: "Demand", ids: ["active-campaigns", "campaign-outcomes", "traffic-7d", "website-conversion"] },
    { label: "Response", ids: ["speed-to-lead", "source-attribution", "forms-7d"] },
    { label: "Customer", ids: ["active-clients", "retention", "client-attention"] },
    { label: "Evidence", ids: ["audience-confidence", "campaign-roas", "traffic-momentum"] },
  ].map(axis => ({ ...axis, score: average(axis.ids.map(id => statusScore(kpis.find(kpi => kpi.id === id)?.status ?? "blind"))) }));
  const center = 150;
  const radius = 105;
  const points = axes.map((axis, index) => polarPoint(center, center, radius * axis.score / 100, index, axes.length)).map(point => `${point.x},${point.y}`).join(" ");
  return <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(230px,.85fr)_minmax(150px,.45fr)] sm:items-center">
    <svg viewBox="0 0 300 300" role="img" aria-label="Business decision compass" className="mx-auto aspect-square w-full max-w-[330px]">
      {[25, 50, 75, 100].map(level => <polygon key={level} points={axes.map((_, index) => { const p = polarPoint(center, center, radius * level / 100, index, axes.length); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="rgba(98,232,255,.12)" strokeWidth="1" />)}
      {axes.map((axis, index) => { const end = polarPoint(center, center, radius, index, axes.length); const label = polarPoint(center, center, radius + 22, index, axes.length); return <g key={axis.label}><line x1={center} y1={center} x2={end.x} y2={end.y} stroke="rgba(98,232,255,.16)" /><text x={label.x} y={label.y} fill="rgba(166,218,227,.62)" fontSize="9" fontWeight="600" textAnchor="middle" dominantBaseline="middle">{axis.label}</text></g>; })}
      <polygon points={points} fill="rgba(98,232,255,.12)" stroke="#62e8ff" strokeWidth="2" />
      {axes.map((axis, index) => { const point = polarPoint(center, center, radius * axis.score / 100, index, axes.length); return <g key={axis.label}><circle cx={point.x} cy={point.y} r="5" fill={axis.score < 40 ? "#f87171" : axis.score < 70 ? "#fcd34d" : "#68f5d0"} /><circle cx={point.x} cy={point.y} r="10" fill="none" stroke="rgba(98,232,255,.25)" /></g>; })}
      <circle cx={center} cy={center} r="31" fill="#020b11" stroke="rgba(98,232,255,.35)" /><text x={center} y={center - 2} fill="white" fontSize="24" fontWeight="700" textAnchor="middle">{Math.round(average(axes.map(axis => axis.score)))}</text><text x={center} y={center + 14} fill="rgba(98,232,255,.58)" fontSize="7" fontWeight="700" textAnchor="middle">STATUS PTS / 100</text>
    </svg>
    <div><div className="space-y-2">{axes.map(axis => <div key={axis.label}><div className="flex items-center justify-between text-[9px]"><span className="text-white/45">{axis.label}</span><strong className={axis.score < 40 ? "text-red-300" : axis.score < 70 ? "text-amber-300" : "text-[#68f5d0]"}>{Math.round(axis.score)}/100 pts</strong></div><div className="mt-1 h-1 border border-[#62e8ff]/12 bg-black/30"><span className="block h-full bg-[#62e8ff]" style={{ width: `${axis.score}%` }} /></div></div>)}</div><p className="mt-4 border-l-2 border-[#62e8ff]/20 pl-3 text-[8px] leading-4 text-white/28">Navigation index, not a measured business percentage. Formula: mean status points for the KPIs on each axis; healthy 100, warning 60, learning 40, critical 20, blind 0.</p></div>
  </div>;
}

function DemandFlow({ snapshot }: { snapshot: CommandIntelligenceSnapshot }) {
  // `blind`/`learning` KPIs still carry a numeric 0 from the Radar. Rendering
  // that as a demand figure invents a measurement nobody took, so those stages
  // report "—" instead.
  const kpiMeasured = (id: string) => {
    const status = snapshot.kpis.find(kpi => kpi.id === id)?.status;
    return status !== undefined && status !== "learning" && status !== "blind";
  };
  const steps: Array<{ label: string; value: number | null; window: string; measured: boolean }> = [
    { label: "Pageviews", value: snapshot.demandFlow.pageviews, window: "7 days", measured: snapshot.demandFlow.pageviews !== null && kpiMeasured("traffic-7d") },
    { label: "Forms", value: snapshot.demandFlow.forms, window: "7 days", measured: snapshot.demandFlow.forms !== null && kpiMeasured("forms-7d") },
    { label: "New leads", value: snapshot.demandFlow.leads, window: "30 days", measured: true },
    { label: "Converted", value: snapshot.demandFlow.convertedLeads, window: "retained", measured: true },
    { label: "Active clients", value: snapshot.demandFlow.activeClients, window: "current", measured: true },
  ];
  const max = Math.max(1, ...steps.map(step => step.measured ? step.value ?? 0 : 0));
  return <div className="mt-5 space-y-2">{steps.map((step, index) => <div key={step.label} className="grid grid-cols-[82px_minmax(0,1fr)_54px] items-center gap-3"><div><p className="text-[9px] font-semibold text-white/62">{step.label}</p><p className="text-[7px] uppercase text-white/25">{step.measured ? step.window : "not monitored"}</p></div><div className="relative h-7 border border-[#62e8ff]/12 bg-black/25"><span className={`absolute inset-y-0 left-0 ${index < 2 ? "bg-[#62e8ff]/25" : index < 4 ? "bg-[#e5c479]/25" : "bg-[#68f5d0]/25"}`} style={{ width: `${step.measured && step.value !== null ? Math.max(step.value ? 6 : 0, step.value / max * 100) : 0}%` }} /><span className="absolute inset-y-0 left-2 flex items-center text-[7px] font-semibold uppercase text-[#8ec9d5]/38">Stage 0{index + 1}</span></div><strong className={`text-right text-sm tabular-nums ${step.measured ? "text-white/85" : "text-white/38"}`}>{step.measured && step.value !== null ? step.value.toLocaleString() : "—"}</strong></div>)}</div>;
}

function KpiInstrument({ kpi, onClick, expanded = false }: { kpi: CommandKpi; onClick: () => void; expanded?: boolean }) {
  return <button data-kpi-id={kpi.id} onClick={onClick} className={`group min-w-0 border-b border-r border-[#62e8ff]/12 p-3 text-left hover:bg-[#62e8ff]/[0.055] sm:p-4 ${expanded ? "min-h-[154px]" : "min-h-[120px]"}`} aria-label={`Inspect ${kpi.label}`}>
    <div className="flex items-start justify-between gap-2"><span className="text-[8px] font-semibold uppercase text-[#8ec9d5]/42">{String(kpi.rank).padStart(2, "0")} · {kpi.domain}</span><span className={`size-1.5 shrink-0 shadow-[0_0_7px_currentColor] ${statusDot(kpi.status)}`} title={kpi.status} /></div>
    <p className="mt-2 truncate text-[10px] font-semibold text-white/62">{kpi.shortLabel}</p><p className="mt-0.5 truncate text-[7px] uppercase text-[#62e8ff]/38">{kpi.scope.label}</p>
    <div className="mt-1 flex items-end justify-between gap-2"><strong className={`min-w-0 truncate text-xl font-semibold tabular-nums ${statusText(kpi.status)}`}>{kpi.display}</strong><KpiSparkline kpi={kpi} /></div>
    <p className="mt-1 truncate text-[7px] uppercase text-white/28" title={`${kpi.measurement.unit} · ${kpi.measurement.basis} · ${kpi.measurement.window}`}>{kpi.measurement.unit} · {kpi.measurement.window}</p>
    {expanded ? <><p className="mt-2 line-clamp-2 text-[9px] leading-4 text-white/28">{kpi.target}</p><span className="mt-2 inline-flex items-center gap-1 text-[8px] font-semibold uppercase text-[#62e8ff]/55 group-hover:text-[#8ef1ff]">Inspect formula and evidence <ArrowUpRight size={9} /></span></> : <p className="mt-2 truncate text-[8px] text-white/25">Target · {kpi.target}</p>}
  </button>;
}

function KpiSparkline({ kpi }: { kpi: CommandKpi }) {
  const values = kpi.history.length ? kpi.history.map(point => point.value) : [kpi.previousValue ?? kpi.value ?? 0, kpi.value ?? 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, index) => `${index / Math.max(1, values.length - 1) * 54},${20 - (value - min) / Math.max(1, max - min) * 16}`).join(" ");
  return <svg viewBox="0 0 54 22" className="h-[22px] w-[54px] shrink-0" aria-hidden="true"><polyline points={points} fill="none" stroke={statusColour(kpi.status)} strokeWidth="1.5" /><line x1="0" y1="21" x2="54" y2="21" stroke="rgba(98,232,255,.12)" /></svg>;
}

function CampaignPortfolioSummary({ snapshot }: { snapshot: CommandIntelligenceSnapshot }) {
  return <div className="mt-4 grid gap-px border border-[#62e8ff]/15 bg-[#62e8ff]/15 grid-cols-2"><SummaryReadout label="Active campaigns" value={String(snapshot.summary.activeCampaigns)} tone="cyan" compact /><SummaryReadout label="Recorded spend" value={money(snapshot.summary.campaignSpendCents, snapshot.currency)} tone="amber" compact /><SummaryReadout label="Attributed return" value={money(snapshot.summary.campaignRevenueCents, snapshot.currency)} tone="green" compact /><SummaryReadout label="Portfolio ROAS" value={snapshot.summary.portfolioRoas === null ? "Learning" : `${snapshot.summary.portfolioRoas.toFixed(2)}x`} tone="blue" compact /></div>;
}

function AudienceMiniSummary({ snapshot }: { snapshot: CommandIntelligenceSnapshot }) {
  const topSignals = snapshot.audienceSignals.slice(0, 5);
  return <div className="mt-4"><div className="grid grid-cols-3 gap-px border border-[#62e8ff]/15 bg-[#62e8ff]/15"><SummaryReadout label="Profiles" value={String(snapshot.summary.audienceProfiles)} tone="cyan" compact /><SummaryReadout label="Validated" value={String(snapshot.summary.validatedProfiles)} tone="green" compact /><SummaryReadout label="Markets" value={String(snapshot.summary.mappedLocations)} tone="blue" compact /></div><div className="mt-3 space-y-2">{topSignals.map(signal => <div key={signal.id} className="flex items-center justify-between gap-3 border-b border-[#62e8ff]/10 pb-2"><span className="min-w-0 truncate text-[10px] text-white/48">{signal.label}</span><span className="shrink-0 text-[8px] font-semibold uppercase text-[#8ec9d5]/42">{signal.category} · {signal.count}</span></div>)}{!topSignals.length ? <p className="text-[10px] leading-4 text-white/35">Add industries, motivations, goals and preferred channels to customer profiles to activate interest intelligence.</p> : null}</div></div>;
}

function CampaignRange({ campaign, maximum, currency }: { campaign: CommandIntelligenceCampaign; maximum: number; currency: string }) {
  return <div><div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-[10px] font-semibold text-white/65">{campaign.name}</span><span className="shrink-0 text-[8px] uppercase text-white/28">{campaign.channel}</span></div><div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_76px] items-center gap-2"><div className="relative h-4 border border-[#62e8ff]/12 bg-black/25"><span className="absolute inset-y-0 left-0 bg-[#e5c479]/35" style={{ width: `${campaign.spendCents / maximum * 100}%` }} /><span className="absolute bottom-0 left-0 h-1 bg-[#68f5d0]" style={{ width: `${Math.min(100, campaign.attributedRevenueCents / maximum * 100)}%` }} /></div><span className="text-right text-[9px] tabular-nums text-white/42">{money(campaign.spendCents, currency)}</span></div></div>;
}

function CampaignLedgerRow({ campaign, currency }: { campaign: CommandIntelligenceCampaign; currency: string }) {
  return <article className="grid gap-3 py-3 lg:grid-cols-[minmax(150px,1fr)_100px_100px_88px] lg:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`size-1.5 shrink-0 ${campaignStatusDot(campaign.status)}`} /><p className="truncate text-xs font-semibold text-white/72">{campaign.name}</p></div><p className="mt-1 truncate text-[8px] uppercase text-white/27">{campaign.kind} · {campaign.status} · {campaign.audienceProfileCount} audiences</p></div><CampaignMiniMetric label="Spend / budget" value={`${money(campaign.spendCents, currency)} / ${money(campaign.budgetCents, currency)}`} /><CampaignMiniMetric label="Leads / clients" value={`${campaign.attributedLeads} / ${campaign.attributedClients}`} /><CampaignMiniMetric label="ROAS" value={campaign.roas === null ? "Learning" : `${campaign.roas.toFixed(2)}x`} tone={campaign.roas === null ? "muted" : campaign.roas >= 3 ? "good" : campaign.roas >= 1 ? "warn" : "bad"} /></article>;
}

function CampaignMiniMetric({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "good" | "warn" | "bad" }) {
  return <div><p className="text-[7px] font-semibold uppercase text-white/24">{label}</p><p className={`mt-1 truncate text-[10px] font-semibold tabular-nums ${tone === "good" ? "text-[#68f5d0]" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-red-300" : "text-white/55"}`}>{value}</p></div>;
}

function SourceCohortChart({ snapshot }: { snapshot: CommandIntelligenceSnapshot }) {
  const rows = snapshot.sourceCohorts.slice(0, 8);
  const max = Math.max(1, ...rows.map(row => row.leads));
  return <div className="mt-4 grid gap-3 md:grid-cols-2">{rows.map(row => <div key={row.id} className="border border-[#62e8ff]/12 bg-[#020b11] p-3"><div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate text-[10px] font-semibold text-white/64">{row.label}</p><span className={`text-[8px] font-semibold uppercase ${row.ready ? "text-[#68f5d0]" : "text-sky-300/65"}`}>{row.ready ? "Comparable" : "Learning"}</span></div><div className="mt-2 h-2 border border-[#62e8ff]/12 bg-black/30"><span className="block h-full bg-[#62e8ff]/45" style={{ width: `${row.leads / max * 100}%` }} /></div><div className="mt-2 grid grid-cols-3 gap-2 text-[8px] text-white/30"><span><strong className="block text-sm text-white/72">{row.leads}</strong>leads</span><span><strong className="block text-sm text-white/72">{row.conversionRatePercent === null ? "-" : `${row.conversionRatePercent}%`}</strong>convert</span><span><strong className="block text-sm text-white/72">{row.churnRatePercent === null ? "-" : `${row.churnRatePercent}%`}</strong>churn</span></div></div>)}{!rows.length ? <div className="md:col-span-2"><EmptyEvidence title="No acquisition cohorts" detail="Source comparisons activate when leads retain their original campaign or channel source." href="/portal/agency/marketing?view=sources" linkLabel="Open lead sources" /></div> : null}</div>;
}

function AudienceMap({ snapshot }: { snapshot: CommandIntelligenceSnapshot }) {
  const mapped = snapshot.audienceLocations.filter(location => location.mapped && location.x !== null && location.y !== null);
  const unmapped = snapshot.audienceLocations.filter(location => !location.mapped);
  return <div className="mt-4">
    <div className="relative h-[260px] w-full min-w-0 overflow-hidden border border-[#62e8ff]/18 bg-[#020b11] sm:h-auto sm:aspect-[16/8.5]">
      <svg viewBox="0 0 1000 520" className="absolute inset-0 size-full opacity-55" aria-hidden="true">
        <g fill="rgba(98,232,255,.055)" stroke="rgba(98,232,255,.18)" strokeWidth="2"><path d="M82 108l78-54 111 24 75 68-35 51-73 17-25 74-86-28-34-74z"/><path d="M272 282l62 21 41 89-28 92-45-31-12-75-35-47z"/><path d="M430 103l56-39 69 20 25 43-40 28-11 49-54 2-36-48z"/><path d="M453 210l83-25 69 52 8 114-55 111-68-34-40-98z"/><path d="M571 95l136-51 143 42 75 95-52 53-100-14-43 72-76-34-18-74-73-21z"/><path d="M776 328l92-31 73 44 1 78-68 52-88-35-31-61z"/></g>
        <g stroke="rgba(98,232,255,.07)">{Array.from({ length: 9 }, (_, index) => <line key={`v${index}`} x1={100 + index * 100} y1="0" x2={100 + index * 100} y2="520" />)}{Array.from({ length: 5 }, (_, index) => <line key={`h${index}`} x1="0" y1={90 + index * 90} x2="1000" y2={90 + index * 90} />)}</g>
      </svg>
      <span className="absolute left-3 top-3 text-[7px] font-semibold uppercase text-[#62e8ff]/35">Audience locations · profile evidence</span>
      {mapped.map(location => <button key={location.id} type="button" className="group absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${location.x}%`, top: `${location.y}%` }} title={`${location.label}: ${location.profileNames.join(", ")}`}><span className="grid size-6 place-items-center rounded-full border border-[#68f5d0]/50 bg-[#68f5d0]/18 text-[8px] font-bold text-[#b8ffed] shadow-[0_0_16px_rgba(104,245,208,.28)] group-hover:scale-125">{location.count}</span><span className="absolute left-1/2 top-7 -translate-x-1/2 whitespace-nowrap text-[7px] font-semibold text-[#b7edf5]/55">{location.label}</span></button>)}
      {!mapped.length ? <div className="absolute inset-0 grid place-items-center p-6 text-center"><div><MapPin className="mx-auto text-[#62e8ff]/40" size={22} /><p className="mt-2 text-xs font-semibold text-white/55">No mapped audience locations</p><p className="mt-1 max-w-sm text-[10px] leading-4 text-white/28">Add recognisable cities, regions or countries to customer profiles. The map will never invent a location.</p></div></div> : null}
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[8px] font-semibold uppercase text-white/28"><span>{mapped.length} mapped markets · {unmapped.length} unmapped labels</span>{unmapped.length ? <span title={unmapped.map(location => location.label).join(", ")} className="text-amber-300/65">Review: {unmapped.slice(0, 3).map(location => location.label).join(" · ")}{unmapped.length > 3 ? ` +${unmapped.length - 3}` : ""}</span> : <span className="text-[#68f5d0]/65">All locations resolved</span>}</div>
  </div>;
}

function SignalBank({ signals }: { signals: CommandAudienceSignal[] }) {
  const max = Math.max(1, ...signals.map(signal => signal.count));
  return <div className="mt-4 space-y-3">{signals.map(signal => <div key={signal.id}><div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-[10px] text-white/58" title={signal.profileNames.join(", ")}>{signal.label}</span><span className="shrink-0 text-[8px] font-semibold uppercase text-[#8ec9d5]/38">{signal.category} · {signal.count}</span></div><div className="mt-1 h-1.5 border border-[#62e8ff]/10 bg-black/30"><span className="block h-full bg-[#62e8ff]/45" style={{ width: `${Math.max(8, signal.count / max * 100)}%` }} /></div></div>)}{!signals.length ? <p className="border-y border-[#62e8ff]/10 py-8 text-center text-[10px] leading-4 text-white/32">No stored signals in this category. Add them to customer profiles to activate the comparison.</p> : null}</div>;
}

function DemographicBank({ demographics }: { demographics: CommandAudienceDemographic[] }) {
  const max = Math.max(1, ...demographics.map(item => item.count));
  return <div className="mt-4 grid gap-px border border-[#62e8ff]/14 bg-[#62e8ff]/14 sm:grid-cols-2 xl:grid-cols-4">
    {demographics.slice(0, 16).map(item => <div key={item.id} className="min-w-0 bg-[#020b11] p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[7px] font-semibold uppercase text-[#62e8ff]/42">{item.category}</p><p className="mt-1 truncate text-[10px] font-semibold text-white/62" title={item.label}>{item.label}</p></div><span className="text-sm font-semibold tabular-nums text-[#68f5d0]">{item.count}</span></div><div className="mt-2 h-1 border border-[#62e8ff]/10 bg-black/30"><span className="block h-full bg-[#68f5d0]/45" style={{ width: `${Math.max(10, item.count / max * 100)}%` }} /></div><p className="mt-2 truncate text-[7px] text-white/22" title={item.profileNames.join(", ")}>{item.profileNames.join(" · ")}</p></div>)}
    {!demographics.length ? <div className="p-8 text-center sm:col-span-2 xl:col-span-4"><UsersRound className="mx-auto text-[#62e8ff]/35" size={20} /><p className="mt-2 text-xs font-semibold text-white/52">Demographic evidence is not recorded yet</p><p className="mx-auto mt-1 max-w-lg text-[10px] leading-4 text-white/28">Add age ranges, languages, life stages, income notes, company sizes and decision roles to customer profiles. Empty fields remain visibly empty.</p></div> : null}
  </div>;
}

function AudienceProfileInspector({ profile, onClose }: { profile: CommandAudienceProfileSummary; onClose: () => void }) {
  // Modal keyboard contract: focus enters the inspector, Tab stays inside, Escape closes, focus returns to the row that opened it.
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: onClose });
  const fields: Array<{ label: string; value?: string | string[] | number }> = [
    { label: "Segment", value: profile.segment },
    { label: "Audience type", value: profile.audienceType },
    { label: "Priority", value: profile.priority },
    { label: "Evidence confidence", value: profile.confidence },
    { label: "Estimated audience", value: profile.estimatedAudienceSize },
    { label: "Age range", value: profile.ageRange },
    { label: "Languages", value: profile.languages },
    { label: "Gender notes", value: profile.genderNotes },
    { label: "Income range", value: profile.incomeRange },
    { label: "Life stage", value: profile.lifeStage },
    { label: "Locations", value: profile.locations },
    { label: "Industries", value: profile.industries },
    { label: "Company size", value: profile.companySize },
    { label: "Business stage", value: profile.businessStage },
    { label: "Job titles", value: profile.jobTitles },
    { label: "Decision roles", value: profile.decisionRoles },
    { label: "Goals", value: profile.goals },
    { label: "Pain points", value: profile.painPoints },
    { label: "Motivations", value: profile.motivations },
    { label: "Objections", value: profile.objections },
    { label: "Buying triggers", value: profile.buyingTriggers },
    { label: "Preferred channels", value: profile.preferredChannels },
    { label: "Content preferences", value: profile.contentPreferences },
    { label: "Offer fit", value: profile.offerFit },
    { label: "Typical budget", value: profile.typicalBudget },
    { label: "Buying cycle", value: profile.buyingCycle },
    { label: "Research notes", value: profile.researchNotes },
  ];
  return <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}><section role="dialog" ref={dialogRef} aria-modal="true" aria-labelledby="audience-profile-heading" className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto border border-[#62e8ff]/28 bg-[#020b11] shadow-[0_24px_80px_rgba(0,0,0,.55)]"><header className="flex items-start justify-between gap-4 border-b border-[#62e8ff]/16 px-4 py-4 sm:px-5"><div><p className="text-[8px] font-semibold uppercase text-[#62e8ff]/55">AUD-04 · Recorded customer intelligence</p><h2 id="audience-profile-heading" className="mt-1 text-lg font-semibold text-white">{profile.name}</h2><p className="mt-1 text-[9px] uppercase text-white/30">{profile.status} · updated {formatAge(profile.updatedAt)}</p></div><button onClick={onClose} title="Close customer profile" className="grid size-9 shrink-0 place-items-center border border-white/10 text-white/50 hover:bg-white/[0.06] hover:text-white"><X size={15} /></button></header><div className="p-4 sm:p-5"><div className="grid gap-px border border-[#62e8ff]/14 bg-[#62e8ff]/14 md:grid-cols-2">{fields.map(field => <ProfileField key={field.label} label={field.label} value={field.value} />)}</div><Link href="/portal/agency/marketing?view=customer-profiles" className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 border border-[#62e8ff]/25 bg-[#62e8ff]/[0.08] px-4 text-xs font-semibold text-[#8ef1ff] hover:bg-[#62e8ff]/[0.13]">Edit customer profiles <ArrowUpRight size={13} /></Link></div></section></div>;
}

function ProfileField({ label, value }: { label: string; value?: string | string[] | number }) {
  const display = Array.isArray(value) ? value.join(" · ") : typeof value === "number" ? value.toLocaleString() : value?.trim();
  return <div className="min-w-0 bg-[#031018] p-3"><p className="text-[7px] font-semibold uppercase text-[#8ec9d5]/38">{label}</p><p className={`mt-1 break-words text-[10px] leading-4 ${display ? "text-white/62" : "text-white/24"}`}>{display || "Not recorded"}</p></div>;
}

function KpiInspector({ kpi, currency, onClose }: { kpi: CommandKpi; currency: string; onClose: () => void }) {
  // Modal keyboard contract: focus enters the inspector, Tab stays inside, Escape closes, focus returns to the KPI that opened it.
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: onClose });
  return <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}><section role="dialog" ref={dialogRef} aria-modal="true" aria-labelledby="kpi-inspector-heading" className="max-h-[90dvh] w-full max-w-xl overflow-y-auto border border-[#62e8ff]/28 bg-[#020b11] shadow-[0_24px_80px_rgba(0,0,0,.55)]"><header className="flex items-start justify-between gap-4 border-b border-[#62e8ff]/16 px-4 py-4 sm:px-5"><div><p className="text-[8px] font-semibold uppercase text-[#62e8ff]/55">INT-{String(kpi.rank).padStart(2, "0")} · {kpi.domain} instrument</p><h2 id="kpi-inspector-heading" className="mt-1 text-lg font-semibold text-white">{kpi.label}</h2><p className="mt-1 text-[9px] uppercase text-[#62e8ff]/48">Scope · {kpi.scope.label}</p></div><button onClick={onClose} title="Close KPI detail" className="grid size-9 shrink-0 place-items-center border border-white/10 text-white/50 hover:bg-white/[0.06] hover:text-white"><X size={15} /></button></header><div className="p-4 sm:p-5"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4"><div><p className={`text-3xl font-semibold tabular-nums ${statusText(kpi.status)}`}>{kpi.display}</p><p className="mt-1 text-[9px] font-semibold uppercase text-white/30">{kpi.measurement.unit} · {kpi.status} · measured {formatAge(kpi.measuredAt)}</p></div><KpiSparkline kpi={kpi} /></div><p className="mt-5 text-sm leading-6 text-white/55">{kpi.detail}</p><div className="mt-5 border border-[#62e8ff]/18 bg-[#62e8ff]/[0.035] p-4"><p className="text-[8px] font-semibold uppercase text-[#62e8ff]/60">What this number means</p><dl className="mt-2 divide-y divide-[#62e8ff]/10 text-xs"><InspectorRow label="Unit" value={kpi.measurement.unit} /><InspectorRow label="Denominator" value={kpi.measurement.basis} /><InspectorRow label="Window" value={kpi.measurement.window} /><InspectorRow label="Formula" value={kpi.measurement.formula} /></dl></div><dl className="mt-5 divide-y divide-[#62e8ff]/12 border-y border-[#62e8ff]/12 text-xs"><InspectorRow label="Scope" value={`${kpi.scope.label} · ${kpi.scope.kind}`} /><InspectorRow label="Target" value={kpi.target} /><InspectorRow label="Baseline" value={kpi.plan.baselineValue === null ? "Not connected" : formatKpiValue(kpi.plan.baselineValue, kpi.format, currency)} /><InspectorRow label="Plan target" value={kpi.plan.targetValue === null ? "Not approved" : formatKpiValue(kpi.plan.targetValue, kpi.format, currency)} /><InspectorRow label="Plan source" value={`${kpi.plan.source} · ${kpi.plan.cadence}`} /><InspectorRow label="Source" value={kpi.sourceId} /><InspectorRow label="Sample" value={kpi.sampleSize === undefined ? "Not supplied" : `${kpi.sampleSize.toLocaleString()} ${kpi.measurement.basis}`} /><InspectorRow label="History" value={kpi.history.length ? `${kpi.history.length} retained points` : "Building baseline"} /></dl><div className="mt-5"><p className="text-[8px] font-semibold uppercase text-[#62e8ff]/55">Evidence</p><ul className="mt-2 divide-y divide-white/8 border-y border-white/8">{kpi.evidence.map(item => <li key={item} className="flex gap-2 py-2 text-[11px] leading-4 text-white/45"><CheckCircle2 size={12} className="mt-0.5 shrink-0 text-[#68f5d0]/65" />{item}</li>)}</ul></div><Link href={kpi.href} className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 border border-[#62e8ff]/25 bg-[#62e8ff]/[0.08] px-4 text-xs font-semibold text-[#8ef1ff] hover:bg-[#62e8ff]/[0.13]">Open operating workspace <ArrowUpRight size={13} /></Link></div></section></div>;
}

function ViewButton({ active, icon, label, detail, onClick }: { active: boolean; icon: React.ReactNode; label: string; detail: string; onClick: () => void }) {
  return <button onClick={onClick} aria-pressed={active} className={`relative flex min-h-[58px] min-w-0 items-center gap-2.5 border-b border-r border-[#62e8ff]/10 px-3 text-left ${active ? "bg-[#62e8ff]/[0.08] text-white" : "text-white/45 hover:bg-[#62e8ff]/[0.045] hover:text-white"}`}><span className={active ? "text-[#68f5d0]" : "text-[#62e8ff]/55"}>{icon}</span><span className="min-w-0"><span className="block truncate text-[11px] font-semibold">{label}</span><span className="block truncate text-[8px] text-[#8ec9d5]/38">{detail}</span></span>{active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#62e8ff] shadow-[0_0_8px_#62e8ff]" /> : null}</button>;
}

// `titleId` renders the id that an owning section points at with
// `aria-labelledby` — without it the reference dangles and the section is
// announced with no name at all.
function SectionHeading({ eyebrow, title, detail, icon, compact = false, titleId }: { eyebrow: string; title: string; detail: string; icon: React.ReactNode; compact?: boolean; titleId?: string }) {
  return <div className="flex min-w-0 items-start gap-2.5"><span className={`grid shrink-0 place-items-center border border-[#62e8ff]/18 bg-[#62e8ff]/[0.055] text-[#62e8ff] ${compact ? "size-7" : "size-8"}`}>{icon}</span><div className="min-w-0"><p className="text-[7px] font-semibold uppercase text-[#76dff1]/50">{eyebrow}</p><h3 id={titleId} className={`mt-0.5 font-semibold text-white/82 ${compact ? "text-xs" : "text-sm"}`}>{title}</h3><p className="mt-0.5 text-[9px] leading-4 text-white/30">{detail}</p></div></div>;
}

function SummaryReadout({ label, value, tone, compact = false }: { label: string; value: string; tone: "cyan" | "green" | "amber" | "red" | "blue"; compact?: boolean }) {
  return <div className={`${compact ? "min-h-[72px] p-3" : "min-h-[82px] p-3 sm:p-4"} border-b border-r border-[#62e8ff]/12 bg-[#020b11]`}><p className="text-[7px] font-semibold uppercase text-white/28">{label}</p><p className={`mt-1 truncate font-semibold tabular-nums ${compact ? "text-base" : "text-xl"} ${tone === "green" ? "text-[#68f5d0]" : tone === "amber" ? "text-amber-300" : tone === "red" ? "text-red-300" : tone === "blue" ? "text-sky-300" : "text-[#62e8ff]"}`}>{value}</p></div>;
}

function InspectorRow({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3 py-2.5"><dt className="text-white/28">{label}</dt><dd className="break-words text-right font-medium text-white/58">{value}</dd></div>; }

function EmptyEvidence({ title, detail, href, linkLabel }: { title: string; detail: string; href: string; linkLabel: string }) { return <div className="p-8 text-center"><Info className="mx-auto text-[#62e8ff]/42" size={20} /><p className="mt-2 text-xs font-semibold text-white/58">{title}</p><p className="mx-auto mt-1 max-w-md text-[10px] leading-4 text-white/30">{detail}</p><Link href={href} className="mt-3 inline-flex min-h-8 items-center gap-1.5 border border-[#62e8ff]/18 px-2.5 text-[9px] font-semibold uppercase text-[#8ef1ff]">{linkLabel} <ArrowUpRight size={10} /></Link></div>; }

function statusScore(status: CommandKpiStatus): number { if (status === "healthy") return 100; if (status === "warning") return 60; if (status === "critical") return 20; if (status === "learning") return 40; return 0; }
function statusText(status: CommandKpiStatus): string { if (status === "critical") return "text-red-300"; if (status === "warning") return "text-amber-300"; if (status === "healthy") return "text-[#68f5d0]"; if (status === "learning") return "text-sky-300"; return "text-white/38"; }
function statusDot(status: CommandKpiStatus): string { if (status === "critical") return "bg-red-400 text-red-400"; if (status === "warning") return "bg-amber-300 text-amber-300"; if (status === "healthy") return "bg-[#68f5d0] text-[#68f5d0]"; if (status === "learning") return "bg-sky-300 text-sky-300"; return "bg-white/25 text-white/25"; }
function statusColour(status: CommandKpiStatus): string { if (status === "critical") return "#f87171"; if (status === "warning") return "#fcd34d"; if (status === "healthy") return "#68f5d0"; if (status === "learning") return "#7dd3fc"; return "rgba(255,255,255,.35)"; }
function confidenceClass(value: string): string { if (value === "validated") return "border-[#68f5d0]/25 bg-[#68f5d0]/[0.07] text-[#91f4dc]"; if (value === "informed") return "border-sky-300/25 bg-sky-300/[0.07] text-sky-200"; return "border-amber-300/25 bg-amber-300/[0.07] text-amber-200"; }
function campaignStatusDot(status: string): string { if (["active", "sending"].includes(status)) return "bg-[#68f5d0] shadow-[0_0_7px_#68f5d0]"; if (status === "scheduled") return "bg-sky-300"; if (status === "paused") return "bg-amber-300"; return "bg-white/25"; }
function polarPoint(cx: number, cy: number, radius: number, index: number, count: number) { const angle = -Math.PI / 2 + index / count * Math.PI * 2; return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }; }
function average(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function money(cents: number, currency: string): string { return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100); }
function formatShortTime(value: number): string { return formatUkDate(value, { hour: "2-digit", minute: "2-digit", hour12: false }); }
function formatDateTime(value: number): string { return formatUkDate(value, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
function formatAge(value: number): string { const elapsed = Math.max(0, Date.now() - value); if (elapsed < 60_000) return "just now"; if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`; if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`; return `${Math.floor(elapsed / 86_400_000)}d ago`; }
function statusSort(status: CommandKpiStatus): number { return status === "critical" ? 0 : status === "warning" ? 1 : status === "blind" ? 2 : status === "learning" ? 3 : 4; }
function domainLabel(domain: string): string { return domain === "inbox" ? "Inbox" : domain.charAt(0).toUpperCase() + domain.slice(1); }
function dateInput(value: number): string { return dateInputValue(value); }
function startOfInputDay(value: string, fallback: number): number { const parsed = new Date(`${value}T00:00:00`).getTime(); return Number.isFinite(parsed) ? parsed : fallback; }
function endOfInputDay(value: string, fallback: number): number { const parsed = new Date(`${value}T23:59:59.999`).getTime(); return Number.isFinite(parsed) ? parsed : fallback; }
function comparisonDuration(start: number, end: number): string { const days = Math.max(0, (end - start) / 86_400_000); return days < 1 ? `${Math.max(1, Math.round(days * 24))} hours` : `${roundNumber(days, days < 7 ? 1 : 0)} days`; }
function comparisonRangeLabel(range: ComparisonRange, mode: ComparisonMode): string {
  if (mode === "plan" && range === "24h") return "Today";
  if (mode === "plan" && range === "7d") return "This week";
  if (mode === "plan" && range === "30d") return "This month";
  if (range === "quarter") return "Quarter";
  if (range === "ytd") return "YTD";
  if (range === "12m") return "12 months";
  return range;
}
function compactNumber(value: number): string { return new Intl.NumberFormat("en-GB", { notation: Math.abs(value) >= 10_000 ? "compact" : "standard", maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0 }).format(value); }
function chartTimeLabel(value: number, span: number): string { return span <= 2 * 86_400_000 ? formatUkDate(value, { hour: "2-digit", minute: "2-digit" }) : formatUkDate(value, { day: "2-digit", month: "short" }); }
function formatKpiValue(value: number, format: CommandKpiFormat, currency: string): string { if (format === "currency") return money(value, currency); if (format === "percent") return `${roundNumber(value, 1)}%`; if (format === "score") return `${roundNumber(value, 0)}/100`; if (format === "duration") return value < 60_000 ? `${Math.round(value / 1_000)}s` : value < 3_600_000 ? `${Math.round(value / 60_000)}m` : `${roundNumber(value / 3_600_000, 1)}h`; return compactNumber(value); }
function planningDisplayValue(value: number, format: CommandKpiFormat): number { return format === "currency" ? roundNumber(value / 100, 2) : roundNumber(value, 2); }
function planningStoredValue(value: number, format: CommandKpiFormat): number { return format === "currency" ? Math.round(value * 100) : value; }
function finiteValue(value: number | null | undefined): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function planProgress(value: number, baseline: number, target: number, direction: CommandKpi["plan"]["direction"]): number {
  if (baseline !== target) return (value - baseline) / (target - baseline) * 100;
  const scale = Math.max(1, Math.abs(target), Math.abs(value));
  return 100 + (direction === "higher" ? value - target : target - value) / scale * 100;
}
function directionalDifference(actual: number, expected: number, direction: CommandKpi["plan"]["direction"]): number { return direction === "higher" ? actual - expected : expected - actual; }
function directionalShortfall(actual: number, target: number, direction: CommandKpi["plan"]["direction"]): number { return direction === "higher" ? target - actual : actual - target; }
function signedKpiValue(value: number, format: CommandKpiFormat, currency: string): string { return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatKpiValue(Math.abs(value), format, currency)}`; }
function gapLabel(value: number, format: CommandKpiFormat, currency: string): string { return value > 0 ? `${formatKpiValue(value, format, currency)} short` : value < 0 ? `${formatKpiValue(Math.abs(value), format, currency)} ahead` : "On target"; }
function roundNumber(value: number, precision: number): number { const factor = 10 ** precision; return Math.round(value * factor) / factor; }
