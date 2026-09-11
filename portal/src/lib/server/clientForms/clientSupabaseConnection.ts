import "server-only";

// Resolving a client's own Supabase connection from the vault.
//
// After the 2026-09 secure-intake redesign a client-supabase connection no
// longer carries an anon key or a raw submissions-table name: an exported site
// posts to the client-owned `aqua-form-submit` Edge Function, and Aqua reads one
// submission back through the bounded, HMAC-authenticated `aqua-form-read`
// function. The connection therefore holds the project URL, the PUBLIC form id,
// the pointer-webhook secret (to VERIFY the notification), and the SEPARATE read
// secret (to SIGN the bounded read). The public anon key is never stored, never
// exported, and has no table access at all.

import { getState } from "@/server/storage";
import { resolveIntegrationConnectionValues } from "@/lib/server/integrations/integrationConnections";
import type { ClientFormColumnOverrides } from "@/lib/enquiries/clientFormMapping";

/** The config key that binds a tested+active connection to exactly one site. */
export const INTAKE_APPROVED_SITE_KEY = "intakeApprovedSiteId";

export interface ClientSupabaseConnection {
  connectionId: string;
  agencyId: string;
  clientId: string;
  /** The client's Supabase project base URL — the Edge Function origin. */
  projectUrl: string;
  /** The PUBLIC form id the intake/read functions map to a fixed destination. */
  formId: string;
  /** The site this connection is approved-and-bound to (server-owned). */
  siteId: string;
  /** Verifies the signed POINTER webhook Aqua receives. Never exported. */
  webhookSecret: string;
  /** Signs the bounded server-to-server read. DISTINCT from webhookSecret. Never exported. */
  readSecret: string;
  /** Optional column overrides. Empty is the normal case — see clientFormMapping. */
  columns: ClientFormColumnOverrides;
  /** Blank means the client did not ask for a confirmation. */
  confirmationSubject?: string;
  confirmationBody?: string;
}

/**
 * The connection with `connectionId`, if it is a live, approved, client-scoped
 * `client-supabase` connection with both secrets set.
 *
 * A webhook arrives from a client's Supabase project with no session and no
 * tenant — the connection id is the only thing it can present. That is exactly
 * why the id alone is not authority: this returns the connection, and the caller
 * must still verify the pointer-webhook secret before believing anything. The
 * agency, client and site ids come from the STORED connection, so a forged body
 * cannot aim a notice at another tenant or site.
 */
export function findClientSupabaseConnection(connectionId: string): ClientSupabaseConnection | null {
  const connection = getState().integrationConnections[connectionId];
  if (!connection) return null;
  if (connection.provider !== "client-supabase") return null;
  // Existence is the revocation check: revokeIntegrationConnection DELETES the
  // record. Client-scoped by definition — an agency-wide one would have no
  // client to attribute an enquiry to.
  if (!connection.clientId) return null;
  // Fail-closed: an unapproved connection resolves to nothing here too, so a
  // pointer webhook for an unbound connection is dropped rather than acted on.
  const siteId = (connection.config?.[INTAKE_APPROVED_SITE_KEY] ?? "").trim();
  if (!siteId) return null;

  let values: Record<string, string>;
  try {
    values = resolveIntegrationConnectionValues(connection.agencyId, connectionId);
  } catch {
    // A vault that cannot decrypt is not an occasion to guess.
    return null;
  }

  const projectUrl = (values.projectUrl ?? "").trim();
  const formId = (values.formId ?? "").trim();
  const webhookSecret = (values.webhookSecret ?? "").trim();
  const readSecret = (values.readSecret ?? "").trim();
  // Distinct secrets for verify vs read — never the same value.
  if (!projectUrl || !formId || !webhookSecret || !readSecret || webhookSecret === readSecret) return null;

  return {
    connectionId,
    agencyId: connection.agencyId,
    clientId: connection.clientId,
    projectUrl,
    formId,
    siteId,
    webhookSecret,
    readSecret,
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
