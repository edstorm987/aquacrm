// Public-funnel domain.

import type { UserId } from "./tenancy";

export type LeadSource = "hc" | "tool" | "signup-card";

export const LEAD_SOURCES: readonly LeadSource[] = ["hc", "tool", "signup-card"] as const;

// Health Check completion slot. Loose JSON-ish shape — HC is outside
// this plugin (T4's `public/health-check/`), so we record what HC
// chooses to send rather than enforcing a tight schema. Common
// fields documented for BOS readers.
export interface HCSlot {
  // Numeric "slot" id assigned by HC to the user's overall placement
  // (e.g. 1 = early-stage, 5 = scaling). Optional — HC may not send.
  slot?: number;
  // Per-axis scores (e.g. brand, traffic, conversion). Free-form.
  scores?: Record<string, number>;
  // Strings/booleans the HC quiz captured.
  answers?: Record<string, string | number | boolean>;
  // HC schema version it was authored against — captured so BOS
  // readers can adapt without re-running the quiz.
  hcSchemaVersion?: string;
  // Anything else HC wants us to remember.
  [key: string]: unknown;
}

export interface LeadCapture {
  id: string;
  source: LeadSource;
  /** Exact erasure lineage. Historical/pre-client captures omit both fields. */
  clientId?: string;
  personId?: string;
  /**
   * Anonymous captures are deliberately outside the authenticatable User
   * namespace. A mailbox-proof promotion flow may later attach a real user;
   * legacy rows can already contain this field.
   */
  leadUserId?: UserId;
  /** Opaque, non-authenticatable identity local to this capture. */
  pendingLeadId?: string;
  /** Exact CRM lineage, present only after an authorised promotion command. */
  promotion?: PendingCapturePromotion;
  email: string;
  capturedAt: number;
  // Source-specific payload. For `hc` this carries the HCSlot; for
  // `tool` it carries the tool's input/output; for `signup-card`
  // an UTM-ish snapshot.
  sourceMeta: Record<string, unknown>;
  hcSlot?: HCSlot;
}

export interface PendingCapturePromotion {
  operationId: string;
  authorityKind: "mailbox-proof" | "authenticated";
  promotedAt: number;
  leadId: string;
  personId: string;
  prospectId?: string;
  pipelineCardId?: string;
}

export type PendingCapturePromotionAuthority =
  | {
      kind: "mailbox-proof";
      /** Canonical mailbox address established by a separate verifier. */
      verifiedEmail: string;
      /** Stable, non-secret verification nonce/id — never the proof token. */
      verificationId: string;
    }
  | {
      kind: "authenticated";
      /** The already-authorised operator responsible for the promotion. */
      actorUserId: UserId;
      /** Stable command id supplied by the authenticated boundary. */
      operationId: string;
    };

export interface PromotePendingCaptureInput {
  captureId: string;
  authority: PendingCapturePromotionAuthority;
  profile?: {
    name?: string;
    phone?: string;
    company?: string;
  };
}

export interface PromotePendingCaptureResult {
  capture: LeadCapture;
  promotion: PendingCapturePromotion;
  promoted: boolean;
}

export interface CaptureHcInput {
  email: string;
  slot: HCSlot;
  /** Stable per-results operation id. Retrying it reuses the original capture. */
  completionId?: string;
  sourceMeta?: Record<string, unknown>;
}

export interface CaptureToolInput {
  email: string;
  toolId: string;                // e.g. "rank-my-website"
  completionId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  sourceMeta?: Record<string, unknown>;
}

export interface CaptureResult {
  capture: LeadCapture;
  pendingLeadId: string;
  // Anonymous completion can only register a brand-new pending capture.
  // Existing identities and replayed completion ids fail closed first.
  created: boolean;
}

export interface MeContext {
  leadUserId: UserId;
  email: string;
  // Most recent HC slot (if any captured for this lead).
  hcSlot?: HCSlot;
  // All captures for this lead, newest first.
  captures: LeadCapture[];
}

// Score-bucket helper. Exposed so the HC-completed event payload is
// stable across HC schema bumps.
export type HcScoreBucket = "early" | "growing" | "scaling";

export function bucketHcSlot(slot?: HCSlot): HcScoreBucket | undefined {
  if (!slot) return undefined;
  const n = typeof slot.slot === "number" ? slot.slot : undefined;
  if (n === undefined) return undefined;
  if (n <= 2) return "early";
  if (n <= 4) return "growing";
  return "scaling";
}

// Email canonicalisation — trim + lowercase. Anonymous capture never reuses
// an identity; the canonical form makes repeat refusal deterministic.
export function canonEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isPlausibleEmail(raw: string): boolean {
  const e = canonEmail(raw);
  if (!e.includes("@")) return false;
  const at = e.indexOf("@");
  if (at === 0 || at === e.length - 1) return false;
  if (!e.slice(at + 1).includes(".")) return false;
  return true;
}
