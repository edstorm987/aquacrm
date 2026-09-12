import { randomUUID } from "node:crypto";

import type {
  MeetingAttempt,
  MeetingAttemptChannel,
  MeetingAttemptOutcome,
  MeetingMode,
  MeetingStatus,
  SalesPresentation,
} from "../lib/domain";
import type { UserId } from "../lib/tenancy";

export const MEETING_ATTEMPT_HISTORY_LIMIT = 1_000;

export class MeetingAttemptHistoryLimitError extends Error {
  constructor() {
    super("Meeting interaction history has reached its 1,000-entry limit.");
    this.name = "MeetingAttemptHistoryLimitError";
  }
}

/**
 * Sanitised meeting fields supplied by the HTTP boundary. The actor, write
 * timestamp and complete attempt history are intentionally absent: the
 * service creates those only after it holds the durable record lock.
 */
export interface MeetingMutationInput {
  patch: {
    nextMeetingAt?: number;
    meetingLink?: string;
    meetingNotes?: string;
    meetingMode?: MeetingMode;
    meetingLocation?: string;
    meetingStatus?: MeetingStatus;
    meetingReminderAt?: number;
    salesPresentations?: SalesPresentation[];
    callRecordingUrl?: string;
    sessionNotes?: string;
  };
  meetingConfirmed?: boolean;
  attempt?: {
    channel: MeetingAttemptChannel;
    outcome: MeetingAttemptOutcome;
    notes?: string;
  };
}

export function appendServerMeetingAttempt(
  existing: MeetingAttempt[] | undefined,
  input: NonNullable<MeetingMutationInput["attempt"]>,
  actor: UserId,
  at: number,
): MeetingAttempt[] {
  const attempts = [...(existing ?? [])];
  if (attempts.length >= MEETING_ATTEMPT_HISTORY_LIMIT) {
    throw new MeetingAttemptHistoryLimitError();
  }
  attempts.push({
    id: `attempt_${randomUUID()}`,
    at,
    actorUserId: actor,
    channel: input.channel,
    outcome: input.outcome,
    notes: input.notes,
  });
  return attempts;
}
