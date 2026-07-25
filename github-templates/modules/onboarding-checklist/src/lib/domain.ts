// Onboarding-checklist domain.

import type { ClientId, UserId } from "./tenancy";

export type OwnerKind = "agency" | "customer";
export type ChecklistStatus = "todo" | "done" | "skipped";

export const OWNER_KINDS: readonly OwnerKind[] = ["agency", "customer"] as const;
export const CHECKLIST_STATUSES: readonly ChecklistStatus[] = ["todo", "done", "skipped"] as const;

export interface ChecklistItem {
  id: string;
  agencyId: string;
  clientId: ClientId;
  title: string;
  description?: string;
  ownerKind: OwnerKind;
  status: ChecklistStatus;
  dueAt?: number;
  completedAt?: number;
  completedBy?: UserId;
  ordering: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateChecklistItemInput {
  title: string;
  description?: string;
  ownerKind: OwnerKind;
  dueAt?: number;
}

export interface UpdateChecklistItemPatch {
  title?: string;
  description?: string;
  ownerKind?: OwnerKind;
  dueAt?: number | null;
  status?: ChecklistStatus;
}

export interface BulkTickEntry {
  id: string;
  status: ChecklistStatus;
}

export interface CompletionPct {
  total: number;
  done: number;
  skipped: number;
  todo: number;
  // Percentage of (done + skipped) over total — skipped counts as
  // "handled" so checklists with N/A items can still reach 100%.
  pct: number;
}

// 8 default seed items typical of agency onboarding (Epic Intro +
// Blueprint phases). Idempotent on install: seeding refuses to run a
// second time when ANY items already exist for the (agency, client).
export interface DefaultSeedItem {
  title: string;
  description: string;
  ownerKind: OwnerKind;
}

export const DEFAULT_SEED_ITEMS: readonly DefaultSeedItem[] = [
  { title: "Welcome call booked",       description: "Kickoff intro call scheduled with the client owner.",         ownerKind: "agency"   },
  { title: "Welcome gift sent",         description: "Branded welcome package shipped (signed by founder).",        ownerKind: "agency"   },
  { title: "Brand questionnaire",       description: "Client completes the brand discovery questionnaire.",         ownerKind: "customer" },
  { title: "Asset upload",              description: "Logos, fonts, product photography uploaded to client-files.", ownerKind: "customer" },
  { title: "Ad-account access granted", description: "Meta / Google ad-account access shared with the agency.",     ownerKind: "customer" },
  { title: "Comms-channel confirmed",   description: "Slack Connect / WhatsApp / email confirmed as primary.",      ownerKind: "agency"   },
  { title: "Scope agreement signed",    description: "Statement of work counter-signed by both parties.",            ownerKind: "agency"   },
  { title: "Kickoff scheduled",         description: "Phase-2 Blueprint kickoff session on the calendar.",          ownerKind: "agency"   },
] as const;
