import type { MarketingCustomerProfile } from "@/built-ins/modules/agency-marketing/src/lib/domain";

/**
 * Customer-intelligence scope + dimensions (KPI intelligence Phase 7).
 *
 * The people/audience workspace can run for **one business** or the **full
 * ecosystem**, and break its profiles down by a configurable dimension. Pure,
 * client-safe helpers — no fabricated data (an unspecified value is labelled, a
 * profile counts in each value of an array dimension).
 */

export type ProfileDimension = "segment" | "priority" | "status" | "confidence" | "location" | "company";

/** Scope profiles to one company; group-wide profiles (no companyIds) always show. `"all"` = the whole ecosystem. */
export function scopeProfiles(profiles: MarketingCustomerProfile[], companyId: string): MarketingCustomerProfile[] {
  if (companyId === "all") return profiles;
  return profiles.filter(profile => profile.companyIds.length === 0 || profile.companyIds.includes(companyId));
}

export interface ProfileBreakdownRow {
  value: string;
  count: number;
}

/**
 * Count the profiles by a chosen dimension, most-common first. Array dimensions
 * (location, company) count a profile once per value; empty values are labelled
 * honestly rather than dropped.
 */
export function summariseProfileDimension(profiles: MarketingCustomerProfile[], dimension: ProfileDimension, companyNames?: Map<string, string>): ProfileBreakdownRow[] {
  const counts = new Map<string, number>();
  const add = (value: string) => counts.set(value, (counts.get(value) ?? 0) + 1);
  for (const profile of profiles) {
    switch (dimension) {
      case "location": (profile.locations.length ? profile.locations : ["Unspecified"]).forEach(add); break;
      case "company": (profile.companyIds.length ? profile.companyIds.map(id => companyNames?.get(id) ?? id) : ["Group-wide"]).forEach(add); break;
      case "segment": add(profile.segment || "Unsegmented"); break;
      case "priority": add(profile.priority || "Unset"); break;
      case "status": add(profile.status); break;
      case "confidence": add(profile.evidenceConfidence || "Unknown"); break;
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}
