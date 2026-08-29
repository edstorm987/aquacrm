import "server-only";

// Reading one submission out of a client's OWN Supabase, on demand.
//
// Ed, 2026-08-27: *"inside their portal shows it all."*
//
// The notice tells us which row, in which table, through which connection. This
// goes and gets it at the moment somebody looks, renders it, and forgets it.
//
// ── The one rule ─────────────────────────────────────────────────────────
//
// **Nothing this returns may be written to our state.** There is no cache, no
// "denormalised copy for search", no audit record of the values. The moment a
// submission is persisted here, AquaCRM becomes a controller of every client's
// customer data and the whole design collapses into the data merge it exists to
// avoid. If a future feature needs the values to be searchable, that is a
// conversation about the architecture, not a cache to be added quietly.
//
// The same rule is why failures below carry no body: an error string containing
// the row would defeat it just as surely as a cache, and error strings end up in
// logs.

import { findClientSupabaseConnection } from "./clientSupabaseConnection";
import { mapClientFormSubmission, type MappedClientFormSubmission } from "@/lib/enquiries/clientFormMapping";
import { getState } from "@/server/storage";
import type { ClientFormNotice } from "@/server/types";

/** How long we will wait on somebody else's database before giving up. */
const TIMEOUT_MS = 8_000;
/** Their table could be anything; a submission is not a document store. */
const MAX_FIELDS = 80;
const MAX_VALUE_LENGTH = 4_000;

export type ClientFormSubmission =
  | {
      status: "ok";
      /** Mapped onto Aqua's own enquiry vocabulary — see clientFormMapping. */
      mapped: MappedClientFormSubmission;
    }
  /** The row is gone from their database. Normal, not an error. */
  | { status: "missing" }
  /** The connection was revoked, or its stored values no longer resolve. */
  | { status: "disconnected" }
  /** Their database refused us, or did not answer in time. */
  | { status: "unavailable"; reason: "refused" | "timeout" | "error" };

/**
 * Flatten one PostgREST row into displayable pairs.
 *
 * Deliberately dumb: no interpretation, no field-name mapping, no guessing
 * which column is "the email". Mapping is a separate, configured concern —
 * doing it here would bury a product decision inside a fetch helper.
 */
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
 * Fetch the submission a notice points at.
 *
 * The caller is responsible for having checked that this session may see this
 * client — this function trusts the notice it is handed. It is not exported to
 * any route directly for that reason; the route gates first.
 */
export async function readClientFormSubmission(notice: ClientFormNotice): Promise<ClientFormSubmission> {
  const connection = findClientSupabaseConnection(notice.connectionId);
  if (!connection) return { status: "disconnected" };
  // The notice and the connection must agree about whose data this is. A notice
  // whose connection has been re-pointed at another client is not something to
  // resolve helpfully.
  if (connection.clientId !== notice.clientId || connection.agencyId !== notice.agencyId) {
    return { status: "disconnected" };
  }

  // PostgREST. The table comes from the CONNECTION (what the client authorised),
  // and the key column from the notice (what the webhook actually matched) —
  // both ours, neither taken from a request.
  const url = new URL(`${connection.projectUrl.replace(/\/+$/, "")}/rest/v1/${encodeURIComponent(connection.submissionsTable)}`);
  url.searchParams.set(notice.rowKey || "id", `eq.${notice.rowId}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "1");

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        apikey: connection.anonKey,
        Authorization: `Bearer ${connection.anonKey}`,
        Accept: "application/json",
      },
      signal: abort.signal,
      cache: "no-store",
    });

    // 401/403 means their row-level-security policy no longer lets this key
    // read the table — which is the client withdrawing access, and is reported
    // as refused rather than dressed up as an outage.
    if (response.status === 401 || response.status === 403) return { status: "unavailable", reason: "refused" };
    if (!response.ok) return { status: "unavailable", reason: "error" };

    const rows = await response.json().catch(() => null) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) return { status: "missing" };
    const row = rows[0];
    if (!row || typeof row !== "object") return { status: "missing" };

    // Mapped here rather than at the screen, so the API answers in Aqua's
    // vocabulary and every consumer — portal, inbox, a future automation —
    // sees the same words the internal path uses.
    return {
      status: "ok",
      mapped: mapClientFormSubmission(toFields(row as Record<string, unknown>), connection.columns),
    };
  } catch (error) {
    // No body, no message, no row — see the header. `AbortError` is the only
    // distinction worth drawing, because a timeout is worth retrying and a
    // malformed response is not.
    const timedOut = error instanceof Error && error.name === "AbortError";
    return { status: "unavailable", reason: timedOut ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
  }
}

/** The notice with this id, if it belongs to this agency. */
export function findClientFormNotice(agencyId: string, noticeId: string): ClientFormNotice | null {
  const notice = getState().clientFormNotices[noticeId];
  return notice && notice.agencyId === agencyId ? notice : null;
}
