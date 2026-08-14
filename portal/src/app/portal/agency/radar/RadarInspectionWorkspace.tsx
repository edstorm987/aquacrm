"use client";

import Link from "next/link";
import type React from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Database,
  Download,
  EyeOff,
  FileJson,
  Gauge,
  Globe2,
  History,
  Layers3,
  LoaderCircle,
  MessageSquareText,
  RadioTower,
  RefreshCw,
  Search,
  ShieldCheck,
  Square,
  Target,
  TimerReset,
} from "lucide-react";

import type {
  AdvisorDomain,
  BusinessIssueRadar,
  BusinessRadarCheck,
  BusinessRadarIncident,
  BusinessRadarIssue,
  RadarCheckScope,
  RadarCheckStatus,
  RadarEvidenceInspectionIndex,
  RadarEvidenceSeriesInspection,
  RadarEvidenceSeriesSummary,
  RadarRuleLens,
  RadarSourceDataIndex,
  RadarSourceDatasetInspection,
  RadarSourceDatasetSummary,
} from "@/lib/businessRadar";

export type RadarInspectionTab = "kpis" | "checks" | "evidence" | "records" | "sources" | "incidents" | "raw";
type InspectionTab = RadarInspectionTab;
type StatusFilter = RadarCheckStatus | "all" | "attention" | "applicable" | "assured" | "firing" | "live";
type ScopeFilter = RadarCheckScope | "all" | "sentinel";

const DOMAINS: AdvisorDomain[] = ["company", "sales", "inbox", "clients", "finance", "delivery", "marketing", "operations", "compliance", "development", "team", "systems"];
const SCOPES: RadarCheckScope[] = ["kpi", "source", "property", "synthetic", "history", "watchdog"];
const LENSES: RadarRuleLens[] = ["connection", "freshness", "threshold", "trend", "anomaly", "integrity", "continuity", "baseline", "confidence", "forecast", "volatility", "resilience"];
const CHECK_BATCH_SIZE = 200;
const SOURCE_PAGE_SIZE = 100;

interface RadarKpiScorecardRow {
  id: string;
  domain: AdvisorDomain;
  familyId: string;
  label: string;
  status: RadarCheckStatus;
  value?: number;
  display?: string;
  previousValue?: number;
  targetValue?: number;
  targetLabel: string;
  expectedDirection: "higher" | "lower" | "neutral";
  measuredAt: number;
  lastSeenAt?: number;
  sourceId: string;
  sampleSize?: number;
  historySamples: number;
  historySpanMs?: number;
  evidenceSamples: number;
  domainConfidencePercent: number;
  owner: string;
  escalationRoute: string;
  evaluationWindow: string;
  notificationCadence: string;
  warningTolerancePercent?: number;
  criticalTolerancePercent?: number;
  href: string;
  checks: BusinessRadarCheck[];
}

export function RadarInspectionWorkspace({
  initialRadar,
  initialEvidence,
  initialTab,
  initialQuery = "",
  initialDomain = "all",
  initialStatus = "all",
  initialScope = "all",
  initialLens = "all",
  initialSourceId = "",
  initialDatasetId = "",
  embedded = false,
}: {
  initialRadar: BusinessIssueRadar;
  initialEvidence: RadarEvidenceInspectionIndex;
  initialTab: InspectionTab;
  initialQuery?: string;
  initialDomain?: AdvisorDomain | "all";
  initialStatus?: StatusFilter;
  initialScope?: ScopeFilter;
  initialLens?: RadarRuleLens | "all";
  initialSourceId?: string;
  initialDatasetId?: string;
  embedded?: boolean;
}) {
  const [radar, setRadar] = useState(initialRadar);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [tab, setTab] = useState<InspectionTab>(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const [domain, setDomain] = useState<AdvisorDomain | "all">(initialDomain);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [scope, setScope] = useState<ScopeFilter>(initialScope);
  const [lens, setLens] = useState<RadarRuleLens | "all">(initialLens);
  const [selectedCheckId, setSelectedCheckId] = useState(radar.checks.find(check => check.status !== "pass")?.id ?? radar.checks[0]?.id ?? "");
  const [selectedSeriesId, setSelectedSeriesId] = useState(evidence.series[0]?.id ?? "");
  const [seriesDetail, setSeriesDetail] = useState<RadarEvidenceSeriesInspection | null>(null);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [sourceIndex, setSourceIndex] = useState<RadarSourceDataIndex | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState(initialDatasetId);
  const [sourceDetail, setSourceDetail] = useState<RadarSourceDatasetInspection | null>(null);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [visibleCheckCount, setVisibleCheckCount] = useState(CHECK_BATCH_SIZE);
  const [selectedKpiId, setSelectedKpiId] = useState("");
  const deferredQuery = useDeferredValue(query);

  const allKpis = useMemo(() => buildKpiScorecard(radar, evidence), [evidence, radar]);
  const kpis = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    return allKpis
      .filter(kpi => domain === "all" || kpi.domain === domain)
      .filter(kpi => matchesStatus(kpi.status, status))
      .filter(kpi => !normalized || JSON.stringify(kpi).toLowerCase().includes(normalized))
      .sort((left, right) => statusRank(left.status) - statusRank(right.status) || left.domain.localeCompare(right.domain) || left.label.localeCompare(right.label));
  }, [allKpis, deferredQuery, domain, status]);

  const checks = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    return radar.checks
      .filter(check => domain === "all" || check.domain === domain)
      .filter(check => matchesStatus(check.status, status))
      .filter(check => matchesScope(check.scope, scope))
      .filter(check => lens === "all" || check.lens === lens)
      .filter(check => !normalized || JSON.stringify(check).toLowerCase().includes(normalized))
      .sort((left, right) => statusRank(left.status) - statusRank(right.status) || left.domain.localeCompare(right.domain) || left.familyLabel.localeCompare(right.familyLabel));
  }, [deferredQuery, domain, lens, radar.checks, scope, status]);

  const filteredSeries = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    return evidence.series.filter(series => (domain === "all" || series.domain === domain) && (!normalized || JSON.stringify(series).toLowerCase().includes(normalized)));
  }, [deferredQuery, domain, evidence.series]);
  const selectedCheck = checks.find(check => check.id === selectedCheckId) ?? checks[0] ?? null;
  const visibleChecks = checks.slice(0, visibleCheckCount);
  const selectedSeries = filteredSeries.find(series => series.id === selectedSeriesId) ?? filteredSeries[0] ?? null;
  const filteredDatasets = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    return (sourceIndex?.datasets ?? []).filter(dataset => (domain === "all" || dataset.domain === domain) && (!normalized || JSON.stringify(dataset).toLowerCase().includes(normalized)));
  }, [deferredQuery, domain, sourceIndex]);
  const selectedDataset = filteredDatasets.find(dataset => dataset.id === selectedDatasetId) ?? filteredDatasets[0] ?? null;
  const selectedKpi = kpis.find(kpi => kpi.id === selectedKpiId) ?? kpis[0] ?? null;

  useEffect(() => {
    setVisibleCheckCount(CHECK_BATCH_SIZE);
  }, [deferredQuery, domain, lens, scope, status]);

  useEffect(() => {
    if (initialTab === "records") void loadSourceIndex(initialDatasetId || initialSourceId || initialQuery, initialDomain);
  }, [initialDatasetId, initialDomain, initialQuery, initialSourceId, initialTab]);

  async function scanNow() {
    setScanBusy(true);
    setError("");
    try {
      const radarResponse = await fetch("/api/portal/advisor/radar", { cache: "no-store" });
      const radarResult = await radarResponse.json().catch(() => null) as { ok?: boolean; radar?: BusinessIssueRadar; error?: string } | null;
      if (!radarResponse.ok || !radarResult?.ok || !radarResult.radar) throw new Error(radarResult?.error || "Radar scan failed.");
      const evidenceResponse = await fetch("/api/portal/advisor/radar/evidence", { cache: "no-store" });
      const evidenceResult = await evidenceResponse.json().catch(() => null) as { ok?: boolean; evidence?: RadarEvidenceInspectionIndex; error?: string } | null;
      if (!evidenceResponse.ok || !evidenceResult?.ok || !evidenceResult.evidence) throw new Error(evidenceResult?.error || "Evidence vault refresh failed.");
      setRadar(radarResult.radar);
      setEvidence(evidenceResult.evidence);
      setSeriesDetail(null);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Radar scan failed.");
    } finally {
      setScanBusy(false);
    }
  }

  async function loadSeries(series: RadarEvidenceSeriesSummary) {
    setSelectedSeriesId(series.id);
    setSeriesDetail(null);
    setSeriesBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/portal/advisor/radar/evidence?seriesId=${encodeURIComponent(series.id)}`, { cache: "no-store" });
      const result = await response.json().catch(() => null) as { ok?: boolean; series?: RadarEvidenceSeriesInspection; error?: string } | null;
      if (!response.ok || !result?.ok || !result.series) throw new Error(result?.error || "Evidence series could not be loaded.");
      setSeriesDetail(result.series);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Evidence series could not be loaded.");
    } finally {
      setSeriesBusy(false);
    }
  }

  async function selectInspectionTab(next: InspectionTab) {
    setTab(next);
    if (!embedded) window.history.replaceState(null, "", `/portal/agency/radar?view=${next}`);
    if (next === "records" && !sourceIndex && !sourceBusy) await loadSourceIndex();
  }

  async function inspectCheckSource(check: BusinessRadarCheck) {
    setQuery(check.sourceId);
    setDomain(check.domain);
    setTab("records");
    if (!embedded) window.history.replaceState(null, "", "/portal/agency/radar?view=records");
    const index = sourceIndex ?? await loadSourceIndex();
    const matchingDataset = index?.datasets.find(dataset => dataset.sourceIds.includes(check.sourceId))
      ?? index?.datasets.find(dataset => dataset.domain === check.domain);
    if (matchingDataset) await loadSourceDataset(matchingDataset);
  }

  async function loadSourceIndex(preferredSourceId = "", preferredDomain: AdvisorDomain | "all" = "all") {
    setSourceBusy(true);
    setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`/api/portal/advisor/radar/sources${sourceIndex ? "?refresh=1" : ""}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json().catch(() => null) as { ok?: boolean; index?: RadarSourceDataIndex; error?: string } | null;
      if (!response.ok || !result?.ok || !result.index) throw new Error(result?.error || "Radar source catalogue could not be loaded.");
      setSourceIndex(result.index);
      const first = result.index.datasets.find(dataset => preferredSourceId && dataset.id === preferredSourceId)
        ?? result.index.datasets.find(dataset => preferredSourceId && dataset.sourceIds.includes(preferredSourceId))
        ?? result.index.datasets.find(dataset => preferredDomain !== "all" && dataset.domain === preferredDomain)
        ?? result.index.datasets[0];
      if (first) await loadSourceDataset(first, 0, false);
      return result.index;
    } catch (sourceError) {
      setError(sourceError instanceof DOMException && sourceError.name === "AbortError"
        ? "The source catalogue took longer than 15 seconds. Refresh it to try again."
        : sourceError instanceof Error ? sourceError.message : "Radar source catalogue could not be loaded.");
      return null;
    } finally {
      window.clearTimeout(timeout);
      setSourceBusy(false);
    }
  }

  async function loadSourceDataset(dataset: RadarSourceDatasetSummary, offset = 0, manageBusy = true) {
    setSelectedDatasetId(dataset.id);
    if (!embedded) window.history.replaceState(null, "", `/portal/agency/radar?view=records&dataset=${encodeURIComponent(dataset.id)}`);
    if (manageBusy) setSourceBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ datasetId: dataset.id, offset: String(offset), limit: String(SOURCE_PAGE_SIZE) });
      const response = await fetch(`/api/portal/advisor/radar/sources?${params}`, { cache: "no-store" });
      const result = await response.json().catch(() => null) as { ok?: boolean; dataset?: RadarSourceDatasetInspection; error?: string } | null;
      if (!response.ok || !result?.ok || !result.dataset) throw new Error(result?.error || "Source records could not be loaded.");
      setSourceDetail(result.dataset);
    } catch (sourceError) {
      setError(sourceError instanceof Error ? sourceError.message : "Source records could not be loaded.");
    } finally {
      if (manageBusy) setSourceBusy(false);
    }
  }

  function exportSnapshot() {
    const blob = new Blob([JSON.stringify({ radar, evidenceIndex: evidence }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aquacrm-radar-snapshot-${new Date(radar.generatedAt).toISOString().replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyRaw() {
    await navigator.clipboard.writeText(JSON.stringify({ radar, evidenceIndex: evidence }, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5" data-testid="radar-inspection-workspace">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          {!embedded ? <Link href="/portal/agency" className="inline-flex items-center gap-1.5 text-xs font-semibold text-black/45 hover:text-black/75"><ArrowLeft size={14} /> Command Centre</Link> : null}
          <p className={`${embedded ? "" : "mt-4"} text-xs font-semibold uppercase tracking-wide text-brand`}>{embedded ? "Omega data station" : "Manual audit room"}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90 sm:text-3xl">{embedded ? "Data inspector" : "Radar inspection"}</h1>
          <p className="mt-2 text-sm leading-6 text-black/55">Inspect the actual business records first, then trace every calculation, source, policy decision, incident, and retained data point behind the business radar.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <button type="button" onClick={() => void selectInspectionTab(tab === "records" ? "checks" : "records")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/65 hover:bg-black/[0.03]"><Database size={15} /> {tab === "records" ? "View check ledger" : "Browse source records"}</button>
          <button type="button" onClick={exportSnapshot} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/65 hover:bg-black/[0.03]"><Download size={15} /> Export snapshot</button>
          <button type="button" onClick={() => void scanNow()} disabled={scanBusy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50">{scanBusy ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} {scanBusy ? "Scanning" : "Scan now"}</button>
        </div>
      </header>

      {error ? <div role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      <section className="grid grid-cols-2 overflow-hidden border-y border-black/10 bg-white sm:grid-cols-4 xl:grid-cols-8" aria-label="Radar inspection summary">
        <SummaryMetric label="Checks" value={radar.summary.totalChecks} icon={<RadioTower size={15} />} />
        <SummaryMetric label="Passing" value={radar.summary.passedChecks} icon={<Check size={15} />} tone="good" />
        <SummaryMetric label="Firing" value={radar.summary.firingChecks} icon={<AlertTriangle size={15} />} tone={radar.summary.firingChecks ? "bad" : "good"} />
        <SummaryMetric label="Blind" value={radar.summary.blindChecks} icon={<EyeOff size={15} />} tone={radar.summary.blindChecks ? "warn" : "good"} />
        <SummaryMetric label="Learning" value={radar.summary.learningChecks} icon={<History size={15} />} />
        <SummaryMetric label="Sources" value={`${radar.summary.connectedSources}/${radar.summary.totalSources}`} icon={<Database size={15} />} />
        <SummaryMetric label="Evidence" value={evidence.totalSamples} icon={<Activity size={15} />} />
        <SummaryMetric label="Generated" value={formatShortDate(radar.generatedAt)} icon={<Gauge size={15} />} compact />
      </section>

      <nav className="overflow-x-auto border-b border-black/10" aria-label="Radar inspection views">
        <div className="flex min-w-max gap-6" role="tablist">
          {([
            ["kpis", "KPI scorecard", allKpis.length],
            ["checks", "Checks", radar.checks.length],
            ["evidence", "Evidence vault", evidence.series.length],
            ["records", "Source records", sourceIndex?.totalDatasets ?? null],
            ["sources", "Connections & coverage", radar.coverage.length + radar.signals.length],
            ["incidents", "Incidents", radar.incidents.length],
            ["raw", "Raw data", null],
          ] as const).map(([id, label, count]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => void selectInspectionTab(id)} className={`min-h-12 border-b-2 text-sm font-semibold ${tab === id ? "border-black text-black" : "border-transparent text-black/45 hover:text-black/70"}`}>{label}{count !== null ? <span className="ml-2 text-xs tabular-nums text-black/35">{count}</span> : null}</button>
          ))}
        </div>
      </nav>

      {tab === "kpis" || tab === "checks" || tab === "evidence" || tab === "records" || tab === "incidents" ? (
        <InspectionFilters
          query={query}
          onQuery={setQuery}
          domain={domain}
          onDomain={setDomain}
          status={status}
          onStatus={setStatus}
          scope={scope}
          onScope={setScope}
          lens={lens}
          onLens={setLens}
          mode={tab}
        />
      ) : null}

      {tab === "kpis" ? (
        <KpiScorecard
          rows={kpis}
          selected={selectedKpi}
          onSelect={setSelectedKpiId}
          onInspectChecks={kpi => {
            setSelectedCheckId(kpi.checks[0]?.id ?? "");
            setQuery(kpi.familyId);
            setDomain(kpi.domain);
            setStatus("all");
            setScope("kpi");
            setLens("all");
            void selectInspectionTab("checks");
          }}
          onInspectEvidence={kpi => {
            setQuery(kpi.familyId);
            setDomain(kpi.domain);
            void selectInspectionTab("evidence");
          }}
        />
      ) : null}

      {tab === "checks" ? (
        <div className="grid min-w-0 overflow-hidden border border-black/10 bg-white xl:grid-cols-[minmax(0,1fr)_440px]">
          <section className="min-w-0 xl:border-r xl:border-black/10" aria-labelledby="check-ledger-heading">
            <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3 sm:px-5"><h2 id="check-ledger-heading" className="text-sm font-semibold text-black/75">Complete scanner ledger</h2><span className="text-xs tabular-nums text-black/40">{visibleChecks.length} of {checks.length}</span></div>
            <div className="max-h-[calc(100dvh-21rem)] min-h-[420px] divide-y divide-black/10 overflow-y-auto">
              {visibleChecks.map(check => <CheckLedgerRow key={check.id} check={check} selected={selectedCheck?.id === check.id} onSelect={() => setSelectedCheckId(check.id)} />)}
              {visibleChecks.length < checks.length ? <div className="flex items-center justify-between gap-3 bg-black/[0.02] px-4 py-3 sm:px-5"><p className="text-xs text-black/42">{(checks.length - visibleChecks.length).toLocaleString()} more matching checks remain.</p><button type="button" onClick={() => setVisibleCheckCount(current => current + CHECK_BATCH_SIZE)} className="min-h-9 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">Load {Math.min(CHECK_BATCH_SIZE, checks.length - visibleChecks.length)} more</button></div> : null}
              {!checks.length ? <Empty title="No matching checks" detail="Change the domain, status, scope, lens, or search phrase." /> : null}
            </div>
          </section>
          <aside className="min-w-0 bg-[#faf9f6]" aria-label="Selected check details">
            {selectedCheck ? <CheckInspector check={selectedCheck} onInspectSource={() => void inspectCheckSource(selectedCheck)} /> : <Empty title="Choose a check" detail="Select any row to inspect its complete calculation record." />}
          </aside>
        </div>
      ) : null}

      {tab === "evidence" ? (
        <div className="grid min-w-0 overflow-hidden border border-black/10 bg-white xl:grid-cols-[minmax(0,.8fr)_minmax(440px,1.2fr)]">
          <section className="min-w-0 xl:border-r xl:border-black/10" aria-labelledby="evidence-series-heading">
            <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3 sm:px-5"><h2 id="evidence-series-heading" className="text-sm font-semibold text-black/75">Retained KPI series</h2><span className="text-xs tabular-nums text-black/40">{filteredSeries.length} shown</span></div>
            <div className="max-h-[calc(100dvh-21rem)] min-h-[420px] divide-y divide-black/10 overflow-y-auto">
              {filteredSeries.map(series => <EvidenceSeriesRow key={series.id} series={series} selected={selectedSeries?.id === series.id} onSelect={() => void loadSeries(series)} />)}
              {!filteredSeries.length ? <Empty title="No evidence series" detail={evidence.available ? "No retained series match these filters." : "Run a Radar scan to begin retaining measurable KPI history."} /> : null}
            </div>
          </section>
          <aside className="min-w-0 bg-[#faf9f6]" aria-label="Selected evidence series">
            {seriesBusy ? <div className="grid min-h-[420px] place-items-center text-sm text-black/45"><span className="inline-flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" /> Loading retained points</span></div> : selectedSeries ? <EvidenceInspector summary={selectedSeries} detail={seriesDetail?.id === selectedSeries.id ? seriesDetail : null} onLoad={() => void loadSeries(selectedSeries)} /> : <Empty title="Choose a series" detail="Select a KPI series to inspect every retained point and hourly rollup." />}
          </aside>
        </div>
      ) : null}

      {tab === "records" ? <SourceRecordsExplorer index={sourceIndex} datasets={filteredDatasets} selected={selectedDataset} detail={sourceDetail?.id === selectedDataset?.id ? sourceDetail : null} busy={sourceBusy} onRefresh={() => void loadSourceIndex()} onSelect={dataset => void loadSourceDataset(dataset)} onPage={(dataset, offset) => void loadSourceDataset(dataset, offset)} /> : null}
      {tab === "sources" ? <SourcesAndMetrics radar={radar} /> : null}
      {tab === "incidents" ? <IncidentInspection radar={radar} query={query} domain={domain} status={status} onSelectIncident={incident => {
        setQuery(incident.id);
        setDomain(incident.domain);
        setStatus("all");
        if (!embedded) window.history.replaceState(null, "", `/portal/agency/radar?view=incidents&domain=${incident.domain}&query=${encodeURIComponent(incident.id)}`);
      }} onInspectCheck={check => {
        setSelectedCheckId(check.id);
        setQuery(check.id);
        setDomain(check.domain);
        setStatus("all");
        setScope(check.scope);
        setLens(check.lens);
        void selectInspectionTab("checks");
      }} onInspectSource={check => void inspectCheckSource(check)} /> : null}
      {tab === "raw" ? <RawInspection radar={radar} evidence={evidence} copied={copied} onCopy={() => void copyRaw()} onExport={exportSnapshot} /> : null}
    </div>
  );
}

function KpiScorecard({ rows, selected, onSelect, onInspectChecks, onInspectEvidence }: {
  rows: RadarKpiScorecardRow[];
  selected: RadarKpiScorecardRow | null;
  onSelect: (id: string) => void;
  onInspectChecks: (row: RadarKpiScorecardRow) => void;
  onInspectEvidence: (row: RadarKpiScorecardRow) => void;
}) {
  const measured = rows.filter(row => row.value !== undefined).length;
  const passing = rows.filter(row => row.status === "pass").length;
  const attention = rows.filter(row => ["critical", "warning", "watch"].includes(row.status)).length;
  const calibrating = rows.filter(row => row.status === "learning" || row.status === "inactive").length;
  const blind = rows.filter(row => row.status === "blind").length;

  return <div className="grid gap-4" data-testid="radar-kpi-scorecard">
    <section className="grid grid-cols-2 overflow-hidden border-y border-black/10 bg-white sm:grid-cols-3 xl:grid-cols-6" aria-label="KPI scorecard summary">
      <SummaryMetric label="KPI families" value={rows.length} icon={<Target size={15} />} />
      <SummaryMetric label="Measured" value={measured} icon={<Gauge size={15} />} tone={measured === rows.length ? "good" : "neutral"} />
      <SummaryMetric label="On target" value={passing} icon={<Check size={15} />} tone="good" />
      <SummaryMetric label="Attention" value={attention} icon={<AlertTriangle size={15} />} tone={attention ? "bad" : "good"} />
      <SummaryMetric label="Calibrating" value={calibrating} icon={<History size={15} />} />
      <SummaryMetric label="Blind" value={blind} icon={<EyeOff size={15} />} tone={blind ? "warn" : "good"} />
    </section>

    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-black/78">Business KPI scorecard</h2>
        <p className="mt-1 text-xs leading-5 text-black/42">One accountable row per KPI family, consolidated from every threshold, trend, anomaly, forecast, confidence, and continuity check.</p>
      </div>
      <p className="text-xs tabular-nums text-black/38">{rows.length ? `${Math.round(measured / rows.length * 100)}% currently measurable` : "No KPI families match"}</p>
    </div>

    <div className="grid min-w-0 overflow-hidden border border-black/10 bg-white xl:grid-cols-[minmax(0,1fr)_440px]">
      <section className="min-w-0 xl:border-r xl:border-black/10" aria-labelledby="kpi-ledger-heading">
        <div className="hidden border-b border-black/10 bg-[#efeee9] px-4 py-2 text-[10px] font-semibold uppercase text-black/38 sm:grid sm:grid-cols-[minmax(190px,1fr)_110px_130px_120px_100px] sm:gap-3 sm:px-5">
          <span id="kpi-ledger-heading">KPI</span><span>Actual</span><span>Target</span><span>Variance</span><span>Confidence</span>
        </div>
        <div className="max-h-[calc(100dvh-22rem)] min-h-[440px] divide-y divide-black/10 overflow-y-auto">
          {rows.map(row => <KpiScorecardRow key={row.id} row={row} selected={selected?.id === row.id} onSelect={() => onSelect(row.id)} />)}
          {!rows.length ? <Empty title="No matching KPIs" detail="Change the domain, status, or search phrase to widen the scorecard." /> : null}
        </div>
      </section>
      <aside className="min-w-0 bg-[#faf9f6]" aria-label="Selected KPI details">
        {selected ? <KpiInspector row={selected} onInspectChecks={() => onInspectChecks(selected)} onInspectEvidence={() => onInspectEvidence(selected)} /> : <Empty title="Choose a KPI" detail="Select a scorecard row to inspect its target, evidence, policy, and detector stack." />}
      </aside>
    </div>
  </div>;
}

function KpiScorecardRow({ row, selected, onSelect }: { row: RadarKpiScorecardRow; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={`grid w-full min-w-0 gap-3 px-4 py-3 text-left transition sm:grid-cols-[minmax(190px,1fr)_110px_130px_120px_100px] sm:items-center sm:px-5 ${selected ? "bg-black/[0.055]" : "hover:bg-black/[0.025]"}`}>
    <span className="min-w-0">
      <span className="flex min-w-0 items-center gap-2"><StatusIcon status={row.status} /><span className="min-w-0"><strong className="block truncate text-sm font-semibold text-black/78">{row.label}</strong><span className="mt-0.5 block truncate text-[10px] font-semibold uppercase text-black/35">{domainLabel(row.domain)} · {row.checks.length} checks</span></span></span>
    </span>
    <KpiRowValue label="Actual" value={formatKpiActual(row)} strong />
    <KpiRowValue label="Target" value={row.targetLabel} />
    <KpiRowValue label="Variance" value={formatKpiVariance(row)} tone={kpiVarianceTone(row)} />
    <KpiRowValue label="Confidence" value={`${row.domainConfidencePercent}%`} detail={row.evidenceSamples ? `${row.evidenceSamples} points` : "No history"} />
  </button>;
}

function KpiRowValue({ label, value, detail, strong = false, tone = "neutral" }: { label: string; value: string; detail?: string; strong?: boolean; tone?: "neutral" | "good" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-black/62";
  return <span className="min-w-0 text-xs tabular-nums"><span className="mb-0.5 block text-[9px] font-semibold uppercase text-black/30 sm:hidden">{label}</span><strong className={`block truncate ${strong ? "text-sm" : "text-xs"} ${toneClass}`}>{value}</strong>{detail ? <span className="mt-0.5 block truncate text-[10px] text-black/32">{detail}</span> : null}</span>;
}

function KpiInspector({ row, onInspectChecks, onInspectEvidence }: { row: RadarKpiScorecardRow; onInspectChecks: () => void; onInspectEvidence: () => void }) {
  const trend = formatKpiTrend(row);
  return <div className="max-h-[calc(100dvh-18rem)] min-h-[440px] overflow-y-auto">
    <header className="border-b border-black/10 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={row.status} /><span className="text-[10px] font-semibold uppercase text-black/35">{domainLabel(row.domain)} KPI · {row.checks.length} detector lenses</span></div>
      <h2 className="mt-3 text-lg font-semibold text-black/85">{row.label}</h2>
      <p className="mt-1 break-all font-mono text-[10px] text-black/32">{row.familyId}</p>
    </header>
    <InspectorSection title="Performance">
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-black/10 bg-black/10">
        <DataCell label="Actual" value={formatKpiActual(row)} />
        <DataCell label="Target" value={row.targetLabel} />
        <DataCell label="Variance" value={formatKpiVariance(row)} />
        <DataCell label="Movement" value={trend} />
      </div>
    </InspectorSection>
    <InspectorSection title="Guardrails & ownership">
      <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <KpiDefinition label="Expected direction" value={readable(row.expectedDirection)} />
        <KpiDefinition label="Evaluation window" value={readable(row.evaluationWindow)} />
        <KpiDefinition label="Warning tolerance" value={row.warningTolerancePercent === undefined ? "Not configured" : `${row.warningTolerancePercent}%`} />
        <KpiDefinition label="Critical tolerance" value={row.criticalTolerancePercent === undefined ? "Not configured" : `${row.criticalTolerancePercent}%`} />
        <KpiDefinition label="Owner" value={row.owner} />
        <KpiDefinition label="Escalation" value={row.escalationRoute} />
        <KpiDefinition label="Notifications" value={readable(row.notificationCadence)} />
        <KpiDefinition label="Measured" value={formatDate(row.measuredAt)} />
      </dl>
    </InspectorSection>
    <InspectorSection title="Evidence confidence">
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-black/10 bg-black/10">
        <DataCell label="Domain confidence" value={`${row.domainConfidencePercent}%`} />
        <DataCell label="Evidence points" value={row.evidenceSamples.toLocaleString()} />
        <DataCell label="History samples" value={row.historySamples.toLocaleString()} />
        <DataCell label="Current sample" value={row.sampleSize === undefined ? "Not declared" : row.sampleSize.toLocaleString()} />
      </div>
      <p className="mt-3 text-xs leading-5 text-black/42">{row.historySpanMs ? `${formatDuration(row.historySpanMs)} of retained history is contributing to this KPI family.` : "No retained history span is available yet; Radar will keep this KPI visibly learning or blind rather than pretending certainty."}</p>
    </InspectorSection>
    <InspectorSection title={`Contributing checks (${row.checks.length})`}>
      <div className="divide-y divide-black/10 border-y border-black/10">
        {row.checks.slice(0, 12).map(check => <div key={check.id} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0"><strong className="block truncate text-xs font-semibold text-black/62">{check.lensLabel}</strong><span className="mt-0.5 block truncate text-[10px] text-black/35">{check.detail}</span></span><StatusBadge status={check.status} /></div>)}
      </div>
      {row.checks.length > 12 ? <p className="mt-2 text-xs text-black/38">{row.checks.length - 12} additional checks remain in the complete ledger.</p> : null}
    </InspectorSection>
    <div className="flex flex-wrap gap-2 px-4 py-4 sm:px-5">
      <button type="button" onClick={onInspectChecks} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><RadioTower size={13} /> Inspect all checks</button>
      <button type="button" onClick={onInspectEvidence} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65"><History size={13} /> Open evidence history</button>
      <Link href={row.href} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65">Open owner workspace <ArrowUpRight size={13} /></Link>
    </div>
  </div>;
}

function KpiDefinition({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] font-semibold uppercase text-black/35">{label}</dt><dd className="mt-1 break-words text-sm text-black/65">{value}</dd></div>;
}

function InspectionFilters({ query, onQuery, domain, onDomain, status, onStatus, scope, onScope, lens, onLens, mode }: {
  query: string;
  onQuery: (value: string) => void;
  domain: AdvisorDomain | "all";
  onDomain: (value: AdvisorDomain | "all") => void;
  status: StatusFilter;
  onStatus: (value: StatusFilter) => void;
  scope: ScopeFilter;
  onScope: (value: ScopeFilter) => void;
  lens: RadarRuleLens | "all";
  onLens: (value: RadarRuleLens | "all") => void;
  mode: "kpis" | "checks" | "evidence" | "records" | "incidents";
}) {
  const showStatus = mode === "checks" || mode === "kpis" || mode === "incidents";
  const showCheckFilters = mode === "checks";
  const placeholder = mode === "records" ? "Search datasets, source IDs, fields, or domains..." : mode === "evidence" ? "Search series, source IDs, or values..." : mode === "incidents" ? "Search incidents, findings, evidence, check IDs, or sources..." : mode === "kpis" ? "Search KPI, owner, target, source, or domain..." : "Search any check field, evidence, source, or ID...";
  return <div className="grid gap-2 border-y border-black/10 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_160px_160px_160px_160px]">
    <label className="relative block min-w-0"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" /><input value={query} onChange={event => onQuery(event.target.value)} placeholder={placeholder} className="mm-field min-h-10 w-full pl-10 text-sm" /></label>
    <Select label="Domain" value={domain} onChange={value => onDomain(value as AdvisorDomain | "all")} options={["all", ...DOMAINS]} />
    {showStatus ? <Select label="Status" value={status} onChange={value => onStatus(value as StatusFilter)} options={mode === "incidents" ? ["all", "attention", "critical", "warning", "watch"] : ["all", "attention", "applicable", "assured", "firing", "live", "critical", "warning", "watch", "blind", "learning", "inactive", "pass"]} /> : <div className="hidden lg:block" />}
    {showCheckFilters ? <Select label="Scope" value={scope} onChange={value => onScope(value as ScopeFilter)} options={["all", "sentinel", ...SCOPES]} /> : <div className="hidden lg:block" />}
    {showCheckFilters ? <Select label="Lens" value={lens} onChange={value => onLens(value as RadarRuleLens | "all")} options={["all", ...LENSES]} /> : <div className="hidden lg:block" />}
  </div>;
}

function CheckLedgerRow({ check, selected, onSelect }: { check: BusinessRadarCheck; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={`grid w-full min-w-0 gap-3 px-4 py-3 text-left transition sm:grid-cols-[auto_minmax(0,1fr)_120px_140px] sm:items-center sm:px-5 ${selected ? "bg-black/[0.055]" : "hover:bg-black/[0.025]"}`}>
    <StatusIcon status={check.status} />
    <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm font-semibold text-black/78">{check.familyLabel}</strong><StatusBadge status={check.status} /></span><span className="mt-1 block line-clamp-1 text-xs text-black/42">{check.detail}</span></span>
    <span className="text-xs"><span className="block font-semibold capitalize text-black/58">{domainLabel(check.domain)}</span><span className="mt-0.5 block capitalize text-black/35">{check.scope} · {check.lensLabel}</span></span>
    <span className="min-w-0 text-xs tabular-nums"><span className="block truncate font-mono text-black/55">{check.value === undefined ? "No numeric value" : formatNumber(check.value)}</span><span className="mt-0.5 block truncate text-black/32">{formatDate(check.measuredAt)}</span></span>
  </button>;
}

function CheckInspector({ check, onInspectSource }: { check: BusinessRadarCheck; onInspectSource: () => void }) {
  const measurementRows = [
    ["Current value", check.value === undefined ? "Not numeric" : formatNumber(check.value)],
    ["Previous value", check.previousValue === undefined ? "Not retained" : formatNumber(check.previousValue)],
    ["Current sample", check.sampleSize === undefined ? "Not declared" : check.sampleSize.toLocaleString()],
    ["History samples", check.historySamples === undefined ? "Not retained" : check.historySamples.toLocaleString()],
    ["History span", check.historySpanMs === undefined ? "Not retained" : formatDuration(check.historySpanMs)],
    ["Expected direction", readable(check.expectedDirection ?? "not declared")],
  ];
  return <div className="max-h-[calc(100dvh-18rem)] min-h-[420px] overflow-y-auto">
    <header className="border-b border-black/10 px-4 py-4 sm:px-5"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={check.status} /><span className="text-[10px] font-semibold uppercase text-black/35">{domainLabel(check.domain)} · {readable(check.scope)} · {check.lensLabel}</span>{check.alwaysOn ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-800">Always on</span> : null}</div><h2 className="mt-3 text-lg font-semibold text-black/85">{check.title}</h2><p className="mt-2 text-sm leading-6 text-black/55">{check.detail}</p></header>
    <InspectorSection title="Measurement"><div className="grid grid-cols-2 gap-px overflow-hidden border border-black/10 bg-black/10">{measurementRows.map(([label, value]) => <DataCell key={label} label={label} value={value} />)}</div></InspectorSection>
    <InspectorSection title="Evidence used">{check.evidence.length ? <ul className="divide-y divide-black/10 border-y border-black/10">{check.evidence.map((item, index) => <li key={`${index}:${item}`} className="flex gap-3 py-2.5 text-sm leading-5 text-black/62"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" />{item}</li>)}</ul> : <p className="text-sm text-black/40">No human-readable evidence was emitted for this check.</p>}</InspectorSection>
    <InspectorSection title="Resolved policy"><dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{Object.entries(check.policy ?? {}).map(([key, value]) => <div key={key}><dt className="text-[10px] font-semibold uppercase text-black/35">{readable(key)}</dt><dd className="mt-1 break-words text-sm text-black/65">{Array.isArray(value) ? value.join(", ") : String(value)}</dd></div>)}{!check.policy ? <p className="text-sm text-black/40">This detector does not expose an adaptive policy record.</p> : null}</dl></InspectorSection>
    <InspectorSection title="Provenance"><dl className="space-y-2 text-xs"><Identifier label="Check ID" value={check.id} /><Identifier label="Rule ID" value={check.ruleId} /><Identifier label="Family ID" value={check.familyId} /><Identifier label="Source ID" value={check.sourceId} /><Identifier label="Measured" value={formatDate(check.measuredAt)} /><Identifier label="Last source signal" value={check.lastSeenAt ? formatDate(check.lastSeenAt) : "Not declared"} />{check.exceptionId ? <Identifier label="Exception ID" value={check.exceptionId} /> : null}</dl><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onInspectSource} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Database size={13} /> Inspect source records</button><Link href={check.href} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">Open source workspace <ArrowUpRight size={13} /></Link></div></InspectorSection>
    <InspectorSection title="Raw check record"><pre className="max-h-80 overflow-auto bg-[#171815] p-4 text-[11px] leading-5 text-white/72">{JSON.stringify(check, null, 2)}</pre></InspectorSection>
  </div>;
}

function EvidenceSeriesRow({ series, selected, onSelect }: { series: RadarEvidenceSeriesSummary; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={`grid w-full gap-3 px-4 py-3 text-left sm:grid-cols-[minmax(0,1fr)_110px_110px] sm:items-center sm:px-5 ${selected ? "bg-black/[0.055]" : "hover:bg-black/[0.025]"}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold text-black/75">{series.familyLabel}</span><span className="mt-1 block truncate text-xs text-black/38">{domainLabel(series.domain)} · {series.sourceId}</span></span><span className="text-xs tabular-nums"><strong className="block text-black/65">{series.latestValue === undefined ? "No value" : formatNumber(series.latestValue)}</strong><span className="text-black/35">latest</span></span><span className="text-xs tabular-nums"><strong className="block text-black/65">{series.totalSamples.toLocaleString()}</strong><span className="text-black/35">samples</span></span></button>;
}

function EvidenceInspector({ summary, detail, onLoad }: { summary: RadarEvidenceSeriesSummary; detail: RadarEvidenceSeriesInspection | null; onLoad: () => void }) {
  const points = detail?.points ?? summary.recentPoints;
  return <div className="max-h-[calc(100dvh-18rem)] min-h-[420px] overflow-y-auto">
    <header className="border-b border-black/10 px-4 py-4 sm:px-5"><p className="text-[10px] font-semibold uppercase text-brand">{domainLabel(summary.domain)} evidence series</p><h2 className="mt-2 text-lg font-semibold text-black/85">{summary.familyLabel}</h2><p className="mt-1 break-all font-mono text-[11px] text-black/38">{summary.id}</p></header>
    <InspectorSection title="Retained movement"><EvidenceBars points={points} /><div className="mt-3 grid grid-cols-2 gap-px border border-black/10 bg-black/10 sm:grid-cols-4"><DataCell label="Latest" value={summary.latestValue === undefined ? "Unavailable" : formatNumber(summary.latestValue)} /><DataCell label="All samples" value={summary.totalSamples.toLocaleString()} /><DataCell label="Recent points" value={summary.retainedPointCount.toLocaleString()} /><DataCell label="Hourly rollups" value={summary.hourlyRollupCount.toLocaleString()} /></div></InspectorSection>
    <InspectorSection title="Series provenance"><dl className="space-y-2 text-xs"><Identifier label="Source ID" value={summary.sourceId} /><Identifier label="Family ID" value={summary.familyId} /><Identifier label="Direction" value={readable(summary.expectedDirection)} /><Identifier label="First seen" value={formatDate(summary.firstSeenAt)} /><Identifier label="Last seen" value={formatDate(summary.lastSeenAt)} /></dl></InspectorSection>
    {!detail ? <div className="px-4 pb-5 sm:px-5"><button type="button" onClick={onLoad} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Database size={15} /> Load every retained point</button><p className="mt-2 text-xs text-black/38">The chart currently shows the latest {summary.recentPoints.length} points from the index.</p></div> : <><InspectorSection title={`Individual points (${detail.points.length})`}><PointTable points={detail.points} /></InspectorSection><InspectorSection title={`Hourly rollups (${detail.hourly.length})`}><HourlyTable rows={detail.hourly} /></InspectorSection><InspectorSection title="Raw evidence series"><pre className="max-h-96 overflow-auto bg-[#171815] p-4 text-[11px] leading-5 text-white/72">{JSON.stringify(detail, null, 2)}</pre></InspectorSection></>}
  </div>;
}

function SourceRecordsExplorer({ index, datasets, selected, detail, busy, onRefresh, onSelect, onPage }: {
  index: RadarSourceDataIndex | null;
  datasets: RadarSourceDatasetSummary[];
  selected: RadarSourceDatasetSummary | null;
  detail: RadarSourceDatasetInspection | null;
  busy: boolean;
  onRefresh: () => void;
  onSelect: (dataset: RadarSourceDatasetSummary) => void;
  onPage: (dataset: RadarSourceDatasetSummary, offset: number) => void;
}) {
  if (!index) {
    return <div className="grid min-h-[440px] place-items-center border border-black/10 bg-white px-6 text-center"><div>{busy ? <LoaderCircle size={24} className="mx-auto animate-spin text-brand" /> : <Database size={24} className="mx-auto text-black/25" />}<p className="mt-3 text-sm font-semibold text-black/65">{busy ? "Loading source catalogue" : "Source catalogue unavailable"}</p><p className="mt-1 max-w-md text-xs leading-5 text-black/42">{busy ? "Gathering tenant-scoped records from every Radar source." : "Refresh the catalogue to try loading the contributing records again."}</p>{!busy ? <button type="button" onClick={onRefresh} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><RefreshCw size={14} /> Refresh sources</button> : null}</div></div>;
  }

  return <div className="grid gap-4">
    <section className="grid overflow-hidden border-y border-black/10 bg-white sm:grid-cols-4" aria-label="Source record summary">
      <SummaryMetric label="Datasets" value={index.totalDatasets} icon={<Layers3 size={15} />} />
      <SummaryMetric label="Records" value={index.totalRecords.toLocaleString()} icon={<Database size={15} />} />
      <SummaryMetric label="Readable" value={index.availableDatasets} icon={<Check size={15} />} tone="good" />
      <SummaryMetric label="Unavailable" value={index.unavailableDatasets} icon={<EyeOff size={15} />} tone={index.unavailableDatasets ? "warn" : "good"} />
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold text-black/78">Operational source catalogue</h2><p className="mt-1 text-xs leading-5 text-black/42">Actual records behind Radar conclusions. Authentication secrets and embedded binary data are removed before display.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={onRefresh} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 disabled:opacity-50"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh</button><a href="/api/portal/advisor/radar/sources?format=json" className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Download size={14} /> Export all sources</a></div>
    </div>
    <div className="grid min-w-0 overflow-hidden border border-black/10 bg-white xl:grid-cols-[minmax(320px,.7fr)_minmax(0,1.3fr)]">
      <section className="min-w-0 xl:border-r xl:border-black/10" aria-labelledby="source-dataset-heading">
        <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3 sm:px-5"><h2 id="source-dataset-heading" className="text-sm font-semibold text-black/75">Contributing datasets</h2><span className="text-xs tabular-nums text-black/40">{datasets.length} shown</span></div>
        <div className="max-h-[calc(100dvh-20rem)] min-h-[440px] divide-y divide-black/10 overflow-y-auto">
          {datasets.map(dataset => <SourceDatasetRow key={dataset.id} dataset={dataset} selected={selected?.id === dataset.id} busy={busy && selected?.id === dataset.id} onSelect={() => onSelect(dataset)} />)}
          {!datasets.length ? <Empty title="No matching datasets" detail="Change the domain or search phrase to inspect another source collection." /> : null}
        </div>
      </section>
      <aside className="min-w-0 bg-[#faf9f6]" aria-label="Selected source records">
        {busy && !detail ? <div className="grid min-h-[440px] place-items-center text-sm text-black/45"><span className="inline-flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" /> Loading source records</span></div> : selected ? detail ? <SourceDatasetInspector dataset={selected} detail={detail} onPage={offset => onPage(selected, offset)} /> : <div className="grid min-h-[440px] place-items-center px-6 text-center"><div><Database size={24} className="mx-auto text-black/25" /><p className="mt-3 text-sm font-semibold text-black/60">{selected.label}</p><p className="mt-1 max-w-md text-xs leading-5 text-black/38">Load this dataset to inspect its current records.</p><button type="button" onClick={() => onSelect(selected)} className="mt-4 min-h-9 rounded-md bg-black px-3 text-xs font-semibold text-white">Load records</button></div></div> : <Empty title="Choose a dataset" detail="Select any contributing collection to inspect its current records." />}
      </aside>
    </div>
  </div>;
}

function SourceDatasetRow({ dataset, selected, busy, onSelect }: { dataset: RadarSourceDatasetSummary; selected: boolean; busy: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={`grid w-full gap-3 px-4 py-3 text-left sm:grid-cols-[minmax(0,1fr)_90px] sm:items-center sm:px-5 ${selected ? "bg-black/[0.055]" : "hover:bg-black/[0.025]"}`}>
    <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm font-semibold text-black/75">{dataset.label}</strong><SourceStatusBadge status={dataset.status} /></span><span className="mt-1 block line-clamp-2 text-xs leading-5 text-black/42">{dataset.description}</span><span className="mt-1 block truncate font-mono text-[10px] text-black/30">{dataset.id}</span></span>
    <span className="text-xs tabular-nums"><strong className="block text-black/65">{busy ? <LoaderCircle size={14} className="animate-spin" /> : dataset.recordCount.toLocaleString()}</strong><span className="text-black/35">records</span></span>
  </button>;
}

function SourceDatasetInspector({ dataset, detail, onPage }: { dataset: RadarSourceDatasetSummary; detail: RadarSourceDatasetInspection; onPage: (offset: number) => void }) {
  const first = detail.recordCount ? detail.offset + 1 : 0;
  const last = Math.min(detail.recordCount, detail.offset + detail.records.length);
  return <div className="max-h-[calc(100dvh-17rem)] min-h-[440px] overflow-y-auto">
    <header className="border-b border-black/10 px-4 py-4 sm:px-5"><div className="flex flex-wrap items-center gap-2"><SourceStatusBadge status={dataset.status} /><span className="text-[10px] font-semibold uppercase text-black/35">{domainLabel(dataset.domain)} source records</span></div><h2 className="mt-3 text-lg font-semibold text-black/85">{dataset.label}</h2><p className="mt-2 text-sm leading-6 text-black/50">{dataset.description}</p>{dataset.unavailableReason ? <p className="mt-3 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{dataset.unavailableReason}</p> : null}<div className="mt-4 flex flex-wrap gap-2"><Link href={dataset.href} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65">Open source workspace <ArrowUpRight size={13} /></Link><a href={`/api/portal/advisor/radar/sources?datasetId=${encodeURIComponent(dataset.id)}&format=json`} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Download size={13} /> Export dataset</a></div></header>
    <InspectorSection title="Dataset provenance"><dl className="space-y-2 text-xs"><Identifier label="Dataset ID" value={dataset.id} /><Identifier label="Radar source IDs" value={dataset.sourceIds.join(", ") || "None"} /><Identifier label="Fields observed" value={dataset.fields.join(", ") || "No fields"} /><Identifier label="Records" value={dataset.recordCount.toLocaleString()} /><Identifier label="Latest update" value={dataset.lastUpdatedAt ? formatDate(dataset.lastUpdatedAt) : "Not recorded"} /></dl></InspectorSection>
    <section aria-labelledby="source-record-page-heading"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3 sm:px-5"><div><h3 id="source-record-page-heading" className="text-sm font-semibold text-black/70">Raw records</h3><p className="mt-0.5 text-xs tabular-nums text-black/38">{first}-{last} of {detail.recordCount.toLocaleString()}</p></div><div className="flex gap-2"><button type="button" aria-label="Previous source record page" disabled={detail.offset === 0} onClick={() => onPage(Math.max(0, detail.offset - detail.limit))} className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/55 disabled:opacity-30"><ChevronLeft size={15} /></button><button type="button" aria-label="Next source record page" disabled={!detail.hasMore} onClick={() => onPage(detail.offset + detail.limit)} className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/55 disabled:opacity-30"><ChevronRight size={15} /></button></div></div>
      <div className="divide-y divide-black/10">{detail.records.map((record, index) => <SourceRecordRow key={`${recordIdentity(record, index)}:${detail.offset + index}`} record={record} index={detail.offset + index} />)}{!detail.records.length ? <Empty title="No records in this dataset" detail={dataset.status === "unavailable" ? "The source could not be read during this inspection." : "The source is connected, but it has not recorded any rows yet."} /> : null}</div>
    </section>
  </div>;
}

function SourceRecordRow({ record, index }: { record: Record<string, unknown>; index: number }) {
  const title = recordIdentity(record, index);
  const stamp = recordTimestamp(record);
  const digest = recordDigest(record);
  return <details className="group px-4 py-3 sm:px-5"><summary className="flex cursor-pointer list-none items-start justify-between gap-4"><span className="min-w-0"><strong className="block truncate text-sm font-semibold text-black/70">{title}</strong><span className="mt-1 block line-clamp-2 text-xs leading-5 text-black/42">{digest || "Open to inspect the complete sanitized record."}</span></span><span className="shrink-0 text-right text-[10px] tabular-nums text-black/35">#{index + 1}{stamp ? <span className="mt-1 block">{stamp}</span> : null}</span></summary><pre className="mt-3 max-h-96 overflow-auto bg-[#171815] p-4 text-[11px] leading-5 text-white/72">{JSON.stringify(record, null, 2)}</pre></details>;
}

function SourceStatusBadge({ status }: { status: RadarSourceDatasetSummary["status"] }) {
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${status === "available" ? "bg-emerald-100 text-emerald-800" : status === "unavailable" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-800"}`}>{status}</span>;
}

function recordIdentity(record: Record<string, unknown>, index: number): string {
  for (const key of ["title", "name", "label", "id", "storageKey", "email", "action", "type"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return `Record ${index + 1}`;
}

function recordTimestamp(record: Record<string, unknown>): string | null {
  for (const key of ["updatedAt", "submittedAt", "occurredAt", "receivedAt", "sentAt", "createdAt", "ts", "finishedAt", "lastMessageAt"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return formatDate(value);
  }
  return null;
}

function recordDigest(record: Record<string, unknown>): string {
  return Object.entries(record).filter(([key, value]) => !["id", "title", "name", "label", "storageKey"].includes(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")).slice(0, 4).map(([key, value]) => `${readable(key)}: ${String(value).slice(0, 90)}`).join(" · ");
}

function SourcesAndMetrics({ radar }: { radar: BusinessIssueRadar }) {
  return <div className="grid gap-5">
    <PrioritySignalCentre radar={radar} />
    <section className="overflow-hidden border border-black/10 bg-white"><SectionHeader icon={<RadioTower size={17} />} title="Domain rollups" detail="Complete assurance, readiness, confidence, and outcome counts for each business area." count={radar.domains.length} /><div className="overflow-x-auto"><table className="w-full min-w-[1120px] border-collapse text-left text-xs"><thead className="bg-[#efeee9]"><tr><Th>Domain</Th><Th>Total</Th><Th>Applicable</Th><Th>Pass</Th><Th>Firing</Th><Th>Watch</Th><Th>Blind</Th><Th>Learning</Th><Th>Inactive</Th><Th>Coverage</Th><Th>Assurance</Th><Th>Confidence</Th><Th>Readiness</Th><Th>Last signal</Th></tr></thead><tbody className="divide-y divide-black/10">{radar.domains.map(item => <tr key={item.domain}><Td><strong>{domainLabel(item.domain)}</strong></Td><Td mono>{item.totalChecks}</Td><Td mono>{item.applicableChecks}</Td><Td mono>{item.passedChecks}</Td><Td mono>{item.firingChecks}</Td><Td mono>{item.watchChecks}</Td><Td mono>{item.blindChecks}</Td><Td mono>{item.learningChecks}</Td><Td mono>{item.inactiveChecks}</Td><Td mono>{item.coveragePercent}%</Td><Td mono>{item.assurancePercent}%</Td><Td mono>{item.confidencePercent}%</Td><Td mono>{item.readinessPercent}%</Td><Td>{item.lastSignalAt ? formatDate(item.lastSignalAt) : "None"}</Td></tr>)}</tbody></table></div></section>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="overflow-hidden border border-black/10 bg-white"><SectionHeader icon={<Database size={17} />} title="Source coverage" detail="Every source Radar evaluates, including freshness and the exact next activation step." count={radar.coverage.length} /><div className="divide-y divide-black/10">{radar.coverage.map(source => {
        const state = sourceConnectionState(source, radar.generatedAt);
        const activation = sourceActivation(source.id, source.domain);
        return <article key={source.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_120px_150px] sm:px-5"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-black/75">{source.label}</h3><ConnectionStateBadge state={state} /></div><p className="mt-1 text-xs leading-5 text-black/45">{source.detail}</p>{state !== "connected" ? <p className="mt-2 border-l-2 border-amber-400 pl-2 text-[11px] leading-5 text-amber-900"><strong>Activate:</strong> {activation.detail}</p> : null}<div className="mt-2 flex flex-wrap items-center gap-3"><p className="break-all font-mono text-[10px] text-black/30">{source.id}</p><Link href={`/portal/agency/radar?view=records&source=${encodeURIComponent(source.id)}`} className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand hover:text-black">Inspect records <Database size={11} /></Link><Link href={activation.href} className="inline-flex items-center gap-1 text-[10px] font-semibold text-black/45 hover:text-black">Open setup <ArrowUpRight size={11} /></Link></div></div><DataPair label="Records" value={source.recordCount.toLocaleString()} /><DataPair label="Last activity" value={source.lastActivityAt ? formatDate(source.lastActivityAt) : "Not recorded"} /></article>;
      })}</div></section>
      <section className="overflow-hidden border border-black/10 bg-white"><SectionHeader icon={<Gauge size={17} />} title="Metric signals" detail="The direct business values supplied to incident and policy evaluation." count={radar.signals.length} /><div className="divide-y divide-black/10">{radar.signals.map(signal => <article key={signal.id} className="px-4 py-4 sm:px-5"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-black/75">{signal.label}</h3><SignalBadge status={signal.status} /></div><strong className="text-sm tabular-nums text-black/70">{signal.display}</strong></div><p className="mt-2 text-xs leading-5 text-black/45">{signal.detail}</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><DataPair label="Target" value={signal.target} /><DataPair label="Domain" value={domainLabel(signal.domain)} /><DataPair label="Measured" value={formatDate(signal.measuredAt)} /></div><p className="mt-2 break-all font-mono text-[10px] text-black/30">{signal.id}</p></article>)}</div></section>
    </div>
  </div>;
}

function PrioritySignalCentre({ radar }: { radar: BusinessIssueRadar }) {
  const configs = [
    { sourceId: "external:website-enquiries", datasetId: "external:website-enquiries", signalId: "metric:form-submissions", label: "Enquiries", detail: "Every website form and chatbot contact.", href: "/portal/agency/inbox?view=forms", freshnessHours: 168, icon: <MessageSquareText size={17} /> },
    { sourceId: "external:response-time-clocks", datasetId: "external:response-time-clocks", signalId: "metric:speed-to-lead", label: "Response clocks", detail: "Receipt-to-first-reply timers and SLA breaches.", href: "/portal/agency/inbox?view=forms", freshnessHours: 168, icon: <TimerReset size={17} /> },
    { sourceId: "core:website-telemetry", datasetId: "core:website-telemetry", signalId: "metric:traffic-7d", label: "Website telemetry", detail: "Aqua Tag traffic, forms, errors and heartbeats.", href: "/portal/agency/fulfilment/technical/performance", freshnessHours: 24, icon: <Globe2 size={17} /> },
    { sourceId: "external:inbox-messages", datasetId: "external:social-messages", label: "Inbox messages", detail: "Inbound, outbound and conversation continuity evidence.", href: "/portal/agency/inbox", freshnessHours: 168, icon: <MessageSquareText size={17} /> },
    { sourceId: "core:calendar-commitments", datasetId: "core:calendar-commitments", signalId: "metric:calendar-commitments-7d", label: "Calendar", detail: "Lead meetings, dated work and command plans.", href: "/portal/agency/calendar", freshnessHours: 168, icon: <CalendarClock size={17} /> },
  ];
  return <section aria-labelledby="priority-signal-centre-heading" className="border-y border-black/10 bg-[#0b1717] text-white">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300">Connection and coverage centre</p><h2 id="priority-signal-centre-heading" className="mt-1 text-lg font-semibold">Priority signal mesh</h2><p className="mt-1 text-xs leading-5 text-white/52">The five first-response sources Radar and Aqua Advisor must be able to prove.</p></div><Link href="/portal/agency/radar?view=records" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/15 px-3 text-xs font-semibold text-white/75 hover:bg-white/5">Inspect raw records <ArrowUpRight size={13} /></Link></header>
    <div className="grid sm:grid-cols-2 xl:grid-cols-5">{configs.map((config, index) => {
      const source = radar.coverage.find(item => item.id === config.sourceId);
      const signal = config.signalId ? radar.signals.find(item => item.id === config.signalId) : undefined;
      const state = sourceConnectionState(source, radar.generatedAt, config.freshnessHours);
      const activation = sourceActivation(config.sourceId, source?.domain ?? "systems");
      return <article key={config.sourceId} className={`min-w-0 px-4 py-4 ${index ? "border-t border-white/10 sm:border-l sm:border-t-0" : ""}`}><div className="flex items-center justify-between gap-2"><span className="grid size-8 place-items-center rounded-md border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">{config.icon}</span><ConnectionStateBadge state={state} dark /></div><h3 className="mt-3 text-sm font-semibold text-white/90">{config.label}</h3><p className="mt-1 min-h-10 text-[11px] leading-5 text-white/45">{config.detail}</p><div className="mt-3 border-t border-white/10 pt-3"><strong className="block text-lg tabular-nums text-white">{signal?.display ?? source?.recordCount.toLocaleString() ?? "—"}</strong><span className="text-[10px] text-white/38">{source?.lastActivityAt ? `Last signal ${formatDate(source.lastActivityAt)}` : "No signal recorded"}</span></div>{state !== "connected" ? <p className="mt-3 text-[10px] leading-4 text-amber-200/80">{activation.detail}</p> : null}<div className="mt-3 flex flex-wrap gap-3"><Link href={`/portal/agency/radar?view=records&dataset=${encodeURIComponent(config.datasetId)}`} className="inline-flex min-h-8 items-center gap-1 text-[10px] font-semibold text-cyan-200">Inspect data <Database size={11} /></Link><Link href={config.href} className="inline-flex min-h-8 items-center gap-1 text-[10px] font-semibold text-white/48">Open source <ArrowUpRight size={11} /></Link></div></article>;
    })}</div>
  </section>;
}

type ConnectionState = "connected" | "empty" | "stale" | "missing";

function sourceConnectionState(source: BusinessIssueRadar["coverage"][number] | undefined, now: number, freshnessHours = 72): ConnectionState {
  if (!source || source.status === "disconnected" || source.status === "unavailable") return "missing";
  if (source.status === "empty") return "empty";
  if (source.lastActivityAt && now - source.lastActivityAt > freshnessHours * 3_600_000) return "stale";
  return "connected";
}

function ConnectionStateBadge({ state, dark = false }: { state: ConnectionState; dark?: boolean }) {
  const style = dark
    ? state === "connected" ? "bg-emerald-300/12 text-emerald-200" : state === "stale" ? "bg-amber-300/12 text-amber-200" : state === "empty" ? "bg-sky-300/12 text-sky-200" : "bg-red-300/12 text-red-200"
    : state === "connected" ? "bg-emerald-100 text-emerald-800" : state === "stale" ? "bg-amber-100 text-amber-800" : state === "empty" ? "bg-sky-100 text-sky-800" : "bg-red-100 text-red-800";
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${style}`}>{state}</span>;
}

function sourceActivation(sourceId: string, domain: AdvisorDomain): { detail: string; href: string } {
  if (sourceId.includes("website-enquiries") || sourceId.includes("response-time")) return { detail: "Connect the website form or chatbot to Master Inbox, then record the first reply on each enquiry.", href: "/portal/agency/inbox?view=forms" };
  if (sourceId.includes("website-telemetry") || sourceId === "core:development") return { detail: "Install Aqua Tag on the property and send a fresh heartbeat or pageview event.", href: "/portal/agency/fulfilment?view=technical" };
  if (sourceId.includes("inbox-message") || sourceId === "core:inbox") return { detail: "Connect an inbox channel, complete webhook verification and sync the latest conversation.", href: "/portal/agency/inbox?view=social" };
  if (sourceId.includes("calendar")) return { detail: "Add a dated task, daily plan or lead meeting and assign an owner.", href: "/portal/agency/calendar" };
  const href: Record<AdvisorDomain, string> = { company: "/portal/agency?station=battle", sales: "/portal/clients?view=journey", inbox: "/portal/agency/inbox", clients: "/portal/clients", finance: "/portal/agency/agency-finance", delivery: "/portal/agency/fulfilment", marketing: "/portal/agency/marketing", operations: "/portal/agency/actions", compliance: "/portal/agency/company?view=legal", development: "/portal/agency/fulfilment?view=technical", team: "/portal/account/permissions", systems: "/portal/agency/company?view=connections" };
  return { detail: "Open the owning workspace, enable the source and add or sync its first fresh record.", href: href[domain] };
}

function IncidentInspection({ radar, query, domain, status, onSelectIncident, onInspectCheck, onInspectSource }: { radar: BusinessIssueRadar; query: string; domain: AdvisorDomain | "all"; status: StatusFilter; onSelectIncident: (incident: BusinessRadarIncident) => void; onInspectCheck: (check: BusinessRadarCheck) => void; onInspectSource: (check: BusinessRadarCheck) => void }) {
  const normalized = query.trim().toLowerCase();
  const selectedIncident = radar.incidents.find(item => item.id.toLowerCase() === normalized);
  const matches = (item: unknown, itemDomain: AdvisorDomain, severity: BusinessRadarIssue["severity"] | "info") => (domain === "all" || itemDomain === domain) && matchesIncidentStatus(severity, status) && (!normalized || JSON.stringify(item).toLowerCase().includes(normalized));
  const conclusions = selectedIncident ? [] : radar.adaptive.conclusions.filter(item => matches(item, item.domain, item.severity));
  const incidents = selectedIncident ? [selectedIncident] : radar.incidents.filter(item => matches(item, item.domain, item.severity));
  const issues = selectedIncident ? radar.issues.filter(item => selectedIncident.issueIds.includes(item.id)) : radar.issues.filter(item => matches(item, item.domain, item.severity));
  const exactChecks = selectedIncident ? selectedIncident.checkIds.map(checkId => radar.checks.find(check => check.id === checkId)).filter((check): check is BusinessRadarCheck => Boolean(check)) : [];
  return <div className="grid gap-5">{selectedIncident ? <IncidentExactBreakdown incident={selectedIncident} issues={issues} checks={exactChecks} onInspectCheck={onInspectCheck} onInspectSource={onInspectSource} /> : <section className="overflow-hidden border border-black/10 bg-white"><SectionHeader icon={<ShieldCheck size={17} />} title="Adaptive conclusions" detail="High-level conclusions generated from health, confidence, readiness, and operating stage." count={conclusions.length} /><div className="grid sm:grid-cols-2 xl:grid-cols-4">{conclusions.map((item, index) => <article key={item.id} className={`px-4 py-4 sm:px-5 ${index ? "border-t border-black/10 sm:border-l sm:border-t-0" : ""}`}><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${item.severity === "critical" ? "bg-red-600" : item.severity === "warning" ? "bg-amber-500" : item.severity === "watch" ? "bg-sky-500" : "bg-black/25"}`} /><span className="text-[10px] font-semibold uppercase text-black/35">{domainLabel(item.domain)}</span></div><h3 className="mt-2 text-sm font-semibold text-black/75">{item.title}</h3><p className="mt-1 text-xs leading-5 text-black/45">{item.detail}</p></article>)}</div>{!conclusions.length ? <Empty title="No matching conclusions" detail="Adjust the search or domain filter to inspect a broader command summary." /> : null}</section>}
    <section className="overflow-hidden border border-black/10 bg-white"><SectionHeader icon={<AlertTriangle size={17} />} title="Grouped incidents" detail="Related findings stay grouped at command level, while the exact issues and checks remain independently inspectable." count={incidents.length} /><div className="divide-y divide-black/10">{incidents.map(incident => <article key={incident.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_260px] sm:px-5"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${severityClass(incident.severity)}`}>{incident.severity}</span><span className="text-[10px] font-semibold uppercase text-black/35">{domainLabel(incident.domain)} · {incident.issueIds.length} issues · {incident.checkIds.length} checks</span></div><h3 className="mt-2 text-sm font-semibold text-black/80">{incident.title}</h3><p className="mt-1 text-sm leading-6 text-black/50">{incident.detail}</p><ul className="mt-3 space-y-1">{incident.evidence.map((item, index) => <li key={`${index}:${item}`} className="text-xs text-black/45">• {item}</li>)}</ul></div><div className="space-y-2"><Identifier label="Incident ID" value={incident.id} /><Identifier label="Source IDs" value={incident.sourceIds.join(", ") || "None"} /><Identifier label="Check IDs" value={incident.checkIds.join(", ") || "None"} /><div className="flex flex-wrap gap-2"><button type="button" onClick={() => onSelectIncident(incident)} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Database size={13} /> Exact breakdown</button><Link href={incident.href} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/65">Open source <ArrowUpRight size={13} /></Link></div></div></article>)}{!incidents.length ? <Empty title="No matching grouped incidents" detail="The complete finding ledger remains available below and in the Checks view." /> : null}</div></section>
    <section className="overflow-hidden border border-black/10 bg-white"><SectionHeader icon={<Activity size={17} />} title="Underlying findings" detail="The ungrouped issue records retained before incident correlation." count={issues.length} /><div className="divide-y divide-black/10">{issues.map(issue => <details key={issue.id} className="group px-4 py-3 sm:px-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><span className="min-w-0"><span className={`mr-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${severityClass(issue.severity)}`}>{issue.severity}</span><strong className="text-sm font-semibold text-black/72">{issue.title}</strong></span><span className="shrink-0 text-[10px] font-semibold uppercase text-black/35">{domainLabel(issue.domain)}</span></summary><div className="pb-2 pt-3"><p className="text-sm leading-6 text-black/50">{issue.detail}</p><pre className="mt-3 max-h-80 overflow-auto bg-[#171815] p-4 text-[11px] leading-5 text-white/72">{JSON.stringify(issue, null, 2)}</pre></div></details>)}{!issues.length ? <Empty title="No matching underlying findings" detail="Adjust the search or domain filter to inspect a broader set of findings." /> : null}</div></section>
  </div>;
}

function IncidentExactBreakdown({ incident, issues, checks, onInspectCheck, onInspectSource }: { incident: BusinessRadarIncident; issues: BusinessRadarIssue[]; checks: BusinessRadarCheck[]; onInspectCheck: (check: BusinessRadarCheck) => void; onInspectSource: (check: BusinessRadarCheck) => void }) {
  return <section className="overflow-hidden border border-black/10 bg-white" data-testid="incident-exact-breakdown">
    <header className="border-b border-black/10 bg-[#f5f4ef] px-4 py-4 sm:px-5"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${severityClass(incident.severity)}`}>{incident.severity}</span><span className="text-[10px] font-semibold uppercase text-black/38">Exact incident breakdown · {domainLabel(incident.domain)}</span></div><h2 className="mt-2 text-lg font-semibold text-black/82">{incident.title}</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-black/50">These are the specific underlying findings and detector results represented by the command-level summary. Nothing below is inferred from the domain total.</p></header>
    <div className="grid grid-cols-3 border-b border-black/10 bg-white"><DataCell label="Underlying issues" value={issues.length} /><DataCell label="Exact checks" value={checks.length} /><DataCell label="Evidence sources" value={incident.sourceIds.length} /></div>
    <div className="grid lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
      <section className="border-b border-black/10 lg:border-b-0 lg:border-r" aria-labelledby="exact-issues-heading"><div className="border-b border-black/10 px-4 py-3 sm:px-5"><h3 id="exact-issues-heading" className="text-sm font-semibold text-black/72">Exact underlying issues</h3><p className="mt-1 text-xs text-black/40">The original ungrouped issue records.</p></div><div className="divide-y divide-black/10">{issues.map(issue => <article key={issue.id} className="px-4 py-4 sm:px-5"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${severityClass(issue.severity)}`}>{issue.severity}</span><span className="break-all font-mono text-[9px] text-black/30">{issue.id}</span></div><h4 className="mt-2 text-sm font-semibold text-black/75">{issue.title}</h4><p className="mt-1 text-xs leading-5 text-black/48">{issue.detail}</p><ul className="mt-2 space-y-1">{issue.evidence.map((item, index) => <li key={`${issue.id}:${index}`} className="text-[11px] leading-4 text-black/42">• {item}</li>)}</ul></article>)}{!issues.length ? <Empty title="No raw issue record" detail="This incident currently derives from detector state rather than an additional issue record." /> : null}</div></section>
      <section aria-labelledby="exact-checks-heading"><div className="border-b border-black/10 px-4 py-3 sm:px-5"><h3 id="exact-checks-heading" className="text-sm font-semibold text-black/72">Exact detector checks</h3><p className="mt-1 text-xs text-black/40">Every attached check is named with its missing proof, evidence and source.</p></div><div className="divide-y divide-black/10">{checks.map(check => <article key={check.id} className="px-4 py-4 sm:px-5"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={check.status} /><span className="text-[10px] font-semibold uppercase text-black/35">{readable(check.scope)} · {check.lensLabel}</span></div><h4 className="mt-2 text-sm font-semibold text-black/78">{check.title}</h4><p className="mt-1 text-xs leading-5 text-black/48">{check.detail}</p><ul className="mt-2 space-y-1">{check.evidence.map((item, index) => <li key={`${check.id}:${index}`} className="text-[11px] leading-4 text-black/42">• {item}</li>)}</ul><p className="mt-2 break-all font-mono text-[9px] text-black/30">{check.id} · {check.sourceId}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => onInspectCheck(check)} className="inline-flex min-h-8 items-center gap-2 rounded-md bg-black px-2.5 text-[11px] font-semibold text-white"><Gauge size={12} /> Full calculation</button><button type="button" onClick={() => onInspectSource(check)} className="inline-flex min-h-8 items-center gap-2 rounded-md border border-black/10 px-2.5 text-[11px] font-semibold text-black/62"><Database size={12} /> Source records</button></div></article>)}{!checks.length ? <Empty title="No detector record attached" detail="The original issue and its evidence remain visible on the left; no unrelated domain checks are being substituted." /> : null}</div></section>
    </div>
  </section>;
}

function RawInspection({ radar, evidence, copied, onCopy, onExport }: { radar: BusinessIssueRadar; evidence: RadarEvidenceInspectionIndex; copied: boolean; onCopy: () => void; onExport: () => void }) {
  return <section className="overflow-hidden border border-black/10 bg-white"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-black/[0.05] text-black/55"><FileJson size={18} /></span><div><h2 className="text-lg font-semibold text-black/82">Complete current snapshot</h2><p className="mt-1 text-sm text-black/45">Unformatted interpretation is removed here. This is the current Radar object and evidence index exactly as this workspace received them.</p></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={onCopy} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/65"><Clipboard size={14} /> {copied ? "Copied" : "Copy JSON"}</button><a href="/api/portal/advisor/radar/evidence?format=json" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/65"><Database size={14} /> Full evidence history</a><button type="button" onClick={onExport} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Download size={14} /> Download snapshot</button></div></header><div className="grid border-b border-black/10 p-4 sm:grid-cols-3 sm:p-5"><DataPair label="Radar generated" value={formatDate(radar.generatedAt)} /><DataPair label="Evidence first recorded" value={evidence.firstRecordedAt ? formatDate(evidence.firstRecordedAt) : "Not recorded"} /><DataPair label="Evidence last recorded" value={evidence.lastRecordedAt ? formatDate(evidence.lastRecordedAt) : "Not recorded"} /></div><pre className="max-h-[70dvh] overflow-auto bg-[#171815] p-4 text-[11px] leading-5 text-white/72 sm:p-5">{JSON.stringify({ radar, evidenceIndex: evidence }, null, 2)}</pre></section>;
}

function EvidenceBars({ points }: { points: RadarEvidenceSeriesSummary["recentPoints"] }) {
  if (!points.length) return <div className="grid h-36 place-items-center border-y border-dashed border-black/10 text-xs text-black/35">No retained numeric points yet.</div>;
  const values = points.map(point => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  return <div className="flex h-36 items-end gap-1 border-b border-black/10 px-1 pt-4" aria-label="Recent evidence values">{points.map((point, index) => <span key={`${point.at}:${index}`} className={`min-w-1 flex-1 rounded-t-sm ${point.status === "critical" ? "bg-red-600" : point.status === "warning" ? "bg-amber-500" : point.status === "watch" ? "bg-sky-500" : "bg-emerald-600"}`} style={{ height: `${Math.max(8, (point.value - minimum) / range * 92 + 8)}%` }} title={`${formatDate(point.at)} · ${formatNumber(point.value)} · ${point.status}`} />)}</div>;
}

function PointTable({ points }: { points: RadarEvidenceSeriesInspection["points"] }) {
  return <div className="max-h-80 overflow-auto border border-black/10"><table className="w-full min-w-[420px] border-collapse text-left text-xs"><thead className="sticky top-0 bg-[#efeee9]"><tr><Th>Time</Th><Th>Value</Th><Th>Status</Th></tr></thead><tbody className="divide-y divide-black/10">{[...points].reverse().map((point, index) => <tr key={`${point.at}:${index}`}><Td>{formatDate(point.at)}</Td><Td mono>{formatNumber(point.value)}</Td><Td><span className="capitalize">{point.status}</span></Td></tr>)}</tbody></table></div>;
}

function HourlyTable({ rows }: { rows: RadarEvidenceSeriesInspection["hourly"] }) {
  return <div className="max-h-80 overflow-auto border border-black/10"><table className="w-full min-w-[600px] border-collapse text-left text-xs"><thead className="sticky top-0 bg-[#efeee9]"><tr><Th>Hour</Th><Th>Samples</Th><Th>Minimum</Th><Th>Average</Th><Th>Maximum</Th><Th>Last</Th></tr></thead><tbody className="divide-y divide-black/10">{[...rows].reverse().map((row, index) => <tr key={`${row.hour}:${index}`}><Td>{formatDate(row.hour)}</Td><Td mono>{row.samples}</Td><Td mono>{formatNumber(row.minimum)}</Td><Td mono>{formatNumber(row.average)}</Td><Td mono>{formatNumber(row.maximum)}</Td><Td mono>{formatNumber(row.last)}</Td></tr>)}</tbody></table></div>;
}

function SummaryMetric({ label, value, icon, tone = "neutral", compact = false }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad"; compact?: boolean }) {
  const toneClass = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : "text-black/55";
  return <div className="border-b border-r border-black/10 px-3 py-3 sm:px-4"><div className={`flex items-center gap-2 text-[10px] font-semibold uppercase ${toneClass}`}>{icon}{label}</div><p className={`${compact ? "text-sm" : "text-lg"} mt-2 font-semibold tabular-nums text-black/78`}>{value}</p></div>;
}

function SectionHeader({ icon, title, detail, count }: { icon: React.ReactNode; title: string; detail: string; count: number }) {
  return <header className="flex items-start justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/[0.05] text-black/50">{icon}</span><div><h2 className="text-base font-semibold text-black/78">{title}</h2><p className="mt-1 text-xs leading-5 text-black/42">{detail}</p></div></div><span className="text-xs font-semibold tabular-nums text-black/35">{count}</span></header>;
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-b border-black/10 px-4 py-4 sm:px-5"><h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-black/38">{title}</h3>{children}</section>; }
function DataCell({ label, value }: { label: string; value: React.ReactNode }) { return <div className="bg-white px-3 py-3"><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 break-words text-sm font-semibold tabular-nums text-black/70">{value}</p></div>; }
function DataPair({ label, value }: { label: string; value: React.ReactNode }) { return <div><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 break-words text-xs font-medium text-black/58">{value}</p></div>; }
function Identifier({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)]"><dt className="font-semibold text-black/38">{label}</dt><dd className="break-all font-mono text-black/58">{value}</dd></div>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <div className="grid min-h-[320px] place-items-center px-6 text-center"><div><RadioTower size={24} className="mx-auto text-black/20" /><p className="mt-3 text-sm font-semibold text-black/60">{title}</p><p className="mt-1 max-w-md text-xs leading-5 text-black/38">{detail}</p></div></div>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[] }) { return <label className="block"><span className="sr-only">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="mm-field min-h-10 w-full text-sm"><option value={options[0]}>{label}: {readable(options[0]!)}</option>{options.slice(1).map(option => <option key={option} value={option}>{readable(option)}</option>)}</select></label>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="border-b border-black/10 px-3 py-2 text-[10px] font-semibold uppercase text-black/40">{children}</th>; }
function Td({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) { return <td className={`px-3 py-2 text-black/58 ${mono ? "font-mono tabular-nums" : ""}`}>{children}</td>; }

function StatusIcon({ status }: { status: RadarCheckStatus }) {
  const className = status === "pass" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "critical" ? "border-red-200 bg-red-50 text-red-700" : status === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : status === "blind" ? "border-orange-200 bg-orange-50 text-orange-700" : status === "learning" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-sky-200 bg-sky-50 text-sky-700";
  return <span className={`grid size-8 shrink-0 place-items-center rounded-md border ${className}`}>{status === "pass" ? <Check size={14} /> : status === "blind" ? <EyeOff size={14} /> : status === "learning" ? <History size={14} /> : status === "inactive" ? <Square size={14} /> : status === "watch" ? <Target size={14} /> : <AlertTriangle size={14} />}</span>;
}
function StatusBadge({ status }: { status: RadarCheckStatus }) { return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${status === "pass" ? "bg-emerald-100 text-emerald-800" : status === "critical" ? "bg-red-100 text-red-800" : status === "warning" ? "bg-amber-100 text-amber-800" : status === "blind" ? "bg-orange-100 text-orange-800" : status === "learning" ? "bg-violet-100 text-violet-800" : status === "inactive" ? "bg-black/[0.06] text-black/50" : "bg-sky-100 text-sky-800"}`}>{status}</span>; }
function SignalBadge({ status }: { status: BusinessIssueRadar["signals"][number]["status"] }) { return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${status === "healthy" ? "bg-emerald-100 text-emerald-800" : status === "critical" ? "bg-red-100 text-red-800" : status === "warning" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{status}</span>; }

function buildKpiScorecard(radar: BusinessIssueRadar, evidence: RadarEvidenceInspectionIndex): RadarKpiScorecardRow[] {
  const groups = new Map<string, BusinessRadarCheck[]>();
  for (const check of radar.checks) {
    if (check.scope !== "kpi") continue;
    const key = `${check.domain}:${check.familyId}`;
    groups.set(key, [...(groups.get(key) ?? []), check]);
  }

  const matchedSignals = new Set<string>();
  const rows: RadarKpiScorecardRow[] = [...groups.values()].map(checks => {
    const ordered = [...checks].sort((left, right) => Number(right.lens === "threshold") - Number(left.lens === "threshold") || right.measuredAt - left.measuredAt);
    const primary = ordered.find(check => check.value !== undefined) ?? ordered[0]!;
    const policyCheck = ordered.find(check => check.policy?.targetValue !== undefined || check.policy?.targetLabel) ?? ordered.find(check => check.policy);
    const policy = policyCheck?.policy;
    const signal = findKpiSignal(radar, primary);
    if (signal) matchedSignals.add(signal.id);
    const relatedEvidence = evidence.series.filter(series => series.domain === primary.domain && (series.familyId === primary.familyId || normalizeKpiKey(series.familyLabel) === normalizeKpiKey(primary.familyLabel)));
    const domainSummary = radar.domains.find(item => item.domain === primary.domain);
    const value = primary.value ?? signal?.value ?? undefined;
    const status = ordered.reduce<RadarCheckStatus>((worst, check) => statusRank(check.status) < statusRank(worst) ? check.status : worst, statusFromSignal(signal?.status));
    const targetValue = policy?.targetValue;
    return {
      id: `${primary.domain}:${primary.familyId}`,
      domain: primary.domain,
      familyId: primary.familyId,
      label: primary.familyLabel,
      status,
      value: value === null ? undefined : value,
      display: signal?.display,
      previousValue: ordered.find(check => check.previousValue !== undefined)?.previousValue,
      targetValue,
      targetLabel: policy?.targetLabel || (targetValue !== undefined ? formatNumber(targetValue) : signal?.target || "Not configured"),
      expectedDirection: policy?.expectedDirection ?? primary.expectedDirection ?? "neutral",
      measuredAt: Math.max(signal?.measuredAt ?? 0, ...ordered.map(check => check.measuredAt)),
      lastSeenAt: newestNumber(ordered.map(check => check.lastSeenAt)),
      sourceId: primary.sourceId,
      sampleSize: newestNumber(ordered.map(check => check.sampleSize)),
      historySamples: newestNumber(ordered.map(check => check.historySamples)) ?? 0,
      historySpanMs: newestNumber(ordered.map(check => check.historySpanMs)),
      evidenceSamples: relatedEvidence.reduce((total, series) => total + series.totalSamples, 0),
      domainConfidencePercent: domainSummary?.confidencePercent ?? 0,
      owner: policy?.owner || "Unassigned",
      escalationRoute: policy?.escalationRoute || "Not configured",
      evaluationWindow: policy?.evaluationWindow || "Not configured",
      notificationCadence: policy?.notificationCadence || "Not configured",
      warningTolerancePercent: policy?.warningTolerancePercent,
      criticalTolerancePercent: policy?.criticalTolerancePercent,
      href: primary.href || signal?.href || "/portal/agency",
      checks: ordered,
    } satisfies RadarKpiScorecardRow;
  });

  for (const signal of radar.signals) {
    if (matchedSignals.has(signal.id)) continue;
    const relatedEvidence = evidence.series.filter(series => series.domain === signal.domain && (normalizeKpiKey(series.familyId) === normalizeKpiKey(signal.id) || normalizeKpiKey(series.familyLabel) === normalizeKpiKey(signal.label)));
    rows.push({
      id: `${signal.domain}:signal:${signal.id}`,
      domain: signal.domain,
      familyId: signal.id,
      label: signal.label,
      status: statusFromSignal(signal.status),
      value: signal.value ?? undefined,
      display: signal.display,
      targetLabel: signal.target || "Not configured",
      expectedDirection: "neutral",
      measuredAt: signal.measuredAt,
      sourceId: signal.id,
      sampleSize: signal.sampleSize,
      historySamples: 0,
      evidenceSamples: relatedEvidence.reduce((total, series) => total + series.totalSamples, 0),
      domainConfidencePercent: radar.domains.find(item => item.domain === signal.domain)?.confidencePercent ?? 0,
      owner: "Unassigned",
      escalationRoute: "Not configured",
      evaluationWindow: "Not configured",
      notificationCadence: "Not configured",
      href: signal.href,
      checks: [],
    });
  }

  return rows;
}

function findKpiSignal(radar: BusinessIssueRadar, check: BusinessRadarCheck) {
  const family = normalizeKpiKey(check.familyId);
  const label = normalizeKpiKey(check.familyLabel);
  return radar.signals.find(signal => {
    if (signal.domain !== check.domain) return false;
    const signalId = normalizeKpiKey(signal.id);
    const signalLabel = normalizeKpiKey(signal.label);
    return signalId === family || signalLabel === label || (signalId.length > 5 && family.includes(signalId)) || (family.length > 5 && signalId.includes(family));
  });
}

function statusFromSignal(status?: BusinessIssueRadar["signals"][number]["status"]): RadarCheckStatus {
  if (!status) return "pass";
  if (status === "healthy") return "pass";
  if (status === "critical" || status === "warning" || status === "watch") return status;
  return "learning";
}

function matchesStatus(status: RadarCheckStatus, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return status !== "pass" && status !== "inactive";
  if (filter === "applicable") return status !== "inactive";
  if (filter === "assured") return status === "pass" || status === "critical" || status === "warning";
  if (filter === "firing") return status === "critical" || status === "warning";
  if (filter === "live") return status !== "learning" && status !== "blind" && status !== "inactive";
  return status === filter;
}

function matchesIncidentStatus(severity: BusinessRadarIssue["severity"] | "info", filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return severity !== "info";
  if (filter === "critical" || filter === "warning" || filter === "watch") return severity === filter;
  return false;
}

function matchesScope(scope: RadarCheckScope, filter: ScopeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "sentinel") return scope === "source" || scope === "property" || scope === "synthetic" || scope === "watchdog";
  return scope === filter;
}

function normalizeKpiKey(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function newestNumber(values: Array<number | undefined>): number | undefined { const available = values.filter((value): value is number => value !== undefined && Number.isFinite(value)); return available.length ? Math.max(...available) : undefined; }

function formatKpiActual(row: RadarKpiScorecardRow): string {
  if (row.display && row.value !== undefined) return row.display;
  return row.value === undefined ? "No measurement" : formatNumber(row.value);
}

function formatKpiVariance(row: RadarKpiScorecardRow): string {
  if (row.value === undefined) return "No actual";
  if (row.targetValue === undefined) return "Text target";
  if (row.expectedDirection === "neutral") return `${formatNumber(row.value - row.targetValue)} difference`;
  const favorableDifference = row.expectedDirection === "higher" ? row.value - row.targetValue : row.targetValue - row.value;
  if (row.targetValue === 0) return favorableDifference === 0 ? "On target" : `${favorableDifference > 0 ? "+" : ""}${formatNumber(favorableDifference)}`;
  const percent = favorableDifference / Math.abs(row.targetValue) * 100;
  if (Math.abs(percent) < 0.05) return "On target";
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}% ${percent > 0 ? "ahead" : "behind"}`;
}

function kpiVarianceTone(row: RadarKpiScorecardRow): "neutral" | "good" | "bad" {
  if (row.value === undefined || row.targetValue === undefined || row.expectedDirection === "neutral") return "neutral";
  const favorableDifference = row.expectedDirection === "higher" ? row.value - row.targetValue : row.targetValue - row.value;
  return favorableDifference >= 0 ? "good" : "bad";
}

function formatKpiTrend(row: RadarKpiScorecardRow): string {
  if (row.value === undefined || row.previousValue === undefined) return "No prior point";
  const difference = row.value - row.previousValue;
  if (difference === 0) return "Flat vs prior";
  if (row.previousValue === 0) return `${difference > 0 ? "+" : ""}${formatNumber(difference)} vs prior`;
  const percent = difference / Math.abs(row.previousValue) * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}% vs prior`;
}

function statusRank(status: RadarCheckStatus): number { return ({ critical: 0, warning: 1, blind: 2, watch: 3, learning: 4, inactive: 5, pass: 6 })[status]; }
function severityClass(severity: "critical" | "warning" | "watch") { return severity === "critical" ? "bg-red-100 text-red-800" : severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"; }
function domainLabel(domain: AdvisorDomain): string { return readable(domain); }
function readable(value: string): string { return value.replace(/[-_:]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
function formatNumber(value: number): string { return value.toLocaleString("en-GB", { maximumFractionDigits: 3 }); }
function formatDate(value: number): string { return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" }); }
function formatShortDate(value: number): string { return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
function formatDuration(value: number): string { const day = 86_400_000; const hour = 3_600_000; const minute = 60_000; return value >= day ? `${(value / day).toFixed(1)} days` : value >= hour ? `${(value / hour).toFixed(1)} hours` : value >= minute ? `${Math.round(value / minute)} minutes` : `${Math.round(value / 1_000)} seconds`; }
