import "server-only";

import { dashboardPlanningSnapshot } from "@/server/dashboardPlanning";
import { listNotepadFolders, listNotepadNotes } from "@/server/notepad";
import { employeePeopleSnapshot } from "@/server/people";
import { listAgencyTasks } from "@/server/tasks";

export function teamWorkspaceData(agencyId: string, userId: string, date?: string) {
  const people = employeePeopleSnapshot(agencyId, userId);
  if (!people) return null;
  return {
    people,
    planning: dashboardPlanningSnapshot(agencyId, userId, date),
    tasks: listAgencyTasks(agencyId).filter(task => task.assigneeUserId === userId || task.createdBy === userId),
    notes: listNotepadNotes(agencyId, userId),
    folders: listNotepadFolders(agencyId, userId),
  };
}
