import "server-only";

// The PUBLIC half of a client's Supabase connection, for baking into an export.
//
// After the 2026-09 secure-intake redesign this returns ONLY what is safe in a
// downloaded file: the intake Edge Function URL, the PUBLIC form id, and the
// PUBLIC Turnstile site key. It CANNOT return the table (there is no exported
// table endpoint), the anon/publishable key, the webhook secret, or the read
// secret — the shape of the return type is the guarantee.
//
// It is fail-closed: a target is returned ONLY for a connection that is tested,
// active, AND explicitly approved-and-bound to THIS exact site. Merely
// connecting or testing never enables an export, and approval is a separate
// server-owned action that no request/query field can reach.

import { getState } from "@/server/storage";
import { resolveIntegrationConnectionValues } from "@/lib/server/integrations/integrationConnections";
import { INTAKE_APPROVED_SITE_KEY } from "./clientSupabaseConnection";

export interface ClientSupabaseExportTarget {
  /** The client-owned intake Edge Function the exported form posts to. */
  submitUrl: string;
  /** The PUBLIC form id the Edge Function maps to a fixed destination server-side. */
  formId: string;
  /** The PUBLIC Cloudflare Turnstile site key (safe to expose), or "". */
  turnstileSiteKey: string;
}

/**
 * This client's Supabase intake target for an exported site, or `undefined`.
 *
 * `undefined` is the normal, fail-closed answer whenever the connection is
 * missing, not tested, not active, or not approved-and-bound to `siteId`. The
 * export then renders inert forms that say submission is unavailable.
 */
export function clientSupabaseExportTarget(agencyId: string, clientId: string, siteId: string): ClientSupabaseExportTarget | undefined {
  // Bound to the EXACT agency + client, not client alone: a connection is
  // identified by the tenant that owns it, so a client id is never trusted on
  // its own to reach a connection in another agency.
  const connection = Object.values(getState().integrationConnections).find(
    (entry) => entry.provider === "client-supabase" && entry.agencyId === agencyId && entry.clientId === clientId,
  );
  if (!connection) return undefined;
  // Tested + active + explicitly approved and bound to THIS site. All three, or
  // the export is inert.
  if (connection.isActive !== true || connection.lastTestStatus !== "passed") return undefined;
  if ((connection.config?.[INTAKE_APPROVED_SITE_KEY] ?? "").trim() !== siteId.trim() || !siteId.trim()) return undefined;

  let values: Record<string, string>;
  try {
    values = resolveIntegrationConnectionValues(connection.agencyId, connection.id);
  } catch {
    return undefined;
  }

  const base = (values.projectUrl ?? "").trim().replace(/\/+$/, "");
  const formId = (values.formId ?? "").trim();
  if (!base || !formId) return undefined;

  // Only these three, all public. `webhookSecret`/`readSecret` are in `values`
  // and are deliberately never read here — the return type cannot carry them,
  // and neither can the table or the anon key (which are not stored at all).
  return {
    submitUrl: `${base}/functions/v1/aqua-form-submit`,
    formId,
    turnstileSiteKey: (values.turnstileSiteKey ?? "").trim(),
  };
}
