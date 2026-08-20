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
  LoaderCircle,
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
  UserPlus,
  UsersRound,
  Zap,
} from "lucide-react";

import { COMMAND_PRIMARY_KPI_STATIONS, type CommandIntelligenceSnapshot, type CommandKpi } from "@/lib/intelligence/commandIntelligence";
import { buildHiringCapacityAnalysis, emptyHiringCapacitySignals, HIRING_CAPACITY_AREA_META, type HiringCapacityAreaAnalysis, type HiringCapacitySignals } from "@/lib/performance/hiringCapacity";
import type { CompanyCapacityAreaId, CompanyCapacityAreaPlan, CompanyObjective, CompanyPlan, CompanyProfile, CompanyQuarterlyEvidenceSnapshot } from "@/server/types";
import { applyIntelligenceScope, KpiComparisonWorkspace } from "./_CommandIntelligenceWorkspace";
import { CapitalOwnershipWorkspace } from "./_CapitalOwnershipWorkspace";
import { QuarterlyStrategyReview } from "./_QuarterlyStrategyReview";
import {
  buildBattlefield,
  buildWarRoomDecisions,
  buildWarRoomPulse,
  summariseBattlefield,
  type WarRoomBattlefieldRow,
  type WarRoomDecision,
  type WarRoomIncident,
  type WarRoomPulseMetric,
  type WarRoomScopeInput,
  type WarRoomTargetState,
} from "./_battleWarRoom";

export type BattleTableSection = "warroom" | "overview" | "intelligence" | "strategy" | "projections" | "objectives" | "capacity" | "plans" | "capital" | "reviews" | "systems";

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
  capacitySignals: HiringCapacitySignals;
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
  capacitySignals: HiringCapacitySignals;
};

// The 10 planning surfaces are the DRILL-IN layer, not the front door. The war
// room above them is the daily surface; these are where a decision is settled.
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

export function BattleTableWorkspace({ payload, intelligence, onOpenIntelligence, radarIncidents = [], initialSection = "warroom", initialScopeId = "ecosystem" }: { payload: BattleTablePayload; intelligence: CommandIntelligenceSnapshot; onOpenIntelligence: (kpiIds?: string[], scopeId?: string) => void; radarIncidents?: WarRoomIncident[]; initialSection?: BattleTableSection; initialScopeId?: string }) {
  const scopes = payload.scopes?.length ? payload.scopes : [fallbackBattleScope(payload)];
  const [scopeId, setScopeId] = useState(scopes.some(scope => scope.id === initialScopeId) ? initialScopeId : scopes[0]!.id);
  const selectedScope = scopes.find(scope => scope.id === scopeId) ?? scopes[0]!;
  const intelligenceScope = intelligence.scopes.find(scope => scope.id === selectedScope.id) ?? intelligence.scopes[0]!;
  const scopedIntelligence = useMemo(() => applyIntelligenceScope(intelligence, intelligenceScope), [intelligence, intelligenceScope]);
  const [profiles, setProfiles] = useState<Record<string, CompanyProfile>>(() => Object.fromEntries(scopes.map(scope => [scope.id, scope.initial])));
  const company = profiles[selectedScope.id] ?? selectedScope.initial;
  const activePayload: BattleTablePayload = { ...payload, companyName: selectedScope.label, initial: company, actuals: selectedScope.actuals, healthScore: selectedScope.healthScore, staffCount: selectedScope.staffCount, productCount: selectedScope.productCount, legalCount: selectedScope.legalCount, capacitySignals: selectedScope.capacitySignals };
  const [section, setSection] = useState<BattleTableSection>(initialSection);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const calculations = useMemo(() => strategicCalculations(company, selectedScope.actuals), [company, selectedScope.actuals]);

  // The war room reads the live payload every scope already carries — the same
  // finance actuals, retained plans and capacity signals the planning sections
  // are fed by. Editing a plan re-derives the battlefield immediately because
  // `profiles` (not the server payload) is what feeds it.
  const warRoomScopes = useMemo<WarRoomScopeInput[]>(() => scopes.map(scope => ({
    id: scope.id,
    companyId: scope.companyId,
    label: scope.label,
    kind: scope.kind,
    profile: profiles[scope.id] ?? scope.initial,
    actuals: scope.actuals,
    healthScore: scope.healthScore,
    productCount: scope.productCount,
    legalCount: scope.legalCount,
    capacitySignals: scope.capacitySignals,
  })), [scopes, profiles]);
  const warRoomNow = intelligence.generatedAt;
  const battlefield = useMemo(() => buildBattlefield({ scopes: warRoomScopes, incidents: radarIncidents, now: warRoomNow }), [warRoomScopes, radarIncidents, warRoomNow]);
  const decisions = useMemo(() => buildWarRoomDecisions({ scopes: warRoomScopes, incidents: radarIncidents, now: warRoomNow }), [warRoomScopes, radarIncidents, warRoomNow]);
  const pulse = useMemo(() => {
    const scope = warRoomScopes.find(item => item.id === selectedScope.id) ?? warRoomScopes[0]!;
    return buildWarRoomPulse({ scope, now: warRoomNow });
  }, [warRoomScopes, selectedScope.id, warRoomNow]);

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

  // Drilling in from the war room moves scope AND section in one move, so a
  // decision opens on the exact company it was raised against.
  function drillInto(nextScopeId: string, next: BattleTableSection) {
    if (scopes.some(scope => scope.id === nextScopeId)) setScopeId(nextScopeId);
    setMessage("");
    setError("");
    selectSection(next);
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

    <div className="relative border-b border-[#d7b56d]/20 bg-[#061016]/96">
      <div className="flex flex-wrap items-stretch border-b border-[#d7b56d]/14">
        <button type="button" aria-pressed={section === "warroom"} onClick={() => selectSection("warroom")} className={`flex min-h-14 flex-1 items-center justify-center gap-2 border-r border-[#d7b56d]/12 px-4 text-[11px] font-semibold uppercase transition ${section === "warroom" ? "bg-[#d7b56d]/[0.14] text-[#f1dba9] shadow-[inset_0_-2px_0_#d7b56d]" : "text-white/60 hover:bg-white/[0.04] hover:text-white"}`}><Zap size={15} /> War room{decisions.length ? <span className={`ml-1 px-2 py-0.5 text-[9px] tabular-nums ${decisions.some(item => item.severity === "critical") ? "bg-red-400/15 text-red-200" : "bg-amber-300/15 text-amber-200"}`}>{decisions.length}</span> : null}</button>
        <span className="hidden items-center px-4 text-[8px] font-semibold uppercase text-white/28 lg:flex">Set-up and planning · drill in below</span>
      </div>
      <nav aria-label="Battle Table views" className="grid grid-flow-col auto-cols-[minmax(9.5rem,1fr)] overflow-x-auto xl:grid-flow-row xl:grid-cols-10">
        {sections.map(item => <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => selectSection(item.id)} className={`flex min-h-12 items-center justify-center gap-2 border-r border-[#d7b56d]/12 px-3 text-[10px] font-semibold uppercase transition ${section === item.id ? "bg-[#d7b56d]/[0.12] text-[#f1dba9] shadow-[inset_0_-2px_0_#d7b56d]" : "text-white/40 hover:bg-white/[0.035] hover:text-white/78"}`}>{item.icon}{item.label}</button>)}
      </nav>
    </div>

    <div id="battle-table-body" className="relative max-h-[calc(100dvh-13rem)] min-h-[38rem] overflow-y-auto">
      {section !== "warroom" ? <div className="flex items-center gap-3 border-b border-[#d7b56d]/12 bg-[#050d11]/80 px-4 py-2 sm:px-6"><button type="button" onClick={() => selectSection("warroom")} className="inline-flex min-h-8 items-center gap-2 text-[9px] font-semibold uppercase text-[#62e8ff] hover:text-white"><Zap size={12} /> Back to the war room</button><span className="text-[9px] uppercase text-white/25">Drill-in · {selectedScope.label}</span></div> : null}
      {section === "warroom" ? <WarRoom rows={battlefield} decisions={decisions} pulse={pulse} selectedScopeId={selectedScope.id} scopeLabel={selectedScope.label} radarCritical={radarIncidents.filter(incident => incident.severity === "critical").length} onDrill={drillInto} onOpenIntelligence={onOpenIntelligence} /> : null}
      {section === "overview" ? <StrategicOverview payload={activePayload} company={company} calculations={calculations} onSelect={selectSection} /> : null}
      {section === "intelligence" ? <KpiStrategyWorkspace snapshot={scopedIntelligence} initialScopeId={selectedScope.id} onOpenIntelligence={onOpenIntelligence} /> : null}
      {section === "strategy" ? <StrategyEditor key={`${selectedScope.id}:strategy`} company={company} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "projections" ? <ProjectionWorkspace key={`${selectedScope.id}:projections`} payload={activePayload} company={company} calculations={calculations} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "objectives" ? <ObjectivesWorkspace key={`${selectedScope.id}:objectives`} company={company} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "capacity" ? <CapacityWorkspace key={`${selectedScope.id}:capacity`} payload={activePayload} company={company} calculations={calculations} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "plans" ? <PlansWorkspace key={`${selectedScope.id}:plans`} company={company} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "capital" ? <CapitalOwnershipWorkspace key={`${selectedScope.id}:capital`} company={company} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "reviews" ? <ReviewsWorkspace key={`${selectedScope.id}:reviews`} payload={activePayload} calculations={calculations} company={company} canEdit={payload.canEdit} saving={saving} onSave={save} /> : null}
      {section === "systems" ? <ExecutiveSystems payload={activePayload} /> : null}
    </div>
  </section>;
}

// ─── The war room — the Battle Table's front door ─────────────────────────────
// Three zones: the battlefield (every scope at a glance), the decisions queue
// (what needs Ed now, with its evidence and where it is settled) and the live
// pulse (key metrics against target, with deviation and run-rate forecast).
function WarRoom({ rows, decisions, pulse, selectedScopeId, scopeLabel, radarCritical, onDrill, onOpenIntelligence }: {
  rows: WarRoomBattlefieldRow[];
  decisions: WarRoomDecision[];
  pulse: WarRoomPulseMetric[];
  selectedScopeId: string;
  scopeLabel: string;
  radarCritical: number;
  onDrill: (scopeId: string, section: BattleTableSection) => void;
  onOpenIntelligence: (kpiIds?: string[], scopeId?: string) => void;
}) {
  const summary = summariseBattlefield(rows);
  const criticalDecisions = decisions.filter(item => item.severity === "critical");
  return <div className="min-w-0">
    <div className="grid grid-cols-2 border-b border-[#d7b56d]/16 sm:grid-cols-3 lg:grid-cols-5">
      <BattleMetric label="Fronts held" value={String(summary.scopes)} detail="Ecosystem plus every trading company on the table" tone="clear" />
      <BattleMetric label="Behind pace" value={String(summary.behind)} detail="Scopes under their month-to-date revenue corridor" tone={summary.behind ? "warning" : "clear"} />
      <BattleMetric label="Needs you now" value={String(criticalDecisions.length)} detail={`${decisions.length} call${decisions.length === 1 ? "" : "s"} in the queue in total`} tone={criticalDecisions.length ? "critical" : decisions.length ? "warning" : "clear"} />
      <BattleMetric label="Radar critical" value={String(radarCritical)} detail="Critical incidents from the latest Radar sweep" tone={radarCritical ? "critical" : "clear"} />
      <BattleMetric label="Open alerts" value={String(summary.alerts)} detail={`${summary.criticalAlerts} cannot wait`} tone={summary.criticalAlerts ? "critical" : summary.alerts ? "warning" : "clear"} />
    </div>

    <section className="border-b border-[#d7b56d]/16 p-4 sm:p-6" aria-label="The battlefield">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">Zone 1 · The battlefield</p><h2 className="mt-1 text-xl font-semibold">Every company at a glance</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-white/42">Health, revenue against the month-to-date corridor and the alert load for each scope. Pick a row to command that company.</p></div>
      </div>
      <div className="mt-4 overflow-x-auto border border-[#d7b56d]/16">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead><tr className="border-b border-white/10 bg-[#071116]/70 text-[9px] uppercase text-white/32"><th className="p-3">Scope</th><th className="p-3">Health</th><th className="p-3">Revenue vs pace</th><th className="p-3">Position</th><th className="p-3">Alerts</th><th className="p-3">Command</th></tr></thead>
          <tbody>
            {rows.map(row => <tr key={row.scopeId} className={`border-b border-white/8 last:border-b-0 ${row.scopeId === selectedScopeId ? "bg-[#d7b56d]/[0.05]" : ""}`}>
              <th className="p-3 font-semibold"><span className="flex items-center gap-2">{row.kind === "aggregate" ? <Layers3 size={13} className="text-[#62e8ff]" /> : <Building2 size={13} className="text-[#e4c783]" />}<span className="truncate">{row.label}</span></span><span className="mt-1 block text-[8px] font-normal uppercase text-white/28">{row.kind === "aggregate" ? "Whole ecosystem" : "Trading company"}</span></th>
              <td className="p-3"><span className={`text-base font-semibold tabular-nums ${row.healthState === "critical" ? "text-red-300" : row.healthState === "warning" ? "text-amber-200" : "text-[#68f5d0]"}`}>{row.healthScore}</span><span className="ml-1 text-[9px] text-white/28">pts</span></td>
              <td className="p-3"><span className="block tabular-nums text-white/78">{money(row.revenueCents, row.currency)}</span><span className="mt-0.5 block text-[9px] text-white/30">{row.targetCents > 0 ? `of ${money(row.targetCents, row.currency)} target` : "no target set"}</span></td>
              <td className="p-3"><TargetStateChip state={row.revenue.state} deviationPercent={row.revenue.deviationPercent} /><span className="mt-1 block text-[9px] text-white/28">{row.revenue.forecastCents === null ? "Run rate unavailable" : `Run rate lands ${money(row.revenue.forecastCents, row.currency)}`}</span></td>
              <td className="p-3"><span className="flex flex-wrap gap-1">{row.criticalAlertCount ? <span className="border border-red-300/25 bg-red-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-red-200">{row.criticalAlertCount} critical</span> : null}{row.alertCount - row.criticalAlertCount > 0 ? <span className="border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-amber-200">{row.alertCount - row.criticalAlertCount} watch</span> : null}{!row.alertCount ? <span className="border border-[#68f5d0]/22 bg-[#68f5d0]/[0.06] px-2 py-0.5 text-[9px] font-semibold uppercase text-[#68f5d0]">Holding</span> : null}</span></td>
              <td className="p-3"><button type="button" onClick={() => onDrill(row.scopeId, "overview")} className="inline-flex min-h-8 items-center gap-1.5 border border-[#62e8ff]/22 bg-[#62e8ff]/[0.05] px-2.5 text-[9px] font-semibold uppercase text-[#8ef1ff] hover:bg-[#62e8ff]/[0.1]">Drill in <ArrowUpRight size={12} /></button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <div className="grid min-w-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.72fr)]">
      <section className="min-w-0 border-b border-[#d7b56d]/16 p-4 sm:p-6 xl:border-b-0 xl:border-r" aria-label="Decisions needing you">
        <p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">Zone 2 · Decisions needing you</p>
        <h2 className="mt-1 text-xl font-semibold">What needs your call right now</h2>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-white/42">Raised from live evidence — revenue pace, capacity guardrails, at-risk objectives, capital exceptions and critical Radar incidents. Nothing here is committed work until you act on it.</p>
        <div className="mt-4 grid gap-2">
          {decisions.map(decision => <DecisionCard key={decision.id} decision={decision} onDrill={onDrill} />)}
          {!decisions.length ? <div className="border border-[#68f5d0]/18 bg-[#68f5d0]/[0.035] px-5 py-10 text-center"><CheckCircle2 className="mx-auto text-[#68f5d0]" size={24} /><p className="mt-3 text-sm font-semibold">No decision is waiting on you</p><p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-white/38">Every scope is inside its corridor, guardrails are clear and no critical incident is open. The queue fills itself as evidence changes.</p></div> : null}
        </div>
      </section>

      <aside className="grid content-start bg-[#071116]/80" aria-label="Live pulse">
        <div className="border-b border-[#d7b56d]/16 p-5">
          <p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">Zone 3 · Live pulse · {scopeLabel}</p>
          <h2 className="mt-1 text-lg font-semibold">Metrics against target</h2>
          <p className="mt-2 text-[10px] leading-4 text-white/35">Deviation is measured against each metric&rsquo;s own target. Missing evidence stays &ldquo;Learning&rdquo; rather than reading as a pass.</p>
        </div>
        <div className="divide-y divide-white/8">
          {pulse.map(metric => <PulseRow key={metric.id} metric={metric} />)}
        </div>
        <div className="p-5">
          <button type="button" onClick={() => onOpenIntelligence(undefined, selectedScopeId)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 border border-[#62e8ff]/22 bg-[#62e8ff]/[0.055] px-3 text-[9px] font-semibold uppercase text-[#8ef1ff] hover:bg-[#62e8ff]/[0.1]"><BarChart3 size={14} /> Full KPI intelligence <ArrowUpRight size={12} /></button>
        </div>
      </aside>
    </div>
  </div>;
}

function DecisionCard({ decision, onDrill }: { decision: WarRoomDecision; onDrill: (scopeId: string, section: BattleTableSection) => void }) {
  const tone = decision.severity === "critical"
    ? { rail: "bg-red-400", border: "border-red-300/25", chip: "bg-red-400/12 text-red-200", label: "Critical" }
    : decision.severity === "warning"
      ? { rail: "bg-amber-300", border: "border-amber-300/25", chip: "bg-amber-300/12 text-amber-200", label: "Warning" }
      : { rail: "bg-[#62e8ff]", border: "border-[#62e8ff]/22", chip: "bg-[#62e8ff]/12 text-[#8ef1ff]", label: "Watch" };
  return <article className={`relative flex gap-3 border ${tone.border} bg-[#071116]/74 p-4`}>
    <span className={`absolute inset-y-0 left-0 w-0.5 ${tone.rail}`} aria-hidden="true" />
    <div className="min-w-0 flex-1 pl-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`px-2 py-0.5 text-[8px] font-semibold uppercase ${tone.chip}`}>{tone.label}</span>
        <span className="text-[8px] font-semibold uppercase text-white/30">{decision.scopeLabel}</span>
      </div>
      <h3 className="mt-2 text-sm font-semibold">{decision.title}</h3>
      <p className="mt-1 text-xs leading-5 text-white/45">{decision.detail}</p>
      {decision.evidence.length ? <ul className="mt-3 grid gap-1 border-l border-white/10 pl-3 text-[10px] leading-4 text-white/38">{decision.evidence.map(item => <li key={item}>{item}</li>)}</ul> : null}
    </div>
    <div className="flex shrink-0 items-start">
      {decision.href
        ? <Link href={decision.href} className="inline-flex min-h-9 items-center gap-1.5 border border-[#d7b56d]/25 bg-[#d7b56d]/[0.07] px-3 text-[9px] font-semibold uppercase text-[#f1dba9] hover:bg-[#d7b56d]/[0.12]">{decision.actionLabel} <ArrowUpRight size={12} /></Link>
        : <button type="button" onClick={() => onDrill(decision.scopeId, decision.section)} className="inline-flex min-h-9 items-center gap-1.5 border border-[#d7b56d]/25 bg-[#d7b56d]/[0.07] px-3 text-[9px] font-semibold uppercase text-[#f1dba9] hover:bg-[#d7b56d]/[0.12]">{decision.actionLabel} <ArrowUpRight size={12} /></button>}
    </div>
  </article>;
}

function PulseRow({ metric }: { metric: WarRoomPulseMetric }) {
  return <div className="px-5 py-4">
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-[9px] font-semibold uppercase text-white/32">{metric.label}</p>
      <TargetStateChip state={metric.state} deviationPercent={metric.deviationPercent} />
    </div>
    <div className="mt-1 flex items-baseline justify-between gap-3">
      <strong className="text-lg tabular-nums">{metric.value}</strong>
      <span className="text-[9px] uppercase text-white/28">{metric.target}</span>
    </div>
    <p className="mt-1 text-[10px] leading-4 text-white/32">{metric.detail}</p>
  </div>;
}

function TargetStateChip({ state, deviationPercent }: { state: WarRoomTargetState; deviationPercent: number | null }) {
  const label = state === "ahead" ? "Ahead"
    : state === "on-track" ? "On track"
    : state === "behind" ? "Behind"
    : state === "critical" ? "Off track"
    : state === "no-target" ? "No target"
    : "Learning";
  const tone = state === "critical" ? "border-red-300/25 bg-red-400/10 text-red-200"
    : state === "behind" ? "border-amber-300/25 bg-amber-300/10 text-amber-200"
    : state === "ahead" || state === "on-track" ? "border-[#68f5d0]/22 bg-[#68f5d0]/[0.06] text-[#68f5d0]"
    : "border-white/12 bg-white/[0.04] text-white/45";
  return <span className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[9px] font-semibold uppercase ${tone}`}>{label}{deviationPercent === null ? null : <span className="tabular-nums opacity-75">{signed(deviationPercent)}%</span>}</span>;
}

function StrategicOverview({ payload, company, calculations, onSelect }: { payload: BattleTablePayload; company: CompanyProfile; calculations: StrategicCalculations; onSelect: (section: BattleTableSection) => void }) {
  const activeObjectives = company.objectives.filter(item => item.status !== "complete");
  const atRiskObjectives = activeObjectives.filter(item => item.status === "at-risk");
  const activePlans = company.plans.filter(item => item.status === "active" || item.status === "planned");
  const capitalExceptions = capitalAttentionCount(company);
  const hiring = hiringAnalysis(payload, company);
  return <div className="grid min-w-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.72fr)]">
    <div className="min-w-0 border-b border-[#d7b56d]/16 xl:border-b-0 xl:border-r">
      <div className="grid grid-cols-2 border-b border-[#d7b56d]/16 sm:grid-cols-3 lg:grid-cols-6">
        <BattleMetric label="Strategic health" value={`${payload.healthScore} pts`} detail={`Of 100 weighted points · ${payload.healthScore < 40 ? "recovery required" : payload.healthScore < 70 ? "watch position" : "plan holding"}`} tone={payload.healthScore < 40 ? "critical" : payload.healthScore < 70 ? "warning" : "clear"} />
        <BattleMetric label="Revenue position" value={`${calculations.revenueProgress}%`} detail={`${money(payload.actuals.monthRevenueCents, payload.actuals.currency)} / ${money(company.monthlyRevenueTargetCents, payload.actuals.currency)}`} tone={calculations.revenueProgress < 50 ? "critical" : calculations.revenueProgress < 80 ? "warning" : "clear"} />
        <BattleMetric label="Objective readiness" value={`${calculations.objectiveProgress}%`} detail={`Mean progress across ${company.objectives.length} objective${company.objectives.length === 1 ? "" : "s"} · ${atRiskObjectives.length} at risk`} tone={atRiskObjectives.length ? "warning" : "clear"} />
        <BattleMetric label="Capacity load" value={`${calculations.capacity.utilisationPercent}%`} detail={`${calculations.capacity.requiredHours}h required / ${company.capacity.weeklyAvailableHours}h available · ${calculations.capacity.headroomHours}h headroom`} tone={calculations.capacity.utilisationPercent >= company.capacity.hiringTriggerPercent ? "critical" : calculations.capacity.utilisationPercent >= 70 ? "warning" : "clear"} />
        <BattleMetric label="Target gap" value={money(calculations.revenueGapCents, payload.actuals.currency)} detail={`${calculations.dealsNeeded} deals / ${calculations.callsNeeded} calls`} tone={calculations.revenueGapCents ? "warning" : "clear"} />
        <button type="button" onClick={() => onSelect("capacity")} className="border-b border-r border-[#d7b56d]/12 bg-[#071116]/76 px-4 py-4 text-left hover:bg-[#d7b56d]/[0.05]"><p className={`text-[9px] font-semibold uppercase ${hiring.hireNowCount ? "text-red-300" : hiring.prepareCount ? "text-amber-200" : "text-[#68f5d0]"}`}>Hiring signal</p><strong className="mt-2 block text-2xl tabular-nums">{hiring.hireNowCount ? `${hiring.hireNowCount} now` : hiring.prepareCount ? `${hiring.prepareCount} prepare` : "Hold"}</strong><span className="mt-1 block text-[10px] leading-4 text-white/35">{hiring.primary ? `${hiring.primary.label} · ${hiring.primary.gapHours}h gap · ${hiring.primary.roleTitle}` : "No area has crossed its guardrail"}</span></button>
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

function CapacityWorkspace({ payload, company, calculations, canEdit, saving, onSave }: WorkspaceProps & { payload: BattleTablePayload; calculations: StrategicCalculations }) {
  const [draft, setDraft] = useState(company);
  const [taskBusy, setTaskBusy] = useState("");
  const [accepted, setAccepted] = useState<string[]>([]);
  const [taskError, setTaskError] = useState("");
  const capacity = strategicCalculations(draft, calculations.actuals).capacity;
  const hiring = hiringAnalysis(payload, draft);
  const recommendations = hiring.ranked.filter(area => area.state !== "balanced");

  function updateArea(id: CompanyCapacityAreaId, patch: Partial<CompanyCapacityAreaPlan>) {
    setDraft(current => ({ ...current, capacity: { ...current.capacity, areas: current.capacity.areas.map(area => area.id === id ? { ...area, ...patch } : area) } }));
  }

  async function acceptRecommendation(area: HiringCapacityAreaAnalysis) {
    setTaskBusy(area.id);
    setTaskError("");
    try {
      const response = await fetch("/api/portal/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `Hiring decision: ${area.roleTitle}`,
          notes: `${area.label} is operating at ${area.utilisationPercent}% against a ${area.targetUtilisationPercent}% guardrail. Assess ${area.preferredEngagement} capacity of about ${area.recommendedWeeklyHours}h/week.`,
          priority: area.state === "hire-now" ? "urgent" : "high",
          origin: "radar",
          sourceId: `hiring-capacity:${company.companyId ?? "ecosystem"}:${area.id}`,
          sourceHref: `/portal/agency?station=battle&battle=capacity${company.companyId ? `&scope=company:${company.companyId}` : ""}`,
          evidence: area.evidence,
          evidenceSourceIds: [`team:capacity:${area.id}`, "company:capacity", "team:hiring"],
          expectedOutcome: `Approve, reject, automate, contract or recruit the ${area.roleTitle} capacity decision with an owner, budget and start date.`,
          dueAt: Date.now() + (area.state === "hire-now" ? 2 : 7) * 86_400_000,
        }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "The hiring action could not be created.");
      setAccepted(current => [...current, area.id]);
    } catch (cause) {
      setTaskError(cause instanceof Error ? cause.message : "The hiring action could not be created.");
    } finally {
      setTaskBusy("");
    }
  }

  return <BattleSection eyebrow="Force capacity" title="Can the business deliver the strategy?" detail="Area-level capacity turns workload, team hours, pipeline demand and targets into ranked hiring decisions. The model shows its evidence and assumptions; it never treats a suggested hire as approved work until you accept it.">
    <div className="grid grid-cols-2 border border-[#d7b56d]/18 lg:grid-cols-6">
      <PlotReadout label="Available" value={`${draft.capacity.weeklyAvailableHours}h`} detail="Authoritative weekly capacity" />
      <PlotReadout label="Required" value={`${capacity.requiredHours}h`} detail="Delivery, sales and admin" />
      <PlotReadout label="Area gaps" value={`${hiring.totalGapHours}h`} detail="Above area guardrails" tone={hiring.totalGapHours ? "critical" : "aqua"} />
      <PlotReadout label="Hire now" value={String(hiring.hireNowCount)} detail="High-impact constraints" tone={hiring.hireNowCount ? "critical" : "aqua"} />
      <PlotReadout label="Prepare" value={String(hiring.prepareCount)} detail="Build a hiring bench" tone={hiring.prepareCount ? "gold" : "aqua"} />
      <PlotReadout label="Capacity value" value={money(hiring.estimatedMonthlyCapacityValueCents, payload.actuals.currency)} detail={`${money(hiring.estimatedMonthlyCostCents, payload.actuals.currency)} modelled monthly cost`} tone="gold" />
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <section className="border border-white/10 bg-[#071116]/74">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-4"><div><p className="text-[9px] font-semibold uppercase text-[#62e8ff]/60">Hiring intelligence · ranked by constraint and impact</p><h3 className="mt-1 text-base font-semibold">Where the next unit of capacity matters most</h3></div><span className="border border-[#d7b56d]/20 px-2.5 py-1.5 text-[8px] font-semibold uppercase text-[#e4c783]">{payload.companyName}</span></header>
          {taskError ? <p role="alert" className="border-b border-red-300/20 bg-red-400/[0.08] px-4 py-3 text-xs text-red-200">{taskError}</p> : null}
          <div className="divide-y divide-white/10">
            {recommendations.slice(0, 5).map((area, index) => <HiringRecommendationRow key={area.id} area={area} rank={index + 1} currency={payload.actuals.currency} busy={taskBusy === area.id} accepted={accepted.includes(area.id)} onAccept={() => void acceptRecommendation(area)} />)}
            {!recommendations.length ? <div className="px-5 py-10 text-center"><CheckCircle2 className="mx-auto text-[#68f5d0]" size={24} /><p className="mt-3 text-sm font-semibold">No hiring guardrail is currently crossed</p><p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-white/38">Keep the area allocations current. Radar will promote a recommendation when demand, backlog or utilisation changes.</p></div> : null}
          </div>
        </section>

        <section className="mt-5 border border-white/10 bg-[#071116]/74">
          <header className="border-b border-white/10 p-4"><p className="text-[9px] font-semibold uppercase text-[#62e8ff]/60">Area capacity map</p><h3 className="mt-1 text-base font-semibold">Every operating area on one decision surface</h3></header>
          <div className="grid md:grid-cols-2 2xl:grid-cols-3">{hiring.areas.map(area => <CapacityAreaCard key={area.id} area={area} />)}</div>
        </section>
      </div>

      <div className="h-fit border border-[#d7b56d]/18 bg-[#071116]/82 p-4">
        <h3 className="text-sm font-semibold">Capacity assumptions</h3>
        <p className="mt-1 text-[10px] leading-4 text-white/35">People hours are used where recorded. Remaining shared hours follow the allocation percentages below.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><BattleNumber label="Weekly available hours" value={draft.capacity.weeklyAvailableHours} onChange={value => setDraft(item => ({ ...item, capacity: { ...item.capacity, weeklyAvailableHours: value } }))} disabled={!canEdit} /><BattleNumber label="Delivery hours per client" value={draft.capacity.deliveryHoursPerActiveClient} onChange={value => setDraft(item => ({ ...item, capacity: { ...item.capacity, deliveryHoursPerActiveClient: value } }))} disabled={!canEdit} /><BattleNumber label="Sales hours per call" value={draft.capacity.salesHoursPerCall} onChange={value => setDraft(item => ({ ...item, capacity: { ...item.capacity, salesHoursPerCall: value } }))} disabled={!canEdit} /><BattleNumber label="Admin buffer" suffix="%" value={draft.capacity.adminBufferPercent} onChange={value => setDraft(item => ({ ...item, capacity: { ...item.capacity, adminBufferPercent: value } }))} disabled={!canEdit} /><BattleNumber label="Overall hiring trigger" suffix="%" value={draft.capacity.hiringTriggerPercent} onChange={value => setDraft(item => ({ ...item, capacity: { ...item.capacity, hiringTriggerPercent: value } }))} disabled={!canEdit} /><BattleField label="Capacity notes"><textarea disabled={!canEdit} value={draft.capacity.notes ?? ""} onChange={event => setDraft(item => ({ ...item, capacity: { ...item.capacity, notes: event.target.value } }))} className={battleTextarea} /></BattleField></div>
        <div className="mt-5 border-t border-[#d7b56d]/15 pt-4"><div className="flex items-center justify-between gap-3"><p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">Area controls</p><span className={`text-[9px] font-semibold uppercase ${draft.capacity.areas.reduce((sum, area) => sum + area.allocationPercent, 0) === 100 ? "text-[#68f5d0]" : "text-[#ffd45c]"}`}>{draft.capacity.areas.reduce((sum, area) => sum + area.allocationPercent, 0)}% configured · normalised automatically</span></div><div className="mt-3 space-y-2">{draft.capacity.areas.map(area => <details key={area.id} className="border border-white/10 bg-black/10"><summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold"><span>{HIRING_CAPACITY_AREA_META.find(item => item.id === area.id)?.label}</span><span className="text-[9px] text-[#62e8ff]">{area.allocationPercent}% · {area.targetUtilisationPercent}% guardrail</span></summary><div className="grid gap-3 border-t border-white/10 p-3"><div className="grid grid-cols-2 gap-3"><BattleNumber label="Capacity allocation" suffix="%" value={area.allocationPercent} onChange={value => updateArea(area.id, { allocationPercent: value })} disabled={!canEdit} /><BattleNumber label="Area guardrail" suffix="%" value={area.targetUtilisationPercent} onChange={value => updateArea(area.id, { targetUtilisationPercent: value })} disabled={!canEdit} /><BattleNumber label="Demand adjustment" suffix="h" value={area.demandAdjustmentHours} onChange={value => updateArea(area.id, { demandAdjustmentHours: value })} disabled={!canEdit} /><BattleNumber label="Hourly cost" prefix={currencySymbol(payload.actuals.currency)} value={area.hourlyCostCents / 100} onChange={value => updateArea(area.id, { hourlyCostCents: Math.max(0, Math.round(value * 100)) })} disabled={!canEdit} /></div><BattleText label="Recommended role" value={area.roleTitle} onChange={roleTitle => updateArea(area.id, { roleTitle })} disabled={!canEdit} /><label className={battleLabel}>Engagement<select value={area.preferredEngagement} disabled={!canEdit} onChange={event => updateArea(area.id, { preferredEngagement: event.target.value as CompanyCapacityAreaPlan["preferredEngagement"] })} className={battleControl}><option value="full-time">Full time</option><option value="part-time">Part time</option><option value="contractor">Contractor</option><option value="freelancer">Freelancer</option><option value="automation">Automation</option></select></label><label className={battleLabel}>Hiring state<select value={area.hiringStatus} disabled={!canEdit} onChange={event => updateArea(area.id, { hiringStatus: event.target.value as CompanyCapacityAreaPlan["hiringStatus"] })} className={battleControl}><option value="monitoring">Monitoring</option><option value="approved">Approved</option><option value="recruiting">Recruiting</option><option value="filled">Filled</option><option value="paused">Paused</option></select></label></div></details>)}</div></div>
        {canEdit ? <SaveButton saving={saving} label="Save capacity and hiring model" onClick={() => void onSave(draft, "Capacity and hiring model saved.")} /> : null}
      </div>
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
    { label: "Products and offers", value: String(payload.productCount), detail: "Pricing, packages, fulfilment and portal seeds", href: "/portal/agency/fulfilment?view=services", icon: <Package size={17} /> },
    { label: "Connections", value: `${payload.connectedSources}/${payload.totalSources}`, detail: "Evidence, integrations and operating inputs", href: "/portal/agency/company?view=connections", icon: <PlugZap size={17} /> },
    { label: "Legal and compliance", value: String(payload.legalCount), detail: "Contracts, insurance, policies and obligations", href: "/portal/agency/company?view=legal", icon: <FileCheck2 size={17} /> },
    { label: "People and departments", value: String(payload.staffCount), detail: "Capacity owners, roles, leave and compensation", href: "/portal/agency/people", icon: <UsersRound size={17} /> },
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

function hiringAnalysis(payload: BattleTablePayload, company: CompanyProfile) {
  return buildHiringCapacityAnalysis({
    capacity: company.capacity,
    actuals: {
      monthlyRevenueTargetCents: company.monthlyRevenueTargetCents,
      monthRevenueCents: payload.actuals.monthRevenueCents,
      averageDealValueCents: company.averageDealValueCents,
      salesCallCloseRatePercent: company.salesCallCloseRatePercent,
      activeClients: payload.actuals.activeClients,
      clientsNeedingAttention: payload.actuals.clientsNeedingAttention,
      leadCount: payload.actuals.leadCount,
      meetingsThisMonth: payload.actuals.meetingsThisMonth,
      productCount: payload.productCount,
      legalCount: payload.legalCount,
      financeConnected: payload.actuals.financeConnected,
    },
    signals: payload.capacitySignals,
  });
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
function HiringRecommendationRow({ area, rank, currency, busy, accepted, onAccept }: { area: HiringCapacityAreaAnalysis; rank: number; currency: string; busy: boolean; accepted: boolean; onAccept: () => void }) {
  const tone = hiringTone(area.state);
  return <article className="grid gap-4 p-4 lg:grid-cols-[42px_minmax(0,1fr)_minmax(210px,.48fr)] lg:items-start">
    <span className={`grid size-10 place-items-center border text-xs font-semibold ${tone.box}`}>{String(rank).padStart(2, "0")}</span>
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><span className={`px-2 py-1 text-[8px] font-semibold uppercase ${tone.badge}`}>{hiringStateLabel(area.state)}</span><span className="text-[8px] font-semibold uppercase text-white/30">{area.confidence} confidence · score {area.impactScore}</span></div>
      <h4 className="mt-2 text-sm font-semibold text-white/84">{area.roleTitle}</h4>
      <p className="mt-1 text-xs leading-5 text-white/42">{area.label} needs approximately {area.recommendedWeeklyHours}h/week of {area.preferredEngagement.replace("-", " ")} capacity. The current model shows a {area.gapHours}h weekly gap.</p>
      <details className="mt-3"><summary className="cursor-pointer text-[9px] font-semibold uppercase text-[#62e8ff]">Inspect evidence</summary><ul className="mt-2 space-y-1 border-l border-[#62e8ff]/18 pl-3 text-[10px] leading-4 text-white/38">{area.evidence.map(item => <li key={item}>{item}</li>)}</ul></details>
    </div>
    <div className="grid grid-cols-2 border border-white/10">
      <HiringReadout label="Utilisation" value={`${area.utilisationPercent}%`} detail={`${area.targetUtilisationPercent}% guardrail`} tone={area.state === "hire-now" ? "critical" : "gold"} />
      <HiringReadout label="Weekly gap" value={`${area.gapHours}h`} detail={`${area.demandHours}h demand`} tone={area.gapHours ? "critical" : "aqua"} />
      <HiringReadout label="Modelled cost" value={money(area.estimatedMonthlyCostCents, currency)} detail="Per month" />
      <HiringReadout label="Capacity value" value={money(area.estimatedMonthlyCapacityValueCents, currency)} detail={area.roiMultiple === null ? "No cost baseline" : `${area.roiMultiple}x gross capacity value`} tone="gold" />
      <button type="button" disabled={busy || accepted} onClick={onAccept} className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 border-t border-[#68f5d0]/18 bg-[#68f5d0]/[0.055] px-3 text-[9px] font-semibold uppercase text-[#68f5d0] hover:bg-[#68f5d0]/[0.1] disabled:cursor-not-allowed disabled:opacity-55">{busy ? <LoaderCircle size={13} className="animate-spin" /> : accepted ? <Check size={13} /> : <Plus size={13} />}{accepted ? "Added to Actions" : "Accept hiring action"}</button>
      <Link href="/portal/agency/people?view=candidates" className="col-span-2 inline-flex min-h-9 items-center justify-center gap-2 border-t border-white/10 text-[9px] font-semibold uppercase text-[#e4c783] hover:bg-[#d7b56d]/[0.06]"><UserPlus size={13} /> Open recruitment</Link>
    </div>
  </article>;
}

function CapacityAreaCard({ area }: { area: HiringCapacityAreaAnalysis }) {
  const tone = hiringTone(area.state);
  return <article className="border-b border-r border-white/10 p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[8px] font-semibold uppercase text-[#62e8ff]/55">{area.id.replace("-", " ")}</p><h4 className="mt-1 text-sm font-semibold">{area.label}</h4></div><span className={`px-2 py-1 text-[8px] font-semibold uppercase ${tone.badge}`}>{hiringStateLabel(area.state)}</span></div>
    <div className="mt-4 flex items-end justify-between gap-3"><div><strong className={`text-2xl tabular-nums ${tone.text}`}>{area.utilisationPercent}%</strong><p className="mt-1 text-[9px] text-white/32">{area.demandHours}h demand / {area.availableHours}h capacity</p></div><Zap size={16} className={tone.text} /></div>
    <div className="mt-3 h-1.5 overflow-hidden bg-white/[0.06]"><div className={`h-full ${tone.bar}`} style={{ width: `${Math.min(100, area.utilisationPercent)}%` }} /></div>
    <div className="mt-4 grid grid-cols-3 gap-px bg-white/10 text-center"><MiniCapacity label="Gap" value={`${area.gapHours}h`} /><MiniCapacity label="People" value={String(area.peopleCount)} /><MiniCapacity label="Tasks" value={`${area.openTaskHours}h`} /></div>
    <p className="mt-3 truncate text-[10px] text-white/38" title={area.roleTitle}>{area.roleTitle}</p>
  </article>;
}

function HiringReadout({ label, value, detail, tone = "aqua" }: { label: string; value: string; detail: string; tone?: "aqua" | "gold" | "critical" }) { return <div className="border-b border-r border-white/10 p-2.5"><p className="text-[7px] font-semibold uppercase text-white/28">{label}</p><strong className={`mt-1 block text-xs ${tone === "critical" ? "text-red-300" : tone === "gold" ? "text-[#f1dba9]" : "text-[#62e8ff]"}`}>{value}</strong><span className="mt-0.5 block text-[7px] leading-3 text-white/25">{detail}</span></div>; }
function MiniCapacity({ label, value }: { label: string; value: string }) { return <div className="bg-[#071116] px-2 py-2"><span className="block text-[7px] font-semibold uppercase text-white/25">{label}</span><strong className="mt-0.5 block text-[10px] text-white/65">{value}</strong></div>; }
function hiringStateLabel(state: HiringCapacityAreaAnalysis["state"]): string { return state === "hire-now" ? "Hire now" : state === "prepare" ? "Prepare" : state === "watch" ? "Watch" : "Balanced"; }
function hiringTone(state: HiringCapacityAreaAnalysis["state"]) {
  if (state === "hire-now") return { text: "text-red-300", bar: "bg-red-400", badge: "bg-red-400/10 text-red-200", box: "border-red-300/24 bg-red-400/[0.07] text-red-200" };
  if (state === "prepare") return { text: "text-amber-200", bar: "bg-amber-300", badge: "bg-amber-300/10 text-amber-200", box: "border-amber-300/24 bg-amber-300/[0.07] text-amber-200" };
  if (state === "watch") return { text: "text-sky-200", bar: "bg-sky-300", badge: "bg-sky-300/10 text-sky-200", box: "border-sky-300/24 bg-sky-300/[0.07] text-sky-200" };
  return { text: "text-[#68f5d0]", bar: "bg-[#68f5d0]", badge: "bg-[#68f5d0]/10 text-[#68f5d0]", box: "border-[#68f5d0]/24 bg-[#68f5d0]/[0.07] text-[#68f5d0]" };
}
function ReviewBlock({ label, value }: { label: string; value: string }) { return <div><h3 className="text-[9px] font-semibold uppercase text-[#e4c783]/55">{label}</h3><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-white/45">{value || "Nothing recorded."}</p></div>; }
function EmptyBattle({ title, detail }: { title: string; detail: string }) { return <div className="border border-dashed border-white/12 p-8 text-center lg:col-span-2"><Target size={22} className="mx-auto text-white/20" /><strong className="mt-3 block text-sm text-white/50">{title}</strong><p className="mt-1 text-xs text-white/28">{detail}</p></div>; }
function SaveButton({ saving, label, onClick }: { saving: boolean; label: string; onClick: () => void }) { return <div className="mt-4 flex justify-end"><button type="button" disabled={saving} onClick={onClick} className={battlePrimaryButton}>{saving ? <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" /> : <Save size={14} />}{saving ? "Saving" : label}</button></div>; }
function BattleField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className={battleLabel}>{label}{hint ? <span className="font-normal normal-case leading-4 text-white/30">{hint}</span> : null}{children}</label>; }
function BattleText({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) { return <label className={battleLabel}>{label}<input value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={battleControl} /></label>; }
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
    capacitySignals: payload.capacitySignals ?? emptyHiringCapacitySignals(),
  };
}
