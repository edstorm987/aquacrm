import type { Billing, CreatePlanInput, Plan } from "./domain";
import type { PluginInstall } from "./tenancy";

export const DEFAULT_MEMBER_PORTAL_HEADING = "Your membership";
export const DEFAULT_BILLING_PORTAL_RETURN_PATH = "/portal/customer/memberships";
export const DEFAULT_TRIAL_DAYS = 0;
const SAFE_RETURN_PROTOCOLS = new Set(["http:", "https:"]);

export interface MembershipSettings {
  defaultTrialDays: number;
  billingPortalReturnUrl: string | null;
  memberPortalHeading: string;
  showAnnualToggle: boolean;
  annualBillingEnabled: boolean;
}

type MembershipInstallSettings = Pick<PluginInstall, "config" | "features">;

function integerInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= min
    && value <= max
    ? value
    : null;
}

function trimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** One runtime interpretation for every memberships install setting. */
export function normalizeMembershipSettings(install: MembershipInstallSettings): MembershipSettings {
  return {
    defaultTrialDays: integerInRange(install.config.defaultTrialDays, 0, 365) ?? DEFAULT_TRIAL_DAYS,
    billingPortalReturnUrl: trimmedString(install.config.billingPortalReturnUrl),
    memberPortalHeading: trimmedString(install.config.memberPortalHeading) ?? DEFAULT_MEMBER_PORTAL_HEADING,
    showAnnualToggle: typeof install.config.showAnnualToggle === "boolean"
      ? install.config.showAnnualToggle
      : true,
    annualBillingEnabled: install.features["annual-billing"] === true,
  };
}

/**
 * Apply the install default before PlanService creates its durable operation
 * fingerprint. An explicit zero is an authored value and must never be treated
 * as absence.
 */
export function applyDefaultTrialDays(
  input: CreatePlanInput,
  defaultTrialDays: number,
): CreatePlanInput {
  return Object.prototype.hasOwnProperty.call(input, "trialDays")
    ? input
    : { ...input, trialDays: defaultTrialDays };
}

function sameOriginHttpUrl(candidate: unknown, origin: string): string | null {
  const raw = trimmedString(candidate);
  if (!raw) return null;
  try {
    const resolved = new URL(raw, `${origin}/`);
    if (!SAFE_RETURN_PROTOCOLS.has(resolved.protocol)) return null;
    if (resolved.origin !== origin || resolved.username || resolved.password) return null;
    return resolved.href;
  } catch {
    return null;
  }
}

/**
 * Stripe always receives an absolute, same-origin HTTP(S) return target.
 * Unsafe or malformed higher-priority candidates simply do not outrank the
 * next configured safe target.
 */
export function resolveBillingPortalReturnUrl(args: {
  requestUrl: string;
  explicitReturnUrl?: unknown;
  configuredReturnUrl?: unknown;
}): string {
  const request = new URL(args.requestUrl);
  const origin = request.origin;
  return sameOriginHttpUrl(args.explicitReturnUrl, origin)
    ?? sameOriginHttpUrl(args.configuredReturnUrl, origin)
    ?? new URL(DEFAULT_BILLING_PORTAL_RETURN_PATH, `${origin}/`).href;
}

export function isAnnualPlanEligible(plan: Pick<Plan, "priceAnnual" | "status">): boolean {
  return plan.status === "active" && Number.isSafeInteger(plan.priceAnnual) && plan.priceAnnual > 0;
}

export function canShowAnnualCadence(
  settings: Pick<MembershipSettings, "showAnnualToggle" | "annualBillingEnabled">,
  plans: readonly Pick<Plan, "priceAnnual" | "status">[],
): boolean {
  return settings.showAnnualToggle
    && settings.annualBillingEnabled
    && plans.some(isAnnualPlanEligible);
}

export function planSupportsBilling(
  plan: Pick<Plan, "priceAnnual" | "status">,
  billing: Billing,
): boolean {
  return billing === "monthly" || isAnnualPlanEligible(plan);
}
