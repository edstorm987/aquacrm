import "server-only";

// The store for "a form came in", and nothing else.
//
// See `ClientFormNotice` in `server/types.ts` for why a notice deliberately
// carries no customer data. This module exists to make that hard to undo: the
// only way to write a notice is `recordClientFormNotice`, whose input type has
// no field a name or an email could be put in.

import crypto from "node:crypto";

import { getState, mutate } from "@/server/storage";
import type { ClientFormNotice } from "@/server/types";

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export interface RecordClientFormNoticeInput {
  agencyId: string;
  clientId: string;
  connectionId: string;
  table: string;
  rowId: string;
  /** The column `rowId` came from. Defaults to `id`, the common case. */
  rowKey?: string;
  receivedAt?: number;
}

/**
 * Record that a submission landed in a client's own database.
 *
 * **Idempotent by (connection, row).** Supabase webhooks retry, and a retried
 * delivery is the same enquiry — counting it twice would inflate every
 * enquiry number in the agency inbox, which is exactly the kind of quiet
 * wrongness nobody notices until they are reporting on it. A repeat delivery
 * returns the existing notice untouched, including its `seenAt`, so a retry
 * cannot resurrect something already dealt with.
 */
export function recordClientFormNotice(input: RecordClientFormNoticeInput): ClientFormNotice {
  const existing = Object.values(getState().clientFormNotices).find(
    notice => notice.connectionId === input.connectionId && notice.rowId === input.rowId,
  );
  if (existing) return existing;

  let saved!: ClientFormNotice;
  mutate(state => {
    // Re-checked inside the mutation: two deliveries arriving together would
    // both pass the read above.
    const already = Object.values(state.clientFormNotices).find(
      notice => notice.connectionId === input.connectionId && notice.rowId === input.rowId,
    );
    if (already) { saved = already; return; }

    const id = makeId("cfn");
    saved = {
      id,
      agencyId: input.agencyId,
      clientId: input.clientId,
      connectionId: input.connectionId,
      table: input.table,
      rowId: input.rowId,
      rowKey: input.rowKey ?? "id",
      receivedAt: input.receivedAt ?? Date.now(),
    };
    state.clientFormNotices[id] = saved;
  });
  return saved;
}

/** This client's notices, newest first. */
export function listClientFormNotices(agencyId: string, clientId: string): ClientFormNotice[] {
  return Object.values(getState().clientFormNotices)
    .filter(notice => notice.agencyId === agencyId && notice.clientId === clientId)
    .sort((a, b) => b.receivedAt - a.receivedAt);
}

/** How many are unseen, for the agency inbox's count. */
export function countUnseenClientFormNotices(agencyId: string, clientId?: string): number {
  return Object.values(getState().clientFormNotices)
    .filter(notice => notice.agencyId === agencyId && (!clientId || notice.clientId === clientId))
    .filter(notice => !notice.seenAt)
    .length;
}

/**
 * Mark one seen.
 *
 * Scoped by agency on purpose: the id alone must not be enough to touch
 * another tenant's notice, even though ids are unguessable.
 */
export function markClientFormNoticeSeen(agencyId: string, noticeId: string, seenAt = Date.now()): void {
  mutate(state => {
    const notice = state.clientFormNotices[noticeId];
    if (!notice || notice.agencyId !== agencyId) return;
    if (notice.seenAt) return;
    notice.seenAt = seenAt;
  });
}
