// Feedback-loops domain.

import type { ClientId, UserId } from "./tenancy";

// ── Pulse ──────────────────────────────────────────────────────

export interface Pulse {
  id: string;
  agencyId: string;
  clientId: ClientId;
  sentAt: number;
  respondent: string;          // customer email at request time
  // Score is set when the customer responds. Until then the pulse is
  // "outstanding" — score === undefined, respondedAt === undefined.
  score?: number;              // 1..10 inclusive
  comment?: string;
  respondedAt?: number;
  createdBy?: UserId;
  // Severity flag: score < 6 marks a detractor (NPS detractor band
  // adjusted for 1-10 scale). Latched on FIRST response only — later
  // edits don't re-emit the detractor event.
  detractorEmittedAt?: number;
}

export interface SendPulseInput {
  respondent: string;
  comment?: string;            // operator may pre-fill a note
  sentAt?: number;             // override for backfill / migrations
}

export interface RespondPulseInput {
  score: number;               // 1..10 inclusive, integer
  comment?: string;
  respondedAt?: number;        // override (used by tests / migrations)
}

export interface PulseSummary {
  totalSent: number;
  totalResponded: number;
  responseRate: number;        // 0..1
  avgScore?: number;           // undefined when no responses
  detractors: number;
  passives: number;            // 6-7
  promoters: number;           // 8+
  byMonth: PulseMonth[];       // descending (newest first)
}

export interface PulseMonth {
  month: string;               // "YYYY-MM"
  sent: number;
  responded: number;
  avgScore?: number;
}

// Detractor cutoff (score strictly below this is a detractor).
export const DETRACTOR_CUTOFF = 6;
// Promoter cutoff (score >= this is a promoter).
export const PROMOTER_CUTOFF = 8;

// ── Testimonial ───────────────────────────────────────────────

export type TestimonialStatus =
  | "pending"   // request sent, customer has not replied
  | "replied"   // customer replied; agency has not approved
  | "approved"  // agency approved (still private)
  | "public";   // approved AND published to public wall

export const TESTIMONIAL_STATUSES: readonly TestimonialStatus[] =
  ["pending", "replied", "approved", "public"] as const;

// State machine — public wall surface itself is R+1 but the state is
// tracked here so when the wall ships nothing structural changes.
export const TESTIMONIAL_TRANSITIONS: Record<TestimonialStatus, TestimonialStatus[]> = {
  pending: ["replied"],
  replied: ["approved", "pending"],   // re-request collapses back to pending
  approved: ["public", "replied"],    // approve→public OR demote back to replied
  public: ["approved"],               // unpublish back to approved (still kept)
};

export interface TestimonialRequest {
  id: string;
  agencyId: string;
  clientId: ClientId;
  prompt: string;
  status: TestimonialStatus;
  respondent: string;          // customer email
  reply?: string;
  repliedAt?: number;
  approvedAt?: number;
  publishedAt?: number;
  createdBy?: UserId;
  createdAt: number;
  updatedAt: number;
}

export interface RequestTestimonialInput {
  prompt: string;
  respondent: string;
}

export interface ReplyTestimonialInput {
  reply: string;
  repliedAt?: number;
}
