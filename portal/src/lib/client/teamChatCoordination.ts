import type { PeopleChannel, PeopleMessage } from "@/server/types";

/**
 * Team Chat request ordering, owned outside React so the contract is provable
 * without a DOM and identical wherever `TeamChat` mounts (People, Team, Dev
 * Team). It mirrors `NotificationAttentionCoordinator`: every fetch takes a
 * token when it starts, and the token decides whether the response may paint.
 *
 *   - A selection is an INTENT. Every load, poll or send that began before the
 *     latest intent is dropped when it settles, whatever order it arrives in.
 *   - A load for a channel the operator no longer wants cannot paint.
 *   - A response older than the newest applied response cannot paint.
 *   - Sends are counted while in flight, so busy state settles when the last
 *     one settles even if the operator has switched conversation meanwhile.
 *
 * → issues #147
 */

export type TeamChatRosterEntry = {
  userId: string;
  name: string;
  presence: { state: "online" | "idle" | "offline"; lastSeenAt?: number };
  workingToday: boolean;
};

export type TeamChatSnapshot = {
  channels: PeopleChannel[];
  activeChannelId: string;
  messages: PeopleMessage[];
  roster: TeamChatRosterEntry[];
  selfUserId: string;
};

export interface TeamChatLoadToken {
  id: number;
  intent: number;
  channelId: string | null;
  selection: boolean;
  previousDesiredChannelId: string | null;
}

export interface TeamChatSendToken {
  id: number;
  intent: number;
  action: string;
  channelId: string | null;
}

export interface TeamChatOutcome {
  /** The response may repaint the conversation. */
  applied: boolean;
  /** The failure belongs to the operator's current intent and should be shown. */
  exposeFailure: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isChannel(value: unknown): value is PeopleChannel {
  const row = record(value);
  return typeof row?.id === "string" && row.id.length > 0
    && (row.kind === "team" || row.kind === "direct")
    && typeof row.name === "string"
    && Array.isArray(row.memberUserIds) && row.memberUserIds.every(id => typeof id === "string");
}

function isMessage(value: unknown): value is PeopleMessage {
  const row = record(value);
  return typeof row?.id === "string" && row.id.length > 0
    && typeof row.channelId === "string"
    && typeof row.authorUserId === "string"
    && typeof row.authorName === "string"
    && typeof row.body === "string"
    && Number.isFinite(row.createdAt);
}

function isRosterEntry(value: unknown): value is TeamChatRosterEntry {
  const row = record(value);
  const presence = record(row?.presence);
  return typeof row?.userId === "string" && typeof row.name === "string"
    && typeof row.workingToday === "boolean"
    && (presence?.state === "online" || presence?.state === "idle" || presence?.state === "offline");
}

/**
 * Only a complete, well-typed snapshot may paint. A 2xx with `ok: true` and a
 * missing or malformed message list is not a chat state; treating it as one
 * would clear a draft or blank the conversation on the server's say-so.
 */
export function isTeamChatSnapshot(value: unknown): value is TeamChatSnapshot {
  const payload = record(value);
  if (!payload || payload.ok === false) return false;
  return typeof payload.activeChannelId === "string"
    && typeof payload.selfUserId === "string"
    && Array.isArray(payload.channels) && payload.channels.every(isChannel)
    && Array.isArray(payload.messages) && payload.messages.every(isMessage)
    && Array.isArray(payload.roster) && payload.roster.every(isRosterEntry);
}

/**
 * A posted message counts as sent only when the authoritative snapshot is for
 * the channel it was posted to AND carries the operator's message. Anything
 * less keeps the draft and shows the failure.
 */
export function isPostedTeamChatSnapshot(
  value: unknown,
  expected: { channelId: string; body: string },
): value is TeamChatSnapshot {
  if (!isTeamChatSnapshot(value)) return false;
  if (value.activeChannelId !== expected.channelId) return false;
  const body = expected.body.trim();
  return value.messages.some(message =>
    message.channelId === expected.channelId
    && message.authorUserId === value.selfUserId
    && message.body === body);
}

/**
 * The draft after a send settles. Only a validated success clears it, and
 * only when the composer still holds exactly what was submitted — a draft the
 * operator has since edited is theirs, not the send's. A failed send changes
 * nothing, so the exact text is there to retry.
 */
export function draftAfterSend(
  drafts: Readonly<Record<string, string>>,
  channelId: string,
  submitted: string,
  outcome: "success" | "failure",
): Record<string, string> {
  if (outcome !== "success") return { ...drafts };
  if ((drafts[channelId] ?? "") !== submitted) return { ...drafts };
  const next = { ...drafts };
  delete next[channelId];
  return next;
}

export class TeamChatCoordinator {
  private requestSequence = 0;
  private appliedSequence = 0;
  private intentSequence = 0;
  private latestSendId = 0;
  private desiredChannel: string | null = null;
  private appliedChannel: string | null = null;
  private readonly inFlightSends = new Set<number>();

  desiredChannelId(): string | null {
    return this.desiredChannel;
  }

  /** The conversation the last accepted response painted. */
  appliedChannelId(): string | null {
    return this.appliedChannel;
  }

  /** Sends still awaiting an outcome; busy state is derived from it. */
  pendingSendCount(): number {
    return this.inFlightSends.size;
  }

  beginLoad(channelId?: string, selection = false): TeamChatLoadToken {
    const previousDesiredChannelId = this.desiredChannel;
    if (selection && channelId) {
      this.intentSequence += 1;
      this.desiredChannel = channelId;
    }
    return {
      id: ++this.requestSequence,
      intent: this.intentSequence,
      channelId: channelId ?? null,
      selection: Boolean(selection && channelId),
      previousDesiredChannelId,
    };
  }

  acceptLoad(token: TeamChatLoadToken, snapshot: TeamChatSnapshot): TeamChatOutcome {
    // A poll for the old channel, or any request from before a newer
    // selection or send, must never repaint the conversation the operator chose.
    if (token.intent !== this.intentSequence) return { applied: false, exposeFailure: false };
    if (token.channelId && this.desiredChannel && token.channelId !== this.desiredChannel) {
      return { applied: false, exposeFailure: false };
    }
    if (token.id < this.appliedSequence) return { applied: false, exposeFailure: false };
    this.markApplied(token.id, snapshot);
    return { applied: true, exposeFailure: false };
  }

  rejectLoad(token: TeamChatLoadToken): TeamChatOutcome {
    if (token.intent !== this.intentSequence) return { applied: false, exposeFailure: false };
    // A failed selection keeps the conversation that is actually painted —
    // not merely the one that was wanted before, which may never have arrived.
    if (token.selection) this.desiredChannel = this.appliedChannel ?? token.previousDesiredChannelId;
    return { applied: false, exposeFailure: true };
  }

  beginSend(action: string, channelId: string | null): TeamChatSendToken {
    const id = ++this.requestSequence;
    this.intentSequence += 1;
    if (channelId) this.desiredChannel = channelId;
    this.inFlightSends.add(id);
    this.latestSendId = id;
    return { id, intent: this.intentSequence, action, channelId };
  }

  acceptSend(token: TeamChatSendToken, snapshot: TeamChatSnapshot): TeamChatOutcome {
    this.inFlightSends.delete(token.id);
    if (token.intent !== this.intentSequence || token.id < this.appliedSequence) {
      return { applied: false, exposeFailure: false };
    }
    if (token.channelId && snapshot.activeChannelId !== token.channelId) {
      return { applied: false, exposeFailure: false };
    }
    this.markApplied(token.id, snapshot);
    return { applied: true, exposeFailure: false };
  }

  /**
   * A failed send never paints, but its failure is still the operator's to
   * see unless a newer send has since taken over the composer. Busy settles
   * either way — a send abandoned by a channel switch must not pin the
   * composer disabled forever.
   */
  rejectSend(token: TeamChatSendToken): TeamChatOutcome {
    this.inFlightSends.delete(token.id);
    return { applied: false, exposeFailure: token.id === this.latestSendId };
  }

  private markApplied(requestId: number, snapshot: TeamChatSnapshot): void {
    this.appliedSequence = requestId;
    if (snapshot.activeChannelId) {
      this.appliedChannel = snapshot.activeChannelId;
      this.desiredChannel = snapshot.activeChannelId;
    }
  }
}
