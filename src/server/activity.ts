import "server-only";
// Activity log — durable audit trail.
//
// Cap kept generous (50k entries) so the JSON blob stays bounded even
// when retention is set to several years. Newest entries kept; oldest
// evicted on append.

import crypto from "crypto";
import { getState, mutate } from "./storage";
import type { ActivityCategory, ActivityEntry } from "./types";

const ACTIVITY_HARD_CAP = 50_000;

export interface LogActivityInput {
  agencyId: string;
  clientId?: string;
  actorUserId?: string;
  actorEmail?: string;
  category: ActivityCategory;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export function logActivity(input: LogActivityInput): ActivityEntry {
  const entry: ActivityEntry = {
    id: `act_${crypto.randomBytes(6).toString("hex")}`,
    ts: Date.now(),
    agencyId: input.agencyId,
    clientId: input.clientId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: input.category,
    action: input.action,
    message: input.message,
    metadata: input.metadata,
  };
  mutate(state => {
    state.activity.push(entry);
    if (state.activity.length > ACTIVITY_HARD_CAP) {
      state.activity.splice(0, state.activity.length - ACTIVITY_HARD_CAP);
    }
  });
  return entry;
}

export interface ListActivityFilter {
  agencyId: string;
  clientId?: string;
  limit?: number;
}

export function listActivity(filter: ListActivityFilter): ActivityEntry[] {
  const limit = filter.limit ?? 50;
  return getState().activity
    .filter(a => {
      if (a.agencyId !== filter.agencyId) return false;
      if (filter.clientId !== undefined && a.clientId !== filter.clientId) return false;
      return true;
    })
    .slice(-limit)
    .reverse();
}
