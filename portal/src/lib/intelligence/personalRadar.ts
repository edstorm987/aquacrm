import type { AgencyTaskPriority, AgencyTaskStatus, CommandCalendarEntry } from "@/server/types";

/**
 * My Radar is the signed-in person's view. It never becomes an agency roll-up
 * just because that person happens to own the business.
 */
export interface PersonalRadarAction {
  id: string;
  title: string;
  status: AgencyTaskStatus;
  priority: AgencyTaskPriority;
  dueAt?: number;
}

export interface PersonalRadarActionSummary {
  /** Complete person-scoped count; `actions` is only the bounded preview. */
  open: number;
  overdue: number;
  urgent: number;
  /** Unique urgent-or-overdue items for the badge. */
  attention: number;
}

export type PersonalRadarGoal = Pick<CommandCalendarEntry,
  "id" | "title" | "status" | "startsAt" | "targetValue" | "currentValue" | "targetUnit" | "recurrence" | "metric"
>;

export interface PersonalRadarReading {
  userId: string;
  from: number;
  to: number;
  work: {
    daysWorked: number;
    workedTodayHours: number;
    workedWeekHours: number;
    plannedTodayHours?: number;
    activeSince?: number;
    currentMode?: "aqua" | "external" | "break" | "unconfirmed";
    currentFocus?: string;
    todayFocus?: string;
    weekOutcome?: string;
  };
  wellbeing: {
    meanDayScore?: number;
    ratedDays: number;
    latestDayScore?: number;
    energyScore?: 1 | 2 | 3 | 4 | 5;
    confidenceScore?: 1 | 2 | 3 | 4 | 5;
  };
  /** Whether this role may read the person's calendar-backed goals. */
  goalsAvailable: boolean;
  /** Whether this role may create or change calendar-backed goals. */
  goalsWritable: boolean;
  /** Complete active count; `goals` below is only the small UI preview. */
  goalCount: number;
  /** Complete count of one-off goals whose review date has passed. */
  reviewDueGoalCount: number;
  goals: PersonalRadarGoal[];
}

export interface PersonalRadarSnapshot {
  generatedAt: number;
  reading: PersonalRadarReading;
  actions: PersonalRadarAction[];
  actionSummary?: PersonalRadarActionSummary;
  actionsAvailable: boolean;
  headline: string;
}

export function summarisePersonalRadarActions(
  actions: readonly PersonalRadarAction[],
  now: number,
): PersonalRadarActionSummary {
  return {
    open: actions.length,
    overdue: actions.filter(action => action.dueAt !== undefined && action.dueAt < now).length,
    urgent: actions.filter(action => action.priority === "urgent").length,
    attention: actions.filter(action => action.priority === "urgent" || (action.dueAt !== undefined && action.dueAt < now)).length,
  };
}

/**
 * Assigned work is personal. An unassigned item belongs to its creator; work
 * explicitly delegated to somebody else does not remain on the creator's own
 * radar merely because they created it.
 */
export function taskBelongsOnMyRadar(
  task: { assigneeUserId?: string; createdBy: string },
  userId: string,
): boolean {
  return task.assigneeUserId ? task.assigneeUserId === userId : task.createdBy === userId;
}

export function goalProgressPercent(goal: PersonalRadarGoal): number | undefined {
  if (goal.targetValue === undefined || goal.targetValue <= 0 || goal.currentValue === undefined) return undefined;
  return Math.min(100, Math.max(0, Math.round(goal.currentValue / goal.targetValue * 100)));
}

export function personalRadarAttentionCount(
  actions: readonly PersonalRadarAction[],
  reading: PersonalRadarReading,
  now: number,
  summary = summarisePersonalRadarActions(actions, now),
): number {
  // A recurring quota remains active after its first start date; treating it
  // as permanently overdue would turn an everyday habit into a permanent red
  // badge. Only one-off goals become review-due here.
  return summary.attention + (reading.goalsAvailable ? reading.reviewDueGoalCount : 0);
}

export function personalRadarHeadline(
  reading: PersonalRadarReading,
  actions: readonly PersonalRadarAction[],
  now: number,
  summary = summarisePersonalRadarActions(actions, now),
): string {
  const overdueActions = summary.overdue;
  if (overdueActions > 0) {
    return `${overdueActions} overdue ${overdueActions === 1 ? "action needs" : "actions need"} your attention.`;
  }
  const urgentActions = summary.urgent;
  if (urgentActions > 0) {
    return `${urgentActions} urgent ${urgentActions === 1 ? "action is" : "actions are"} waiting for you.`;
  }
  const reviewDueGoals = reading.goalsAvailable ? reading.reviewDueGoalCount : 0;
  if (reviewDueGoals > 0) {
    return `${reviewDueGoals} personal ${reviewDueGoals === 1 ? "goal is" : "goals are"} due for review.`;
  }
  const focus = reading.work.currentFocus || reading.work.todayFocus;
  if (focus) return `Your focus: ${focus}`;
  if (reading.goalsAvailable && reading.goalCount > 0) {
    return `${reading.goalCount} active ${reading.goalCount === 1 ? "goal" : "goals"} and ${summary.open} open ${summary.open === 1 ? "action" : "actions"}.`;
  }
  if (!reading.goalsAvailable && summary.open === 0) return "Your personal wellbeing and work pace are ready; calendar goals are hidden by your role.";
  return summary.open > 0
    ? `${summary.open} open ${summary.open === 1 ? "action" : "actions"}; choose the one that matters most today.`
    : "Nothing urgent is waiting. Set today’s focus or add a personal goal when you are ready.";
}
