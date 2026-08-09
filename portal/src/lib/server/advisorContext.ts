import "server-only";

import { listAgencyTasks } from "@/server/tasks";
import { buildCompanyHealthSnapshot } from "./companyHealthSnapshot";
import { listOperationalAlerts } from "./operationalAlerts";

export async function buildAdvisorContext(agencyId: string, now = Date.now()) {
  const [company, alerts] = await Promise.all([
    buildCompanyHealthSnapshot(agencyId, now),
    listOperationalAlerts(agencyId, now),
  ]);
  const tasks = listAgencyTasks(agencyId)
    .filter(task => task.status !== "done")
    .slice(0, 100)
    .map(task => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      dueAt: task.dueAt,
      assigneeUserId: task.assigneeUserId,
    }));

  return {
    generatedAt: new Date(now).toISOString(),
    company: {
      health: company.health,
      actuals: company.actuals,
      targets: {
        monthlyRevenueTargetCents: company.profile.monthlyRevenueTargetCents,
        annualRevenueTargetCents: company.profile.annualRevenueTargetCents,
        averageDealValueCents: company.profile.averageDealValueCents,
        salesCallCloseRatePercent: company.profile.salesCallCloseRatePercent,
      },
      revenueGapCents: company.revenueGapCents,
      dealsNeeded: company.dealsNeeded,
      estimatedCallsNeeded: company.estimatedCallsNeeded,
      objectives: company.profile.objectives,
      activePlans: company.profile.plans.filter(plan => !["complete", "paused"].includes(plan.status)),
    },
    operationalAlerts: alerts.slice(0, 80),
    openTasks: tasks,
  };
}
