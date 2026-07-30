import "server-only";

import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type { AgencyWorkspaceSettings, ClientStage } from "./types";

const DEFAULTS: Omit<AgencyWorkspaceSettings, "agencyId" | "updatedAt"> = {
  timezone: "Europe/London",
  defaultCurrency: "GBP",
  defaultTaxRatePercent: 0,
  defaultPaymentTermsDays: 7,
  invoicePrefix: "MM",
  defaultClientStage: "aqua-epic-intro",
  createPortalByDefault: false,
  portalAccessDays: 7,
  notifications: {
    overdueTasks: true,
    outages: true,
    supportRequests: true,
    meetingReminders: true,
    financeAlerts: true,
    marketingAlerts: true,
    digest: "daily",
  },
};

export function getAgencyWorkspaceSettings(agencyId: string): AgencyWorkspaceSettings {
  const stored = getState().agencySettings[agencyId];
  return {
    ...DEFAULTS,
    ...stored,
    agencyId,
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
    message: "Updated AquaCRM workspace settings.",
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
