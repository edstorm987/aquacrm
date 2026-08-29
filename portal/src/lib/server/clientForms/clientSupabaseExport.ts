import "server-only";

// The PUBLIC half of a client's Supabase connection, for baking into an export.
//
// Separate from `findClientSupabaseConnection` on purpose, and the separation is
// the point: that function returns everything, including the webhook secret.
// This one returns only what is safe to put in a file somebody downloads, and
// it is the only thing the export handler is given.
//
// Written as its own module rather than a flag on the other one because "give
// me the connection, but not the secret bits" is exactly the sort of parameter
// that gets passed wrong once and leaks a secret into a ZIP. A function that
// CANNOT return the secret is a better guarantee than a function that promises
// not to.

import { getState } from "@/server/storage";
import { resolveIntegrationConnectionValues } from "@/lib/server/integrations/integrationConnections";

export interface ClientSupabaseExportTarget {
  projectUrl: string;
  anonKey: string;
  table: string;
}

/**
 * This client's Supabase target for an exported site, or `undefined`.
 *
 * `undefined` is a normal answer, not a failure: a client with no Supabase
 * connected gets an export whose forms render and say they are not connected.
 */
export function clientSupabaseExportTarget(clientId: string): ClientSupabaseExportTarget | undefined {
  const connection = Object.values(getState().integrationConnections).find(
    entry => entry.provider === "client-supabase" && entry.clientId === clientId,
  );
  if (!connection) return undefined;

  let values: Record<string, string>;
  try {
    values = resolveIntegrationConnectionValues(connection.agencyId, connection.id);
  } catch {
    return undefined;
  }

  const projectUrl = (values.projectUrl ?? "").trim();
  const anonKey = (values.anonKey ?? "").trim();
  const table = (values.submissionsTable ?? "").trim();
  if (!projectUrl || !anonKey || !table) return undefined;

  // Only these three. `webhookSecret` is in `values` and is deliberately not
  // read here — the shape of the return type is the guarantee.
  return { projectUrl, anonKey, table };
}
