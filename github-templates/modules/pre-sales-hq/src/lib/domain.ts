// Pre-sales HQ domain.

import type { UserId } from "./tenancy";

export type DiscoveryOutcome = "scheduled" | "completed" | "no-show" | "cancelled";

export const DISCOVERY_OUTCOMES: readonly DiscoveryOutcome[] =
  ["scheduled", "completed", "no-show", "cancelled"] as const;

export interface DiscoveryCall {
  id: string;
  agencyId: string;
  leadId: string;
  scheduledAt: number;
  completedAt?: number;
  outcome: DiscoveryOutcome;
  notes?: string;
  createdBy?: UserId;
  createdAt: number;
  updatedAt: number;
}

export interface CreateDiscoveryCallInput {
  leadId: string;
  scheduledAt: number;
  notes?: string;
}

export interface UpdateDiscoveryCallPatch {
  scheduledAt?: number;
  notes?: string;
  completedAt?: number;
  outcome?: DiscoveryOutcome;
}

export type ProposalStatus = "draft" | "sent" | "accepted" | "rejected" | "withdrawn";

export const PROPOSAL_STATUSES: readonly ProposalStatus[] =
  ["draft", "sent", "accepted", "rejected", "withdrawn"] as const;

export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ["sent", "withdrawn"],
  sent: ["accepted", "rejected", "withdrawn"],
  accepted: [],
  rejected: ["sent"],          // re-pitch path
  withdrawn: ["draft"],        // operator can reopen as draft
};

export interface Proposal {
  id: string;
  agencyId: string;
  leadId: string;
  amountCents: number;
  currency: string;            // "gbp" / "usd" / etc — matches finance plugin's union shape
  status: ProposalStatus;
  sentAt?: number;
  decidedAt?: number;          // accepted/rejected timestamp
  notes?: string;
  createdBy?: UserId;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProposalInput {
  leadId: string;
  amountCents: number;
  currency?: string;
  notes?: string;
}

export type NurtureType = "email" | "call" | "linkedin" | "other";

export interface NurtureTouch {
  id: string;
  agencyId: string;
  leadId: string;
  type: NurtureType;
  sentAt: number;
  response?: "replied" | "no-response" | "bounced";
  notes?: string;
  createdBy?: UserId;
  createdAt: number;
}

export interface CreateNurtureTouchInput {
  leadId: string;
  type: NurtureType;
  sentAt?: number;
  response?: NurtureTouch["response"];
  notes?: string;
}

// Re-Nurturing cadence: a lead is "overdue" when more than this many
// days have passed since the last NurtureTouch with response !==
// "replied". Default 14 days; overridable per-agency.
export const DEFAULT_NURTURE_CADENCE_DAYS = 14;

export interface OverdueNurture {
  leadId: string;
  daysSinceLastTouch: number;
  lastTouchAt?: number;
  lastTouchType?: NurtureType;
}

// Subscriber payload for client-crm `lead.status_changed`. Mirrors
// the marketing plugin's onCrmLeadStatusChanged shape so foundations
// can wire both subscribers from a single bus event.
export interface LeadStatusChangedEvent {
  leadId: string;
  fromStatus?: string;
  toStatus: string;
}
