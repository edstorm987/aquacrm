export const CLIENT_OPERATION_STATES = [
  "unassigned",
  "onboarding",
  "active",
  "waiting-client",
  "paused",
  "at-risk",
  "closing",
] as const;

export type ClientOperationState = (typeof CLIENT_OPERATION_STATES)[number];

export interface ClientOperationsReview {
  id: string;
  outcome: string;
  reviewedAt: number;
  nextReviewAt?: number;
  reviewedBy: string;
}

export interface ClientOperationsBrief {
  ownerId?: string;
  ownerUserId?: string;
  ownerName?: string;
  ownerEmail?: string;
  state: ClientOperationState;
  currentObjective?: string;
  nextReviewAt?: number;
  riskSummary?: string;
  handoverNote?: string;
  reviews: ClientOperationsReview[];
  updatedAt?: number;
  updatedBy?: string;
}

export function cleanClientOperationsBrief(value: unknown): ClientOperationsBrief {
  if (!value || typeof value !== "object") return { state: "unassigned", reviews: [] };
  const candidate = value as Partial<ClientOperationsBrief>;
  return {
    ownerId: cleanText(candidate.ownerId, 160),
    ownerUserId: cleanText(candidate.ownerUserId, 160),
    ownerName: cleanText(candidate.ownerName, 160),
    ownerEmail: cleanText(candidate.ownerEmail, 320),
    state: CLIENT_OPERATION_STATES.includes(candidate.state as ClientOperationState)
      ? candidate.state as ClientOperationState
      : "unassigned",
    currentObjective: cleanText(candidate.currentObjective, 1_000),
    nextReviewAt: cleanTimestamp(candidate.nextReviewAt),
    riskSummary: cleanText(candidate.riskSummary, 4_000),
    handoverNote: cleanText(candidate.handoverNote, 10_000),
    reviews: cleanReviews(candidate.reviews),
    updatedAt: cleanTimestamp(candidate.updatedAt),
    updatedBy: cleanText(candidate.updatedBy, 320),
  };
}

function cleanReviews(value: unknown): ClientOperationsReview[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ClientOperationsReview>;
    const id = cleanText(candidate.id, 160);
    const outcome = cleanText(candidate.outcome, 10_000);
    const reviewedAt = cleanTimestamp(candidate.reviewedAt);
    const reviewedBy = cleanText(candidate.reviewedBy, 320);
    if (!id || !outcome || !reviewedAt || !reviewedBy) return [];
    return [{ id, outcome, reviewedAt, nextReviewAt: cleanTimestamp(candidate.nextReviewAt), reviewedBy }];
  }).sort((left, right) => right.reviewedAt - left.reviewedAt).slice(0, 50);
}

export function clientOperationStateLabel(state: ClientOperationState): string {
  return state === "waiting-client"
    ? "Waiting on client"
    : state === "at-risk"
      ? "At risk"
      : state.charAt(0).toUpperCase() + state.slice(1);
}

function cleanText(value: unknown, limit: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : undefined;
}

function cleanTimestamp(value: unknown): number | undefined {
  const timestamp = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
}
