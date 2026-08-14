"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  FileCheck2,
  Flag,
  Gauge,
  Landmark,
  Layers3,
  Map,
  Package,
  PlugZap,
  Plus,
  Route,
  Save,
  ShieldCheck,
  Target,
  Telescope,
  Trash2,
  TrendingUp,
  UsersRound,
} from "lucide-react";

import { COMMAND_PRIMARY_KPI_STATIONS, type CommandIntelligenceSnapshot, type CommandKpi } from "@/lib/commandIntelligence";
import type { CompanyObjective, CompanyPlan, CompanyProfile, CompanyQuarterlyEvidenceSnapshot } from "@/server/types";
import { applyIntelligenceScope, KpiComparisonWorkspace } from "./_CommandIntelligenceWorkspace";
import { CapitalOwnershipWorkspace } from "./_CapitalOwnershipWorkspace";
import { QuarterlyStrategyReview } from "./_QuarterlyStrategyReview";

export type BattleTableSection = "overview" | "intelligence" | "strategy" | "projections" | "objectives" | "capacity" | "plans" | "capital" | "reviews" | "systems";

export type BattleTableActuals = {
  monthRevenueCents: number;
  previousMonthRevenueCents: number;
  monthlyRevenueGrowthPercent: number | null;
  mrrCents: number;
  currency: string;
  financeConnected: boolean;
  activeClients: number;
  clientsNeedingAttention: number;
  leadCount: number;
  meetingsThisMonth: number;
  completedSalesCalls: number;
  openTasks: number;
  overdueTasks: number;
};

export type BattleTablePayload = {
  companyName: string;
  initial: CompanyProfile;
  actuals: BattleTableActuals;
  healthScore: number;
  staffCount: number;
  brandCount: number;
  productCount: number;
  legalCount: number;
  connectedSources: number;
  totalSources: number;
  canEdit: boolean;
  scopes?: BattleTableScopePayload[];
};

export type BattleTableScopePayload = {
  id: string;
  companyId: string | null;
  label: string;
  kind: "aggregate" | "company";
  detail: string;
  initial: CompanyProfile;
  actuals: BattleTableActuals;
  healthScore: number;
  staffCount: number;
  productCount: number;
  legalCount: number;
  coverage: string[];
};

const sections: Array<{ id: BattleTableSection; label: string; icon: React.ReactNode }> = [
  { id: "overview", label: "Strategic plot", icon: <Map size={14} /> },
  { id: "intelligence", label: "KPI intelligence", icon: <BarChart3 size={14} /> },
  { id: "strategy", label: "Direction", icon: <Telescope size={14} /> },
  { id: "projections", label: "Projections", icon: <TrendingUp size={14} /> },
  { id: "objectives", label: "Objectives", icon: <Target size={14} /> },
  { id: "capacity", label: "Capacity", icon: <Gauge size={14} /> },
  { id: "plans", label: "Plans", icon: <Route size={14} /> },
  { id: "capital", label: "Capital & ownership", icon: <CircleDollarSign size={14} /> },
  { id: "reviews", label: "Reviews", icon: <BookOpenCheck size={14} /> },
  { id: "systems", label: "Executive systems", icon: <Layers3 size={14} /> },
];

export function BattleTableWorkspace({ payload, intelligence, onOpenIntelligence, initialSection = "overview", initialScopeId = "ecosystem" }: { payload: BattleTablePayload; intelligence: CommandIntelligenceSnapshot; onOpenIntelligence: (kpiIds?: string[], scopeId?: string) => void; initialSection?: BattleTableSection; initialScopeId?: string }) {
  const scopes = payload.scopes?.length ? payload.scopes : [fallbackBattleScope(payload)];
  const [scopeId, setScopeId] = useState(scopes.some(scope => scope.id === initialScopeId) ? initialScopeId : scopes[0]!.id);
  const selectedScope = scopes.find(scope => scope.id === scopeId) ?? scopes[0]!;
  const intelligenceScope = intelligence.scopes.find(scope => scope.id === selectedScope.id) ?? intelligence.scopes[0]!;
  const scopedIntelligence = useMemo(() => applyIntelligenceScope(intelligence, intelligenceScope), [intelligence, intelligenceScope]);
  const [profiles, setProfiles] = useState<Record<string, CompanyProfile>>(() => Object.fromEntries(scopes.map(scope => [scope.id, scope.initial])));
  const company = profiles[selectedScope.id] ?? selectedScope.initial;
  const activePayload: BattleTablePayload = { ...payload, companyName: selectedScope.label, initial: company, actuals: selectedScope.actuals, healthScore: selectedScope.healthScore, staffCount: selectedScope.staffCount, productCount: selectedScope.productCount, legalCount: selectedScope.legalCount };
  const [section, setSection] = useState<BattleTableSection>(initialSection);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const calculations = useMemo(() => strategicCalculations(company, selectedScope.actuals), [company, selectedScope.actuals]);

  async function save(next: CompanyProfile, success = "Battle Table updated.") {
    if (!payload.canEdit) return false;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const endpoint = selectedScope.companyId ? `/api/portal/company?companyId=${encodeURIComponent(selectedScope.companyId)}` : "/api/portal/company?scope=parent";
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; company?: CompanyProfile; error?: string } | null;
      if (!response.ok || !result?.ok || !result.company) throw new Error(result?.error || "The executive plan could not be saved.");
      setProfiles(current => ({ ...current, [selectedScope.id]: result.company! }));
      setMessage(success);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The executive plan could not be saved.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function selectSection(next: BattleTableSection) {
    setSection(next);
    window.requestAnimationFrame(() => document.getElementById("battle-table-body")?.scrollTo({ top: 0, behavior: "smooth" }));
  }

  return <section className="aqua-battle-table relative min-h-[46rem] overflow-hidden border border-[#d7b56d]/30 bg-[#050b0e] text-white" aria-labelledby="battle-table-heading">
    <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" style={{ backgroundImage: "linear-gradient(rgba(215,181,109,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(98,232,255,.025) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
    <header className="relative flex min-h-[78px] flex-wrap items-center justify-between gap-4 border-b border-[#d7b56d]/25 bg-[#071116]/95 px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center border border-[#d7b56d]/45 bg-[#d7b56d]/[0.07] text-[#e4c783] shadow-[inset_0_0_18px_rgba(215,181,109,.08),0_0_16px_rgba(215,181,109,.08)]"><Map size={20} /><span className="absolute -right-1 -top-1 size-2 bg-[#68f5d0] shadow-[0_0_8px_#68f5d0]" /></span>
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">BT-01 - Strategic operations room - {selectedScope.label}</p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 id="battle-table-heading" className="text-lg font-semibold">Battle Table</h1><span className="text-[9px] font-semibold uppercase text-[#62e8ff]/65">Strategy, projections, targets and executive decisions</span></div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase">
        {message ? <span role="status" className="hidden text-[#68f5d0] md:inline">{message}</span> : null}
        {error ? <span role="alert" className="hidden text-red-300 md:inline">{error}</span> : null}
        <span className="border border-[#68f5d0]/22 bg-[#68f5d0]/[0.05] px-3 py-2 text-[#68f5d0]">{saving ? "Saving plot" : "Strategy live"}</span>
      </div>
    </header>

    <section className="relative grid border-b border-[#d7b56d]/20 bg-[#050d11]/96 lg:grid-cols-[minmax(240px,.55fr)_minmax(0,1fr)_auto] lg:items-stretch" aria-label="Battle Table scope">
      <label className="border-b border-[#d7b56d]/14 p-3 lg:border-b-0 lg:border-r sm:px-5">
        <span className="flex items-center gap-2 text-[8px] font-semibold uppercase text-[#e4c783]/60"><Building2 size={12} /> Projection scope</span>
        <select value={selectedScope.id} onChange={event => { setScopeId(event.target.value); setMessage(""); setError(""); }} className="mt-2 min-h-10 w-full border border-[#d7b56d]/24 bg-[#071116] px-3 text-xs font-semibold text-white outline-none focus:border-[#d7b56d]/60">
          <optgroup label="Combined"><option value="ecosystem">Whole Aqua ecosystem</option></optgroup>
          {scopes.some(scope => scope.kind === "company") ? <optgroup label="Trading brands">{scopes.filter(scope => scope.kind === "company").map(scope => <option key={scope.id} value={scope.id}>{scope.label}</option>)}</optgroup> : null}
        </select>
      </label>
      <div className="min-w-0 border-b border-[#d7b56d]/14 px-4 py-3 lg:border-b-0 lg:border-r sm:px-5"><p className="text-xs font-semibold text-white/78">{selectedScope.kind === "aggregate" ? "Defined aggregate" : "Exact company plan"} · {selectedScope.label}</p><p className="mt-1 text-[9px] leading-4 text-white/35">{selectedScope.detail}</p></div>
      <div className="flex min-w-[250px] flex-wrap content-center gap-1.5 px-4 py-3 sm:px-5">{selectedScope.coverage.map(item => <span key={item} className="border border-[#62e8ff]/15 bg-[#62e8ff]/[0.04] px-2 py-1 text-[7px] font-semibold uppercase text-[#8ec9d5]/55">{item}</span>)}</div>
    </section>

    <nav aria-label="Battle Table views" className="relative grid grid-flow-col auto-cols-[minmax(9.5rem,1fr)] overflow-x-auto border-b border-[#d7b56d]/20 bg-[#061016]/96 xl:grid-flow-row xl:grid-cols-10">
      {sections.map(item => <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => selectSection(item.id)} className={`flex min-h-14 items-center justify-center gap-2 border-r border-[#d7b56d]/12 px-3 text-[10px] font-semibold uppercase transition ${section === item.id ? "bg-[#d7b56d]/[0.12] text-[#f1dba9] shadow-[inset_0_-2px_0_#d7b56d]" : "text-white/45 hover:bg-white/[0.035] hover:text-white/78"}`}>{item.icon}{item.label}</button>)}
    </nav>

    <div id="battle-table-body" className="relative max-h-[calc(100dvh-13rem)] min-h-[38rem] overflow-y-auto">
      {section === "overview" ? <StrategicOverview payload={activePayload} company={company} calculations={calculations} onSelect={selectSection} /> : null}
      {section === "intelligence" ? <KpiStrategyWorkspace snapshot={scopedIntelligence} initialScopeId={selectedScope.id} onOpenIntelligence={onOpenIntelligence} /> : null}
      {section === "strategy" ? <StrategyEditor key={`${selectedScope.id}:strategy`} company={company} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "projections" ? <ProjectionWorkspace key={`${selectedScope.id}:projections`} payload={activePayload} company={company} calculations={calculations} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "objectives" ? <ObjectivesWorkspace key={`${selectedScope.id}:objectives`} company={company} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "capacity" ? <CapacityWorkspace key={`${selectedScope.id}:capacity`} company={company} calculations={calculations} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "plans" ? <PlansWorkspace key={`${selectedScope.id}:plans`} company={company} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "capital" ? <CapitalOwnershipWorkspace key={`${selectedScope.id}:capital`} company={company} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "reviews" ? <ReviewsWorkspace key={`${selectedScope.id}:reviews`} payload={activePayload} calculations={calculations} company={company} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "systems" ? <ExecutiveSystems payload={activePayload} /> : null}
    </div>
  </section>;
}

function StrategicOverview({ payload, company, calculations, onSelect }: { payload: BattleTablePayload; company: CompanyProfile; calculations: StrategicCalculations; onSelect: (section: BattleTableSection) => void }) {
  const activeObjectives = company.objectives.filter(item => item.status !== "complete");
  const atRiskObjectives = activeObjectives.filter(item => item.status === "at-risk");
  const activePlans = company.plans.filter(item => item.status === "active" || item.status === "planned");
  const capitalExceptions = capitalAttentionCount(company);
  return <div className="grid min-w-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.72fr)]">
    <div className="min-w-0 border-b border-[#d7b56d]/16 xl:border-b-0 xl:border-r">
      <div className="grid grid-cols-2 border-b border-[#d7b56d]/16 sm:grid-cols-3 lg:grid-cols-5">
        <BattleMetric label="Strategic health" value={`${payload.healthScore} pts`} detail={`Of 100 weighted points · ${payload.healthScore < 40 ? "recovery required" : payload.healthScore < 70 ? "watch position" : "plan holding"}`} tone={payload.healthScore < 40 ? "critical" : payload.healthScore < 70 ? "warning" : "clear"} />
        <BattleMetric label="Revenue position" value={`${calculations.revenueProgress}%`} detail={`${money(payload.actuals.monthRevenueCents, payload.actuals.currency)} / ${money(company.monthlyRevenueTargetCents, payload.actuals.currency)}`} tone={calculations.revenueProgress < 50 ? "critical" : calculations.revenueProgress < 80 ? "warning" : "clear"} />
        <BattleMetric label="Objective readiness" value={`${calculations.objectiveProgress}%`} detail={`Mean progress across ${company.objectives.length} objective${company.objectives.length === 1 ? "" : "s"} · ${atRiskObjectives.length} at risk`} tone={atRiskObjectives.length ? "warning" : "clear"} />
        <BattleMetric label="Capacity load" value={`${calculations.capacity.utilisationPercent}%`} detail={`${calculations.capacity.requiredHours}h required / ${company.capacity.weeklyAvailableHours}h available · ${calculations.capacity.headroomHours}h headroom`} tone={calculations.capacity.utilisationPercent >= company.capacity.hiringTriggerPercent ? "critical" : calculations.capacity.utilisationPercent >= 70 ? "warning" : "clear"} />
        <BattleMetric label="Target gap" value={money(calculations.revenueGapCents, payload.actuals.currency)} detail={`${calculations.dealsNeeded} deals / ${calculations.callsNeeded} calls`} tone={calculations.revenueGapCents ? "warning" : "clear"} />
      </div>

      <section className="p-4 sm:p-6" aria-label="Executive projection plot">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-[9px] font-semibold uppercase text-[#62e8ff]/58">{payload.companyName} · Strategic plotting surface · {company.projection.horizonMonths} month horizon</p><h2 className="mt-1 text-xl font-semibold">Revenue trajectory and target corridor</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-white/42">Current-month paid income for this exact scope is plotted against its retained base and target assumptions. Approved targets remain authoritative; changing the scenario never rewrites actual performance.</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onSelect("intelligence")} className="inline-flex min-h-9 items-center gap-2 border border-[#62e8ff]/22 bg-[#62e8ff]/[0.055] px-3 text-[10px] font-semibold uppercase text-[#8ef1ff] hover:bg-[#62e8ff]/[0.1]"><BarChart3 size={14} /> KPI trends</button><button type="button" onClick={() => onSelect("projections")} className="inline-flex min-h-9 items-center gap-2 border border-[#d7b56d]/25 bg-[#d7b56d]/[0.07] px-3 text-[10px] font-semibold uppercase text-[#f1dba9] hover:bg-[#d7b56d]/[0.12]"><Telescope size={14} /> Run scenarios</button></div>
        </div>
        <ProjectionChart calculations={calculations} currency={payload.actuals.currency} />
        <div className="mt-3 grid border border-[#d7b56d]/16 sm:grid-cols-3">
          <PlotReadout label="Paid income this month" value={money(payload.actuals.monthRevenueCents, payload.actuals.currency)} detail={payload.actuals.financeConnected ? `Finance evidence allocated to ${payload.companyName}` : "Awaiting finance evidence"} />
          <PlotReadout label="Base case exit" value={money(calculations.baseExitCents, payload.actuals.currency)} detail={`${signed(company.projection.baseMonthlyGrowthPercent)}% monthly assumption`} />
          <PlotReadout label="Target case exit" value={money(calculations.targetExitCents, payload.actuals.currency)} detail={`${signed(company.projection.targetMonthlyGrowthPercent)}% monthly assumption`} tone="gold" />
        </div>
      </section>
    </div>

    <aside className="grid content-start bg-[#071116]/80">
      <div className="border-b border-[#d7b56d]/16 p-5">
        <p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">Executive directive</p>
        <h2 className="mt-1 text-lg font-semibold">{company.vision || "Define the future position"}</h2>
        <p className="mt-3 text-xs leading-5 text-white/42">{company.mission || "Record the mission that every product, hire, campaign and expansion decision must support."}</p>
        <button type="button" onClick={() => onSelect("strategy")} className="mt-4 inline-flex min-h-8 items-center gap-2 text-[10px] font-semibold uppercase text-[#62e8ff] hover:text-white"><Flag size={13} /> Set direction</button>
      </div>
      <div className="border-b border-[#d7b56d]/16 p-5">
        <div className="flex items-center justify-between"><p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">Objectives on the table</p><button type="button" onClick={() => onSelect("objectives")} className="text-[9px] font-semibold uppercase text-[#62e8ff]">Open all</button></div>
        <div className="mt-3 divide-y divide-white/8 border-y border-white/8">
          {activeObjectives.slice(0, 4).map(item => <ObjectiveReadout key={item.id} item={item} />)}
          {!activeObjectives.length ? <p className="py-6 text-xs text-white/32">No measurable objectives are active yet.</p> : null}
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between"><p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">Decision lanes</p><button type="button" onClick={() => onSelect("plans")} className="text-[9px] font-semibold uppercase text-[#62e8ff]">Plan room</button></div>
        <div className="mt-3 grid grid-cols-3 border border-white/10">
          {(["now", "next", "later"] as const).map(horizon => <button key={horizon} type="button" onClick={() => onSelect("plans")} className="border-r border-white/10 px-2 py-4 text-center last:border-r-0"><strong className="block text-xl text-[#f1dba9]">{company.plans.filter(item => item.horizon === horizon && item.status !== "complete").length}</strong><span className="mt-1 block text-[8px] font-semibold uppercase text-white/35">{horizon}</span></button>)}
        </div>
        <p className="mt-3 text-xs leading-5 text-white/38">{activePlans.length ? `${activePlans.length} planned or active moves are in motion.` : "The decision lanes are clear. Add the next strategic move when ready."}</p>
        <button type="button" onClick={() => onSelect("capital")} className={`mt-4 flex w-full items-center justify-between border px-3 py-3 text-left ${capitalExceptions ? "border-amber-300/24 bg-amber-300/[0.045]" : "border-[#68f5d0]/18 bg-[#68f5d0]/[0.035]"}`}><span><strong className="block text-xs text-white/70">Capital &amp; ownership</strong><span className="mt-1 block text-[9px] text-white/32">Cap table, investments, dividends and decisions</span></span><span className={`text-sm font-semibold ${capitalExceptions ? "text-amber-200" : "text-[#68f5d0]"}`}>{capitalExceptions ? `${capitalExceptions} watch` : "Clear"}</span></button>
      </div>
    </aside>
  </div>;
}

function KpiStrategyWorkspace({ snapshot, initialScopeId, onOpenIntelligence }: { snapshot: CommandIntelligenceSnapshot; initialScopeId: string; onOpenIntelligence: (kpiIds?: string[], scopeId?: string) => void }) {
  const primaryIds = COMMAND_PRIMARY_KPI_STATIONS.flatMap(station => station.openIds).filter((id, index, ids) => ids.indexOf(id) === index && snapshot.kpis.some(kpi => kpi.id === id));
  const attentionCount = snapshot.summary.criticalKpis + snapshot.summary.warningKpis;
  return <div>
    <header className="grid border-b border-[#d7b56d]/16 bg-[#071116]/86 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(110px,.18fr))_auto] lg:items-stretch">
      <div className="min-w-0 border-b border-[#d7b56d]/14 px-4 py-4 lg:border-b-0 lg:border-r sm:px-6">
        <p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">Strategic intelligence station · Same evidence, longer horizon</p>
        <h2 className="mt-1 text-lg font-semibold">Trends, projections and target gaps</h2>
        <p className="mt-1 max-w-2xl text-[10px] leading-4 text-white/38">Choose any KPI, compare periods, approve a baseline and see the projected landing point. Recorded evidence stays authoritative; missing history is shown as missing.</p>
      </div>
      <StrategicKpiReadout label="Connected" value={`${snapshot.summary.connectedKpis}/${snapshot.kpis.length}`} tone="clear" />
      <StrategicKpiReadout label="Attention" value={String(attentionCount)} tone={snapshot.summary.criticalKpis ? "critical" : attentionCount ? "warning" : "clear"} />
      <StrategicKpiReadout label="Blind" value={String(snapshot.summary.blindKpis)} tone={snapshot.summary.blindKpis ? "warning" : "clear"} />
      <div className="flex items-center px-4 py-3"><button type="button" onClick={() => onOpenIntelligence(primaryIds, initialScopeId)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 border border-[#d7b56d]/30 bg-[#d7b56d]/[0.1] px-4 text-[9px] font-semibold uppercase text-[#f1dba9] hover:bg-[#d7b56d]/[0.16]">Full KPI workspace <ArrowUpRight size={13} /></button></div>
    </header>
    <KpiComparisonWorkspace snapshot={snapshot} initialKpiIds={primaryIds.slice(0, 5)} initialRange="quarter" context="strategic" onInspect={(kpi: CommandKpi) => onOpenIntelligence([kpi.id], kpi.scope.id)} />
  </div>;
}

function StrategicKpiReadout({ label, value, tone }: { label: string; value: string; tone: "critical" | "warning" | "clear" }) {
  return <div className="border-b border-[#d7b56d]/14 px-4 py-4 lg:border-b-0 lg:border-r"><p className="text-[8px] font-semibold uppercase text-white/28">{label}</p><strong className={`mt-1 block text-xl tabular-nums ${tone === "critical" ? "text-red-300" : tone === "warning" ? "text-amber-200" : "text-[#68f5d0]"}`}>{value}</strong></div>;
}

function StrategyEditor({ company, canEdit, saving, onSave }: WorkspaceProps) {
  const [draft, setDraft] = useState(company);
  return <BattleSection eyebrow="Strategic doctrine" title="Direction before motion" detail="Mission, vision and operating principles become the filter for targets, products, campaigns, hiring and expansion.">
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.7fr)]">
      <div className="grid gap-4"><BattleField label="Mission" hint="What the business does, for whom, and why it matters."><textarea disabled={!canEdit} value={draft.mission} onChange={event => setDraft(value => ({ ...value, mission: event.target.value }))} className={battleTextarea} /></BattleField><BattleField label="Vision" hint="The future position this strategy is trying to create."><textarea disabled={!canEdit} value={draft.vision} onChange={event => setDraft(value => ({ ...value, vision: event.target.value }))} className={battleTextarea} /></BattleField><BattleField label="Operating values" hint="One principle per line. These should resolve real trade-offs."><textarea disabled={!canEdit} value={draft.values.join("\n")} onChange={event => setDraft(value => ({ ...value, values: event.target.value.split("\n").map(item => item.trim()).filter(Boolean) }))} className={battleTextarea} /></BattleField>{canEdit ? <SaveButton saving={saving} label="Save strategic direction" onClick={() => void onSave(draft, "Strategic direction saved.")} /> : null}</div>
      <aside className="border border-[#d7b56d]/18 bg-[#d7b56d]/[0.035] p-5"><p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">Doctrine test</p><h3 className="mt-2 text-lg font-semibold">Can a decision be rejected?</h3><p className="mt-3 text-xs leading-5 text-white/42">Useful strategy makes it obvious when an opportunity, client, product or expansion does not fit. If every option passes, sharpen the direction.</p><dl className="mt-5 divide-y divide-white/10 border-y border-white/10 text-xs"><DoctrineRow label="Mission recorded" ready={Boolean(draft.mission)} /><DoctrineRow label="Future position recorded" ready={Boolean(draft.vision)} /><DoctrineRow label="Decision principles" ready={draft.values.length >= 3} /></dl></aside>
    </div>
  </BattleSection>;
}

function ProjectionWorkspace({ payload, company, calculations, canEdit, saving, onSave }: WorkspaceProps & { payload: BattleTablePayload; calculations: StrategicCalculations }) {
  const [draft, setDraft] = useState(company);
  const draftCalculations = strategicCalculations(draft, payload.actuals);
  const moneyPrefix = currencySymbol(payload.actuals.currency);
  return <BattleSection eyebrow={`Projection laboratory · ${payload.companyName}`} title="Model the route before committing resources" detail={`Compare ${payload.companyName}'s retained base case with its target case. These assumptions save only to the selected scope.`}>
    <ProjectionChart calculations={draftCalculations} currency={payload.actuals.currency} large />
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
      <div className="border border-[#d7b56d]/18 bg-[#071116]/82 p-4 sm:p-5">
        <h3 className="text-sm font-semibold">Scenario assumptions</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <BattleNumber label={`Monthly revenue target (${payload.actuals.currency.toUpperCase()})`} prefix={moneyPrefix} value={draft.monthlyRevenueTargetCents / 100} onChange={value => setDraft(item => ({ ...item, monthlyRevenueTargetCents: pounds(value) }))} disabled={!canEdit} />
          <BattleNumber label={`Annual revenue target (${payload.actuals.currency.toUpperCase()})`} prefix={moneyPrefix} value={draft.annualRevenueTargetCents / 100} onChange={value => setDraft(item => ({ ...item, annualRevenueTargetCents: pounds(value) }))} disabled={!canEdit} />
          <BattleNumber label={`Average deal value (${payload.actuals.currency.toUpperCase()})`} prefix={moneyPrefix} value={draft.averageDealValueCents / 100} onChange={value => setDraft(item => ({ ...item, averageDealValueCents: pounds(value) }))} disabled={!canEdit} />
          <BattleNumber label="Sales close rate" suffix="%" value={draft.salesCallCloseRatePercent} onChange={value => setDraft(item => ({ ...item, salesCallCloseRatePercent: clamp(value, 1, 100) }))} disabled={!canEdit} />
          <BattleNumber label="Projection horizon" suffix=" months" value={draft.projection.horizonMonths} onChange={value => setDraft(item => ({ ...item, projection: { ...item.projection, horizonMonths: clamp(value, 3, 60) } }))} disabled={!canEdit} />
          <BattleNumber label="Base monthly growth" suffix="%" value={draft.projection.baseMonthlyGrowthPercent} onChange={value => setDraft(item => ({ ...item, projection: { ...item.projection, baseMonthlyGrowthPercent: clamp(value, -100, 500) } }))} disabled={!canEdit} />
          <BattleNumber label="Target monthly growth" suffix="%" value={draft.projection.targetMonthlyGrowthPercent} onChange={value => setDraft(item => ({ ...item, projection: { ...item.projection, targetMonthlyGrowthPercent: clamp(value, -100, 500) } }))} disabled={!canEdit} />
          <BattleNumber label="Gross margin target" suffix="%" value={draft.projection.grossMarginTargetPercent} onChange={value => setDraft(item => ({ ...item, projection: { ...item.projection, grossMarginTargetPercent: clamp(value, 0, 100) } }))} disabled={!canEdit} />
          <BattleNumber label={`Monthly operating cost (${payload.actuals.currency.toUpperCase()})`} prefix={moneyPrefix} value={draft.projection.monthlyOperatingCostCents / 100} onChange={value => setDraft(item => ({ ...item, projection: { ...item.projection, monthlyOperatingCostCents: pounds(value) } }))} disabled={!canEdit} />
          <BattleNumber label={`Cash reserve target (${payload.actuals.currency.toUpperCase()})`} prefix={moneyPrefix} value={draft.projection.cashReserveTargetCents / 100} onChange={value => setDraft(item => ({ ...item, projection: { ...item.projection, cashReserveTargetCents: pounds(value) } }))} disabled={!canEdit} />
        </div>
        {canEdit ? <SaveButton saving={saving} label="Lock scenario assumptions" onClick={() => void onSave(draft, "Projection assumptions saved.")} /> : null}
      </div>
      <ScenarioTable calculations={draftCalculations} company={draft} currency={payload.actuals.currency} />
    </div>
  </BattleSection>;
}

function ObjectivesWorkspace({ company, canEdit, saving, onSave }: WorkspaceProps) {
  const [form, setForm] = useState({ title: "", metric: "", current: 0, target: 1, unit: "", status: "on-track" as CompanyObjective["status"] });
  async function add() {
    if (!form.title.trim()) return;
    const objective: CompanyObjective = { id: `obj-${Date.now()}`, title: form.title.trim(), metric: form.metric.trim(), currentValue: form.current, targetValue: Math.max(1, form.target), unit: form.unit.trim(), status: form.status };
    if (await onSave({ ...company, objectives: [...company.objectives, objective] }, "Objective added to the Battle Table.")) setForm({ title: "", metric: "", current: 0, target: 1, unit: "", status: "on-track" });
  }
  async function update(id: string, patch: Partial<CompanyObjective>) { await onSave({ ...company, objectives: company.objectives.map(item => item.id === id ? { ...item, ...patch } : item) }, "Objective updated."); }
  async function remove(id: string) { await onSave({ ...company, objectives: company.objectives.filter(item => item.id !== id) }, "Objective removed."); }
  return <BattleSection eyebrow="Objective command" title="Measurable outcomes, not vague intent" detail="Every objective carries a current value, target, status and visible progress position.">
    {canEdit ? <div className="grid gap-3 border border-[#d7b56d]/18 bg-[#071116]/80 p-4 lg:grid-cols-[minmax(180px,1.4fr)_minmax(130px,1fr)_100px_100px_90px_130px_auto] lg:items-end"><BattleText label="Objective" value={form.title} onChange={title => setForm(item => ({ ...item, title }))} /><BattleText label="Metric" value={form.metric} onChange={metric => setForm(item => ({ ...item, metric }))} /><BattleNumber label="Current" value={form.current} onChange={current => setForm(item => ({ ...item, current }))} /><BattleNumber label="Target" value={form.target} onChange={target => setForm(item => ({ ...item, target }))} /><BattleText label="Unit" value={form.unit} onChange={unit => setForm(item => ({ ...item, unit }))} /><label className={battleLabel}>Status<select value={form.status} onChange={event => setForm(item => ({ ...item, status: event.target.value as CompanyObjective["status"] }))} className={battleControl}><option value="on-track">On track</option><option value="at-risk">At risk</option><option value="complete">Complete</option></select></label><button type="button" disabled={saving || !form.title.trim()} onClick={() => void add()} className={battlePrimaryButton}><Plus size={14} /> Add</button></div> : null}
    <div className="mt-5 grid gap-3 lg:grid-cols-2">
      {company.objectives.map(item => { const progress = Math.min(100, Math.round(item.currentValue / Math.max(1, item.targetValue) * 100)); return <article key={item.id} className="border border-white/10 bg-[#071116]/74 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{item.title}</h3><StatusChip status={item.status} /></div><p className="mt-1 text-[10px] uppercase text-white/35">{item.metric || "Progress"} - {item.currentValue}{item.unit} of {item.targetValue}{item.unit}</p></div>{canEdit ? <button type="button" aria-label={`Delete ${item.title}`} onClick={() => void remove(item.id)} className="grid size-8 place-items-center text-white/30 hover:bg-red-400/10 hover:text-red-200"><Trash2 size={14} /></button> : null}</div><div className="mt-4 h-2 overflow-hidden bg-white/[0.07]"><div className={`h-full ${item.status === "at-risk" ? "bg-amber-300" : item.status === "complete" ? "bg-[#68f5d0]" : "bg-[#62e8ff]"}`} style={{ width: `${progress}%` }} /></div><div className="mt-2 flex items-center justify-between text-[10px]"><span className="text-white/35">{progress}% complete</span>{canEdit ? <div className="flex gap-2"><button type="button" onClick={() => void update(item.id, { status: item.status === "at-risk" ? "on-track" : "at-risk" })} className="text-[#e4c783]">{item.status === "at-risk" ? "Mark on track" : "Flag risk"}</button><button type="button" onClick={() => void update(item.id, { status: "complete", currentValue: item.targetValue })} className="text-[#68f5d0]">Complete</button></div> : null}</div></article>; })}
      {!company.objectives.length ? <EmptyBattle title="No objectives plotted" detail="Add the first measurable outcome to establish strategic accountability." /> : null}
    </div>
  </BattleSection>;
}

function CapacityWorkspace({ company, calculations, canEdit, saving, onSave }: WorkspaceProps & { calculations: StrategicCalculations }) {
  const [draft, setDraft] = useState(company);
  const capacity = strategicCalculations(draft, calculations.actuals).capacity;
  return <BattleSection eyebrow="Force capacity" title="Can the business deliver the strategy?" detail="Translate active clients and required sales activity into weekly load before adding commitments.">
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div><div className="grid grid-cols-2 border border-[#d7b56d]/18 md:grid-cols-4"><PlotReadout label="Available" value={`${draft.capacity.weeklyAvailableHours}h`} detail="Weekly capacity" /><PlotReadout label="Required" value={`${capacity.requiredHours}h`} detail="Delivery, sales and admin" /><PlotReadout label="Headroom" value={`${capacity.headroomHours}h`} detail={capacity.headroomHours >= 0 ? "Capacity available" : "Over capacity"} tone={capacity.headroomHours >= 0 ? "aqua" : "critical"} /><PlotReadout label="Utilisation" value={`${capacity.utilisationPercent}%`} detail={`${draft.capacity.hiringTriggerPercent}% hiring trigger`} tone={capacity.utilisationPercent >= draft.capacity.hiringTriggerPercent ? "critical" : "gold"} /></div><div className="mt-5 border border-white/10 bg-[#071116]/74 p-5"><div className="h-4 overflow-hidden bg-white/[0.06]"><div className={`h-full transition-all ${capacity.utilisationPercent >= draft.capacity.hiringTriggerPercent ? "bg-red-400" : "bg-[#62e8ff]"}`} style={{ width: `${Math.min(100, capacity.utilisationPercent)}%` }} /></div><div className="mt-5 divide-y divide-white/10 text-xs"><CapacityRow label="Client delivery" detail={`${calculations.actuals.activeClients} clients x ${draft.capacity.deliveryHoursPerActiveClient}h`} value={`${capacity.deliveryHours}h`} /><CapacityRow label="Sales activity" detail={`${calculations.callsNeeded} calls/month x ${draft.capacity.salesHoursPerCall}h`} value={`${capacity.salesHours}h`} /><CapacityRow label="Admin reserve" detail={`${draft.capacity.adminBufferPercent}% operating buffer`} value={`${capacity.bufferHours}h`} /></div></div></div>
      <div className="border border-[#d7b56d]/18 bg-[#071116]/82 p-4"><h3 className="text-sm font-semibold">Capacity assumptions</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><BattleNumber label="Weekly available hours" value={draft.capacity.weeklyAvailableHours} onChange={value => setDraft(item => ({ ...item, capacity: { ...item.capacity, weeklyAvailableHours: value } }))} disabled={!canEdit} /><BattleNumber label="Delivery hours per client" value={draft.capacity.deliveryHoursPerActiveClient} onChange={value => setDraft(item => ({ ...item, capacity: { ...item.capacity, deliveryHoursPerActiveClient: value } }))} disabled={!canEdit} /><BattleNumber label="Sales hours per call" value={draft.capacity.salesHoursPerCall} onChange={value => setDraft(item => ({ ...item, capacity: { ...item.capacity, salesHoursPerCall: value } }))} disabled={!canEdit} /><BattleNumber label="Admin buffer" suffix="%" value={draft.capacity.adminBufferPercent} onChange={value => setDraft(item => ({ ...item, capacity: { ...item.capacity, adminBufferPercent: value } }))} disabled={!canEdit} /><BattleNumber label="Hiring trigger" suffix="%" value={draft.capacity.hiringTriggerPercent} onChange={value => setDraft(item => ({ ...item, capacity: { ...item.capacity, hiringTriggerPercent: value } }))} disabled={!canEdit} /><BattleField label="Capacity notes"><textarea disabled={!canEdit} value={draft.capacity.notes ?? ""} onChange={event => setDraft(item => ({ ...item, capacity: { ...item.capacity, notes: event.target.value } }))} className={battleTextarea} /></BattleField></div>{canEdit ? <SaveButton saving={saving} label="Save capacity model" onClick={() => void onSave(draft, "Capacity model saved.")} /> : null}</div>
    </div>
  </BattleSection>;
}

function PlansWorkspace({ company, canEdit, saving, onSave }: WorkspaceProps) {
  const [form, setForm] = useState({ title: "", horizon: "now" as CompanyPlan["horizon"], owner: "Ed", notes: "" });
  async function add() { if (!form.title.trim()) return; const plan: CompanyPlan = { id: `plan-${Date.now()}`, title: form.title.trim(), horizon: form.horizon, status: "planned", owner: form.owner.trim() || undefined, notes: form.notes.trim() || undefined }; if (await onSave({ ...company, plans: [...company.plans, plan] }, "Plan added to the decision lanes.")) setForm({ title: "", horizon: "now", owner: "Ed", notes: "" }); }
  async function update(id: string, patch: Partial<CompanyPlan>) { await onSave({ ...company, plans: company.plans.map(item => item.id === id ? { ...item, ...patch } : item) }, "Plan position updated."); }
  async function remove(id: string) { await onSave({ ...company, plans: company.plans.filter(item => item.id !== id) }, "Plan removed."); }
  return <BattleSection eyebrow="Decision lanes" title="Now, next and later" detail="Keep current commitments separate from the next move and ideas that have not earned resources yet.">
    {canEdit ? <div className="grid gap-3 border border-[#d7b56d]/18 bg-[#071116]/80 p-4 lg:grid-cols-[minmax(200px,1.4fr)_120px_140px_minmax(180px,1fr)_auto] lg:items-end"><BattleText label="Plan or expansion" value={form.title} onChange={title => setForm(item => ({ ...item, title }))} /><label className={battleLabel}>Horizon<select value={form.horizon} onChange={event => setForm(item => ({ ...item, horizon: event.target.value as CompanyPlan["horizon"] }))} className={battleControl}><option value="now">Now</option><option value="next">Next</option><option value="later">Later</option></select></label><BattleText label="Owner" value={form.owner} onChange={owner => setForm(item => ({ ...item, owner }))} /><BattleText label="Decision notes" value={form.notes} onChange={notes => setForm(item => ({ ...item, notes }))} /><button type="button" disabled={saving || !form.title.trim()} onClick={() => void add()} className={battlePrimaryButton}><Plus size={14} /> Add</button></div> : null}
    <div className="mt-5 grid gap-4 lg:grid-cols-3">{(["now", "next", "later"] as const).map(horizon => <section key={horizon} className="border border-white/10 bg-[#071116]/70"><header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><h3 className="text-xs font-semibold uppercase text-[#e4c783]">{horizon}</h3><span className="text-xs text-white/35">{company.plans.filter(item => item.horizon === horizon && item.status !== "complete").length}</span></header><div className="divide-y divide-white/10 p-3">{company.plans.filter(item => item.horizon === horizon).map(item => <article key={item.id} className="group py-3"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-white/82">{item.title}</strong><p className="mt-1 text-[10px] uppercase text-white/35">{item.status}{item.owner ? ` - ${item.owner}` : ""}</p></div>{canEdit ? <button type="button" aria-label={`Delete ${item.title}`} onClick={() => void remove(item.id)} className="text-white/25 opacity-0 group-hover:opacity-100"><Trash2 size={13} /></button> : null}</div>{item.notes ? <p className="mt-2 text-xs leading-5 text-white/40">{item.notes}</p> : null}{canEdit && item.status !== "complete" ? <div className="mt-2 flex gap-3 text-[9px] font-semibold uppercase"><button type="button" onClick={() => void update(item.id, { status: item.status === "active" ? "paused" : "active" })} className="text-[#62e8ff]">{item.status === "active" ? "Pause" : "Activate"}</button><button type="button" onClick={() => void update(item.id, { status: "complete" })} className="text-[#68f5d0]">Complete</button></div> : null}</article>)}{!company.plans.some(item => item.horizon === horizon) ? <p className="py-6 text-center text-xs text-white/25">Lane clear</p> : null}</div></section>)}</div>
  </BattleSection>;
}

function ReviewsWorkspace({ payload, calculations, company, canEdit, saving, onSave }: WorkspaceProps & { payload: BattleTablePayload; calculations: StrategicCalculations }) {
  const evidence: CompanyQuarterlyEvidenceSnapshot = {
    revenueCents: payload.actuals.monthRevenueCents,
    revenueTargetCents: company.monthlyRevenueTargetCents,
    revenueProgressPercent: calculations.revenueProgress,
    monthlyGrowthPercent: payload.actuals.monthlyRevenueGrowthPercent ?? undefined,
    activeClients: payload.actuals.activeClients,
    clientsNeedingAttention: payload.actuals.clientsNeedingAttention,
    openLeads: payload.actuals.leadCount,
    openTasks: payload.actuals.openTasks,
    overdueTasks: payload.actuals.overdueTasks,
    healthScore: payload.healthScore,
    objectiveProgressPercent: calculations.objectiveProgress,
    objectivesAtRisk: company.objectives.filter(item => item.status === "at-risk").length,
    capacityUtilisationPercent: calculations.capacity.utilisationPercent,
    connectedSources: payload.connectedSources,
    totalSources: payload.totalSources,
    capturedAt: Date.now(),
  };
  return <QuarterlyStrategyReview company={company} evidence={evidence} currency={payload.actuals.currency} canEdit={canEdit} saving={saving} onSave={onSave} />;
}

function ExecutiveSystems({ payload }: { payload: BattleTablePayload }) {
  const systems = [
    { label: "Service brands", value: String(payload.brandCount), detail: "Trading identities, ownership and aggregate performance", href: "/portal/agency/company?view=companies", icon: <Building2 size={17} /> },
    { label: "Products and offers", value: String(payload.productCount), detail: "Pricing, packages, fulfilment and portal seeds", href: "/portal/agency/company?view=products", icon: <Package size={17} /> },
    { label: "Connections", value: `${payload.connectedSources}/${payload.totalSources}`, detail: "Evidence, integrations and operating inputs", href: "/portal/agency/company?view=connections", icon: <PlugZap size={17} /> },
    { label: "Legal and compliance", value: String(payload.legalCount), detail: "Contracts, insurance, policies and obligations", href: "/portal/agency/company?view=legal", icon: <FileCheck2 size={17} /> },
    { label: "People and departments", value: String(payload.staffCount), detail: "Capacity owners, roles, leave and compensation", href: "/portal/agency/agency-hr", icon: <UsersRound size={17} /> },
    { label: "Finance planning", value: payload.actuals.financeConnected ? "Live" : "Setup", detail: "Budgets, cash, forecasts, tax and profitability", href: "/portal/agency/agency-finance/plans", icon: <Landmark size={17} /> },
    { label: "Journey and pipeline", value: String(payload.actuals.leadCount), detail: "Demand, conversion, deals and source quality", href: "/portal/clients?view=journey", icon: <BriefcaseBusiness size={17} /> },
    { label: "Executive actions", value: String(payload.actuals.openTasks), detail: "Owned work created from strategic decisions", href: "/portal/agency/actions", icon: <CheckCircle2 size={17} /> },
  ];
  return <BattleSection eyebrow="Executive systems map" title="Every supporting system remains one move away" detail="Battle Table owns strategic direction. Specialist workspaces retain the detailed records and controls behind each decision."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{systems.map(system => <Link key={system.label} href={system.href} className="group flex min-h-36 flex-col border border-white/10 bg-[#071116]/75 p-4 hover:border-[#d7b56d]/35 hover:bg-[#d7b56d]/[0.045]"><div className="flex items-start justify-between"><span className="grid size-9 place-items-center border border-[#d7b56d]/20 text-[#e4c783]">{system.icon}</span><ArrowUpRight size={14} className="text-white/25 group-hover:text-[#62e8ff]" /></div><strong className="mt-4 text-sm">{system.label}</strong><span className="mt-1 text-2xl font-semibold text-[#f1dba9]">{system.value}</span><span className="mt-2 text-xs leading-5 text-white/38">{system.detail}</span></Link>)}</div></BattleSection>;
}

type WorkspaceProps = { company: CompanyProfile; canEdit: boolean; saving: boolean; onSave: (next: CompanyProfile, success?: string) => Promise<boolean> };
type StrategicCalculations = ReturnType<typeof strategicCalculations>;

function strategicCalculations(company: CompanyProfile, actuals: BattleTableActuals) {
  const projection = company.projection;
  const horizon = Math.max(3, projection.horizonMonths);
  const current = actuals.monthRevenueCents;
  const base = projectSeries(current, projection.baseMonthlyGrowthPercent, horizon);
  const target = projectSeries(current, projection.targetMonthlyGrowthPercent, horizon);
  const requiredMonthly = company.monthlyRevenueTargetCents;
  const required = Array.from({ length: horizon + 1 }, (_, index) => requiredMonthly * Math.min(1, (index + 1) / Math.max(1, horizon / 2)));
  const revenueGapCents = Math.max(0, requiredMonthly - current);
  const dealsNeeded = revenueGapCents > 0 ? Math.ceil(revenueGapCents / Math.max(1, company.averageDealValueCents)) : 0;
  const callsNeeded = dealsNeeded > 0 ? Math.ceil(dealsNeeded / Math.max(0.01, company.salesCallCloseRatePercent / 100)) : 0;
  const deliveryHours = round(actuals.activeClients * company.capacity.deliveryHoursPerActiveClient);
  const salesHours = round((callsNeeded * company.capacity.salesHoursPerCall) / 4.33);
  const bufferHours = round((deliveryHours + salesHours) * company.capacity.adminBufferPercent / 100);
  const requiredHours = round(deliveryHours + salesHours + bufferHours);
  const headroomHours = round(company.capacity.weeklyAvailableHours - requiredHours);
  const utilisationPercent = company.capacity.weeklyAvailableHours > 0 ? Math.round(requiredHours / company.capacity.weeklyAvailableHours * 100) : 0;
  const objectiveProgress = company.objectives.length ? Math.round(company.objectives.reduce((sum, item) => sum + Math.min(100, item.currentValue / Math.max(1, item.targetValue) * 100), 0) / company.objectives.length) : 0;
  return {
    actuals,
    base,
    target,
    required,
    baseExitCents: base.at(-1) ?? 0,
    targetExitCents: target.at(-1) ?? 0,
    revenueGapCents,
    dealsNeeded,
    callsNeeded,
    revenueProgress: requiredMonthly > 0 ? Math.min(100, Math.round(current / requiredMonthly * 100)) : 0,
    objectiveProgress,
    capacity: { deliveryHours, salesHours, bufferHours, requiredHours, headroomHours, utilisationPercent },
  };
}

function ProjectionChart({ calculations, currency, large = false }: { calculations: StrategicCalculations; currency: string; large?: boolean }) {
  const width = 900;
  const height = large ? 320 : 250;
  const padding = 34;
  const all = [...calculations.base, ...calculations.target, ...calculations.required];
  const max = Math.max(1, ...all);
  const points = (series: number[]) => series.map((value, index) => `${padding + index / Math.max(1, series.length - 1) * (width - padding * 2)},${height - padding - value / max * (height - padding * 2)}`).join(" ");
  return <div className="mt-5 overflow-hidden border border-[#d7b56d]/16 bg-[#030a0e]/90 p-3" aria-label="Revenue projection chart">
    <div className="flex flex-wrap items-center gap-4 text-[9px] font-semibold uppercase"><Legend colour="#62e8ff" label="Base case" /><Legend colour="#e4c783" label="Target case" /><Legend colour="#ff7f87" label="Required corridor" /><span className="ml-auto text-white/30">Exit target {money(calculations.required.at(-1) ?? 0, currency)}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} className={`mt-2 w-full ${large ? "min-h-[240px]" : "min-h-[190px]"}`} role="img" aria-label="Base, target and required revenue trajectories">
      {Array.from({ length: 5 }, (_, index) => <line key={index} x1={padding} x2={width - padding} y1={padding + index * (height - padding * 2) / 4} y2={padding + index * (height - padding * 2) / 4} stroke="rgba(255,255,255,.07)" />)}
      {Array.from({ length: 7 }, (_, index) => <line key={index} x1={padding + index * (width - padding * 2) / 6} x2={padding + index * (width - padding * 2) / 6} y1={padding} y2={height - padding} stroke="rgba(98,232,255,.045)" />)}
      <polyline points={points(calculations.required)} fill="none" stroke="#ff7f87" strokeWidth="2" strokeDasharray="8 7" opacity=".72" />
      <polyline points={points(calculations.base)} fill="none" stroke="#62e8ff" strokeWidth="3" />
      <polyline points={points(calculations.target)} fill="none" stroke="#e4c783" strokeWidth="3" />
      <circle cx={padding} cy={height - padding - calculations.base[0]! / max * (height - padding * 2)} r="5" fill="#68f5d0" />
    </svg>
  </div>;
}

function ScenarioTable({ calculations, company, currency }: { calculations: StrategicCalculations; company: CompanyProfile; currency: string }) {
  const margin = company.projection.grossMarginTargetPercent / 100;
  const opCost = company.projection.monthlyOperatingCostCents;
  const scenarios = [
    { label: "Current position", revenue: calculations.actuals.monthRevenueCents, tone: "text-white" },
    { label: "Base case exit", revenue: calculations.baseExitCents, tone: "text-[#62e8ff]" },
    { label: "Target case exit", revenue: calculations.targetExitCents, tone: "text-[#f1dba9]" },
  ];
  return <div className="overflow-x-auto border border-[#d7b56d]/18"><table className="w-full min-w-[560px] border-collapse text-left text-xs"><thead><tr className="border-b border-white/10 text-[9px] uppercase text-white/35"><th className="p-4">Scenario</th><th className="p-4">Monthly revenue</th><th className="p-4">Annual run rate</th><th className="p-4">Gross profit</th><th className="p-4">Operating contribution</th></tr></thead><tbody>{scenarios.map(row => <tr key={row.label} className="border-b border-white/8 last:border-b-0"><th className="p-4 font-semibold">{row.label}</th><td className={`p-4 font-semibold ${row.tone}`}>{money(row.revenue, currency)}</td><td className="p-4 text-white/65">{money(row.revenue * 12, currency)}</td><td className="p-4 text-white/65">{money(row.revenue * margin, currency)}</td><td className={`p-4 font-semibold ${row.revenue * margin - opCost >= 0 ? "text-[#68f5d0]" : "text-red-300"}`}>{money(row.revenue * margin - opCost, currency)}</td></tr>)}</tbody></table><div className="grid grid-cols-2 border-t border-[#d7b56d]/16"><PlotReadout label="Reserve objective" value={money(company.projection.cashReserveTargetCents, currency)} detail="Approved cash resilience target" /><PlotReadout label="Monthly operating cost" value={money(opCost, currency)} detail="Scenario assumption" /></div></div>;
}

function BattleSection({ eyebrow, title, detail, children }: { eyebrow: string; title: string; detail: string; children: React.ReactNode }) { return <div className="p-4 sm:p-6"><header className="mb-5"><p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold">{title}</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-white/42">{detail}</p></header>{children}</div>; }
function BattleMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "critical" | "warning" | "clear" }) { return <div className="border-b border-r border-[#d7b56d]/12 bg-[#071116]/76 px-4 py-4"><p className={`text-[9px] font-semibold uppercase ${tone === "critical" ? "text-red-300" : tone === "warning" ? "text-amber-200" : "text-[#68f5d0]"}`}>{label}</p><strong className="mt-2 block text-2xl tabular-nums">{value}</strong><span className="mt-1 block text-[10px] leading-4 text-white/35">{detail}</span></div>; }
function PlotReadout({ label, value, detail, tone = "aqua" }: { label: string; value: string; detail: string; tone?: "aqua" | "gold" | "critical" }) { return <div className="border-b border-r border-white/10 p-4"><p className="text-[8px] font-semibold uppercase text-white/32">{label}</p><strong className={`mt-1 block text-lg ${tone === "gold" ? "text-[#f1dba9]" : tone === "critical" ? "text-red-300" : "text-[#62e8ff]"}`}>{value}</strong><span className="mt-1 block text-[10px] text-white/32">{detail}</span></div>; }
function ObjectiveReadout({ item }: { item: CompanyObjective }) { const progress = Math.min(100, Math.round(item.currentValue / Math.max(1, item.targetValue) * 100)); return <div className="py-3"><div className="flex items-center justify-between gap-3"><strong className="truncate text-xs text-white/72">{item.title}</strong><span className={item.status === "at-risk" ? "text-amber-200" : "text-[#68f5d0]"}>{progress}%</span></div><div className="mt-2 h-1 bg-white/[0.07]"><div className={item.status === "at-risk" ? "h-full bg-amber-300" : "h-full bg-[#62e8ff]"} style={{ width: `${progress}%` }} /></div></div>; }
function StatusChip({ status }: { status: CompanyObjective["status"] }) { return <span className={`px-2 py-0.5 text-[8px] font-semibold uppercase ${status === "at-risk" ? "bg-amber-300/10 text-amber-200" : status === "complete" ? "bg-emerald-300/10 text-emerald-200" : "bg-sky-300/10 text-sky-200"}`}>{status.replace("-", " ")}</span>; }
function DoctrineRow({ label, ready }: { label: string; ready: boolean }) { return <div className="flex items-center justify-between py-3"><dt className="text-white/45">{label}</dt><dd className={ready ? "text-[#68f5d0]" : "text-amber-200"}>{ready ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}</dd></div>; }
function CapacityRow({ label, detail, value }: { label: string; detail: string; value: string }) { return <div className="grid gap-1 py-3 sm:grid-cols-[140px_1fr_70px]"><strong className="text-white/70">{label}</strong><span className="text-white/35">{detail}</span><span className="text-right font-semibold text-[#f1dba9]">{value}</span></div>; }
function ReviewBlock({ label, value }: { label: string; value: string }) { return <div><h3 className="text-[9px] font-semibold uppercase text-[#e4c783]/55">{label}</h3><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-white/45">{value || "Nothing recorded."}</p></div>; }
function EmptyBattle({ title, detail }: { title: string; detail: string }) { return <div className="border border-dashed border-white/12 p-8 text-center lg:col-span-2"><Target size={22} className="mx-auto text-white/20" /><strong className="mt-3 block text-sm text-white/50">{title}</strong><p className="mt-1 text-xs text-white/28">{detail}</p></div>; }
function SaveButton({ saving, label, onClick }: { saving: boolean; label: string; onClick: () => void }) { return <div className="mt-4 flex justify-end"><button type="button" disabled={saving} onClick={onClick} className={battlePrimaryButton}>{saving ? <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" /> : <Save size={14} />}{saving ? "Saving" : label}</button></div>; }
function BattleField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className={battleLabel}>{label}{hint ? <span className="font-normal normal-case leading-4 text-white/30">{hint}</span> : null}{children}</label>; }
function BattleText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className={battleLabel}>{label}<input value={value} onChange={event => onChange(event.target.value)} className={battleControl} /></label>; }
function BattleNumber({ label, value, onChange, prefix, suffix, disabled }: { label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string; disabled?: boolean }) { return <label className={battleLabel}>{label}<span className="relative">{prefix ? <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35">{prefix}</span> : null}<input type="number" value={Number.isFinite(value) ? value : 0} disabled={disabled} onChange={event => onChange(Number(event.target.value))} className={`${battleControl} ${prefix ? "pl-7" : ""} ${suffix ? "pr-14" : ""}`} />{suffix ? <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/35">{suffix}</span> : null}</span></label>; }
function Legend({ colour, label }: { colour: string; label: string }) { return <span className="inline-flex items-center gap-2 text-white/45"><span className="h-0.5 w-5" style={{ backgroundColor: colour }} />{label}</span>; }

function projectSeries(start: number, monthlyPercent: number, months: number) { return Array.from({ length: months + 1 }, (_, index) => start * Math.pow(1 + monthlyPercent / 100, index)); }
function money(cents: number, currency: string) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100); }
function currencySymbol(currency: string) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), currencyDisplay: "narrowSymbol" }).formatToParts(0).find(part => part.type === "currency")?.value ?? currency.toUpperCase(); }
function pounds(value: number) { return Math.max(0, Math.round((Number(value) || 0) * 100)); }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function round(value: number) { return Math.round(value * 10) / 10; }
function signed(value: number) { return `${value > 0 ? "+" : ""}${value}`; }
function capitalAttentionCount(company: CompanyProfile) {
  const capital = company.capital;
  const active = capital.shareholders.filter(item => item.status === "active");
  const issuedByClass = new globalThis.Map<string, number>();
  active.forEach(item => issuedByClass.set(item.shareClassId, (issuedByClass.get(item.shareClassId) ?? 0) + item.shares));
  const overdueDividends = capital.dividends.filter(item => item.status !== "cancelled" && item.paymentDueAt && item.paymentDueAt < Date.now() && item.paidCents < item.declaredCents).length;
  const staleInvestments = capital.investments.filter(item => item.status === "active" && (!item.valuedAt || Date.now() - item.valuedAt > 90 * 86_400_000)).length;
  const unapproved = capital.transactions.filter(item => (item.status === "approved" || item.status === "completed") && !item.approvalId).length + capital.dividends.filter(item => item.status !== "draft" && item.status !== "cancelled" && !item.approvalId).length;
  return Number(!active.length)
    + capital.shareClasses.filter(item => (issuedByClass.get(item.id) ?? 0) > item.authorisedShares).length
    + overdueDividends
    + staleInvestments
    + unapproved
    + capital.decisions.filter(item => item.status === "draft").length;
}

const battleLabel = "grid gap-1.5 text-[9px] font-semibold uppercase text-white/42";
const battleControl = "min-h-10 w-full border border-white/12 bg-[#030a0e] px-3 text-sm normal-case text-white outline-none transition focus:border-[#d7b56d]/55 disabled:cursor-not-allowed disabled:opacity-55";
const battleTextarea = `${battleControl} min-h-28 py-3 leading-5`;
const battlePrimaryButton = "inline-flex min-h-10 items-center justify-center gap-2 border border-[#d7b56d]/32 bg-[#d7b56d]/[0.12] px-4 text-[10px] font-semibold uppercase text-[#f1dba9] hover:bg-[#d7b56d]/[0.18] disabled:cursor-not-allowed disabled:opacity-40";

function fallbackBattleScope(payload: BattleTablePayload): BattleTableScopePayload {
  return {
    id: "ecosystem",
    companyId: null,
    label: payload.companyName,
    kind: "aggregate",
    detail: "All connected companies and shared records combined. Company-specific plans remain available when trading brands are configured.",
    initial: payload.initial,
    actuals: payload.actuals,
    healthScore: payload.healthScore,
    staffCount: payload.staffCount,
    productCount: payload.productCount,
    legalCount: payload.legalCount,
    coverage: ["finance", "clients", "pipeline", "tasks", "people", "products"],
  };
}
