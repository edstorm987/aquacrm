export type ClientMarketingServiceStatus = "setup" | "active" | "paused" | "complete";
export type ClientMarketingApproval = "not-required" | "pending" | "approved" | "changes-requested";
export type ClientMarketingContentStatus = "idea" | "draft" | "review" | "approved" | "scheduled" | "published";
export type ClientMarketingCampaignStatus = "draft" | "review" | "scheduled" | "active" | "paused" | "complete";

export interface ClientSocialProfile {
  id: string;
  platform: string;
  handle: string;
  url?: string;
  owner?: string;
  status: "planned" | "connected" | "attention" | "archived";
}

export interface ClientMarketingContentItem {
  id: string;
  title: string;
  platform: string;
  format: string;
  status: ClientMarketingContentStatus;
  approval: ClientMarketingApproval;
  scheduledAt?: number;
  publishedUrl?: string;
  notes?: string;
  clientFeedback?: string;
  updatedAt: number;
}

export interface ClientPaidCampaign {
  id: string;
  name: string;
  platform: string;
  objective: string;
  status: ClientMarketingCampaignStatus;
  approval: ClientMarketingApproval;
  budgetCents: number;
  spendCents: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenueCents: number;
  startsAt?: number;
  endsAt?: number;
  notes?: string;
  clientFeedback?: string;
  updatedAt: number;
}

export interface ClientMarketingService {
  enabled: boolean;
  status: ClientMarketingServiceStatus;
  currency: "gbp" | "usd" | "eur";
  monthlyBudgetCents: number;
  primaryGoal?: string;
  audience?: string;
  approvalRequired: boolean;
  reportingCadence: "weekly" | "fortnightly" | "monthly";
  profiles: ClientSocialProfile[];
  content: ClientMarketingContentItem[];
  campaigns: ClientPaidCampaign[];
  updatedAt?: number;
}

export const EMPTY_CLIENT_MARKETING_SERVICE: ClientMarketingService = {
  enabled: false,
  status: "setup",
  currency: "gbp",
  monthlyBudgetCents: 0,
  approvalRequired: true,
  reportingCadence: "monthly",
  profiles: [],
  content: [],
  campaigns: [],
};

const serviceStatuses = new Set<ClientMarketingServiceStatus>(["setup", "active", "paused", "complete"]);
const approvals = new Set<ClientMarketingApproval>(["not-required", "pending", "approved", "changes-requested"]);
const contentStatuses = new Set<ClientMarketingContentStatus>(["idea", "draft", "review", "approved", "scheduled", "published"]);
const campaignStatuses = new Set<ClientMarketingCampaignStatus>(["draft", "review", "scheduled", "active", "paused", "complete"]);
const currencies = new Set<ClientMarketingService["currency"]>(["gbp", "usd", "eur"]);
const cadences = new Set<ClientMarketingService["reportingCadence"]>(["weekly", "fortnightly", "monthly"]);

function text(value: unknown, max = 500): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function timestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

export function cleanClientMarketingService(value: unknown): ClientMarketingService {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_CLIENT_MARKETING_SERVICE };
  const source = value as Record<string, unknown>;
  const profiles = Array.isArray(source.profiles) ? source.profiles.flatMap((entry, index): ClientSocialProfile[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const platform = text(row.platform, 80);
    const handle = text(row.handle, 160);
    if (!platform || !handle) return [];
    const status = row.status === "connected" || row.status === "attention" || row.status === "archived" ? row.status : "planned";
    return [{
      id: text(row.id, 100) ?? `profile_${index + 1}`,
      platform,
      handle,
      url: text(row.url, 500),
      owner: text(row.owner, 120),
      status,
    }];
  }).slice(0, 100) : [];

  const content = Array.isArray(source.content) ? source.content.flatMap((entry, index): ClientMarketingContentItem[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const title = text(row.title, 180);
    if (!title) return [];
    return [{
      id: text(row.id, 100) ?? `content_${index + 1}`,
      title,
      platform: text(row.platform, 80) ?? "Social",
      format: text(row.format, 80) ?? "Post",
      status: contentStatuses.has(row.status as ClientMarketingContentStatus) ? row.status as ClientMarketingContentStatus : "idea",
      approval: approvals.has(row.approval as ClientMarketingApproval) ? row.approval as ClientMarketingApproval : "pending",
      scheduledAt: timestamp(row.scheduledAt),
      publishedUrl: text(row.publishedUrl, 500),
      notes: text(row.notes, 4_000),
      clientFeedback: text(row.clientFeedback, 2_000),
      updatedAt: timestamp(row.updatedAt) ?? Date.now(),
    }];
  }).slice(0, 500) : [];

  const campaigns = Array.isArray(source.campaigns) ? source.campaigns.flatMap((entry, index): ClientPaidCampaign[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const name = text(row.name, 180);
    if (!name) return [];
    return [{
      id: text(row.id, 100) ?? `campaign_${index + 1}`,
      name,
      platform: text(row.platform, 80) ?? "Meta Ads",
      objective: text(row.objective, 240) ?? "Generate qualified demand",
      status: campaignStatuses.has(row.status as ClientMarketingCampaignStatus) ? row.status as ClientMarketingCampaignStatus : "draft",
      approval: approvals.has(row.approval as ClientMarketingApproval) ? row.approval as ClientMarketingApproval : "pending",
      budgetCents: count(row.budgetCents),
      spendCents: count(row.spendCents),
      impressions: count(row.impressions),
      clicks: count(row.clicks),
      leads: count(row.leads),
      conversions: count(row.conversions),
      revenueCents: count(row.revenueCents),
      startsAt: timestamp(row.startsAt),
      endsAt: timestamp(row.endsAt),
      notes: text(row.notes, 4_000),
      clientFeedback: text(row.clientFeedback, 2_000),
      updatedAt: timestamp(row.updatedAt) ?? Date.now(),
    }];
  }).slice(0, 250) : [];

  return {
    enabled: source.enabled === true,
    status: serviceStatuses.has(source.status as ClientMarketingServiceStatus) ? source.status as ClientMarketingServiceStatus : "setup",
    currency: currencies.has(source.currency as ClientMarketingService["currency"]) ? source.currency as ClientMarketingService["currency"] : "gbp",
    monthlyBudgetCents: count(source.monthlyBudgetCents),
    primaryGoal: text(source.primaryGoal, 500),
    audience: text(source.audience, 1_000),
    approvalRequired: source.approvalRequired !== false,
    reportingCadence: cadences.has(source.reportingCadence as ClientMarketingService["reportingCadence"]) ? source.reportingCadence as ClientMarketingService["reportingCadence"] : "monthly",
    profiles,
    content,
    campaigns,
    updatedAt: timestamp(source.updatedAt),
  };
}

export function clientMarketingMetrics(service: ClientMarketingService) {
  const activeCampaigns = service.campaigns.filter(campaign => campaign.status === "active");
  const spendCents = service.campaigns.reduce((sum, campaign) => sum + campaign.spendCents, 0);
  const revenueCents = service.campaigns.reduce((sum, campaign) => sum + campaign.revenueCents, 0);
  const impressions = service.campaigns.reduce((sum, campaign) => sum + campaign.impressions, 0);
  const clicks = service.campaigns.reduce((sum, campaign) => sum + campaign.clicks, 0);
  const leads = service.campaigns.reduce((sum, campaign) => sum + campaign.leads, 0);
  const conversions = service.campaigns.reduce((sum, campaign) => sum + campaign.conversions, 0);
  const pendingApprovals = service.content.filter(item => item.approval === "pending").length
    + service.campaigns.filter(item => item.approval === "pending").length;
  const scheduledContent = service.content.filter(item => item.status === "scheduled").length;
  return {
    activeCampaigns: activeCampaigns.length,
    spendCents,
    revenueCents,
    impressions,
    clicks,
    leads,
    conversions,
    pendingApprovals,
    scheduledContent,
    ctr: impressions > 0 ? clicks / impressions : null,
    cplCents: leads > 0 ? Math.round(spendCents / leads) : null,
    conversionRate: clicks > 0 ? conversions / clicks : null,
    roas: spendCents > 0 ? revenueCents / spendCents : null,
  };
}
