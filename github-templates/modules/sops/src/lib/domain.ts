// SOP shelf domain. Persisted under per-install plugin storage.
//
// SOPs are agency-scoped notes with markdown bodies + a tag-family
// taxonomy mirrored from chapter #59 §9c.

import type { AgencyId, UserId } from "./tenancy";

export type TagFamily =
  | "sales"     // Sales & Discovery — lead magnets, presentation, rebuttals.
  | "service"   // Onboarding & Service Delivery — Aqua Incubator, recurring.
  | "leads"     // Leads & Nurturing — Pre-Sales HQ, Re-Nurturing.
  | "standards" // Standards & Internal — communication, behaviour, the Novem.
  | "mastery";  // Mastery Plan — 200+ reviews follow-on.

export const TAG_FAMILIES: TagFamily[] = [
  "sales", "service", "leads", "standards", "mastery",
];

export const TAG_FAMILY_LABELS: Record<TagFamily, string> = {
  sales: "Sales & Discovery",
  service: "Onboarding & Service Delivery",
  leads: "Leads & Nurturing",
  standards: "Standards & Internal",
  mastery: "Mastery Plan",
};

export type SopStatus = "draft" | "published" | "archived";

export interface Sop {
  id: string;
  agencyId: AgencyId;
  title: string;
  slug: string;
  body: string;        // markdown source
  tags: TagFamily[];
  status: SopStatus;
  createdAt: number;
  createdBy?: UserId;
  updatedAt: number;
  updatedBy?: UserId;
}

export interface CreateSopInput {
  title: string;
  body?: string;
  tags?: TagFamily[];
  status?: SopStatus;
  slug?: string;
}

export interface UpdateSopPatch {
  title?: string;
  body?: string;
  tags?: TagFamily[];
  status?: SopStatus;
}

export interface SopFilter {
  tag?: TagFamily;
  status?: SopStatus;
  query?: string;       // free-text title match (case-insensitive substring)
}

// Slug builder — lower-case, hyphenate non-alphanumerics, trim repeats.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "sop";
}
