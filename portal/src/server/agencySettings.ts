import "server-only";

import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type { AdvisorCustomSkill, AdvisorSkillRecipeId, AgencyWorkspaceSettings, ClientStage } from "./types";

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
    advisor: { ...DEFAULTS.advisor, ...(stored?.advisor ?? {}) },
    notifications: { ...DEFAULTS.notifications, ...(stored?.notifications ?? {}) },
    updatedAt: stored?.updatedAt ?? 0,
  };
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
    timezone: cleanOptional(patch.timezone ?? current.timezone, 80) || DEFAULTS.timezone,
    defaultCurrency: cleanCurrency(patch.defaultCurrency ?? current.defaultCurrency),
    defaultTaxRatePercent: cleanNumber(patch.defaultTaxRatePercent ?? current.defaultTaxRatePercent, 0, 100),
    defaultPaymentTermsDays: cleanNumber(patch.defaultPaymentTermsDays ?? current.defaultPaymentTermsDays, 0, 365),
    invoicePrefix: cleanOptional(patch.invoicePrefix ?? current.invoicePrefix, 12)?.toUpperCase() || DEFAULTS.invoicePrefix,
    defaultClientStage: cleanStage(patch.defaultClientStage ?? current.defaultClientStage),
    createPortalByDefault: patch.createPortalByDefault ?? current.createPortalByDefault,
    portalAccessDays: cleanNumber(patch.portalAccessDays ?? current.portalAccessDays, 1, 90),
    clientWelcomeMessage: cleanOptional(patch.clientWelcomeMessage ?? current.clientWelcomeMessage, 2_000),
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

function cleanCurrency(value: unknown): string {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(currency) ? currency : DEFAULTS.defaultCurrency;
}

function cleanNumber(value: unknown, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
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
  };
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
