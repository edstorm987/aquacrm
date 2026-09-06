// The one canonical "needs you" queue.
//
// Every owner-facing attention list — the Actions workspace, the Command Centre
// priority feed, the Master Inbox count — must agree on WHAT needs the owner and
// HOW it is ranked, or the app contradicts itself (Ed: "needs you notifications
// is wrong… it's meant to combine the actions + other things into one"). The
// server assembles the inputs once (`assembleAgencyActions`); this module is the
// single place that turns those inputs into the ranked queue. It holds no state
// and does no I/O, so a server assembly and any client surface build the exact
// same list from the exact same rule.

import type { AgencyTask, AgencyTaskOrigin, AgencyTaskPriority, ExternalAssistantActionProposal } from "@/server/types";
import type { AdvisorActionSuggestion } from "@/lib/advisor/advisorActions";
import type { ResolutionKind } from "@/lib/inbox/resolutionExplain";
import type { ProtectedAttentionWindow } from "@/lib/intelligence/attentionProtection";

/** A pipeline/inbox-derived signal awaiting acceptance (not yet a committed task). */
export type GeneratedAction = {
  id: string;
  title: string;
  detail: string;
  href: string;
  kind: string;
  dueAt?: number;
  priority: "normal" | "high" | "urgent";
  clientId?: string;
  // Defaults to "crm" for the pipeline-derived signals that predate this.
  // Needs-attention alerts set "inbox" so they are not mislabelled.
  origin?: Extract<AgencyTaskOrigin, "crm" | "inbox">;
  /** Lands on the exact record behind this, not the list containing it. */
  evidenceHref?: string;
  /**
   * How many times this has been put off, and since when.
   *
   * Off-system work is the case that needs it: nothing in Aqua does the job,
   * so the only pressure to act is knowing how long you have not.
   */
  deferrals?: number;
  firstDeferredAt?: number;
  /**
   * How it can be dealt with, declared by the check. Named apart from `kind`
   * above, which is the badge label ("Needs attention"), not a classification.
   */
  resolutionKind?: ResolutionKind;
  causalVersion?: number;
  /** Exact source-alert identity used by the server's causal mutation check. */
  alertOccurrenceKey?: string;
};

export type ActionSort = "priority" | "due-soon" | "newest" | "oldest" | "recently-updated";

export type UnifiedActionItem =
  | { type: "task"; id: string; source: AgencyTaskOrigin; priority: AgencyTaskPriority; dueAt?: number; createdAt: number; updatedAt: number; task: AgencyTask }
  | { type: "suggestion"; id: string; source: "radar" | "advisor"; priority: AgencyTaskPriority; dueAt?: number; createdAt: number; updatedAt: number; suggestion: AdvisorActionSuggestion }
  | { type: "proposal"; id: string; source: "advisor"; priority: AgencyTaskPriority; dueAt?: number; createdAt: number; updatedAt: number; proposal: ExternalAssistantActionProposal }
  | { type: "crm"; id: string; source: "crm"; priority: AgencyTaskPriority; dueAt?: number; createdAt: number; updatedAt: number; action: GeneratedAction };

/** A task's origin, defaulting to manual for records that predate the field. */
export function taskOrigin(task: AgencyTask): AgencyTaskOrigin { return task.origin ?? "manual"; }

/** The one ranking of urgency, shared by every attention surface. */
export function priorityRank(priority: AgencyTaskPriority): number { return priority === "urgent" ? 0 : priority === "high" ? 1 : priority === "normal" ? 2 : 3; }

/**
 * Only inbox/CRM-derived rows carry a deferral count — a task or an Advisor
 * suggestion has never been "put off", it has simply not been done yet.
 */
export function deferralsOf(item: UnifiedActionItem): number | undefined {
  return item.type === "crm" ? item.action.deferrals : undefined;
}

/** Combine every attention input into one ranked queue. The single source. */
export function buildUnifiedActionQueue({ tasks, radar, advisor, proposals, crm, recommendationsGeneratedAt, advisorReviewedAt, sort }: {
  tasks: AgencyTask[];
  radar: AdvisorActionSuggestion[];
  advisor: AdvisorActionSuggestion[];
  proposals: ExternalAssistantActionProposal[];
  crm: GeneratedAction[];
  recommendationsGeneratedAt: number;
  advisorReviewedAt: number | null;
  sort: ActionSort;
}): UnifiedActionItem[] {
  const rows: UnifiedActionItem[] = [
    ...tasks.map(task => ({ type: "task" as const, id: task.id, source: taskOrigin(task), priority: task.priority, dueAt: task.dueAt, createdAt: task.createdAt, updatedAt: task.updatedAt, task })),
    ...radar.map(suggestion => ({ type: "suggestion" as const, id: suggestion.id, source: "radar" as const, priority: suggestion.priority, dueAt: suggestion.dueAt, createdAt: recommendationsGeneratedAt, updatedAt: recommendationsGeneratedAt, suggestion })),
    ...advisor.map(suggestion => ({ type: "suggestion" as const, id: suggestion.id, source: "advisor" as const, priority: suggestion.priority, dueAt: suggestion.dueAt, createdAt: advisorReviewedAt ?? recommendationsGeneratedAt, updatedAt: advisorReviewedAt ?? recommendationsGeneratedAt, suggestion })),
    ...proposals.filter(proposal => proposal.status === "pending").map(proposal => ({ type: "proposal" as const, id: proposal.id, source: "advisor" as const, priority: proposal.priority, dueAt: proposal.suggestedDueAt, createdAt: proposal.submittedAt, updatedAt: proposal.updatedAt, proposal })),
    ...crm.map(action => ({ type: "crm" as const, id: action.id, source: "crm" as const, priority: action.priority, dueAt: action.dueAt, createdAt: recommendationsGeneratedAt, updatedAt: recommendationsGeneratedAt, action })),
  ];
  return rows.sort((left, right) => {
    const completion = Number(left.type === "task" && left.task.status === "done") - Number(right.type === "task" && right.task.status === "done");
    if (completion) return completion;
    if (sort === "due-soon") return (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER) || priorityRank(left.priority) - priorityRank(right.priority);
    if (sort === "newest") return right.createdAt - left.createdAt;
    if (sort === "oldest") return left.createdAt - right.createdAt;
    if (sort === "recently-updated") return right.updatedAt - left.updatedAt;
    return priorityRank(left.priority) - priorityRank(right.priority) || (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER) || right.updatedAt - left.updatedAt;
  });
}

/**
 * Pull the task a caller deep-linked to into the focus window even if the
 * ranking would have held it in reserve — so "open this task" never lands on a
 * hidden row.
 */
export function promoteLinkedTask(window: ProtectedAttentionWindow<UnifiedActionItem>, taskId: string | null): ProtectedAttentionWindow<UnifiedActionItem> {
  if (!taskId || window.focus.some(item => item.type === "task" && item.id === taskId)) return window;
  const linked = window.reserve.find(item => item.type === "task" && item.id === taskId);
  if (!linked) return window;
  const displaced = window.focus.at(-1);
  const focus = [linked, ...window.focus.filter(item => item.id !== linked.id)].slice(0, window.focusLimit);
  const reserve = [
    ...window.reserve.filter(item => item.id !== linked.id),
    ...(displaced && !focus.some(item => item.id === displaced.id) ? [displaced] : []),
  ];
  const reserveGroups = [...reserve.reduce((groups, item) => {
    groups.set(item.source, (groups.get(item.source) ?? 0) + 1);
    return groups;
  }, new Map<string, number>())]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  return { ...window, focus, reserve, reserveCount: reserve.length, reserveGroups };
}
