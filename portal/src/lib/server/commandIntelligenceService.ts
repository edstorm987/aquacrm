import "server-only";

import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import {
  MARKETING_CUSTOMER_PROFILES_KEY,
  type MarketingCustomerProfile,
} from "@/built-ins/modules/agency-marketing/src/lib/domain";
import type { Campaign, Lead } from "@/built-ins/modules/leads-pipeline/src/lib/domain";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { buildCommercialIntelligence } from "@/lib/intelligence/commercialIntelligence";
import type {
  AdvisorDomain,
  BusinessIssueRadar,
  BusinessRadarCheck,
  RadarCheckStatus,
  RadarEvidenceInspectionIndex,
} from "@/lib/radar/businessRadar";
import type {
  CommandAudienceLocation,
  CommandAudienceDemographic,
  CommandAudienceSignal,
  CommandIntelligenceCampaign,
  CommandIntelligenceScope,
  CommandIntelligenceSnapshot,
  CommandKpi,
  CommandKpiFormat,
  CommandKpiMeasurement,
  CommandKpiPoint,
  CommandKpiPlan,
  CommandKpiPlanningCadence,
  CommandKpiStatus,
  CommandKpiTargetDirection,
  CommandScopedKpiReading,
} from "@/lib/intelligence/commandIntelligence";
import type { BrandPortfolioRow, BrandPortfolioSnapshot } from "@/lib/brands/brandPortfolio";
import { buildBrandPortfolioSnapshot } from "@/lib/server/brandPortfolioService";
import { getInstall } from "@/server/pluginInstalls";
import { getState } from "@/server/storage";
import { getPipelineBySlug, listCards } from "@/server/pipelines";
import { listClients } from "@/server/tenants";
import type { Client, TradingCompany } from "@/server/types";
import { buildCompanyHealthSnapshot } from "@/lib/server/kpi/companyHealthSnapshot";
import { makePluginStorage } from "./pluginStorage";
import { inspectRadarEvidenceSeries } from "@/lib/server/radar/radarEvidenceVault";
import { buildRadarTelemetrySnapshot, type RadarTelemetryProperty } from "@/lib/server/radar/radarTelemetry";
import { clientWorkspaceDisplayName, clientWorkspaceHref } from "@/lib/clients/clientWorkspace";

const DAY = 86_400_000;

interface CommandIntelligenceInput {
  agencyId: string;
  radar: BusinessIssueRadar;
  evidence: RadarEvidenceInspectionIndex;
  now?: number;
  brandPortfolio?: BrandPortfolioSnapshot;
}

interface KpiInput {
  id: string;
  rank: number;
  label: string;
  shortLabel: string;
  domain: AdvisorDomain;
  format: CommandKpiFormat;
  value: number | null;
  display: string;
  target: string;
  detail: string;
  href: string;
  sourceId: string;
  measuredAt: number;
  sampleSize?: number;
  previousValue?: number;
  status: CommandKpiStatus;
  evidence: string[];
  familyId: string;
  history?: CommandKpiPoint[];
  plan?: {
    baselineValue?: number | null;
    targetValue?: number | null;
    direction?: CommandKpiTargetDirection;
    cadence?: CommandKpiPlanningCadence;
    source: string;
  };
}

export async function buildCommandIntelligenceSnapshot({
  agencyId,
  radar,
  evidence,
  now = Date.now(),
  brandPortfolio: suppliedBrandPortfolio,
}: CommandIntelligenceInput): Promise<CommandIntelligenceSnapshot> {
  evidence = hydrateCommandEvidence(agencyId, evidence);
  const [company, marketing, brandPortfolio] = await Promise.all([
    buildCompanyHealthSnapshot(agencyId, now),
    readMarketingIntelligence(agencyId),
    suppliedBrandPortfolio ? Promise.resolve(suppliedBrandPortfolio) : buildBrandPortfolioSnapshot(agencyId, now),
  ]);
  const state = getState();
  const clients = listClients(agencyId, { includeArchived: true });
  const telemetry = buildRadarTelemetrySnapshot(state.agencyWebsites[agencyId], clients, state.radarSyntheticProbes[agencyId] ?? {}, now);
  const tradingCompanies = Object.values(state.tradingCompanies).filter(item => item.agencyId === agencyId && item.status !== "archived");
  const campaignRows = buildCampaignRows(marketing.campaigns, marketing.leads, clients);
  const campaignSpendCents = campaignRows.reduce((sum, campaign) => sum + campaign.spendCents, 0);
  const campaignRevenueCents = campaignRows.reduce((sum, campaign) => sum + campaign.attributedRevenueCents, 0);
  const portfolioRoas = campaignSpendCents > 0
    ? round(campaignRevenueCents / campaignSpendCents, 2)
    : null;
  const activeCampaigns = campaignRows.filter(campaign => ["active", "scheduled", "sending"].includes(campaign.status)).length;
  const launchedCampaigns = campaignRows.filter(campaign => campaign.status !== "draft");
  const campaignsWithOutcomePath = launchedCampaigns.filter(campaign => campaign.attributedLeads > 0 || campaign.attributedRevenueCents > 0 || marketing.campaigns.find(row => row.id === campaign.id)?.sourceKey).length;
  const campaignOutcomeCoverage = percentage(campaignsWithOutcomePath, launchedCampaigns.length);
  const activeProfiles = marketing.profiles.filter(profile => profile.status === "active");
  const validatedProfiles = activeProfiles.filter(profile => profile.evidenceConfidence === "validated");
  const audienceConfidence = percentage(validatedProfiles.length, activeProfiles.length);
  const locationRows = buildAudienceLocations(marketing.profiles);
  const audienceSignals = buildAudienceSignals(marketing.profiles);
  const audienceDemographics = buildAudienceDemographics(marketing.profiles);
  const revenueTargetPercent = company.profile.monthlyRevenueTargetCents > 0
    ? round(company.actuals.monthRevenueCents / company.profile.monthlyRevenueTargetCents * 100, 1)
    : null;
  const attributionPercent = radar.commercial.leadCount
    ? round((radar.commercial.leadCount - radar.commercial.unattributedLeadCount) / radar.commercial.leadCount * 100, 1)
    : null;
  // `null` = no actual reading (blind/learning/inactive check). The value itself
  // now carries measuredness — there is no separate flag to forget, so nothing
  // downstream can present an unmeasured window as a confident zero.
  const traffic7d = measuredCheckValue(radar, "marketing", "traffic-7d");
  const trafficPrevious7d = findCheck(radar, "marketing", "traffic-7d")?.previousValue ?? null;
  const trafficChange = checkValue(radar, "marketing", "traffic-change");
  const forms7d = measuredCheckValue(radar, "marketing", "form-submissions");
  const websiteConversionRate = checkValue(radar, "marketing", "conversion-rate");
  const campaignBudgetCents = campaignRows.reduce((sum, row) => sum + row.budgetCents, 0);
  const plannedLeadDemand = Math.max(1, Math.ceil(Math.max(1, company.dealsNeeded) / 0.2));
  const trafficBaseline = trafficPrevious7d ?? traffic7d;
  const leadsPipeline = getPipelineBySlug(agencyId, "leads");
  const commercialIntelligence = buildCommercialIntelligence({
    leads: marketing.leads,
    clients,
    campaigns: marketing.campaigns,
    pipeline: leadsPipeline,
    cards: leadsPipeline ? listCards(leadsPipeline.id) : [],
    currency: company.actuals.currency,
    pageviews: traffic7d,
    forms: forms7d,
    now,
  });
  const kpis = [
    makeKpi({ id: "business-health", rank: 1, label: "Business health", shortLabel: "Health", domain: "company", format: "score", value: radar.adaptive.healthScore, display: `${radar.adaptive.healthScore}/100`, target: "80 or above", detail: "Executive performance against approved commercial, client, operating and safety targets.", href: "/portal/agency?station=battle", sourceId: "company-health", measuredAt: radar.generatedAt, status: scoreStatus(radar.adaptive.healthScore), evidence: [`Confidence ${radar.adaptive.confidencePercent}%`, `Readiness ${radar.adaptive.readinessPercent}%`], familyId: "overall-health", plan: { baselineValue: radar.adaptive.healthScore, targetValue: 80, cadence: "monthly", source: "Approved company health guardrail" } }, evidence),
    makeKpi({ id: "revenue-target", rank: 2, label: "Revenue target attainment", shortLabel: "Target pace", domain: "finance", format: "percent", value: revenueTargetPercent, display: revenueTargetPercent === null ? "No target" : `${round(revenueTargetPercent, 0)}%`, target: `${money(company.profile.monthlyRevenueTargetCents, company.actuals.currency)} this month`, detail: "Recorded monthly income as a share of the approved monthly target.", href: "/portal/agency/agency-finance/planning", sourceId: "finance:target", measuredAt: now, status: statusFromCheck(findCheck(radar, "finance", "target-progress")), evidence: [money(company.actuals.monthRevenueCents, company.actuals.currency), `Gap ${money(company.revenueGapCents, company.actuals.currency)}`], familyId: "target-progress", plan: { baselineValue: 0, targetValue: 100, cadence: "monthly", source: "Company monthly revenue target" } }, evidence),
    makeKpi({ id: "mrr", rank: 3, label: "Monthly recurring revenue", shortLabel: "MRR", domain: "finance", format: "currency", value: company.actuals.mrrCents, display: money(company.actuals.mrrCents, company.actuals.currency), target: "A growing recurring baseline", detail: "Monthly recurring revenue recognised by the connected finance system.", href: "/portal/agency/agency-finance", sourceId: "finance:mrr", measuredAt: now, status: statusFromCheck(findCheck(radar, "finance", "mrr")), evidence: [company.actuals.mrrCents ? "Recurring revenue recorded" : "No recurring revenue recorded"], familyId: "mrr", plan: { targetValue: company.profile.monthlyRevenueTargetCents, cadence: "monthly", source: "Company monthly revenue target" } }, evidence),
    makeKpi({ id: "revenue-gap", rank: 4, label: "Revenue gap", shortLabel: "Revenue gap", domain: "finance", format: "currency", value: company.revenueGapCents, display: money(company.revenueGapCents, company.actuals.currency), target: `${money(0, company.actuals.currency)} remaining`, detail: "Income still required to meet the current monthly target.", href: "/portal/agency/agency-finance/planning", sourceId: "company:revenue-gap", measuredAt: now, status: company.revenueGapCents > 0 ? "warning" : "healthy", evidence: [`${company.dealsNeeded} estimated deals needed`, `${company.estimatedCallsNeeded} estimated calls needed`], familyId: "cash-gap", plan: { baselineValue: company.profile.monthlyRevenueTargetCents, targetValue: 0, direction: "lower", cadence: "monthly", source: "Company monthly revenue target" } }, evidence),
    makeKpi({ id: "recent-leads", rank: 5, label: "New leads in 30 days", shortLabel: "New leads", domain: "sales", format: "number", value: radar.commercial.recentLeadCount, display: radar.commercial.recentLeadCount.toLocaleString(), target: "Enough demand to support the revenue plan", detail: "Lead records captured during the rolling 30-day window.", href: "/portal/clients?view=journey", sourceId: "commercial:lifecycle", measuredAt: radar.commercial.latestActivityAt ?? now, sampleSize: radar.commercial.leadCount, status: radar.commercial.available ? radar.commercial.recentLeadCount ? "healthy" : "learning" : "blind", evidence: [`${radar.commercial.leadCount} retained leads`, `${radar.commercial.openLeadCount} currently open`], familyId: "enquiries-30d", plan: { baselineValue: 0, targetValue: plannedLeadDemand, cadence: "monthly", source: "Revenue gap divided by the 20% lead conversion guardrail" } }, evidence),
    makeKpi({ id: "lead-conversion", rank: 6, label: "Lead-to-client conversion", shortLabel: "Lead conversion", domain: "sales", format: "percent", value: radar.commercial.conversionRatePercent, display: percentDisplay(radar.commercial.conversionRatePercent), target: "20% or above after 5 leads", detail: "Retained leads with a recorded client conversion.", href: "/portal/clients?view=journey", sourceId: "commercial:lifecycle", measuredAt: radar.commercial.latestActivityAt ?? now, sampleSize: radar.commercial.leadCount, status: statusFromCheck(findCheck(radar, "sales", "lead-conversion-rate")), evidence: [`${radar.commercial.convertedLeadCount} converted`, `${radar.commercial.lostLeadCount} lost`], familyId: "lead-conversion-rate", plan: { baselineValue: 0, targetValue: 20, cadence: "rolling", source: "Approved commercial conversion guardrail" } }, evidence),
    makeKpi({ id: "speed-to-lead", rank: 7, label: "Replies within target", shortLabel: "Speed to lead", domain: "sales", format: "percent", value: radar.speedToLead.withinTargetPercent, display: percentDisplay(radar.speedToLead.withinTargetPercent), target: `First response within ${radar.speedToLead.targetMinutes} minutes`, detail: "Share of measurable enquiries answered inside the configured first-response target.", href: "/portal/agency/inbox?view=forms", sourceId: "sales:response", measuredAt: radar.generatedAt, sampleSize: radar.speedToLead.measuredResponseCount, status: speedStatus(radar.speedToLead.status, radar.speedToLead.enquiryCount), evidence: [`${radar.speedToLead.breachedCount} breaches`, `${radar.speedToLead.awaitingResponseCount} awaiting reply`, `Oldest ${duration(radar.speedToLead.oldestWaitingMs)}`], familyId: "median-response", plan: { baselineValue: 0, targetValue: 100, cadence: "daily", source: `Configured ${radar.speedToLead.targetMinutes}-minute first-response SLA` } }, evidence),
    makeKpi({ id: "source-attribution", rank: 8, label: "Lead source attribution", shortLabel: "Attribution", domain: "marketing", format: "percent", value: attributionPercent, display: percentDisplay(attributionPercent), target: "85% or above", detail: "Leads carrying a usable original source so channel outcomes can be compared.", href: "/portal/agency/marketing?view=sources", sourceId: "commercial:lifecycle", measuredAt: radar.commercial.latestActivityAt ?? now, sampleSize: radar.commercial.leadCount, status: statusFromCheck(findCheck(radar, "marketing", "lead-source-attribution")), evidence: [`${radar.commercial.unattributedLeadCount} unattributed`, `${radar.commercial.cohorts.length} source cohorts`], familyId: "lead-source-attribution", plan: { baselineValue: 0, targetValue: 85, cadence: "rolling", source: "Marketing attribution guardrail" } }, evidence),
    makeKpi({ id: "active-campaigns", rank: 9, label: "Active campaigns", shortLabel: "Campaigns", domain: "marketing", format: "number", value: activeCampaigns, display: activeCampaigns.toLocaleString(), target: "At least one intentional live demand motion", detail: "Campaigns currently active, scheduled or sending.", href: "/portal/agency/marketing?view=campaigns", sourceId: "marketing:campaigns", measuredAt: newest(campaignRows.map(row => row.updatedAt)) ?? now, sampleSize: campaignRows.length, status: marketing.campaignsConnected ? activeCampaigns ? "healthy" : "learning" : "blind", evidence: [`${campaignRows.length} total campaigns`, `${campaignRows.filter(row => row.status === "draft").length} drafts`], familyId: "campaign-records", plan: { baselineValue: 0, targetValue: 1, cadence: "monthly", source: "Minimum live demand-motion guardrail" } }, evidence),
    makeKpi({ id: "campaign-outcomes", rank: 10, label: "Campaign outcome coverage", shortLabel: "Outcome coverage", domain: "marketing", format: "percent", value: campaignOutcomeCoverage, display: percentDisplay(campaignOutcomeCoverage), target: "100% of launched campaigns attributable", detail: "Launched campaigns with a source key, attributed lead or attributed revenue path.", href: "/portal/agency/marketing?view=campaigns", sourceId: "marketing:campaigns", measuredAt: newest(campaignRows.map(row => row.updatedAt)) ?? now, sampleSize: launchedCampaigns.length, status: launchedCampaigns.length ? (campaignOutcomeCoverage ?? 0) >= 80 ? "healthy" : (campaignOutcomeCoverage ?? 0) >= 50 ? "warning" : "critical" : marketing.campaignsConnected ? "learning" : "blind", evidence: [`${campaignsWithOutcomePath}/${launchedCampaigns.length} launched campaigns traceable`], familyId: "campaign-attribution", plan: { baselineValue: 0, targetValue: 100, cadence: "guardrail", source: "Campaign attribution policy" } }, evidence),
    makeKpi({ id: "marketing-spend", rank: 11, label: "Marketing spend", shortLabel: "Spend", domain: "marketing", format: "currency", value: campaignSpendCents, display: money(campaignSpendCents, company.actuals.currency), target: "Inside funded campaign budgets", detail: "Recorded spend across campaign records in the current workspace.", href: "/portal/agency/marketing?view=campaigns", sourceId: "marketing:campaigns", measuredAt: newest(campaignRows.map(row => row.updatedAt)) ?? now, sampleSize: campaignRows.length, status: marketing.campaignsConnected ? "healthy" : "blind", evidence: [`Budget ${money(campaignBudgetCents, company.actuals.currency)}`, `${campaignRows.filter(row => row.spendPercent !== null && row.spendPercent > 100).length} over budget`], familyId: "campaign-spend", plan: { baselineValue: 0, targetValue: campaignBudgetCents || null, direction: "lower", cadence: "monthly", source: "Funded campaign budgets" } }, evidence),
    makeKpi({ id: "campaign-roas", rank: 12, label: "Campaign return on spend", shortLabel: "ROAS", domain: "marketing", format: "number", value: portfolioRoas, display: portfolioRoas === null ? "Learning" : `${portfolioRoas.toFixed(2)}x`, target: "3.00x or above", detail: "Attributed campaign revenue divided by recorded campaign spend.", href: "/portal/agency/marketing?view=campaigns", sourceId: "marketing:campaigns", measuredAt: newest(campaignRows.map(row => row.updatedAt)) ?? now, sampleSize: campaignRows.filter(row => row.spendCents > 0).length, status: portfolioRoas === null ? marketing.campaignsConnected ? "learning" : "blind" : portfolioRoas < 1 ? "critical" : portfolioRoas < 3 ? "warning" : "healthy", evidence: [`Revenue ${money(campaignRevenueCents, company.actuals.currency)}`, `Spend ${money(campaignSpendCents, company.actuals.currency)}`], familyId: "campaign-roas", plan: { baselineValue: 0, targetValue: 3, cadence: "rolling", source: "Campaign return guardrail" } }, evidence),
    makeKpi({ id: "traffic-7d", rank: 13, label: "Website traffic in 7 days", shortLabel: "Traffic", domain: "marketing", format: "number", value: traffic7d, previousValue: trafficPrevious7d ?? undefined, display: traffic7d === null ? "—" : traffic7d.toLocaleString(), target: "Stable or growing qualified traffic", detail: "Aqua Tag pageviews across monitored agency and client properties.", href: "/portal/agency/fulfilment/technical/performance", sourceId: "marketing:traffic", measuredAt: findCheck(radar, "marketing", "traffic-7d")?.lastSeenAt ?? now, sampleSize: radar.summary.monitoredProperties, status: statusFromCheck(findCheck(radar, "marketing", "traffic-7d")), evidence: [traffic7d === null ? "No pageview reading yet — not a measured zero" : `Previous 7d ${(trafficPrevious7d ?? 0).toLocaleString()}`, `${radar.summary.monitoredProperties} properties watched`], familyId: "traffic-7d", plan: { baselineValue: 0, targetValue: trafficBaseline || null, cadence: "weekly", source: "Previous seven-day traffic baseline" } }, evidence),
    makeKpi({ id: "revenue-growth", rank: 14, label: "Month-on-month revenue growth", shortLabel: "Growth rate", domain: "finance", format: "percent", value: company.actuals.monthlyRevenueGrowthPercent, display: revenueGrowthDisplay(company.actuals.monthlyRevenueGrowthPercent, company.actuals.monthRevenueCents, company.actuals.previousMonthRevenueCents), target: "5% or above month-on-month", detail: "Recorded current-month revenue compared with the immediately preceding calendar month. Growth remains uncalibrated when the prior month is zero because percentage change is mathematically undefined.", href: "/portal/agency/agency-finance/planning", sourceId: "finance:revenue-growth", measuredAt: now, sampleSize: company.revenueGrowthHistory.length, previousValue: company.revenueGrowthHistory.at(-2)?.value, status: revenueGrowthStatus(company.actuals.financeConnected, company.actuals.monthlyRevenueGrowthPercent), evidence: [
      `Current month ${money(company.actuals.monthRevenueCents, company.actuals.currency)}`,
      `Previous month ${money(company.actuals.previousMonthRevenueCents, company.actuals.currency)}`,
      "Formula: (current month - previous month) / previous month x 100",
      ...(company.actuals.previousMonthRevenueCents <= 0 ? ["Previous-month revenue is zero, so a percentage rate cannot be proven yet"] : []),
    ], familyId: "monthly-revenue-growth", history: company.revenueGrowthHistory, plan: { baselineValue: 0, targetValue: 5, cadence: "monthly", source: "Approved positive-growth guardrail" } }, evidence),
    makeKpi({ id: "forms-7d", rank: 15, label: "Form submissions in 7 days", shortLabel: "Forms", domain: "marketing", format: "number", value: forms7d, display: forms7d === null ? "—" : forms7d.toLocaleString(), target: "Demand captured and routed", detail: "Tracked website form events received during the last seven days.", href: "/portal/agency/fulfilment/technical/performance", sourceId: "marketing:forms", measuredAt: findCheck(radar, "marketing", "form-submissions")?.lastSeenAt ?? now, status: statusFromCheck(findCheck(radar, "marketing", "form-submissions")), evidence: [traffic7d === null ? "Pageviews not monitored" : `${traffic7d.toLocaleString()} pageviews`, `${checkValue(radar, "marketing", "conversions") ?? 0} conversion events`], familyId: "form-submissions", plan: { baselineValue: 0, targetValue: 1, cadence: "weekly", source: "Minimum measurable demand guardrail" } }, evidence),
    makeKpi({ id: "website-conversion", rank: 16, label: "Website conversion rate", shortLabel: "Web conversion", domain: "marketing", format: "percent", value: websiteConversionRate, display: percentDisplay(websiteConversionRate), target: "1% or above", detail: "Tracked conversion events as a share of monitored pageviews.", href: "/portal/agency/fulfilment/technical/performance", sourceId: "marketing:conversion-rate", measuredAt: findCheck(radar, "marketing", "conversion-rate")?.lastSeenAt ?? now, sampleSize: traffic7d ?? undefined, status: statusFromCheck(findCheck(radar, "marketing", "conversion-rate")), evidence: [`${checkValue(radar, "marketing", "conversions") ?? 0} conversions`, traffic7d === null ? "Pageviews not monitored" : `${traffic7d} pageviews`], familyId: "conversion-rate", plan: { baselineValue: 0, targetValue: 1, cadence: "weekly", source: "Website conversion guardrail" } }, evidence),
    makeKpi({ id: "audience-confidence", rank: 17, label: "Validated audience coverage", shortLabel: "Audience proof", domain: "marketing", format: "percent", value: audienceConfidence, display: percentDisplay(audienceConfidence), target: "Every active primary audience validated", detail: "Active customer profiles supported by validated rather than assumed evidence.", href: "/portal/agency/marketing?view=customer-profiles", sourceId: "marketing:customer-profiles", measuredAt: newest(marketing.profiles.map(profile => profile.updatedAt)) ?? now, sampleSize: activeProfiles.length, status: marketing.profilesConnected ? activeProfiles.length ? (audienceConfidence ?? 0) >= 80 ? "healthy" : (audienceConfidence ?? 0) >= 40 ? "warning" : "critical" : "learning" : "blind", evidence: [`${validatedProfiles.length}/${activeProfiles.length} active profiles validated`, `${marketing.profiles.filter(profile => profile.evidenceConfidence === "assumption").length} assumption-led profiles`], familyId: "audience-confidence", plan: { baselineValue: 0, targetValue: 100, cadence: "monthly", source: "Customer evidence policy" } }, evidence),
    makeKpi({ id: "active-clients", rank: 18, label: "Active clients", shortLabel: "Clients", domain: "clients", format: "number", value: company.actuals.activeClients, display: company.actuals.activeClients.toLocaleString(), target: "Enough retained capacity to support the plan", detail: "Active client relationships excluding churned or archived records.", href: "/portal/clients", sourceId: "clients:active", measuredAt: newest(clients.map(client => client.updatedAt)) ?? now, sampleSize: clients.length, status: company.actuals.activeClients ? "healthy" : "learning", evidence: [`${clients.length} total client records`], familyId: "active-clients", plan: { baselineValue: company.actuals.activeClients, targetValue: null, cadence: "monthly", source: "Awaiting an approved client-capacity target" } }, evidence),
    makeKpi({ id: "retention", rank: 19, label: "Portfolio retention", shortLabel: "Retention", domain: "clients", format: "percent", value: radar.commercial.retentionRatePercent, display: percentDisplay(radar.commercial.retentionRatePercent), target: "80% or above", detail: "Active clients as a share of active plus recorded churned relationships.", href: "/portal/clients?view=health", sourceId: "commercial:lifecycle", measuredAt: radar.commercial.latestActivityAt ?? now, sampleSize: radar.commercial.activeClientCount + radar.commercial.churnedClientCount, status: statusFromCheck(findCheck(radar, "clients", "retention-state")), evidence: [`${radar.commercial.activeClientCount} active`, `${radar.commercial.churnedClientCount} churned`], familyId: "retention-state", plan: { baselineValue: 0, targetValue: 80, cadence: "rolling", source: "Portfolio retention guardrail" } }, evidence),
    makeKpi({ id: "client-attention", rank: 20, label: "Clients needing attention", shortLabel: "Client attention", domain: "clients", format: "number", value: company.actuals.clientsNeedingAttention, display: company.actuals.clientsNeedingAttention.toLocaleString(), target: "0 unresolved health concerns", detail: "Clients with ownership, contact, request, milestone or production-health concerns.", href: "/portal/clients?view=health", sourceId: "clients:attention", measuredAt: newest(clients.map(client => client.updatedAt)) ?? now, sampleSize: company.actuals.activeClients, status: company.actuals.clientsNeedingAttention ? company.actuals.clientsNeedingAttention >= Math.max(3, Math.ceil(company.actuals.activeClients / 2)) ? "critical" : "warning" : company.actuals.activeClients ? "healthy" : "learning", evidence: [`${company.actuals.activeClients} active clients`, `${company.actuals.clientsNeedingAttention} need review`], familyId: "attention-clients", plan: { baselineValue: Math.max(1, company.actuals.clientsNeedingAttention), targetValue: 0, direction: "lower", cadence: "daily", source: "Client health resolution guardrail" } }, evidence),
  ];

  const connectedKpis = kpis.filter(kpi => kpi.status !== "blind").length;
  const scopes = buildIntelligenceScopes({
    agencyName: state.agencies[agencyId]?.name ?? "Agency workspace",
    clients,
    tradingCompanies,
    properties: telemetry.properties,
    brandPortfolio,
    now,
  });
  return {
    generatedAt: now,
    currency: company.actuals.currency,
    kpis,
    scopes,
    campaigns: campaignRows,
    audienceProfiles: marketing.profiles.map(profile => ({
      id: profile.id,
      name: profile.name,
      segment: profile.segment || profile.audienceType,
      status: profile.status,
      priority: profile.priority,
      confidence: profile.evidenceConfidence,
      audienceType: profile.audienceType,
      estimatedAudienceSize: profile.estimatedAudienceSize,
      ageRange: profile.ageRange,
      languages: profile.languages,
      genderNotes: profile.genderNotes,
      incomeRange: profile.incomeRange,
      lifeStage: profile.lifeStage,
      locations: profile.locations,
      industries: profile.industries,
      companySize: profile.companySize,
      businessStage: profile.businessStage,
      jobTitles: profile.jobTitles,
      decisionRoles: profile.decisionRoles,
      goals: profile.goals,
      painPoints: profile.painPoints,
      motivations: profile.motivations,
      objections: profile.objections,
      buyingTriggers: profile.buyingTriggers,
      preferredChannels: profile.preferredChannels,
      contentPreferences: profile.contentPreferences,
      offerFit: profile.offerFit,
      typicalBudget: profile.typicalBudget,
      buyingCycle: profile.buyingCycle,
      researchNotes: profile.researchNotes,
      topSignals: [...profile.goals, ...profile.motivations, ...profile.contentPreferences].slice(0, 5),
      updatedAt: profile.updatedAt,
    })),
    audienceLocations: locationRows,
    audienceSignals,
    audienceDemographics,
    sourceCohorts: radar.commercial.cohorts.map(cohort => ({
      id: cohort.key,
      label: cohort.label,
      leads: cohort.leadCount,
      converted: cohort.convertedLeadCount,
      conversionRatePercent: cohort.conversionRatePercent,
      clients: cohort.clientCount,
      churnRatePercent: cohort.churnRatePercent,
      ready: cohort.conversionSampleReady || cohort.retentionSampleReady,
    })),
    demandFlow: {
      pageviews: traffic7d,
      forms: forms7d,
      leads: radar.commercial.recentLeadCount,
      convertedLeads: radar.commercial.convertedLeadCount,
      activeClients: radar.commercial.activeClientCount,
    },
    commercialIntelligence,
    summary: {
      connectedKpis,
      learningKpis: kpis.filter(kpi => kpi.status === "learning").length,
      blindKpis: kpis.filter(kpi => kpi.status === "blind").length,
      criticalKpis: kpis.filter(kpi => kpi.status === "critical").length,
      warningKpis: kpis.filter(kpi => kpi.status === "warning").length,
      activeCampaigns,
      campaignSpendCents,
      campaignRevenueCents,
      portfolioRoas,
      audienceProfiles: marketing.profiles.length,
      validatedProfiles: marketing.profiles.filter(profile => profile.evidenceConfidence === "validated").length,
      mappedLocations: locationRows.filter(location => location.mapped).length,
      unmappedLocations: locationRows.filter(location => !location.mapped).length,
    },
  };
}

function hydrateCommandEvidence(agencyId: string, evidence: RadarEvidenceInspectionIndex): RadarEvidenceInspectionIndex {
  return {
    ...evidence,
    series: evidence.series.map(summary => {
      const detail = inspectRadarEvidenceSeries(agencyId, summary.id);
      if (!detail) return summary;
      const points = [
        ...detail.hourly.map(item => ({ at: item.hour, value: item.average, status: "watch" as const })),
        ...detail.points,
      ].sort((left, right) => left.at - right.at);
      return { ...summary, recentPoints: points };
    }),
  };
}

async function readMarketingIntelligence(agencyId: string): Promise<{ campaignsConnected: boolean; profilesConnected: boolean; campaigns: Campaign[]; leads: Lead[]; profiles: MarketingCustomerProfile[] }> {
  const leadsInstall = getInstall({ agencyId }, "leads-pipeline");
  const marketingInstall = getInstall({ agencyId }, "agency-marketing");
  let campaigns: Campaign[] = [];
  let leads: Lead[] = [];
  let profiles: MarketingCustomerProfile[] = [];
  let campaignsConnected = false;
  let profilesConnected = false;
  if (leadsInstall?.enabled) {
    try {
      ensureLeadsPipelineFoundationRegistered();
      const container = leadsContainerFor({ agencyId, storage: makePluginStorage(leadsInstall.id) as never });
      [campaigns, leads] = await Promise.all([container.campaigns.list(), container.leads.list()]);
      campaignsConnected = true;
    } catch {
      campaigns = [];
      leads = [];
    }
  }
  if (marketingInstall?.enabled) {
    try {
      profiles = await makePluginStorage(marketingInstall.id).get<MarketingCustomerProfile[]>(MARKETING_CUSTOMER_PROFILES_KEY) ?? [];
      profilesConnected = true;
    } catch {
      profiles = [];
    }
  }
  return { campaignsConnected, profilesConnected, campaigns, leads, profiles };
}

function buildCampaignRows(campaigns: Campaign[], leads: Lead[], clients: ReturnType<typeof listClients>): CommandIntelligenceCampaign[] {
  return campaigns.map(campaign => {
    const attributedLeads = campaign.sourceKey ? leads.filter(lead => lead.source === campaign.sourceKey).length : 0;
    const attributedClients = campaign.sourceKey ? clients.filter(client => String(client.metadata?.leadSource ?? "") === campaign.sourceKey).length : 0;
    const steps = campaign.steps ?? [];
    return {
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel || "other",
      kind: campaign.kind || "other",
      status: campaign.status,
      budgetCents: Math.max(0, campaign.budgetCents ?? 0),
      spendCents: Math.max(0, campaign.spendCents ?? 0),
      attributedRevenueCents: Math.max(0, campaign.attributedRevenueCents ?? 0),
      attributedLeads,
      attributedClients,
      audienceProfileCount: campaign.customerProfileIds?.length ?? 0,
      completedSteps: steps.filter(step => step.status === "done").length,
      totalSteps: steps.length,
      spendPercent: campaign.budgetCents ? round((campaign.spendCents ?? 0) / campaign.budgetCents * 100, 1) : null,
      roas: campaign.spendCents ? round((campaign.attributedRevenueCents ?? 0) / campaign.spendCents, 2) : null,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      updatedAt: campaign.updatedAt,
    };
  }).sort((left, right) => activeRank(left.status) - activeRank(right.status) || right.updatedAt - left.updatedAt);
}

function makeKpi(input: KpiInput, evidence: RadarEvidenceInspectionIndex): CommandKpi {
  const { familyId, plan: planInput, history: inputHistory, ...kpi } = input;
  const series = evidence.series.find(item => item.domain === input.domain && item.familyId === familyId);
  const history = inputHistory?.length
    ? inputHistory.slice(-24)
    : series?.recentPoints.slice(-24).map(point => ({ at: point.at, value: point.value })) ?? [];
  const plan: CommandKpiPlan = {
    baselineValue: planInput?.baselineValue ?? history[0]?.value ?? input.previousValue ?? input.value,
    targetValue: planInput?.targetValue ?? null,
    direction: planInput?.direction ?? "higher",
    cadence: planInput?.cadence ?? "rolling",
    source: planInput?.source ?? "No approved planning target is connected",
  };
  return {
    ...kpi,
    history,
    plan,
    measurement: measurementFor(input.id, input.format, input.sampleSize),
    scope: { id: "ecosystem", label: "Whole Aqua ecosystem", kind: "ecosystem" },
  };
}

function revenueGrowthDisplay(value: number | null, currentRevenueCents: number, previousRevenueCents: number): string {
  if (value !== null) return `${value > 0 ? "+" : ""}${round(value, 1)}%`;
  return currentRevenueCents > 0 && previousRevenueCents === 0 ? "New revenue" : "No baseline";
}

function revenueGrowthStatus(financeConnected: boolean, value: number | null): CommandKpiStatus {
  if (!financeConnected) return "blind";
  if (value === null) return "learning";
  if (value < -10) return "critical";
  if (value < 5) return "warning";
  return "healthy";
}

function buildIntelligenceScopes(input: {
  agencyName: string;
  clients: Client[];
  tradingCompanies: TradingCompany[];
  properties: RadarTelemetryProperty[];
  brandPortfolio: BrandPortfolioSnapshot;
  now: number;
}): CommandIntelligenceScope[] {
  const ecosystem: CommandIntelligenceScope = {
    id: "ecosystem",
    label: "Whole Aqua ecosystem",
    kind: "ecosystem",
    detail: `All connected business systems and ${input.properties.length} monitored ${input.properties.length === 1 ? "property" : "properties"} combined.`,
    href: "/portal/agency",
    propertyCount: input.properties.length,
    inheritGlobalKpis: true,
    readings: [],
  };
  const agencyProperties = input.properties.filter(property => !property.clientId);
  const workspaceScope = scopeWithWebsiteReadings({
    id: "workspace",
    label: input.agencyName,
    kind: "workspace",
    detail: "The operating company and its directly owned web properties, excluding client websites.",
    href: "/portal/agency?station=battle",
    properties: agencyProperties,
    inheritGlobalKpis: true,
    now: input.now,
  });
  const companyScopes = input.tradingCompanies.map(company => {
    const properties = input.properties.filter(property => sameHost(property.publicUrl, company.website));
    const scope = scopeWithWebsiteReadings({
      id: `company:${company.id}`,
      label: company.name,
      kind: "company",
      detail: properties.length ? `Owned company with ${properties.length} matched monitored ${properties.length === 1 ? "property" : "properties"}.` : "Owned company recorded, but no monitored property or allocated financial stream is linked yet.",
      href: `/portal/agency/company?view=companies&company=${encodeURIComponent(company.id)}`,
      publicUrl: company.website,
      properties,
      inheritGlobalKpis: false,
      now: input.now,
    });
    const portfolioRow = input.brandPortfolio.rows.find(row => row.id === company.id);
    if (portfolioRow) scope.readings.push(...companyPortfolioReadings(company.id, company.name, portfolioRow, input.brandPortfolio.financeConnected, input.now));
    return scope;
  });
  const clientScopes = input.clients.filter(client => client.status !== "archived").map(client => {
    const clientLabel = clientWorkspaceDisplayName(client);
    const properties = input.properties.filter(property => property.clientId === client.id);
    const scope = scopeWithWebsiteReadings({
      id: `client:${client.id}`,
      label: clientLabel,
      kind: "client",
      detail: `${properties.length} monitored ${properties.length === 1 ? "property" : "properties"} plus this client's retained lifecycle state.`,
      href: `/portal/clients/${client.id}`,
      publicUrl: client.websiteUrl,
      properties,
      inheritGlobalKpis: false,
      now: input.now,
    });
    scope.readings.push(...clientLifecycleReadings(client, input.now));
    return scope;
  });
  const propertyScopes = input.properties.map(property => scopeWithWebsiteReadings({
    id: `property:${property.id}`,
    label: property.label,
    kind: "property",
    detail: `${property.clientName ? `${property.clientName} · ` : ""}${property.publicUrl ? safeHost(property.publicUrl) : "Monitored property"} · telemetry only.`,
    href: property.href,
    publicUrl: property.publicUrl,
    parentId: property.clientId ? `client:${property.clientId}` : "workspace",
    properties: [property],
    inheritGlobalKpis: false,
    now: input.now,
  }));
  return [ecosystem, workspaceScope, ...companyScopes, ...clientScopes, ...propertyScopes];
}

function scopeWithWebsiteReadings(input: {
  id: string;
  label: string;
  kind: CommandIntelligenceScope["kind"];
  detail: string;
  href: string;
  publicUrl?: string;
  parentId?: string;
  properties: RadarTelemetryProperty[];
  inheritGlobalKpis: boolean;
  now: number;
}): CommandIntelligenceScope {
  return {
    id: input.id,
    label: input.label,
    kind: input.kind,
    detail: input.detail,
    href: input.href,
    publicUrl: input.publicUrl,
    parentId: input.parentId,
    propertyCount: input.properties.length,
    inheritGlobalKpis: input.inheritGlobalKpis,
    readings: input.properties.length ? websiteScopeReadings(input.id, input.label, input.properties, input.now) : [],
  };
}

function websiteScopeReadings(scopeId: string, label: string, properties: RadarTelemetryProperty[], now: number): CommandScopedKpiReading[] {
  const DAY = 86_400_000;
  const current = sumNumbers(properties.map(property => property.current7d));
  const previous = sumNumbers(properties.map(property => property.previous7d));
  const forms = sumNumbers(properties.map(property => property.forms7d));
  const conversions = sumNumbers(properties.map(property => property.conversions7d));
  const previousForms = properties.flatMap(property => property.events).filter(event => event.type === "form" && event.occurredAt >= now - 14 * DAY && event.occurredAt < now - 7 * DAY).length;
  const previousConversions = properties.flatMap(property => property.events).filter(event => scopedConversion(event) && event.occurredAt >= now - 14 * DAY && event.occurredAt < now - 7 * DAY).length;
  const momentum = previous ? round((current - previous) / previous * 100, 1) : current ? 100 : 0;
  const conversionRate = current ? round(conversions / current * 100, 2) : null;
  const previousConversionRate = previous ? round(previousConversions / previous * 100, 2) : null;
  const measuredAt = newest(properties.map(property => property.lastSeenAt)) ?? now;
  const sourceId = `scope:${scopeId}`;
  const href = properties.length === 1 ? properties[0]!.href : `/portal/agency/performance?scope=${encodeURIComponent(scopeId)}`;
  const propertyEvidence = properties.map(property => property.publicUrl ? `${property.label} · ${safeHost(property.publicUrl)}` : property.label);
  const connected = properties.some(property => property.lastSeenAt);
  const trafficStatus: CommandKpiStatus = !connected ? "blind" : previous >= 5 && current <= previous * 0.5 ? current === 0 ? "critical" : "warning" : "healthy";
  const momentumStatus: CommandKpiStatus = !connected ? "blind" : momentum < -50 ? "critical" : momentum < 0 ? "warning" : "healthy";
  const formsStatus: CommandKpiStatus = !connected ? "blind" : forms ? "healthy" : "learning";
  const conversionStatus: CommandKpiStatus = !connected ? "blind" : conversionRate === null ? "learning" : conversionRate < 1 ? "critical" : "healthy";
  return [
    scopedReading("traffic-7d", current, current.toLocaleString(), trafficStatus, `${label} recorded ${current} pageviews in the current seven-day window.`, href, `${sourceId}:traffic`, measuredAt, properties.length, previous, [{ at: now - 7 * DAY, value: previous }, { at: now, value: current }], [`Scope ${label}`, `Previous 7d ${previous}`, ...propertyEvidence], { baselineValue: 0, targetValue: previous || null, direction: "higher", cadence: "weekly", source: `${label} previous seven-day baseline` }),
    scopedReading("traffic-momentum", momentum, `${momentum > 0 ? "+" : ""}${round(momentum, 1)}%`, momentumStatus, `${label} traffic compared with its own preceding seven-day window.`, href, `${sourceId}:traffic`, measuredAt, properties.length, previous ? round((previous - previous) / previous * 100, 1) : 0, [{ at: now - 7 * DAY, value: 0 }, { at: now, value: momentum }], [`Current ${current}`, `Previous ${previous}`, ...propertyEvidence], { baselineValue: -100, targetValue: 0, direction: "higher", cadence: "weekly", source: `${label} no-decline traffic guardrail` }),
    scopedReading("forms-7d", forms, forms.toLocaleString(), formsStatus, `${label} generated ${forms} tracked form submissions in seven days.`, href, `${sourceId}:forms`, measuredAt, properties.length, previousForms, [{ at: now - 7 * DAY, value: previousForms }, { at: now, value: forms }], [`Scope ${label}`, `Previous forms ${previousForms}`, ...propertyEvidence], { baselineValue: 0, targetValue: Math.max(1, previousForms), direction: "higher", cadence: "weekly", source: `${label} previous form-demand baseline` }),
    scopedReading("website-conversion", conversionRate, conversionRate === null ? "No traffic" : `${round(conversionRate, 2)}%`, conversionStatus, `${label} tracked ${conversions} conversion events from ${current} pageviews.`, href, `${sourceId}:conversion`, measuredAt, current, previousConversionRate ?? undefined, [{ at: now - 7 * DAY, value: previousConversionRate ?? 0 }, ...(conversionRate === null ? [] : [{ at: now, value: conversionRate }])], [`${conversions} conversions`, `${current} pageviews`, ...propertyEvidence], { baselineValue: 0, targetValue: 1, direction: "higher", cadence: "weekly", source: `${label} website conversion guardrail` }),
  ];
}

function clientLifecycleReadings(client: Client, now: number): CommandScopedKpiReading[] {
  const clientLabel = clientWorkspaceDisplayName(client);
  const active = client.status === "active" && client.stage !== "churned";
  const retention = client.stage === "churned" ? 0 : active ? 100 : null;
  return [
    scopedReading("active-clients", active ? 1 : 0, active ? "1 active" : "Not active", active ? "healthy" : "warning", `${clientLabel}'s current relationship state.`, clientWorkspaceHref(client.id, "overview"), `client:${client.id}:lifecycle`, client.updatedAt, 1, undefined, [{ at: client.updatedAt, value: active ? 1 : 0 }], [`Status ${client.status}`, `Stage ${client.stage}`], { baselineValue: 0, targetValue: 1, direction: "higher", cadence: "monthly", source: `${clientLabel} relationship state` }),
    scopedReading("retention", retention, retention === null ? "Unknown" : `${retention}%`, retention === null ? "learning" : retention ? "healthy" : "critical", `${clientLabel}'s retained or churned lifecycle outcome.`, clientWorkspaceHref(client.id, "relationship"), `client:${client.id}:lifecycle`, client.updatedAt, 1, undefined, retention === null ? [] : [{ at: now, value: retention }], [`Status ${client.status}`, `Stage ${client.stage}`], { baselineValue: 0, targetValue: 100, direction: "higher", cadence: "rolling", source: `${clientLabel} retention state` }),
  ];
}

function scopedReading(kpiId: string, value: number | null, display: string, status: CommandKpiStatus, detail: string, href: string, sourceId: string, measuredAt: number, sampleSize: number, previousValue: number | undefined, history: CommandScopedKpiReading["history"], evidence: string[], plan: CommandScopedKpiReading["plan"]): CommandScopedKpiReading {
  const format = kpiFormatFor(kpiId);
  return { kpiId, value, display, status, detail, href, sourceId, measuredAt, sampleSize, previousValue, history, evidence, plan, measurement: measurementFor(kpiId, format, sampleSize) };
}

function companyPortfolioReadings(companyId: string, label: string, row: BrandPortfolioRow, financeConnected: boolean, now: number): CommandScopedKpiReading[] {
  const targetCents = row.monthlyRevenueTargetCents;
  const href = `/portal/agency?station=battle&scope=${encodeURIComponent(`company:${companyId}`)}`;
  const revenuePercent = targetCents > 0 ? round(row.monthRevenueCents / targetCents * 100, 1) : null;
  const revenueGap = Math.max(0, targetCents - row.monthRevenueCents);
  const conversion = row.leadCount ? round(row.convertedLeadCount / row.leadCount * 100, 1) : null;
  const retentionDenominator = row.activeClients + row.churnedClients;
  const retention = retentionDenominator ? round(row.activeClients / retentionDenominator * 100, 1) : null;
  const financeStatus: CommandKpiStatus = !financeConnected ? "blind" : row.revenueRecordCount || row.mrrCents ? "healthy" : "learning";
  const previousGrowth = row.monthlyRevenueGrowthPercent ?? undefined;
  const commonEvidence = [`Scope ${label}`, ...row.evidence];
  return [
    scopedReading("revenue-target", revenuePercent, revenuePercent === null ? "No target" : `${round(revenuePercent, 0)}%`, !financeConnected ? "blind" : revenuePercent === null ? "learning" : revenuePercent < 50 ? "critical" : revenuePercent < 80 ? "warning" : "healthy", `${label} recorded ${money(row.monthRevenueCents, row.currency)} against its own ${money(targetCents, row.currency)} monthly target.`, href, `company:${companyId}:finance`, now, row.revenueRecordCount, undefined, [{ at: now, value: revenuePercent ?? 0 }], commonEvidence, { baselineValue: 0, targetValue: 100, direction: "higher", cadence: "monthly", source: `${label} monthly revenue target` }),
    scopedReading("mrr", row.mrrCents, money(row.mrrCents, row.currency), financeStatus, `${label} recurring plan value from clients allocated to this company.`, href, `company:${companyId}:plans`, now, row.activeClients, undefined, [{ at: now, value: row.mrrCents }], commonEvidence, { baselineValue: 0, targetValue: targetCents, direction: "higher", cadence: "monthly", source: `${label} recurring plans` }),
    scopedReading("revenue-gap", revenueGap, money(revenueGap, row.currency), financeConnected ? revenueGap ? "warning" : "healthy" : "blind", `${label} income still required to meet its own approved monthly target.`, href, `company:${companyId}:finance`, now, row.revenueRecordCount, undefined, [{ at: now, value: revenueGap }], commonEvidence, { baselineValue: targetCents, targetValue: 0, direction: "lower", cadence: "monthly", source: `${label} monthly revenue target` }),
    scopedReading("revenue-growth", row.monthlyRevenueGrowthPercent, revenueGrowthDisplay(row.monthlyRevenueGrowthPercent, row.monthRevenueCents, row.previousMonthRevenueCents), revenueGrowthStatus(financeConnected, row.monthlyRevenueGrowthPercent), `${label} current-month paid income compared with its own preceding calendar month.`, href, `company:${companyId}:finance`, now, row.revenueRecordCount, previousGrowth, [{ at: now - 30 * 86_400_000, value: row.previousMonthRevenueCents }, { at: now, value: row.monthRevenueCents }], [...commonEvidence, `Previous month ${money(row.previousMonthRevenueCents, row.currency)}`], { baselineValue: 0, targetValue: 5, direction: "higher", cadence: "monthly", source: `${label} positive-growth guardrail` }),
    scopedReading("recent-leads", row.recentLeadCount, row.recentLeadCount.toLocaleString(), row.recentLeadCount ? "healthy" : "learning", `${row.recentLeadCount} leads were captured for ${label} in the trailing 30 days.`, "/portal/clients?view=journey", `company:${companyId}:leads`, now, row.recentLeadCount, undefined, [{ at: now, value: row.recentLeadCount }], commonEvidence, { baselineValue: 0, targetValue: null, direction: "higher", cadence: "monthly", source: `Awaiting ${label} lead-volume target` }),
    scopedReading("lead-conversion", conversion, percentDisplay(conversion), conversion === null ? "learning" : conversion < 10 ? "critical" : conversion < 20 ? "warning" : "healthy", `${label} leads with a recorded client conversion.`, "/portal/clients?view=journey", `company:${companyId}:leads`, now, row.leadCount, undefined, conversion === null ? [] : [{ at: now, value: conversion }], [...commonEvidence, `${row.convertedLeadCount}/${row.leadCount} converted`], { baselineValue: 0, targetValue: 20, direction: "higher", cadence: "rolling", source: `${label} conversion guardrail` }),
    scopedReading("active-clients", row.activeClients, row.activeClients.toLocaleString(), row.activeClients ? "healthy" : "learning", `${label} active client relationships excluding churned and archived records.`, "/portal/clients", `company:${companyId}:clients`, now, row.totalClients, undefined, [{ at: now, value: row.activeClients }], commonEvidence, { baselineValue: row.activeClients, targetValue: null, direction: "higher", cadence: "monthly", source: `Awaiting ${label} capacity target` }),
    scopedReading("retention", retention, percentDisplay(retention), retention === null ? "learning" : retention < 80 ? "warning" : "healthy", `${label} active clients divided by active plus recorded churned relationships.`, "/portal/clients?view=health", `company:${companyId}:clients`, now, retentionDenominator, undefined, retention === null ? [] : [{ at: now, value: retention }], [...commonEvidence, `${row.churnedClients} churned`], { baselineValue: 0, targetValue: 80, direction: "higher", cadence: "rolling", source: `${label} retention guardrail` }),
    scopedReading("client-attention", row.clientsNeedingAttention, row.clientsNeedingAttention.toLocaleString(), row.clientsNeedingAttention ? "warning" : row.activeClients ? "healthy" : "learning", `${label} clients with ownership, contact, request, milestone or telemetry concerns.`, "/portal/clients?view=health", `company:${companyId}:clients`, now, row.activeClients, undefined, [{ at: now, value: row.clientsNeedingAttention }], commonEvidence, { baselineValue: row.clientsNeedingAttention, targetValue: 0, direction: "lower", cadence: "daily", source: `${label} client health guardrail` }),
  ];
}

function kpiFormatFor(kpiId: string): CommandKpiFormat {
  if (["revenue-target", "lead-conversion", "speed-to-lead", "source-attribution", "campaign-outcomes", "revenue-growth", "website-conversion", "audience-confidence", "retention", "traffic-momentum"].includes(kpiId)) return "percent";
  if (["mrr", "revenue-gap", "marketing-spend"].includes(kpiId)) return "currency";
  if (kpiId === "business-health") return "score";
  return "number";
}

function measurementFor(kpiId: string, format: CommandKpiFormat, sampleSize?: number): CommandKpiMeasurement {
  const exact: Record<string, CommandKpiMeasurement> = {
    "business-health": { unit: "weighted index points", basis: "100-point Aqua health index", window: "latest Radar sweep", formula: "35% income + 25% client health + 25% pipeline sufficiency + 15% task control" },
    "revenue-target": { unit: "percent of target", basis: "paid income / approved monthly revenue target", window: "current calendar month", formula: "recorded paid income divided by the selected scope's monthly target x 100" },
    mrr: { unit: "currency per month", basis: "active recurring plans", window: "current plan assignments", formula: "sum of active plan monthly value for allocated clients" },
    "revenue-gap": { unit: "currency", basis: "approved monthly revenue target", window: "current calendar month", formula: "maximum of zero and target less recorded paid income" },
    "recent-leads": { unit: "lead records", basis: "retained CRM leads", window: "rolling 30 days", formula: "count of leads captured inside the evaluation window" },
    "lead-conversion": { unit: "percent of leads", basis: "retained leads with a known outcome", window: "retained lifecycle history", formula: "converted lead records divided by all retained lead records x 100" },
    "speed-to-lead": { unit: "percent of measurable enquiries", basis: "enquiries with a first-response clock", window: "current retained enquiry set", formula: "responses inside the configured SLA divided by measurable enquiry responses x 100" },
    "source-attribution": { unit: "percent of leads", basis: "retained lead records", window: "retained lifecycle history", formula: "leads with a usable original source divided by retained leads x 100" },
    "active-campaigns": { unit: "campaign records", basis: "active, scheduled or sending campaigns", window: "current campaign state", formula: "count of campaigns in an operating state" },
    "campaign-outcomes": { unit: "percent of launched campaigns", basis: "non-draft campaigns", window: "retained campaign history", formula: "launched campaigns with a source, lead or revenue path divided by launched campaigns x 100" },
    "marketing-spend": { unit: "currency", basis: "campaign spend records", window: "current workspace records", formula: "sum of recorded campaign spend" },
    "campaign-roas": { unit: "revenue multiple", basis: "campaigns with recorded spend", window: "retained campaign records", formula: "attributed campaign revenue divided by recorded campaign spend" },
    "traffic-7d": { unit: "pageviews", basis: "selected monitored web properties", window: "rolling 7 days", formula: "count of Aqua Tag pageview events across the selected scope" },
    "traffic-momentum": { unit: "percent change", basis: "selected monitored web properties", window: "current 7 days versus preceding 7 days", formula: "(current pageviews - previous pageviews) divided by previous pageviews x 100" },
    "revenue-growth": { unit: "percent change", basis: "paid income in the selected scope", window: "current month versus preceding month", formula: "(current paid income - previous paid income) divided by previous paid income x 100" },
    "forms-7d": { unit: "form submissions", basis: "selected monitored web properties", window: "rolling 7 days", formula: "count of tracked form events" },
    "website-conversion": { unit: "percent of pageviews", basis: "selected monitored web properties", window: "rolling 7 days", formula: "tracked conversion events divided by tracked pageviews x 100" },
    "audience-confidence": { unit: "percent of active profiles", basis: "active customer profiles", window: "current profile state", formula: "validated active profiles divided by active profiles x 100" },
    "active-clients": { unit: "client accounts", basis: "allocated client records", window: "current relationship state", formula: "active clients excluding churned and archived records" },
    retention: { unit: "percent of known client outcomes", basis: "active plus churned client relationships", window: "retained lifecycle history", formula: "active clients divided by active plus churned clients x 100" },
    "client-attention": { unit: "client accounts", basis: "active client records", window: "latest health evaluation", formula: "count with an ownership, contact, request, milestone or telemetry concern" },
  };
  return exact[kpiId] ?? {
    unit: format === "currency" ? "currency" : format === "percent" ? "percent" : format === "duration" ? "elapsed time" : format === "score" ? "index points" : "records",
    basis: sampleSize === undefined ? "connected source records" : `${sampleSize.toLocaleString()} supplied samples`,
    window: "latest connected evidence",
    formula: "See the evidence and source rows for this instrument's retained calculation inputs",
  };
}

function scopedConversion(event: RadarTelemetryProperty["events"][number]): boolean {
  return event.type === "conversion" || event.type === "form" || (event.type === "interaction" && event.metric === "conversion");
}

function sameHost(left?: string, right?: string): boolean {
  const leftHost = safeHost(left);
  const rightHost = safeHost(right);
  return Boolean(leftHost && rightHost && (leftHost === rightHost || leftHost.replace(/^www\./, "") === rightHost.replace(/^www\./, "")));
}

function safeHost(value?: string): string {
  if (!value) return "";
  try { return new URL(value).hostname; } catch { return value.replace(/^https?:\/\//, "").split("/")[0] ?? ""; }
}

function sumNumbers(values: number[]): number { return values.reduce((sum, value) => sum + value, 0); }

function findCheck(radar: BusinessIssueRadar, domain: AdvisorDomain, familyId: string): BusinessRadarCheck | undefined {
  const matches = radar.checks.filter(check => check.domain === domain && check.familyId === familyId);
  return matches.find(check => check.scope === "kpi" && check.lens === "threshold")
    ?? matches.find(check => check.scope === "kpi")
    ?? matches[0];
}

function checkValue(radar: BusinessIssueRadar, domain: AdvisorDomain, familyId: string): number | null {
  const value = findCheck(radar, domain, familyId)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Statuses where the check actually assessed something. `blind` (no data
 * source), `learning` (not enough evidence yet) and `inactive` (not applicable)
 * all still emit `value: 0` from the Radar, so an untracked agency reports zero
 * pageviews exactly like a tracked-but-quiet one. Only a lens whose own status
 * is one of these may supply a reading — the same convention
 * `marketingIntelligence.ts` already applies to its own surface.
 */
const ASSESSED_CHECK_STATUSES: readonly RadarCheckStatus[] = ["pass", "critical", "warning", "watch"];

function checkMeasured(radar: BusinessIssueRadar, domain: AdvisorDomain, familyId: string): boolean {
  const check = findCheck(radar, domain, familyId);
  if (!check || !ASSESSED_CHECK_STATUSES.includes(check.status)) return false;
  return typeof check.value === "number" && Number.isFinite(check.value);
}

/** A check's value ONLY when the check actually assessed something — `null` otherwise, never a fabricated 0. */
function measuredCheckValue(radar: BusinessIssueRadar, domain: AdvisorDomain, familyId: string): number | null {
  return checkMeasured(radar, domain, familyId) ? checkValue(radar, domain, familyId) : null;
}

function statusFromCheck(check: BusinessRadarCheck | undefined): CommandKpiStatus {
  if (!check) return "blind";
  return radarStatus(check.status);
}

function radarStatus(status: RadarCheckStatus): CommandKpiStatus {
  if (status === "pass") return "healthy";
  if (status === "critical") return "critical";
  if (status === "warning" || status === "watch") return "warning";
  if (status === "blind" || status === "inactive") return "blind";
  return "learning";
}

function speedStatus(status: BusinessIssueRadar["speedToLead"]["status"], sample: number): CommandKpiStatus {
  if (!sample || status === "unknown") return "learning";
  if (status === "critical") return "critical";
  if (status === "warning") return "warning";
  return "healthy";
}

function scoreStatus(value: number): CommandKpiStatus {
  if (value < 40) return "critical";
  if (value < 70) return "warning";
  return "healthy";
}

function buildAudienceLocations(profiles: MarketingCustomerProfile[]): CommandAudienceLocation[] {
  const rows = new Map<string, CommandAudienceLocation>();
  for (const profile of profiles.filter(item => item.status !== "archived")) {
    for (const location of profile.locations) {
      const label = location.trim();
      if (!label) continue;
      const id = label.toLowerCase();
      const existing = rows.get(id);
      if (existing) {
        existing.count += 1;
        if (!existing.profileNames.includes(profile.name)) existing.profileNames.push(profile.name);
        continue;
      }
      const point = locationPoint(label);
      rows.set(id, { id, label, count: 1, profileNames: [profile.name], x: point?.x ?? null, y: point?.y ?? null, mapped: Boolean(point) });
    }
  }
  return [...rows.values()].sort((left, right) => Number(right.mapped) - Number(left.mapped) || right.count - left.count || left.label.localeCompare(right.label));
}

function buildAudienceSignals(profiles: MarketingCustomerProfile[]): CommandAudienceSignal[] {
  const signals = new Map<string, CommandAudienceSignal>();
  const collect = (profile: MarketingCustomerProfile, category: CommandAudienceSignal["category"], values: string[]) => {
    for (const source of values) {
      const label = source.trim();
      if (!label) continue;
      const id = `${category}:${label.toLowerCase()}`;
      const existing = signals.get(id);
      if (existing) {
        existing.count += 1;
        if (!existing.profileNames.includes(profile.name)) existing.profileNames.push(profile.name);
      } else {
        signals.set(id, { id, label, category, count: 1, profileNames: [profile.name] });
      }
    }
  };
  for (const profile of profiles.filter(item => item.status !== "archived")) {
    collect(profile, "industry", profile.industries);
    collect(profile, "goal", profile.goals);
    collect(profile, "motivation", profile.motivations);
    collect(profile, "channel", profile.preferredChannels);
    collect(profile, "content", profile.contentPreferences);
    collect(profile, "pain", profile.painPoints);
  }
  return [...signals.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)).slice(0, 40);
}

function buildAudienceDemographics(profiles: MarketingCustomerProfile[]): CommandAudienceDemographic[] {
  const rows = new Map<string, CommandAudienceDemographic>();
  const collect = (profile: MarketingCustomerProfile, category: CommandAudienceDemographic["category"], values: Array<string | undefined>) => {
    for (const source of values) {
      const label = source?.trim();
      if (!label) continue;
      const id = `${category}:${label.toLowerCase()}`;
      const existing = rows.get(id);
      if (existing) {
        existing.count += 1;
        if (!existing.profileNames.includes(profile.name)) existing.profileNames.push(profile.name);
      } else {
        rows.set(id, { id, label, category, count: 1, profileNames: [profile.name] });
      }
    }
  };
  for (const profile of profiles.filter(item => item.status !== "archived")) {
    collect(profile, "age", [profile.ageRange]);
    collect(profile, "language", profile.languages);
    collect(profile, "life-stage", [profile.lifeStage]);
    collect(profile, "income", [profile.incomeRange]);
    collect(profile, "company-size", [profile.companySize]);
    collect(profile, "business-stage", [profile.businessStage]);
    collect(profile, "job-role", profile.jobTitles);
    collect(profile, "decision-role", profile.decisionRoles);
  }
  return [...rows.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)).slice(0, 48);
}

function locationPoint(value: string): { x: number; y: number } | null {
  const location = value.toLowerCase();
  const points: Array<[RegExp, number, number]> = [
    [/london/, 49.5, 28], [/suffolk|ipswich|east anglia|trimley/, 51, 27], [/manchester/, 47, 24], [/birmingham|west midlands/, 48, 26], [/bristol/, 46, 28], [/cardiff|wales/, 45, 28], [/edinburgh/, 47, 18], [/glasgow/, 45, 18], [/belfast|northern ireland/, 43, 21], [/leeds|yorkshire/, 49, 22], [/newcastle|north east/, 49, 20], [/liverpool/, 45, 23], [/nottingham|derby/, 49, 25], [/england|united kingdom|\buk\b|britain/, 48, 25],
    [/france|paris/, 49, 34], [/spain|portugal/, 45, 39], [/germany|netherlands|belgium/, 52, 31], [/italy/, 53, 38], [/europe/, 53, 31], [/united states|\busa\b|america/, 24, 35], [/canada/, 23, 23], [/mexico/, 22, 48], [/brazil/, 35, 67], [/south america/, 32, 66], [/south africa/, 56, 77], [/nigeria|ghana|west africa/, 51, 59], [/kenya|east africa/, 59, 62], [/india/, 71, 50], [/china/, 80, 42], [/japan/, 89, 42], [/singapore/, 79, 62], [/australia/, 86, 74], [/new zealand/, 95, 79], [/middle east|dubai|uae/, 64, 48], [/asia/, 78, 48], [/africa/, 55, 60],
  ];
  const match = points.find(([pattern]) => pattern.test(location));
  return match ? { x: match[1], y: match[2] } : null;
}

function activeRank(status: string): number {
  if (["active", "sending"].includes(status)) return 0;
  if (status === "scheduled") return 1;
  if (status === "draft") return 2;
  return 3;
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round(numerator / denominator * 100, 1) : null;
}

function percentDisplay(value: number | null): string {
  return value === null ? "Learning" : `${round(value, value % 1 ? 1 : 0)}%`;
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
}

function duration(milliseconds: number | null): string {
  if (milliseconds === null) return "No sample";
  if (milliseconds < 60_000) return `${Math.max(1, Math.round(milliseconds / 1_000))}s`;
  if (milliseconds < 3_600_000) return `${Math.round(milliseconds / 60_000)}m`;
  if (milliseconds < DAY) return `${Math.round(milliseconds / 3_600_000)}h`;
  return `${Math.floor(milliseconds / DAY)}d ${Math.round(milliseconds % DAY / 3_600_000)}h`;
}

function newest(values: Array<number | undefined>): number | undefined {
  const available = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return available.length ? Math.max(...available) : undefined;
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
