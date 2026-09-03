import "server-only";

import { summarisePersonalRadarActions, taskBelongsOnMyRadar, type PersonalRadarAction, type PersonalRadarActionSummary } from "@/lib/intelligence/personalRadar";
import { listAgencyTasks } from "@/server/tasks";
import type { SessionPayload } from "@/server/types";
import type { CurrentAccessActor } from "@/server/accessControl";

export interface PersonalRadarActionsResult {
  available: boolean;
  actions: PersonalRadarAction[];
  actionSummary: PersonalRadarActionSummary;
}

/**
 * Read only the current person's actionable work.
 *
 * `workspace.actions` controls the Actions slice, not My Radar itself. A staff
 * member who loses that element still keeps their wellbeing, goals and work
 * rhythm; the unavailable slice says why it is absent. Owners retain their
 * baseline. Managers and staff both pass through canonical element and client
 * association gates, while the list remains personal rather than expanding to
 * every task in the business.
 */
export async function readPersonalRadarActions(
  session: SessionPayload,
  now = Date.now(),
  resolvedActor?: CurrentAccessActor,
): Promise<PersonalRadarActionsResult> {
  let canReadAssociatedClient: ((clientId?: string) => boolean) | null = null;
  if (session.role !== "agency-owner") {
    try {
      // Keep the delegated-staff governance graph out of healthy owner chrome.
      // This reader is used in the shared topbar on every agency navigation,
      // while these modules are required only for a delegated identity.
      const [association, access] = await Promise.all([
        import("@/lib/server/access/clientAssociationElement"),
        import("@/lib/server/access/workspaceElementAccess"),
      ]);
      const actor = resolvedActor ?? (await access.requireCurrentWorkspaceElementAccess("staff", "workspace.actions", "view")).actor;
      access.assertWorkspaceElementAccess(
        access.resolveActorWorkspaceElementAccess(actor, "staff"),
        "workspace.actions",
        "view",
      );
      canReadAssociatedClient = clientId => association.canReadClientAssociation(actor, "agency-task", clientId);
    } catch (error) {
      const { AuthError } = await import("@/lib/server/auth/auth");
      if (error instanceof AuthError && error.status === 403) {
        return { available: false, actions: [], actionSummary: { open: 0, overdue: 0, urgent: 0, attention: 0 } };
      }
      throw error;
    }
  }

  const personalTasks = listAgencyTasks(resolvedActor?.resourceAgencyId ?? session.agencyId)
    .filter(task => task.status !== "done" && taskBelongsOnMyRadar(task, session.userId))
    .filter(task => !canReadAssociatedClient || canReadAssociatedClient(task.clientId))
    .sort((left, right) => {
      const leftOverdue = left.dueAt !== undefined && left.dueAt < now;
      const rightOverdue = right.dueAt !== undefined && right.dueAt < now;
      if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
      const priority = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
      const priorityDifference = priority[left.priority] - priority[right.priority];
      if (priorityDifference) return priorityDifference;
      return (left.dueAt ?? Number.POSITIVE_INFINITY) - (right.dueAt ?? Number.POSITIVE_INFINITY);
    });
  const fullActions: PersonalRadarAction[] = personalTasks.map(task => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt,
    }));

  return {
    available: true,
    // Every consumer renders at most eight. Keep the complete totals above,
    // but do not serialize an unbounded task collection through shared chrome.
    actions: fullActions.slice(0, 8),
    actionSummary: summarisePersonalRadarActions(fullActions, now),
  };
}
