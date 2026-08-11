export const LEAD_WAIT_THRESHOLDS = {
  firstResponseWarningMs: 4 * 60 * 60 * 1_000,
  firstResponseCriticalMs: 24 * 60 * 60 * 1_000,
  followUpMs: 3 * 24 * 60 * 60 * 1_000,
  stageMs: 7 * 24 * 60 * 60 * 1_000,
} as const;

export interface LeadTimingInput {
  capturedAt: number;
  lastEnquiryAt?: number;
  lastEnquiryRespondedAt?: number;
  firstContactedAt?: number;
  lastContactedAt?: number;
  currentStageId?: string;
  stageEnteredAt?: number;
  convertedAt?: number;
  enquiryCount?: number;
}

export type LeadWaitTone = "neutral" | "notice" | "warning" | "critical" | "complete";

export interface LeadTimingSnapshot {
  journeyAgeMs: number;
  latestEnquiryAt: number;
  latestResponseAt?: number;
  latestResponseMs?: number;
  firstResponseMs?: number;
  awaitingResponse: boolean;
  currentWaitMs: number;
  followUpWaitMs?: number;
  stageAgeMs: number;
  needsFollowUp: boolean;
  stageStalled: boolean;
  tone: LeadWaitTone;
}

function elapsed(from: number, to: number): number {
  return Math.max(0, to - from);
}

export function leadTimingSnapshot(lead: LeadTimingInput, referenceNow = Date.now()): LeadTimingSnapshot {
  const now = Number.isFinite(referenceNow) ? referenceNow : Date.now();
  const latestEnquiryAt = lead.lastEnquiryAt ?? lead.capturedAt;
  const latestResponseAt = lead.lastEnquiryAt
    ? lead.lastEnquiryRespondedAt
    : lead.firstContactedAt;
  const awaitingResponse = !latestResponseAt && !lead.convertedAt;
  const currentWaitMs = awaitingResponse
    ? elapsed(latestEnquiryAt, now)
    : elapsed(lead.lastContactedAt ?? latestResponseAt ?? latestEnquiryAt, now);
  const firstResponseMs = lead.firstContactedAt
    ? elapsed(lead.capturedAt, lead.firstContactedAt)
    : undefined;
  const latestResponseMs = latestResponseAt
    ? elapsed(latestEnquiryAt, latestResponseAt)
    : undefined;
  const followUpWaitMs = lead.lastContactedAt
    ? elapsed(lead.lastContactedAt, now)
    : undefined;
  const stageAgeMs = elapsed(lead.stageEnteredAt ?? lead.capturedAt, lead.convertedAt ?? now);
  const closed = Boolean(lead.convertedAt) || lead.currentStageId === "won" || lead.currentStageId === "lost";
  const needsFollowUp = !closed && !awaitingResponse && (followUpWaitMs ?? 0) >= LEAD_WAIT_THRESHOLDS.followUpMs;
  const stageStalled = !closed && stageAgeMs >= LEAD_WAIT_THRESHOLDS.stageMs;
  const tone: LeadWaitTone = closed
    ? "complete"
    : awaitingResponse && currentWaitMs >= LEAD_WAIT_THRESHOLDS.firstResponseCriticalMs
      ? "critical"
      : awaitingResponse && currentWaitMs >= LEAD_WAIT_THRESHOLDS.firstResponseWarningMs
        ? "warning"
        : awaitingResponse
          ? "notice"
          : needsFollowUp || stageStalled
            ? "warning"
            : "neutral";

  return {
    journeyAgeMs: elapsed(lead.capturedAt, lead.convertedAt ?? now),
    latestEnquiryAt,
    latestResponseAt,
    latestResponseMs,
    firstResponseMs,
    awaitingResponse,
    currentWaitMs,
    followUpWaitMs,
    stageAgeMs,
    needsFollowUp,
    stageStalled,
    tone,
  };
}

export function formatElapsed(milliseconds: number): string {
  const ms = Math.max(0, milliseconds);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60 ? `${minutes % 60}m` : ""}`.trim();
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ${hours % 24 ? `${hours % 24}h` : ""}`.trim();
  const weeks = Math.floor(days / 7);
  return `${weeks}w ${days % 7 ? `${days % 7}d` : ""}`.trim();
}

export function averageElapsed(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length ? Math.round(valid.reduce((total, value) => total + value, 0) / valid.length) : undefined;
}
