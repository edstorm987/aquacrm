import "server-only";

import { listAgencyTasks } from "@/server/tasks";
import { buildBusinessRecommendedActions } from "@/lib/intelligence/businessRecommendedActions";
import { buildCompanyHealthSnapshot } from "@/engines/data/server/kpi/companyHealthSnapshot";
import { listOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import { buildBusinessIssueRadar } from "@/engines/data/server/radar/businessIssueRadar";
import { dashboardWorkAccountabilitySnapshot } from "@/server/dashboardPlanning";
import { canReadClientAssociation } from "@/lib/server/access/clientAssociationElement";
import { filterOperationalAlertsForActor } from "@/lib/server/access/operationalAlertAccess";
import {
  clientWorkspaceElementAtLeast,
  clientWorkspaceElementLevel,
  resolveActorClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import {
  resolveActorWorkspaceElementAccess,
  workspaceElementAtLeast,
  workspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";
import { clientWorkspaceDisplayName } from "@/lib/clients/clientWorkspace";
import type { CurrentAccessActor } from "@/server/accessControl";

export async function buildAdvisorContext(agencyId: string, now = Date.now()) {
  const [company, alerts] = await Promise.all([
    buildCompanyHealthSnapshot(agencyId, now),
    listOperationalAlerts(agencyId, now),
  ]);
  const businessRadar = await buildBusinessIssueRadar(agencyId, now, {
    company,
    operationalAlerts: alerts,
  });
  const openTaskRecords = listAgencyTasks(agencyId).filter(task => task.status !== "done");
  const recommendedActions = buildBusinessRecommendedActions({
    radar: businessRadar,
    alerts,
    existingTaskTitles: openTaskRecords.map(task => task.title),
    now,
    limit: 5,
  });
  const tasks = openTaskRecords
    .slice(0, 100)
    .map(task => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      dueAt: task.dueAt,
      assigneeUserId: task.assigneeUserId,
      clientId: task.clientId,
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
      capital: company.profile.capital,
    },
    operationalAlerts: alerts.slice(0, 80),
    businessRadar,
    recommendedActions,
    openTasks: tasks,
    workAccountability: dashboardWorkAccountabilitySnapshot(agencyId, now),
  };
}

export type AdvisorContextSource = Awaited<ReturnType<typeof buildAdvisorContext>>;

export interface ActorAdvisorClient {
  id: string;
  name: string;
  stage: string;
  status: string;
  updatedAt: number;
  lastContactedAt?: number;
}

/**
 * The only Advisor context permitted to cross a model-provider boundary.
 *
 * `buildAdvisorContext` is intentionally still the full internal source used
 * by owner-only/external delegation paths. In-app AI must call this actor-bound
 * projection instead: it removes fields, rather than asking the model to ignore
 * them. Exact-client grants are evaluated row by row and never become an
 * agency-wide client permission.
 */
export async function buildAdvisorContextForActor(
  actor: CurrentAccessActor,
  now = Date.now(),
) {
  const source = await buildAdvisorContext(actor.resourceAgencyId, now);
  const { resolveBusinessRadarAccessForActor } = await import("@/lib/server/intelligence/personalRadarAccess");
  return projectAdvisorContextForActor(
    actor,
    source,
    await resolveBusinessRadarAccessForActor(actor),
    now,
  );
}

/** Pure projection seam used by the provider-bound regression tests. */
export function projectAdvisorContextForActor(
  actor: CurrentAccessActor,
  source: AdvisorContextSource,
  businessRadarVisible: boolean,
  now = Date.now(),
) {
  const staff = resolveActorWorkspaceElementAccess(actor, "staff");
  const actionsVisible = workspaceElementAtLeast(
    workspaceElementLevel(staff, "workspace.actions"),
    "view",
  );
  const clients: ActorAdvisorClient[] = [];
  for (const client of Object.values(actor.resourceState.clients)) {
    if (client.agencyId !== actor.resourceAgencyId) continue;
    const access = resolveActorClientWorkspaceElementAccess(actor, client.id);
    if (!clientWorkspaceElementAtLeast(
      clientWorkspaceElementLevel(access, "client.overview"),
      "view",
    )) continue;
    const relationshipVisible = clientWorkspaceElementAtLeast(
      clientWorkspaceElementLevel(access, "client.relationship"),
      "view",
    );
    clients.push({
      id: client.id,
      name: clientWorkspaceDisplayName(client),
      stage: client.stage,
      status: client.status,
      updatedAt: client.updatedAt,
      lastContactedAt: relationshipVisible && typeof client.metadata?.lastContactedAt === "number"
        ? client.metadata.lastContactedAt
        : undefined,
    });
  }
  const openTasks = actionsVisible
    ? source.openTasks.filter(task => canReadClientAssociation(actor, "agency-task", task.clientId))
    : [];
  const operationalAlerts = filterOperationalAlertsForActor(actor, source.operationalAlerts);
  const recommendedActions = businessRadarVisible
    ? buildBusinessRecommendedActions({
        radar: source.businessRadar,
        alerts: operationalAlerts,
        existingTaskTitles: openTasks.map(task => task.title),
        now,
        limit: 5,
      })
    : [];
  const withheld = [
    ...(!businessRadarVisible ? ["company", "businessRadar", "recommendedActions", "workAccountability"] : []),
    ...(!actionsVisible ? ["openTasks"] : []),
  ];

  return {
    generatedAt: source.generatedAt,
    company: businessRadarVisible ? source.company : null,
    operationalAlerts,
    businessRadar: businessRadarVisible ? source.businessRadar : null,
    recommendedActions,
    openTasks,
    workAccountability: businessRadarVisible ? source.workAccountability : null,
    clients,
    access: {
      businessRadar: businessRadarVisible,
      actions: actionsVisible,
      visibleClientCount: clients.length,
      withheld,
    },
  };
}
