// Dev projects, grouped into Ed's two levels for DISPLAY.
//
// The RULES live in the store (`saveDevProject` / `deleteDevProject` in
// src/engines/editor/server/devProjects.ts): exactly two levels, a child can
// never be a parent, a parent with children can never be deleted. This module
// only arranges an already-legal flat list for a screen — parents in the
// order the server sent them (updatedAt, newest first), each with its
// children gathered underneath — and it is shared rather than inlined so the
// Projects workspace and any future consumer group the same way, and so the
// grouping is testable without mounting a screen.
//
// Pure and client-safe on purpose: no `server-only`, no imports beyond the
// structural type below, because the projects list reaches the browser whole
// through the projects GET and the grouping happens where it renders.

export interface DevProjectGroupable {
  id: string;
  parentProjectId?: string;
}

export interface DevProjectGroup<T extends DevProjectGroupable> {
  parent: T;
  children: T[];
}

/**
 * Arrange a flat project list as [parent, ...its children] groups.
 *
 * Tolerant by design — display code must never make a record unreachable:
 *
 *   - a child whose parent is NOT in the list (a drifted blob, a half-applied
 *     patch) renders as its own top-level row rather than vanishing;
 *   - a record claiming to be its own parent (the store forbids it; an old or
 *     hand-edited blob might still say it) renders top-level too, rather than
 *     disappearing into a group that would never be built.
 *
 * Order is preserved from the input for parents AND within each child list,
 * so the server's newest-first sort keeps meaning something after grouping.
 */
export function groupDevProjects<T extends DevProjectGroupable>(projects: T[]): DevProjectGroup<T>[] {
  const ids = new Set(projects.map(project => project.id));
  const topLevel = projects.filter(project =>
    !project.parentProjectId
    || project.parentProjectId === project.id
    || !ids.has(project.parentProjectId));
  return topLevel.map(parent => ({
    parent,
    children: projects.filter(project => project.parentProjectId === parent.id && project.id !== parent.id),
  }));
}

/**
 * The projects an editor door is allowed to switch between.
 *
 * The door is the project named by the URL when the editor opened. A
 * top-level door may see itself and its direct children; a door opened on a
 * child may see only that child. Keeping this anchored to the door (rather
 * than the current selection) means selecting a child cannot strand the
 * operator, and a child-scoped door can never widen upward to its parent.
 *
 * The store enforces exactly two levels, so one direct-child filter is the
 * complete family. Unknown doors return no options rather than falling back
 * to the agency-wide list.
 */
export function devProjectDoorFamily<T extends DevProjectGroupable>(
  projects: T[],
  doorProjectId: string,
): T[] {
  const door = projects.find(project => project.id === doorProjectId);
  if (!door) return [];
  if (door.parentProjectId) return [door];
  return [
    door,
    ...projects.filter(project => project.parentProjectId === door.id && project.id !== door.id),
  ];
}
