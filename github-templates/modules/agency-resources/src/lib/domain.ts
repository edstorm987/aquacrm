// Internal-team resource library domain.

import type { Role, UserId } from "./tenancy";

// 5 kinds — overlap with sops/aqua-resources but team-internal: SOPs
// distinct from the customer-facing SOPs plugin (sops shelf is
// agency-wide; team-resources are operator-internal).
export type TeamResourceKind =
  | "sop"             // team SOP (e.g. "How to onboard a new staff member")
  | "training"        // training module
  | "brand-guideline" // brand book / style
  | "process-doc"     // process documentation
  | "policy"          // HR / compliance policy
  | "note";           // free-form note

export const RESOURCE_KINDS: readonly TeamResourceKind[] =
  ["sop", "training", "brand-guideline", "process-doc", "policy", "note"] as const;

export const KIND_LABELS: Record<TeamResourceKind, string> = {
  sop: "Team SOP",
  training: "Training",
  "brand-guideline": "Brand guideline",
  "process-doc": "Process doc",
  policy: "Policy",
  note: "Note",
};

// All possible roles a TeamResource can be visible to. Empty array
// means "agency staff only" (admins always see; staff sees by
// default). Use this to broaden visibility (e.g. include freelancers).
export const ALL_VISIBLE_ROLES: readonly Role[] = [
  "agency-owner", "agency-manager", "agency-staff", "freelancer",
];

export interface TeamResource {
  id: string;
  agencyId: string;
  kind: TeamResourceKind;
  title: string;
  slug: string;
  body: string;             // markdown
  tags: string[];           // free-form taxonomy
  visibleToRoles: Role[];   // [] = ALL_VISIBLE_ROLES default
  archived: boolean;
  viewCount: number;
  lastViewedAt?: number;
  createdBy?: UserId;
  createdAt: number;
  updatedAt: number;
  lastEditedBy?: UserId;
  lastEditedAt?: number;
}

export interface CreateTeamResourceInput {
  kind: TeamResourceKind;
  title: string;
  body?: string;
  tags?: string[];
  visibleToRoles?: Role[];
  slug?: string;
}

export interface UpdateTeamResourcePatch {
  title?: string;
  body?: string;
  tags?: string[];
  visibleToRoles?: Role[];
  archived?: boolean;
  kind?: TeamResourceKind;
}

export interface TeamResourceFilter {
  kind?: TeamResourceKind;
  query?: string;
  tag?: string;
  includeArchived?: boolean;
}

export interface TeamResourceSummary {
  id: string;
  kind: TeamResourceKind;
  title: string;
  slug: string;
  tags: string[];
  visibleToRoles: Role[];
  archived: boolean;
  viewCount: number;
  lastViewedAt?: number;
  updatedAt: number;
  lastEditedBy?: UserId;
}

export function summarise(r: TeamResource): TeamResourceSummary {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    slug: r.slug,
    tags: r.tags,
    visibleToRoles: r.visibleToRoles,
    archived: r.archived,
    viewCount: r.viewCount,
    lastViewedAt: r.lastViewedAt,
    updatedAt: r.updatedAt,
    lastEditedBy: r.lastEditedBy,
  };
}

export function slugify(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Recent-activity entry — used by the RecentActivityPage.
export interface RecentActivityEntry {
  resourceId: string;
  title: string;
  kind: TeamResourceKind;
  // Either edit or view; whichever was more recent for the row.
  ts: number;
  type: "edited" | "viewed";
  actor?: UserId;
}
