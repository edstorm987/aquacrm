import type { Thought } from "@/lib/server/devTeamThoughts";

// The Tasks view used to seed client state from its server prop
// (`useState(initialThoughts)`), which froze the inline notes at first mount.
// router.refresh() re-rendered the server component and updated the header's
// "N thoughts waiting" pill, the done counts and the task states — but the
// notes underneath still said "waiting to be picked up" for something a worker
// had already acknowledged. Two numbers on one screen disagreeing, until a
// hard reload.
//
// So the server copy is rendered directly, and the only client state is the
// rows WE just posted, held until the server copy carries them. These two
// functions are that rule, kept separate from the component so they can be
// driven in a test — the component itself pulls in next/link, which cannot be
// imported under the suite's react-server condition.

/** Server rows, plus any locally-posted row the server hasn't returned yet. */
export function mergeThoughts(
  fromServer: Record<string, Thought[]>,
  pending: Thought[],
): Record<string, Thought[]> {
  const merged: Record<string, Thought[]> = {};
  for (const [taskId, rows] of Object.entries(fromServer)) merged[taskId] = rows;
  for (const t of pending) {
    if (!t.taskId) continue;
    const rows = merged[t.taskId] ?? [];
    if (!rows.some(s => s.id === t.id)) merged[t.taskId] = [t, ...rows];
  }
  return merged;
}

/**
 * Drop the optimistic rows the server has now caught up with. Returns the SAME
 * array when nothing landed, so re-syncing on every refresh cannot loop.
 */
export function dropLanded(pending: Thought[], fromServer: Record<string, Thought[]>): Thought[] {
  const still = pending.filter(t => !(fromServer[t.taskId ?? ""] ?? []).some(s => s.id === t.id));
  return still.length === pending.length ? pending : still;
}
