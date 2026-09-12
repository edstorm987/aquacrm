export type ProspectWorkflowState = "unreviewed" | "researching" | "ready" | "outreach" | "engaged" | "not-now";
export type ProspectWorkflowDesk = "researching" | "prospecting";
export type ProspectWorkflowWorkspace = "scouting" | ProspectWorkflowDesk;

/** Suggested desk for the next action; it is guidance, never a routing lock. */
export function prospectWorkflowDesk(state: ProspectWorkflowState): ProspectWorkflowDesk {
  return state === "unreviewed" || state === "researching" ? "researching" : "prospecting";
}

/**
 * Scouting previews fresh intake. Researching and Outreach Command are
 * overlapping workbenches over the same active Prospect records: research is
 * optional and revisitable, and a newly scouted person can be contacted
 * immediately without being copied or forced through a synthetic gate.
 */
export function prospectVisibleInWorkspace(
  state: ProspectWorkflowState,
  workspace: ProspectWorkflowWorkspace,
): boolean {
  return workspace === "scouting" ? state === "unreviewed" : true;
}
