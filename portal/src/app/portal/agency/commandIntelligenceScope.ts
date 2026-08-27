import type {
  CommandIntelligenceScope,
  CommandIntelligenceSnapshot,
} from "@/lib/intelligence/commandIntelligence";

/**
 * Project the aggregate intelligence snapshot onto one company/property scope.
 * Kept outside the large visual intelligence workspace so Battle Table's
 * default war-room chunk does not pull every KPI drill-in component with it.
 */
export function applyIntelligenceScope(
  snapshot: CommandIntelligenceSnapshot,
  scope: CommandIntelligenceScope | null | undefined,
): CommandIntelligenceSnapshot {
  // Snapshots are persisted/cached independently of the UI. Treat a missing
  // scope as the aggregate view instead of crashing while reading `.kind`.
  if (!scope || scope.kind === "ecosystem") return snapshot;
  const readings = new Map(scope.readings.map(reading => [reading.kpiId, reading]));
  const kpis = snapshot.kpis.flatMap(kpi => {
    const reading = readings.get(kpi.id);
    if (!scope.inheritGlobalKpis && !reading) return [];
    return [{
      ...kpi,
      ...(reading ?? {}),
      scope: { id: scope.id, label: scope.label, kind: scope.kind },
    }];
  });
  const readingValue = (id: string) => kpis.find(kpi => kpi.id === id)?.value ?? 0;
  // Preserves "unmeasured" (`null`) instead of minting a zero for scopes without a reading.
  const readingValueOrNull = (id: string) => kpis.find(kpi => kpi.id === id)?.value ?? null;
  const scopedPortfolio = scope.inheritGlobalKpis;
  const campaigns = scopedPortfolio ? snapshot.campaigns : [];
  const audienceProfiles = scopedPortfolio ? snapshot.audienceProfiles : [];
  const audienceLocations = scopedPortfolio ? snapshot.audienceLocations : [];
  const audienceSignals = scopedPortfolio ? snapshot.audienceSignals : [];
  const audienceDemographics = scopedPortfolio ? snapshot.audienceDemographics : [];
  const sourceCohorts = scopedPortfolio ? snapshot.sourceCohorts : [];
  const campaignSpendCents = campaigns.reduce((sum, campaign) => sum + campaign.spendCents, 0);
  const campaignRevenueCents = campaigns.reduce((sum, campaign) => sum + campaign.attributedRevenueCents, 0);
  return {
    ...snapshot,
    kpis,
    campaigns,
    audienceProfiles,
    audienceLocations,
    audienceSignals,
    audienceDemographics,
    sourceCohorts,
    demandFlow: {
      pageviews: readingValueOrNull("traffic-7d"),
      forms: readingValueOrNull("forms-7d"),
      leads: scopedPortfolio ? snapshot.demandFlow.leads : 0,
      convertedLeads: scopedPortfolio ? snapshot.demandFlow.convertedLeads : 0,
      activeClients: scope.kind === "client" ? readingValue("active-clients") : scopedPortfolio ? snapshot.demandFlow.activeClients : 0,
    },
    summary: {
      ...snapshot.summary,
      connectedKpis: kpis.filter(kpi => kpi.status !== "blind").length,
      learningKpis: kpis.filter(kpi => kpi.status === "learning").length,
      blindKpis: kpis.filter(kpi => kpi.status === "blind").length,
      criticalKpis: kpis.filter(kpi => kpi.status === "critical").length,
      warningKpis: kpis.filter(kpi => kpi.status === "warning").length,
      activeCampaigns: campaigns.filter(campaign => ["active", "scheduled", "sending"].includes(campaign.status)).length,
      campaignSpendCents,
      campaignRevenueCents,
      portfolioRoas: campaignSpendCents ? campaignRevenueCents / campaignSpendCents : null,
      audienceProfiles: audienceProfiles.length,
      validatedProfiles: audienceProfiles.filter(profile => profile.confidence === "validated").length,
      mappedLocations: audienceLocations.filter(location => location.mapped).length,
      unmappedLocations: audienceLocations.filter(location => !location.mapped).length,
    },
  };
}
