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
  // The lead user's id. Set after the user is created by the LeadUserPort.
  leadUserId: UserId;
  email: string;
  capturedAt: number;
  // Source-specific payload. For `hc` this carries the HCSlot; for
  // `tool` it carries the tool's input/output; for `signup-card`
  // an UTM-ish snapshot.
  sourceMeta: Record<string, unknown>;
  hcSlot?: HCSlot;
}

export interface CaptureHcInput {
  email: string;
  slot: HCSlot;
  sourceMeta?: Record<string, unknown>;
}

export interface CaptureToolInput {
  email: string;
  toolId: string;                // e.g. "rank-my-website"
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  sourceMeta?: Record<string, unknown>;
}

export interface CaptureResult {
  capture: LeadCapture;
  leadUserId: UserId;
  // Opaque session token / cookie string. Foundation's SessionPort
  // produces this; the plugin treats it as a black box and returns
  // it in the JSON body for the HC client to set client-side, OR
  // the foundation handler re-issues a Set-Cookie response header.
  session?: string;
  // Whether the call created a NEW lead user. False on idempotent
  // re-completion (same email re-submits HC).
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

// Email canonicalisation — trim + lowercase. Used as the
// idempotency key.
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
