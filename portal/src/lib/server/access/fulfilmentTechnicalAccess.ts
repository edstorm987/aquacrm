import "server-only";

import { AuthError } from "@/lib/server/auth/auth";
import {
  FULFILMENT_VIEW_ELEMENT_KEYS,
  requireCurrentWorkspaceElementAccess,
  type WorkspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";
import { AGENCY_ROLES } from "@/server/types";

/**
 * The Technical workspace is labelled "Projects" in the stable element
 * registry. Keep that existing key so saved role grants continue to work while
 * every Technical page/API consumes one named authority boundary.
 */
export const FULFILMENT_TECHNICAL_ELEMENT_KEY = FULFILMENT_VIEW_ELEMENT_KEYS.technical;

export async function requireCurrentFulfilmentTechnicalAccess(
  required: Exclude<WorkspaceElementLevel, "hidden">,
) {
  const resolved = await requireCurrentWorkspaceElementAccess(
    "fulfilment",
    FULFILMENT_TECHNICAL_ELEMENT_KEY,
    required,
  );
  if (!AGENCY_ROLES.includes(resolved.actor.session.role)) {
    throw new AuthError(403, "forbidden");
  }
  return resolved;
}
