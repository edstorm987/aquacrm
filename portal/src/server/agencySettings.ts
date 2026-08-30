import "server-only";

import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import { DEPARTMENT_PROFILES } from "@/lib/access/departmentProfiles";
import { isValidTimezone, normaliseTimezone } from "@/lib/shared/timezones";
import type {
  AdvisorCustomSkill,
  AdvisorSkillRecipeId,
  AgencyWorkspaceSettings,
  ClientStage,
  DepartmentBaselineSetting,
  RadarActivationCondition,
  RadarBaselineStrategy,
  RadarEvaluationWindow,
  RadarNotificationCadence,
  RadarOperatingStage,
  RadarPolicyConfiguration,
  RadarPolicyException,
  RadarPolicyExceptionEffect,
  RadarPolicyRule,
  RadarPolicyState,
} from "./types";

const RADAR_DOMAINS = ["company", "sales", "inbox", "clients", "finance", "delivery", "marketing", "operations", "compliance", "development", "team", "systems"] as const;
const RADAR_STATES: RadarPolicyState[] = ["inherit", "learning", "live", "seasonal", "paused", "not-applicable", "retired"];
const RADAR_ACTIVATIONS: RadarActivationCondition[] = ["immediate", "on-first-sample", "on-first-activity", "manual"];
const RADAR_BASELINES: RadarBaselineStrategy[] = ["target-and-baseline", "target-only", "rolling", "prior-period"];
const RADAR_WINDOWS: RadarEvaluationWindow[] = ["realtime", "daily", "weekly", "monthly", "quarterly"];
const RADAR_NOTIFICATIONS: RadarNotificationCadence[] = ["immediate", "hourly", "daily", "weekly", "off"];
const RADAR_EXCEPTION_EFFECTS: RadarPolicyExceptionEffect[] = ["mute-notifications", "downgrade-to-watch", "pause-check"];

const DEFAULT_RADAR_POLICY: RadarPolicyConfiguration = {
  operatingStage: "setup",
  defaultPolicy: {
    state: "learning",
    activationCondition: "on-first-activity",
    baselineStrategy: "target-and-baseline",
    warningTolerancePercent: 15,
    criticalTolerancePercent: 30,
    minimumSampleSize: 12,
    learningPeriodDays: 30,
    evaluationWindow: "daily",
    businessHoursOnly: false,
    notificationCadence: "daily",
  },
  domainPolicies: {
    systems: { state: "live", activationCondition: "immediate", minimumSampleSize: 1, learningPeriodDays: 0, evaluationWindow: "realtime", notificationCadence: "immediate" },
    compliance: { state: "live", activationCondition: "immediate", minimumSampleSize: 1, learningPeriodDays: 0, notificationCadence: "immediate" },
  },
  metricPolicies: {},
  exceptions: [],
  updatedAt: 0,
};

const DEFAULTS: Omit<AgencyWorkspaceSettings, "agencyId" | "updatedAt"> = {
  timezone: "Europe/London",
  defaultCurrency: "GBP",
  defaultTaxRatePercent: 0,
  defaultPaymentTermsDays: 7,
  invoicePrefix: "MM",
  defaultClientStage: "aqua-epic-intro",
  createPortalByDefault: false,
  portalAccessDays: 7,
  advisor: {
    speedToLeadTargetMinutes: 5,
    speedToLeadWarningMinutes: 15,
    speedToLeadCriticalMinutes: 60,
    staleDataHours: 72,
    skillPolicies: {},
    customSkills: [],
    radarPolicy: DEFAULT_RADAR_POLICY,
  },
  notifications: {
    overdueTasks: true,
    outages: true,
    supportRequests: true,
    meetingReminders: true,
    financeAlerts: true,
    marketingAlerts: true,
    clientAlerts: true,
    contractAlerts: true,
    complianceAlerts: true,
    developmentAlerts: true,
    digest: "daily",
  },
};

export function getAgencyWorkspaceSettings(agencyId: string): AgencyWorkspaceSettings {
  const stored = getState().agencySettings[agencyId];
  return {
    ...DEFAULTS,
    ...stored,
    agencyId,
    advisor: cleanAdvisorSettings(stored?.advisor, DEFAULTS.advisor),
    notifications: { ...DEFAULTS.notifications, ...(stored?.notifications ?? {}) },
    updatedAt: stored?.updatedAt ?? 0,
  };
}

/**
 * Baselines, cleaned.
 *
 * Unknown department ids are DROPPED rather than kept: a baseline for a
 * department that does not exist can never be met, so it would sit on the radar
 * as a permanent, unfixable starvation. Duplicates collapse to the last value,
 * because two baselines for one department is a question with no answer.
 */
function cleanDepartmentBaselines(value: unknown): DepartmentBaselineSetting[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const known = new Set(DEPARTMENT_PROFILES.map(profile => profile.id as string));
  const byId = new Map<string, number>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as { departmentId?: unknown; weeklyHours?: unknown };
    const departmentId = typeof entry.departmentId === "string" ? entry.departmentId.trim() : "";
    if (!known.has(departmentId)) continue;
    const hours = typeof entry.weeklyHours === "number" && Number.isFinite(entry.weeklyHours)
      ? Math.min(Math.max(entry.weeklyHours, 0), 168)
      : 0;
    byId.set(departmentId, hours);
  }
  return byId.size ? [...byId].map(([departmentId, weeklyHours]) => ({ departmentId, weeklyHours })) : undefined;
}

export function updateAgencyWorkspaceSettings(
  agencyId: string,
  patch: Partial<Omit<AgencyWorkspaceSettings, "agencyId" | "updatedAt">>,
  actorUserId: string,
): AgencyWorkspaceSettings {
  const current = getAgencyWorkspaceSettings(agencyId);
  const updated: AgencyWorkspaceSettings = {
    ...current,
    legalName: cleanOptional(patch.legalName ?? current.legalName, 180),
    supportEmail: cleanEmail(patch.supportEmail ?? current.supportEmail),
    phone: cleanOptional(patch.phone ?? current.phone, 60),
    website: cleanUrl(patch.website ?? current.website),
    businessAddress: cleanOptional(patch.businessAddress ?? current.businessAddress, 1_000),
    companyNumber: cleanOptional(patch.companyNumber ?? current.companyNumber, 80),
    taxNumber: cleanOptional(patch.taxNumber ?? current.taxNumber, 80),
    timezone: cleanTimezone(patch.timezone ?? current.timezone, current.timezone),
    defaultCurrency: cleanCurrency(patch.defaultCurrency ?? current.defaultCurrency),
    defaultTaxRatePercent: cleanNumber(patch.defaultTaxRatePercent ?? current.defaultTaxRatePercent, 0, 100),
    defaultPaymentTermsDays: cleanWholeNumber(patch.defaultPaymentTermsDays ?? current.defaultPaymentTermsDays, 0, 365),
    invoicePrefix: cleanOptional(patch.invoicePrefix ?? current.invoicePrefix, 12)?.toUpperCase() || DEFAULTS.invoicePrefix,
    defaultClientStage: cleanStage(patch.defaultClientStage ?? current.defaultClientStage),
    createPortalByDefault: patch.createPortalByDefault ?? current.createPortalByDefault,
    portalAccessDays: cleanNumber(patch.portalAccessDays ?? current.portalAccessDays, 1, 90),
    clientWelcomeMessage: cleanOptional(patch.clientWelcomeMessage ?? current.clientWelcomeMessage, 2_000),
    departmentBaselines: cleanDepartmentBaselines(patch.departmentBaselines ?? current.departmentBaselines),
    advisor: cleanAdvisorSettings(patch.advisor, current.advisor),
    notifications: {
      ...current.notifications,
      ...(patch.notifications ?? {}),
      digest: cleanDigest(patch.notifications?.digest ?? current.notifications.digest),
    },
    updatedAt: Date.now(),
  };
  mutate(state => {
    state.agencySettings[agencyId] = updated;
  });
  logActivity({
    agencyId,
    actorUserId,
    category: "settings",
    action: "workspace.settings_updated",
    message: "Updated AquaOasis-Web workspace settings.",
  });
  return updated;
}

function cleanOptional(value: unknown, limit: number): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, limit) || undefined : undefined;
}

function cleanEmail(value: unknown): string | undefined {
  const email = cleanOptional(value, 240);
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : undefined;
}

function cleanUrl(value: unknown): string | undefined {
  const raw = cleanOptional(value, 2_000);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The store's last-resort guard on the workspace zone.
 *
 * Until the picker became a searchable free-text input (2026-08-30), the five
 * <option>s in SettingsTabs were the only thing between a POST body and
 * storage — the route handed `timezone` straight through and this file only
 * trimmed it. The invariant belongs HERE, where every caller passes: the
 * Settings route, the Dev Team editor adapter, and anything later.
 *
 * Invalid input keeps the zone already stored rather than resetting to the
 * default: somebody typing a typo must not silently relocate a workspace that
 * was correctly configured.
 */
function cleanTimezone(value: unknown, fallback: string): string {
  const zone = cleanOptional(value, 80);
  if (!zone || !isValidTimezone(zone)) return fallback || DEFAULTS.timezone;
  return normaliseTimezone(zone);
}

function cleanCurrency(value: unknown): string {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(currency) ? currency : DEFAULTS.defaultCurrency;
}

function cleanNumber(value: unknown, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

function cleanWholeNumber(value: unknown, min: number, max: number): number {
  return Math.round(cleanNumber(value, min, max));
}

function cleanStage(value: unknown): ClientStage {
  const stages: ClientStage[] = ["lead", "discovery", "design", "development", "onboarding", "live", "churned", "aqua-epic-intro", "aqua-blueprint", "aqua-diagnostics", "aqua-brand-builder", "aqua-traffic", "aqua-mastery"];
  return stages.includes(value as ClientStage) ? value as ClientStage : DEFAULTS.defaultClientStage;
}

function cleanDigest(value: unknown): AgencyWorkspaceSettings["notifications"]["digest"] {
  return value === "off" || value === "weekly" ? value : "daily";
}

function cleanAdvisorSettings(
  patch: Partial<AgencyWorkspaceSettings["advisor"]> | undefined,
  current: AgencyWorkspaceSettings["advisor"],
): AgencyWorkspaceSettings["advisor"] {
  const target = cleanNumber(patch?.speedToLeadTargetMinutes ?? current.speedToLeadTargetMinutes, 1, 240);
  const warning = Math.max(target, cleanNumber(patch?.speedToLeadWarningMinutes ?? current.speedToLeadWarningMinutes, 1, 720));
  const critical = Math.max(warning, cleanNumber(patch?.speedToLeadCriticalMinutes ?? current.speedToLeadCriticalMinutes, 1, 1_440));
  return {
    speedToLeadTargetMinutes: target,
    speedToLeadWarningMinutes: warning,
    speedToLeadCriticalMinutes: critical,
    staleDataHours: cleanNumber(patch?.staleDataHours ?? current.staleDataHours, 1, 720),
    skillPolicies: cleanAdvisorSkillPolicies(patch?.skillPolicies ?? current.skillPolicies),
    customSkills: cleanCustomAdvisorSkills(patch?.customSkills ?? current.customSkills),
    radarPolicy: cleanRadarPolicy(patch?.radarPolicy, current.radarPolicy),
  };
}

function cleanRadarPolicy(
  patch: RadarPolicyConfiguration | undefined,
  current: RadarPolicyConfiguration,
): RadarPolicyConfiguration {
  const stage = patch?.operatingStage ?? current.operatingStage;
  const domainPolicies = cleanRadarPolicyMap({ ...current.domainPolicies, ...(patch?.domainPolicies ?? {}) }, true);
  const metricPolicies = cleanRadarPolicyMap({ ...current.metricPolicies, ...(patch?.metricPolicies ?? {}) }, false);
  return {
    operatingStage: isOneOf(stage, ["setup", "launch", "operating", "scaling", "seasonal", "paused"] as RadarOperatingStage[]) ? stage : "setup",
    defaultPolicy: cleanRadarPolicyRule({ ...current.defaultPolicy, ...(patch?.defaultPolicy ?? {}) }, DEFAULT_RADAR_POLICY.defaultPolicy),
    domainPolicies,
    metricPolicies,
    exceptions: cleanRadarExceptions(patch?.exceptions ?? current.exceptions),
    updatedAt: patch?.updatedAt ?? current.updatedAt,
  };
}

function cleanRadarPolicyMap(value: unknown, domainsOnly: boolean): Record<string, RadarPolicyRule> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([id, rule]) => (domainsOnly ? RADAR_DOMAINS.includes(id as typeof RADAR_DOMAINS[number]) : /^[a-z0-9][a-z0-9:_-]{2,140}$/.test(id)) && rule && typeof rule === "object" && !Array.isArray(rule))
    .slice(0, domainsOnly ? RADAR_DOMAINS.length : 512)
    .map(([id, rule]) => [id, cleanRadarPolicyRule(rule as RadarPolicyRule)]));
}

function cleanRadarPolicyRule(value: RadarPolicyRule, fallback: RadarPolicyRule = {}): RadarPolicyRule {
  const rule: RadarPolicyRule = {};
  const source = { ...fallback, ...value };
  if (isOneOf(source.state, RADAR_STATES)) rule.state = source.state;
  if (isOneOf(source.activationCondition, RADAR_ACTIVATIONS)) rule.activationCondition = source.activationCondition;
  if (isOneOf(source.baselineStrategy, RADAR_BASELINES)) rule.baselineStrategy = source.baselineStrategy;
  if (typeof source.targetValue === "number" && Number.isFinite(source.targetValue)) rule.targetValue = Math.min(1e12, Math.max(-1e12, source.targetValue));
  const targetLabel = cleanOptional(source.targetLabel, 120);
  if (targetLabel) rule.targetLabel = targetLabel;
  if (source.expectedDirection === "higher" || source.expectedDirection === "lower" || source.expectedDirection === "neutral") rule.expectedDirection = source.expectedDirection;
  assignPolicyNumber(rule, "warningTolerancePercent", source.warningTolerancePercent, 0, 1_000);
  assignPolicyNumber(rule, "criticalTolerancePercent", source.criticalTolerancePercent, rule.warningTolerancePercent ?? 0, 2_000);
  assignPolicyNumber(rule, "minimumSampleSize", source.minimumSampleSize, 0, 1_000_000);
  assignPolicyNumber(rule, "learningPeriodDays", source.learningPeriodDays, 0, 3_650);
  if (isOneOf(source.evaluationWindow, RADAR_WINDOWS)) rule.evaluationWindow = source.evaluationWindow;
  if (typeof source.businessHoursOnly === "boolean") rule.businessHoursOnly = source.businessHoursOnly;
  if (isOneOf(source.notificationCadence, RADAR_NOTIFICATIONS)) rule.notificationCadence = source.notificationCadence;
  const owner = cleanOptional(source.owner, 120);
  const escalationRoute = cleanOptional(source.escalationRoute, 240);
  const activationNote = cleanOptional(source.activationNote, 500);
  if (owner) rule.owner = owner;
  if (escalationRoute) rule.escalationRoute = escalationRoute;
  if (activationNote) rule.activationNote = activationNote;
  if (Array.isArray(source.activeMonths)) rule.activeMonths = [...new Set(source.activeMonths.map(Number).filter(month => Number.isInteger(month) && month >= 1 && month <= 12))].sort((a, b) => a - b);
  return rule;
}

function assignPolicyNumber<K extends "warningTolerancePercent" | "criticalTolerancePercent" | "minimumSampleSize" | "learningPeriodDays">(
  target: RadarPolicyRule,
  key: K,
  value: unknown,
  min: number,
  max: number,
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  target[key] = Math.round(Math.min(max, Math.max(min, value)) * 100) / 100;
}

function cleanRadarExceptions(value: unknown): RadarPolicyException[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const source = item as Partial<RadarPolicyException>;
    const id = cleanOptional(source.id, 100);
    const domain = cleanOptional(source.domain, 40);
    const metricId = cleanOptional(source.metricId, 140);
    const reason = cleanOptional(source.reason, 500);
    const createdBy = cleanOptional(source.createdBy, 100);
    const expiresAt = typeof source.expiresAt === "number" && Number.isFinite(source.expiresAt) ? source.expiresAt : 0;
    const createdAt = typeof source.createdAt === "number" && Number.isFinite(source.createdAt) ? source.createdAt : Date.now();
    if (!id || !domain || !RADAR_DOMAINS.includes(domain as typeof RADAR_DOMAINS[number]) || !reason || !createdBy || !isOneOf(source.effect, RADAR_EXCEPTION_EFFECTS) || expiresAt <= createdAt) return [];
    return [{ id, domain, metricId, effect: source.effect, reason, expiresAt, createdAt, createdBy }];
  }).sort((left, right) => left.expiresAt - right.expiresAt).slice(0, 100);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function cleanAdvisorSkillPolicies(value: unknown): AgencyWorkspaceSettings["advisor"]["skillPolicies"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([id]) => /^[a-z0-9][a-z0-9:_-]{2,100}$/.test(id))
    .slice(0, 64)
    .map(([id, policy]) => [id, { enabled: Boolean((policy as { enabled?: unknown } | null)?.enabled) }]));
}

function cleanCustomAdvisorSkills(value: unknown): AdvisorCustomSkill[] {
  if (!Array.isArray(value)) return [];
  const recipes: AdvisorSkillRecipeId[] = ["executive-radar", "lead-response-triage", "client-health-review", "finance-guard", "delivery-blockers", "reply-drafter", "priority-task-proposal", "single-task-create"];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const source = item as Partial<AdvisorCustomSkill>;
    if (!source.id || !/^skill_[a-f0-9]{8,32}$/.test(source.id) || !recipes.includes(source.recipeId as AdvisorSkillRecipeId)) return [];
    const name = cleanOptional(source.name, 80);
    if (!name) return [];
    const createdAt = cleanNumber(source.createdAt, 0, Number.MAX_SAFE_INTEGER) || Date.now();
    return [{
      id: source.id,
      name,
      description: cleanOptional(source.description, 400),
      recipeId: source.recipeId as AdvisorSkillRecipeId,
      enabled: source.enabled !== false,
      createdAt,
      updatedAt: cleanNumber(source.updatedAt, createdAt, Number.MAX_SAFE_INTEGER) || createdAt,
    }];
  }).slice(0, 24);
}
