import "server-only";

import { getSession } from "@/lib/server/auth/auth";

/**
 * Who may WRITE plugin settings — the single list, shared by the endpoint that
 * enforces it and the panels that decide whether to offer a Save button.
 *
 * It exists because the two had drifted. `POST /api/portal/plugins/settings`
 * requires an agency owner or manager, but a client-scoped plugin page is also
 * visible to `client-owner` and `client-staff`. Mounting the editable panel for
 * them rendered a form with an enabled Save whose every submission answered
 * 403 — a control that cannot do what it offers. Reading the list from one
 * place means widening the endpoint can never silently leave a surface behind,
 * or the reverse.
 *
 * The endpoint stays the enforcement point. This only decides what to RENDER;
 * it is never a substitute for the server check.
 */
export const PLUGIN_SETTINGS_WRITE_ROLES = ["agency-owner", "agency-manager"] as const;

/**
 * Whether the current viewer's save would actually be accepted.
 *
 * Answers false for a signed-out viewer, which is the safe direction: the panel
 * renders read-only rather than offering a control that cannot work.
 */
export async function canEditPluginSettings(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return (PLUGIN_SETTINGS_WRITE_ROLES as readonly string[]).includes(session.role);
}
