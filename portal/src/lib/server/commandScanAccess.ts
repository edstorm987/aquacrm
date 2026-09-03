import "server-only";

import type { CurrentAccessActor } from "@/server/accessControl";
import type { AccessElementKey } from "@/server/types";

type CommandScanElementGate = (
  element: AccessElementKey,
  action?: "view" | "use" | "manage",
) => Promise<CurrentAccessActor>;

async function currentBusinessRadarGate(action: "view" | "use"): Promise<CurrentAccessActor> {
  const [{ AccessControlError, requireCurrentAccessActor }, { resolveBusinessRadarCapabilityForActor }] = await Promise.all([
    import("@/server/accessControl"),
    import("@/lib/server/intelligence/personalRadarAccess"),
  ]);
  const actor = await requireCurrentAccessActor();
  if (!await resolveBusinessRadarCapabilityForActor(actor, action)) {
    throw new AccessControlError(403, `workspace_overview_${action}_required`);
  }
  return actor;
}

/** Running the expensive graph is an interactive operation, not a role grant. */
export function requireCommandScanIssueAccess(
  gate?: CommandScanElementGate,
): Promise<CurrentAccessActor> {
  return gate ? gate("workspace.overview", "use") : currentBusinessRadarGate("use");
}

/** A result handle may only disclose the snapshot to somebody who can view it. */
export function requireCommandScanReadAccess(
  gate?: CommandScanElementGate,
): Promise<CurrentAccessActor> {
  return gate ? gate("workspace.overview", "view") : currentBusinessRadarGate("view");
}
