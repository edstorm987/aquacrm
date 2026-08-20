import "server-only";

import { buildCommandIntelligenceSnapshot } from "@/lib/server/commandIntelligenceService";
import { inspectRadarEvidence } from "@/engines/data/server/radar/radarEvidenceVault";
import { describeCommandKpis, describeEvidenceSeries, type KpiDescriptor } from "@/lib/performance/kpiRegistry";

/**
 * KPI Registry — server seam.
 *
 * The client-safe {@link describeCommandKpis} projects an already-built
 * intelligence snapshot into descriptors; this server twin is the composition
 * point that *builds* the snapshot first, for callers that only want the KPI
 * list (a test, or a future `/api/portal/kpi-registry` route) rather than the
 * whole dashboard payload.
 *
 * It is also the intended growth point: later phases register the 40 commercial
 * formulas and the radar **evidence series** here — the evidence-series provider
 * can read {@link inspectRadarEvidenceSeries} directly for deeper history than
 * the 24-point `history` carried on a command KPI — all without changing the
 * {@link KpiDescriptor} contract the explorer consumes.
 */

/** Same inputs as the command-intelligence builder (radar + evidence + scope). */
export type KpiRegistryInput = Parameters<typeof buildCommandIntelligenceSnapshot>[0];

/**
 * Build the KPI registry for an agency: run the command-intelligence snapshot
 * and project its KPIs into descriptors. Phase 1 registers the 20 command KPIs;
 * every descriptor carries the metric's plottable series verbatim — no recompute.
 */
export async function buildKpiRegistry(input: KpiRegistryInput): Promise<KpiDescriptor[]> {
  const snapshot = await buildCommandIntelligenceSnapshot(input);
  return describeCommandKpis(snapshot);
}

/**
 * Register every retained radar-evidence series for an agency as an
 * evidence-kind descriptor. This is the vault-backed series provider the plan
 * anticipated — it reads the durable time-series directly (deeper than the
 * 24-point `history` carried on a command KPI). Served lazily via the
 * KPI-registry route, because an agency can retain well over a thousand series.
 */
export function buildEvidenceDescriptors(agencyId: string): KpiDescriptor[] {
  return inspectRadarEvidence(agencyId).series.map(describeEvidenceSeries);
}
