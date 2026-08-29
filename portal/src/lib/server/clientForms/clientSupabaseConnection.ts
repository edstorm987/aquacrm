import "server-only";

// Resolving a client's own Supabase connection from the vault.
//
// Split out from the webhook route because two very different callers need it:
// the unauthenticated webhook (which knows only a connection id) and the
// portal's on-demand reader (which knows a session and a client). Keeping the
// lookup in one place means the "is this connection really this client's"
// question is answered the same way both times.

import { getState } from "@/server/storage";
import { resolveIntegrationConnectionValues } from "@/lib/server/integrations/integrationConnections";
import type { ClientFormColumnOverrides } from "@/lib/enquiries/clientFormMapping";

export interface ClientSupabaseConnection {
  connectionId: string;
  agencyId: string;
  clientId: string;
  projectUrl: string;
  /** The ANON key. Never a service-role key — see the catalogue entry. */
  anonKey: string;
  submissionsTable: string;
  webhookSecret: string;
  /** Optional column overrides. Empty is the normal case — see clientFormMapping. */
  columns: ClientFormColumnOverrides;
  /** Blank means the client did not ask for a confirmation. */
  confirmationSubject?: string;
  confirmationBody?: string;
}

/**
 * The connection with `connectionId`, if it is a live client-scoped
 * `client-supabase` connection with a webhook secret set.
 *
 * ── Why this takes no agency id ──────────────────────────────────────────
 *
 * Every other read of a vault connection is scoped by the caller's agency,
 * because every other caller HAS one. A webhook arrives from a client's
 * Supabase project with no session and no tenant — the connection id is the
 * only thing it can present. That is exactly why the id alone is not
 * sufficient authority: this returns the connection, and the caller must still
 * verify the shared secret before believing anything in the request.
 *
 * The agency and client ids then come from the STORED connection rather than
 * from the payload, so a forged body cannot aim a notice at another tenant.
 */
export function findClientSupabaseConnection(connectionId: string): ClientSupabaseConnection | null {
  const connection = getState().integrationConnections[connectionId];
  if (!connection) return null;
  if (connection.provider !== "client-supabase") return null;
  // No status check, deliberately. `revokeIntegrationConnection` DELETES the
  // record rather than flagging it, so existence is already the revocation
  // check — and filtering on `status` would suggest a revoked connection could
  // still be found here, which it cannot. `needs-attention` is not a reason to
  // drop a notification either: a webhook arriving is evidence the link works,
  // and discarding it would lose an enquiry to a stale status flag.
  // Client-scoped by definition. An agency-wide one would have no client to
  // attribute an enquiry to, and silently attributing it to the agency would be
  // the data merge this whole design exists to avoid.
  if (!connection.clientId) return null;

  let values: Record<string, string>;
  try {
    values = resolveIntegrationConnectionValues(connection.agencyId, connectionId);
  } catch {
    // A vault that cannot decrypt is not an occasion to guess.
    return null;
  }

  const projectUrl = (values.projectUrl ?? "").trim();
  const anonKey = (values.anonKey ?? "").trim();
  const submissionsTable = (values.submissionsTable ?? "").trim();
  const webhookSecret = (values.webhookSecret ?? "").trim();
  if (!projectUrl || !anonKey || !submissionsTable || !webhookSecret) return null;

  return {
    connectionId,
    agencyId: connection.agencyId,
    clientId: connection.clientId,
    projectUrl,
    anonKey,
    submissionsTable,
    webhookSecret,
    columns: {
      columnName: values.columnName?.trim() || undefined,
      columnEmail: values.columnEmail?.trim() || undefined,
      columnPhone: values.columnPhone?.trim() || undefined,
      columnMessage: values.columnMessage?.trim() || undefined,
      columnSubmittedAt: values.columnSubmittedAt?.trim() || undefined,
    },
    confirmationSubject: values.confirmationSubject?.trim() || undefined,
    confirmationBody: values.confirmationBody?.trim() || undefined,
  };
}
