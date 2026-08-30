import type { CompanyProfile } from "@/server/types";

/**
 * Every Battle Table station and the Company workspace edit one CompanyProfile
 * and PUT the whole record. The server now refuses a write whose `revision` is
 * not the one the editor loaded, which turns a silent last-write-wins overwrite
 * into a visible conflict. This module holds the client half of that contract:
 * work out which top-level fields the editor actually changed, and rebase only
 * those onto the newer profile the server handed back so a retry keeps the other
 * session's work instead of clobbering it.
 */

const REBASEABLE_FIELDS = [
  "mission",
  "vision",
  "values",
  "monthlyRevenueTargetCents",
  "averageDealValueCents",
  "salesCallCloseRatePercent",
  "annualRevenueTargetCents",
  "capacity",
  "projection",
  "capital",
  "objectives",
  "plans",
  "reviews",
] as const satisfies readonly (keyof CompanyProfile)[];

export type RebaseableCompanyField = (typeof REBASEABLE_FIELDS)[number];

export interface CompanyProfileConflict {
  /** The profile the editor started from. */
  base: CompanyProfile;
  /** What the editor tried to save. */
  attempted: CompanyProfile;
  /** The newer profile the server answered the refusal with. */
  latest: CompanyProfile;
}

/** The top-level fields this editor actually touched — nothing else is resent. */
export function changedCompanyFields(base: CompanyProfile, attempted: CompanyProfile): RebaseableCompanyField[] {
  return REBASEABLE_FIELDS.filter(field => JSON.stringify(base[field]) !== JSON.stringify(attempted[field]));
}

/**
 * Reapply this editor's own changes onto the newer profile. Untouched fields
 * keep the newer session's values, and the retry carries the newer revision so
 * the server can compare-and-swap again rather than being told to trust us.
 */
export function rebaseCompanyProfile(conflict: CompanyProfileConflict): CompanyProfile {
  const next: CompanyProfile = { ...conflict.latest };
  for (const field of changedCompanyFields(conflict.base, conflict.attempted)) {
    Object.assign(next, { [field]: conflict.attempted[field] });
  }
  return { ...next, agencyId: conflict.latest.agencyId, companyId: conflict.latest.companyId, revision: conflict.latest.revision };
}

/** Plain-English account of what happened and what the retry will do. */
export function describeCompanyConflict(conflict: CompanyProfileConflict): string {
  const fields = changedCompanyFields(conflict.base, conflict.attempted);
  if (!fields.length) return "This plan changed elsewhere while you had it open. The latest version is now loaded; nothing of yours was lost.";
  return `This plan changed elsewhere while you had it open — nothing was overwritten. The latest version is loaded; retrying reapplies your ${fields.length} changed section${fields.length === 1 ? "" : "s"} onto it.`;
}
