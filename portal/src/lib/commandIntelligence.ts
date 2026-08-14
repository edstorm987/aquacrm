import type { AdvisorDomain } from "@/lib/businessRadar";

export type CommandKpiStatus = "critical" | "warning" | "healthy" | "learning" | "blind";
export type CommandKpiFormat = "number" | "percent" | "currency" | "duration" | "score";

export const COMMAND_PRIMARY_KPI_STATIONS = [
  { id: "growth", label: "Growth", kpiId: "revenue-growth", openIds: ["revenue-growth", "mrr", "retention"] },
  { id: "acquisition", label: "Acquisition", kpiId: "traffic-7d", openIds: ["traffic-7d", "forms-7d", "website-conversion", "lead-conversion", "source-attribution"] },
  { id: "finance", label: "Finance", kpiId: "revenue-target", openIds: ["revenue-target", "mrr", "revenue-gap", "marketing-spend", "campaign-roas"] },
  { id: "systems", label: "Systems", kpiId: "business-health", openIds: ["business-health"] },
  { id: "operations", label: "Operations", kpiId: "client-attention", openIds: ["client-attention", "active-clients", "speed-to-lead"] },
] as const;

export interface CommandKpiPoint {
  at: number;
  value: number;
}

export type CommandKpiTargetDirection = "higher" | "lower";
export type CommandKpiPlanningCadence = "daily" | "weekly" | "monthly" | "quarterly" | "rolling" | "guardrail";

export interface CommandKpiPlan {
  baselineValue: number | null;
  targetValue: number | null;
  direction: CommandKpiTargetDirection;
  cadence: CommandKpiPlanningCadence;
  source: string;
}

export interface CommandKpiMeasurement {
  unit: string;
  basis: string;
  window: string;
  formula: string;
}

export type CommandKpiScopeKind = "ecosystem" | "workspace" | "company" | "client" | "property";

export interface CommandKpiScopeRef {
  id: string;
  label: string;
  kind: CommandKpiScopeKind;
}

export interface CommandKpi {
  id: string;
  rank: number;
  label: string;
  shortLabel: string;
  domain: AdvisorDomain;
  value: number | null;
  display: string;
  format: CommandKpiFormat;
  status: CommandKpiStatus;
  target: string;
  detail: string;
  href: string;
  sourceId: string;
  measuredAt: number;
  sampleSize?: number;
  previousValue?: number;
  history: CommandKpiPoint[];
  evidence: string[];
  plan: CommandKpiPlan;
  measurement: CommandKpiMeasurement;
  scope: CommandKpiScopeRef;
}

export interface CommandScopedKpiReading {
  kpiId: string;
  value: number | null;
  display: string;
  status: CommandKpiStatus;
  detail: string;
  href: string;
  sourceId: string;
  measuredAt: number;
  sampleSize?: number;
  previousValue?: number;
  history: CommandKpiPoint[];
  evidence: string[];
  plan: CommandKpiPlan;
  measurement: CommandKpiMeasurement;
}

export interface CommandIntelligenceScope extends CommandKpiScopeRef {
  detail: string;
  href: string;
  publicUrl?: string;
  parentId?: string;
  propertyCount: number;
  inheritGlobalKpis: boolean;
  readings: CommandScopedKpiReading[];
}

export interface CommandIntelligenceCampaign {
  id: string;
  name: string;
  channel: string;
  kind: string;
  status: string;
  budgetCents: number;
  spendCents: number;
  attributedRevenueCents: number;
  attributedLeads: number;
  attributedClients: number;
  audienceProfileCount: number;
  completedSteps: number;
  totalSteps: number;
  spendPercent: number | null;
  roas: number | null;
  startsAt?: number;
  endsAt?: number;
  updatedAt: number;
}

export interface CommandAudienceLocation {
  id: string;
  label: string;
  count: number;
  profileNames: string[];
  x: number | null;
  y: number | null;
  mapped: boolean;
}

export interface CommandAudienceSignal {
  id: string;
  label: string;
  category: "industry" | "goal" | "motivation" | "channel" | "content" | "pain";
  count: number;
  profileNames: string[];
}

export interface CommandAudienceDemographic {
  id: string;
  label: string;
  category: "age" | "language" | "life-stage" | "income" | "company-size" | "business-stage" | "job-role" | "decision-role";
  count: number;
  profileNames: string[];
}

export interface CommandAudienceProfileSummary {
  id: string;
  name: string;
  segment: string;
  status: string;
  priority: string;
  confidence: string;
  audienceType: string;
  estimatedAudienceSize?: number;
  ageRange?: string;
  languages: string[];
  genderNotes?: string;
  incomeRange?: string;
  lifeStage?: string;
  locations: string[];
  industries: string[];
  companySize?: string;
  businessStage?: string;
  jobTitles: string[];
  decisionRoles: string[];
  goals: string[];
  painPoints: string[];
  motivations: string[];
  objections: string[];
  buyingTriggers: string[];
  preferredChannels: string[];
  contentPreferences: string[];
  offerFit?: string;
  typicalBudget?: string;
  buyingCycle?: string;
  researchNotes?: string;
  topSignals: string[];
  updatedAt: number;
}

export interface CommandSourceCohort {
  id: string;
  label: string;
  leads: number;
  converted: number;
  conversionRatePercent: number | null;
  clients: number;
  churnRatePercent: number | null;
  ready: boolean;
}

export interface CommandDemandFlow {
  pageviews: number;
  forms: number;
  leads: number;
  convertedLeads: number;
  activeClients: number;
}

export type CommercialMetricCategory = "outcome" | "driver" | "efficiency" | "quality";
export type CommercialMetricUnit = "count" | "percent" | "currency" | "duration" | "ratio";
export type CommercialRecordState = "new" | "contacted" | "meeting" | "proposal" | "won" | "lost" | "client" | "churned";

export interface CommercialFormulaMetric {
  id: string;
  label: string;
  category: CommercialMetricCategory;
  unit: CommercialMetricUnit;
  value: number | null;
  display: string;
  formula: string;
  numerator?: number;
  denominator?: number;
  target: string;
  status: CommandKpiStatus;
  source: string;
  detail: string;
  href: string;
  evidence: string[];
}

export interface CommercialPipelineStage {
  id: string;
  label: string;
  order: number;
  leadCount: number;
  sharePercent: number | null;
  conversionToNextPercent: number | null;
  medianAgeMs: number | null;
  staleCount: number;
  recordIds: string[];
}

export interface CommercialPersonRow {
  id: string;
  kind: "lead" | "client";
  name: string;
  email: string;
  company: string;
  source: string;
  campaignId?: string;
  campaignName?: string;
  stageId: string;
  stageLabel: string;
  state: CommercialRecordState;
  capturedAt: number;
  stageEnteredAt?: number;
  firstContactedAt?: number;
  convertedAt?: number;
  clientId?: string;
  clientStatus?: string;
  responseMs: number | null;
  ageMs: number;
  timeToConversionMs: number | null;
  enquiryCount: number;
  touchCount: number;
  meetingScheduled: boolean;
  tags: string[];
  href: string;
}

export interface CommercialSourcePerformance {
  id: string;
  label: string;
  campaignId?: string;
  campaignName?: string;
  channel?: string;
  leads: number;
  open: number;
  won: number;
  lost: number;
  clients: number;
  activeClients: number;
  churnedClients: number;
  conversionRatePercent: number | null;
  decisionWinRatePercent: number | null;
  retentionRatePercent: number | null;
  medianResponseMs: number | null;
  medianConversionMs: number | null;
  spendCents: number;
  revenueCents: number;
  costPerLeadCents: number | null;
  acquisitionCostCents: number | null;
  roas: number | null;
  href: string;
}

export interface CommercialIntelligenceSnapshot {
  generatedAt: number;
  formulas: CommercialFormulaMetric[];
  stages: CommercialPipelineStage[];
  people: CommercialPersonRow[];
  sources: CommercialSourcePerformance[];
  lineage: {
    pageviews: number;
    forms: number;
    leads: number;
    contacted: number;
    meetings: number;
    proposals: number;
    won: number;
    activeClients: number;
    churnedClients: number;
  };
  quality: {
    sourceCoveragePercent: number | null;
    campaignCoveragePercent: number | null;
    stageCoveragePercent: number | null;
    conversionLinkCoveragePercent: number | null;
    contactabilityPercent: number | null;
    exactRecords: number;
    missingSource: number;
    missingStage: number;
    missingClientLink: number;
  };
}

export interface CommandIntelligenceSnapshot {
  generatedAt: number;
  currency: string;
  kpis: CommandKpi[];
  scopes: CommandIntelligenceScope[];
  campaigns: CommandIntelligenceCampaign[];
  audienceProfiles: CommandAudienceProfileSummary[];
  audienceLocations: CommandAudienceLocation[];
  audienceSignals: CommandAudienceSignal[];
  audienceDemographics: CommandAudienceDemographic[];
  sourceCohorts: CommandSourceCohort[];
  demandFlow: CommandDemandFlow;
  commercialIntelligence: CommercialIntelligenceSnapshot;
  summary: {
    connectedKpis: number;
    learningKpis: number;
    blindKpis: number;
    criticalKpis: number;
    warningKpis: number;
    activeCampaigns: number;
    campaignSpendCents: number;
    campaignRevenueCents: number;
    portfolioRoas: number | null;
    audienceProfiles: number;
    validatedProfiles: number;
    mappedLocations: number;
    unmappedLocations: number;
  };
}
