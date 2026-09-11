import "server-only";

// Reading one submission out of a client's OWN Supabase, on demand.
//
// Ed, 2026-08-27: *"inside their portal shows it all."*
//
// After the 2026-09 secure-intake redesign this no longer SELECTs the table with
// the public anon key (which contradicted the INSERT-only/no-access RLS the same
// key must live under). Instead it calls the client-owned `aqua-form-read` Edge
// Function server-to-server, authenticated with a per-connection READ secret
// (distinct from the webhook secret), a fresh timestamp and a single-use nonce.
// The function returns exactly one row's ALLOWLISTED fields.
//
// ── The one rule ─────────────────────────────────────────────────────────
//
// **Nothing this returns may be written to our state.** No cache, no
// denormalised copy, no audit of the values, and failures carry no body — an
// error string containing the row would defeat the design just as a cache would.

import crypto from "node:crypto";
import { brokeredFetch, OutboundBlockedError } from "@/lib/server/net/outboundBroker";
import { findClientSupabaseConnection } from "./clientSupabaseConnection";
import { mapClientFormSubmission, type MappedClientFormSubmission } from "@/lib/enquiries/clientFormMapping";
import { getState } from "@/server/storage";
import type { ClientFormNotice } from "@/server/types";

/** How long we will wait on somebody else's Edge Function before giving up. */
const TIMEOUT_MS = 8_000;
/** A submission is not a document store. */
const MAX_FIELDS = 80;
const MAX_VALUE_LENGTH = 4_000;

export type ClientFormSubmission =
  | { status: "ok"; mapped: MappedClientFormSubmission }
  | { status: "missing" }
  | { status: "disconnected" }
  | { status: "unavailable"; reason: "refused" | "timeout" | "error" };

/** Flatten one submission's allowlisted fields into displayable pairs. */
function toFields(row: Record<string, unknown>): Array<{ key: string; value: string }> {
  return Object.entries(row)
    .slice(0, MAX_FIELDS)
    .map(([key, value]) => ({
      key,
      value:
        value === null || value === undefined ? ""
          : typeof value === "string" ? value.slice(0, MAX_VALUE_LENGTH)
            : typeof value === "number" || typeof value === "boolean" ? String(value)
              : JSON.stringify(value).slice(0, MAX_VALUE_LENGTH),
    }));
}

/**
 * Fetch the submission a notice points at, through the client's own bounded read
 * Edge Function. The caller is responsible for having checked the session may see
 * this client — this function trusts the notice it is handed and is not exported
 * to any route directly.
 */
export async function readClientFormSubmission(notice: ClientFormNotice): Promise<ClientFormSubmission> {
  const connection = findClientSupabaseConnection(notice.connectionId);
  if (!connection) return { status: "disconnected" };
  // The notice and the connection must agree about whose data this is.
  if (connection.clientId !== notice.clientId || connection.agencyId !== notice.agencyId) {
    return { status: "disconnected" };
  }

  const submissionId = (notice.rowId || "").trim();
  if (!submissionId) return { status: "missing" };

  // Sign (ts.nonce.submissionId) with the READ secret. The nonce is single-use
  // (the read function refuses a replay) and the timestamp is bounded there.
  const ts = Date.now().toString();
  const nonce = `${crypto.randomUUID()}${crypto.randomBytes(12).toString("hex")}`;
  const signature = crypto.createHmac("sha256", connection.readSecret).update(`${ts}.${nonce}.${submissionId}`).digest("hex");
  const url = `${connection.projectUrl.replace(/\/+$/, "")}/functions/v1/aqua-form-read`;
  const body = JSON.stringify({ siteId: connection.siteId, submissionId, ts, nonce, signature });

  try {
    // Through the audited egress broker (assume-breach containment): the
    // client-authorised project URL is stored data; the broker rejects unsafe
    // destinations and pins the vetted address against DNS rebinding.
    const response = await brokeredFetch({
      url,
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body,
      timeoutMs: TIMEOUT_MS,
      tenantId: connection.agencyId,
      purpose: "client-form.read",
    });

    if (response.status === 401 || response.status === 403) return { status: "unavailable", reason: "refused" };
    if (response.status < 200 || response.status >= 300) return { status: "unavailable", reason: "error" };

    const payload = JSON.parse(response.bodyText || "null") as
      | { ok?: boolean; status?: string; submission?: { fields?: Record<string, unknown> } }
      | null;
    if (!payload || payload.ok !== true) return { status: "unavailable", reason: "error" };
    if (payload.status === "missing" || !payload.submission) return { status: "missing" };

    const fields = payload.submission.fields && typeof payload.submission.fields === "object"
      ? payload.submission.fields as Record<string, unknown>
      : {};
    return {
      status: "ok",
      mapped: mapClientFormSubmission(toFields(fields), connection.columns),
    };
  } catch (error) {
    if (error instanceof OutboundBlockedError) return { status: "unavailable", reason: "refused" };
    const timedOut = error instanceof Error && /timed out/.test(error.message);
    return { status: "unavailable", reason: timedOut ? "timeout" : "error" };
  }
}

/** The notice with this id, if it belongs to this agency. */
export function findClientFormNotice(agencyId: string, noticeId: string): ClientFormNotice | null {
  const notice = getState().clientFormNotices[noticeId];
  return notice && notice.agencyId === agencyId ? notice : null;
}
