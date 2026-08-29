import "server-only";

// Writing a detected column mapping onto a client's Supabase connection.
//
// Ed, 2026-08-27: *"press a button instant mapping."* The detection is shown in
// the website-sources panel; this is what accepting it does.
//
// ── Why this is NOT `saveIntegrationConnection` ──────────────────────────
//
// That function rebuilds the whole config from what it is given, and for any
// non-secret field it was NOT given it does `delete config[field.id]`. So the
// obvious "just save the five column fields" call would silently wipe
// `projectUrl` and `submissionsTable` — the two things without which the
// connection resolves to nothing and every enquiry stops arriving.
//
// A narrow mutator cannot make that mistake. It touches five keys by name and
// is incapable of removing anything else, which is a better guarantee than
// remembering to send the other fields back every time.

import { getState, mutate } from "@/server/storage";

/** The five overrides, matching `ClientFormColumnOverrides`. */
export interface ClientSupabaseColumnMapping {
  columnName?: string;
  columnEmail?: string;
  columnPhone?: string;
  columnMessage?: string;
  columnSubmittedAt?: string;
}

const COLUMN_KEYS = [
  "columnName",
  "columnEmail",
  "columnPhone",
  "columnMessage",
  "columnSubmittedAt",
] as const;

export type ApplyMappingResult =
  | { ok: true; connectionId: string }
  /** No `client-supabase` connection for that client — nothing to write onto. */
  | { ok: false; reason: "no-connection" };

/**
 * Set (or clear) the column overrides on this client's Supabase connection.
 *
 * A blank or missing value CLEARS that override, returning the field to
 * detection — which is what "the mapping was wrong, let it work it out again"
 * has to mean. An override that could only ever be added would leave somebody
 * stuck with a bad guess they typed once.
 */
export function setClientSupabaseColumnMapping(
  agencyId: string,
  clientId: string,
  mapping: ClientSupabaseColumnMapping,
): ApplyMappingResult {
  const connection = Object.values(getState().integrationConnections).find(
    entry => entry.provider === "client-supabase"
      && entry.agencyId === agencyId
      && entry.clientId === clientId,
  );
  if (!connection) return { ok: false, reason: "no-connection" };

  mutate(state => {
    const live = state.integrationConnections[connection.id];
    if (!live) return;
    for (const key of COLUMN_KEYS) {
      const value = (mapping[key] ?? "").trim();
      if (value) live.config[key] = value;
      else delete live.config[key];
    }
    live.updatedAt = Date.now();
  });

  return { ok: true, connectionId: connection.id };
}
