import "server-only";

import type { CurrentAccessActor } from "@/server/accessControl";
import type { AccessElementKey } from "@/server/types";

type CommandScanElementGate = (
  element: AccessElementKey,
  action?: "view" | "use" | "manage",
) => Promise<CurrentAccessActor>;

async function currentElementGate(
  element: AccessElementKey,
  action: "view" | "use" | "manage" = "view",
): Promise<CurrentAccessActor> {
  const { requireAssistantElement } = await import("@/lib/server/assistants/assistantContextScope");
  return requireAssistantElement(element, action);
}

/** Running the expensive graph is an interactive operation, not a role grant. */
export function requireCommandScanIssueAccess(
  gate: CommandScanElementGate = currentElementGate,
): Promise<CurrentAccessActor> {
  return gate("workspace.overview", "use");
}

/** A result handle may only disclose the snapshot to somebody who can view it. */
export function requireCommandScanReadAccess(
  gate: CommandScanElementGate = currentElementGate,
): Promise<CurrentAccessActor> {
  return gate("workspace.overview", "view");
}
