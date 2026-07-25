// Agency-ops domain types.

import type { UserId } from "./tenancy";

export type Cadence = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Daily", weekly: "Weekly", biweekly: "Every 2 weeks",
  monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly",
};

export const CADENCE_MS: Record<Cadence, number> = {
  daily: 86_400_000,
  weekly: 7 * 86_400_000,
  biweekly: 14 * 86_400_000,
  monthly: 30 * 86_400_000,
  quarterly: 91 * 86_400_000,
  yearly: 365 * 86_400_000,
};

export interface RecurringTask {
  id: string;
  agencyId: string;
  title: string;
  description?: string;
  cadence: Cadence;
  nextDue: number;        // epoch ms
  lastDoneAt?: number;
  assignee?: UserId;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateRecurringTaskInput {
  title: string;
  description?: string;
  cadence: Cadence;
  startDue?: number;       // first due-date; defaults to now()
  assignee?: UserId;
  active?: boolean;
}

export interface UpdateRecurringTaskPatch {
  title?: string;
  description?: string;
  cadence?: Cadence;
  nextDue?: number;
  assignee?: UserId;
  active?: boolean;
}

export type StatusLevel = "green" | "amber" | "red" | "unknown";

export const STATUS_LABELS: Record<StatusLevel, string> = {
  green: "OK", amber: "Degraded", red: "Down", unknown: "Unknown",
};

export interface StatusItem {
  id: string;
  agencyId: string;
  system: string;
  status: StatusLevel;
  lastChecked?: number;
  lastCheckedBy?: UserId;
  message?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateStatusItemInput {
  system: string;
  status?: StatusLevel;
  message?: string;
}

export interface MarkStatusInput {
  status: StatusLevel;
  message?: string;
}

export type IncidentSeverity = "minor" | "major" | "critical";

export const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  minor: "Minor", major: "Major", critical: "Critical",
};

export interface Incident {
  id: string;
  agencyId: string;
  title: string;
  severity: IncidentSeverity;
  startedAt: number;
  resolvedAt?: number;
  notes?: string;
  systemId?: string;       // optional cross-link to StatusItem
  createdAt: number;
  updatedAt: number;
}

export interface CreateIncidentInput {
  title: string;
  severity: IncidentSeverity;
  startedAt?: number;
  notes?: string;
  systemId?: string;
}

export interface UpdateIncidentPatch {
  title?: string;
  severity?: IncidentSeverity;
  notes?: string;
  resolvedAt?: number | null;
}

// Default starter recurring tasks (chapter §1 "Standards & Internal /
// Recurring Actions" — operator can paste over them via seedDefaults).
export const DEFAULT_RECURRING_TASKS: ReadonlyArray<{ title: string; cadence: Cadence; description?: string }> = [
  { title: "Review weekly KPIs",           cadence: "weekly",    description: "Pull MRR / churn from agency-finance founder dashboard." },
  { title: "Triage support inbox",         cadence: "daily",     description: "Zero-out the agency support inbox." },
  { title: "Audit failed logins",          cadence: "weekly",    description: "Check `auth` activity for repeated failures." },
  { title: "Backup verification",          cadence: "monthly",   description: "Spot-check backup snapshot integrity." },
  { title: "Plugin healthcheck pass",      cadence: "weekly",    description: "Walk Ops monitoring plugin — green on all systems." },
  { title: "Rotate at-risk credentials",   cadence: "quarterly", description: "Run credentials-vault for stale rotations (>90d)." },
  { title: "Client retention review",      cadence: "monthly",   description: "Cross-check churn signals on the founder dashboard." },
  { title: "Compliance / SOP refresh",     cadence: "quarterly", description: "Refresh SOP shelf for any changed processes." },
] as const;

export interface IncidentFilter {
  resolved?: boolean;
  severity?: IncidentSeverity;
  systemId?: string;
  fromStartedAt?: number;
  toStartedAt?: number;
}

export interface RecurringTaskFilter {
  active?: boolean;
  overdue?: boolean;       // nextDue <= refNow
  cadence?: Cadence;
  assignee?: UserId;
}

export interface HealthOverview {
  systems: { total: number; green: number; amber: number; red: number; unknown: number };
  recurringTasks: { total: number; active: number; overdueCount: number; nextOverdueId?: string };
  incidents: { open: number; resolved: number; criticalOpen: number };
  hasData: boolean;
}
