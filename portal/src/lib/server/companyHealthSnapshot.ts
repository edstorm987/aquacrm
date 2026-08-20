import "server-only";
import { cache } from "react";

import { getRequestNow } from "@/lib/server/requestNow";
import { ensureAgencyFinanceFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/agencyFinanceFoundation";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { containerFor as financeContainerFor } from "@/built-ins/modules/agency-finance/src/server/foundationAdapter";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { summarizeClientTelemetry, type ClientTelemetryEvent } from "@/lib/clientTelemetry";
import { calculateCompanyHealth } from "@/lib/companyHealth";
import { getCompanyProfile } from "@/server/company";
import { listClientMilestones } from "@/server/clientMilestones";
import { getInstall } from "@/server/pluginInstalls";
import { listAgencyTasks } from "@/server/tasks";
import { listClients } from "@/server/tenants";
import { makePluginStorage } from "./pluginStorage";

export interface CompanyHealthActuals {
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
}

export interface CompanyRevenueGrowthPoint {
  at: number;
  value: number;
}

// Request-deduped: the agency page and the radar engine both build this same
// snapshot per render; React cache() (keyed on agencyId, shared request `now`)
// collapses them to one build. The raw function below is unchanged.
export const getRequestCompanyHealth = cache(
  (agencyId: string) => buildCompanyHealthSnapshot(agencyId, getRequestNow()),
);

export async function buildCompanyHealthSnapshot(agencyId: string, now = Date.now()) {
  const clients = listClients(agencyId);
  const activeClients = clients.filter(client => client.status === "active" && client.stage !== "churned");
  const milestones = listClientMilestones(agencyId);
  const tasks = listAgencyTasks(agencyId);
  const openTasks = tasks.filter(task => task.status !== "done");
  const clientsNeedingAttention = activeClients.filter(client => {
    const metadata = client.metadata ?? {};
    const lastContactedAt = Number(metadata.lastContactedAt ?? 0);
    const telemetryEvents = Array.isArray(metadata.telemetryEvents) ? metadata.telemetryEvents as ClientTelemetryEvent[] : [];
    const telemetry = summarizeClientTelemetry(telemetryEvents);
    const clientMilestones = milestones.filter(item => item.clientId === client.id);
    const requests = Array.isArray(metadata.clientRequests) ? metadata.clientRequests as Array<{ status?: string }> : [];
    return !client.ownerEmail
      || !lastContactedAt
      || now - lastContactedAt > 14 * 24 * 60 * 60 * 1000
      || telemetry.errors24h > 0
      || requests.some(request => request.status === "open")
      || clientMilestones.some(item => item.status === "blocked" || Boolean(item.targetAt && item.targetAt < now && item.status !== "complete"));
  }).length;

  const profile = getCompanyProfile(agencyId, null);
  const actuals: CompanyHealthActuals = {
    monthRevenueCents: 0,
    previousMonthRevenueCents: 0,
    monthlyRevenueGrowthPercent: null,
    mrrCents: 0,
    currency: "gbp",
    financeConnected: false,
    activeClients: activeClients.length,
    clientsNeedingAttention,
    leadCount: 0,
    meetingsThisMonth: 0,
    completedSalesCalls: 0,
    openTasks: openTasks.length,
    overdueTasks: openTasks.filter(task => Boolean(task.dueAt && task.dueAt < now)).length,
  };
  let revenueGrowthHistory: CompanyRevenueGrowthPoint[] = [];

  const financeInstall = getInstall({ agencyId }, "agency-finance");
  if (financeInstall?.enabled) {
    try {
      ensureAgencyFinanceFoundationRegistered();
      const finance = financeContainerFor({
        agencyId,
        storage: makePluginStorage(financeInstall.id) as never,
        install: financeInstall,
      });
      const snapshot = await finance.pnl.founderSnapshot(now);
      const currentMonth = snapshot.trailingMonths.at(-1);
      const previousMonth = snapshot.trailingMonths.at(-2);
      actuals.monthRevenueCents = currentMonth?.revenueCents ?? 0;
      actuals.previousMonthRevenueCents = previousMonth?.revenueCents ?? 0;
      actuals.monthlyRevenueGrowthPercent = revenueGrowthPercent(actuals.monthRevenueCents, actuals.previousMonthRevenueCents);
      actuals.mrrCents = snapshot.mrrCents;
      actuals.currency = snapshot.currency;
      actuals.financeConnected = true;
      revenueGrowthHistory = snapshot.trailingMonths.flatMap((month, index, months) => {
        if (index === 0) return [];
        const value = revenueGrowthPercent(month.revenueCents, months[index - 1]?.revenueCents ?? 0);
        return value === null ? [] : [{
          at: Date.UTC(month.year, month.month - 1, 1),
          value,
        }];
      });
    } catch {
      // The health view remains usable while finance is being connected.
    }
  }

  const leadsInstall = getInstall({ agencyId }, "leads-pipeline");
  if (leadsInstall?.enabled) {
    try {
      ensureLeadsPipelineFoundationRegistered();
      const leads = await leadsContainerFor({
        agencyId,
        storage: makePluginStorage(leadsInstall.id) as never,
      }).leads.list();
      actuals.leadCount = leads.length;
      const date = new Date(now);
      const start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
      actuals.meetingsThisMonth = leads.filter(lead => lead.nextMeetingAt && lead.nextMeetingAt >= start && lead.nextMeetingAt < end).length;
      actuals.completedSalesCalls = leads.filter(lead =>
        lead.meetingStatus === "completed" &&
        (lead.nextMeetingAt ?? 0) >= start &&
        (lead.nextMeetingAt ?? 0) < end,
      ).length;
    } catch {
      // Sales metrics stay at zero until the leads workspace is ready.
    }
  }

  const date = new Date(now);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const revenueGapCents = Math.max(0, profile.monthlyRevenueTargetCents - actuals.monthRevenueCents);
  const dealsNeeded = revenueGapCents > 0 ? Math.ceil(revenueGapCents / Math.max(1, profile.averageDealValueCents)) : 0;
  const estimatedCallsNeeded = dealsNeeded > 0
    ? Math.ceil(dealsNeeded / Math.max(0.01, profile.salesCallCloseRatePercent / 100))
    : 0;
  const health = calculateCompanyHealth({
    monthRevenueCents: actuals.monthRevenueCents,
    monthlyRevenueTargetCents: profile.monthlyRevenueTargetCents,
    dayOfMonth: date.getDate(),
    daysInMonth,
    activeClients: actuals.activeClients,
    clientsNeedingAttention: actuals.clientsNeedingAttention,
    revenueGapCents,
    estimatedCallsNeeded,
    meetingsThisMonth: actuals.meetingsThisMonth,
    openTasks: actuals.openTasks,
    overdueTasks: actuals.overdueTasks,
  });

  return {
    generatedAt: new Date(now).toISOString(),
    profile,
    actuals,
    revenueGrowthHistory,
    health,
    revenueGapCents,
    dealsNeeded,
    estimatedCallsNeeded,
  };
}

function revenueGrowthPercent(currentRevenueCents: number, previousRevenueCents: number): number | null {
  if (previousRevenueCents <= 0) return null;
  return Math.round((currentRevenueCents - previousRevenueCents) / previousRevenueCents * 1_000) / 10;
}
