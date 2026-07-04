// Reports: campaignSnapshot + leadFunnel.

import type { AgencyId } from "../lib/tenancy";
import type {
  Campaign,
  CampaignChannel,
  CampaignSnapshot,
  CampaignStatus,
  Lead,
  LeadFunnel,
  LeadStatus,
} from "../lib/domain";
import type { CampaignService } from "./campaigns";
import type { LeadService } from "./leads";

const ALL_CHANNELS: CampaignChannel[] = ["email", "sms", "social", "paid", "organic", "event"];
const ALL_STATUSES: CampaignStatus[] = ["draft", "scheduled", "running", "paused", "completed", "archived"];
const ALL_LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "converted", "unqualified", "lost"];

export class ReportService {
  constructor(
    private agencyId: AgencyId,
    private campaigns: CampaignService,
    private leads: LeadService,
  ) {}

  async campaignSnapshot(args: { from: number; to: number }): Promise<CampaignSnapshot> {
    const all = await this.campaigns.list();
    const inWindow = all.filter(c => c.createdAt >= args.from && c.createdAt <= args.to);
    const byChannel = ALL_CHANNELS.map(channel => {
      const slice = inWindow.filter(c => c.channel === channel);
      return {
        channel,
        count: slice.length,
        budgetCents: slice.reduce((s, c) => s + (c.budgetCents ?? 0), 0),
        resultTotal: slice.reduce((s, c) => s + (c.resultActual ?? 0), 0),
      };
    }).filter(row => row.count > 0);
    const byStatus = ALL_STATUSES.map(status => ({
      status,
      count: inWindow.filter(c => c.status === status).length,
    })).filter(row => row.count > 0);
    return {
      from: args.from,
      to: args.to,
      byChannel,
      byStatus,
      totalCampaigns: inWindow.length,
      totalBudgetCents: inWindow.reduce((s, c) => s + (c.budgetCents ?? 0), 0),
    };
  }

  async leadFunnel(args: { from: number; to: number }): Promise<LeadFunnel> {
    const all = await this.leads.list();
    const inWindow = all.filter(l => l.createdAt >= args.from && l.createdAt <= args.to);
    const counts = (status: LeadStatus): number => inWindow.filter(l => l.status === status).length;

    const byStatus = ALL_LEAD_STATUSES.map(status => ({
      status,
      count: counts(status),
    })).filter(row => row.count > 0);

    const total = inWindow.length;
    const convertedCount = counts("converted");

    return {
      from: args.from,
      to: args.to,
      byStatus,
      total,
      conversionRate: total === 0 ? 0 : convertedCount / total,
      newCount: counts("new"),
      contactedCount: counts("contacted"),
      qualifiedCount: counts("qualified"),
      convertedCount,
      unqualifiedCount: counts("unqualified"),
      lostCount: counts("lost"),
    };
  }

  // Convenience helper — surfaces what a Lead's campaign produced.
  // Useful for the Campaigns page when admins want a quick "this
  // campaign generated X leads, Y converted" line.
  async campaignLeadStats(campaignId: string): Promise<{ total: number; converted: number; conversionRate: number }> {
    const leads = await this.leads.listForCampaign(campaignId);
    const total = leads.length;
    const converted = leads.filter(l => l.status === "converted").length;
    return { total, converted, conversionRate: total === 0 ? 0 : converted / total };
  }
}
