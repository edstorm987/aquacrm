import "server-only";

import { getCompanyProfile } from "@/server/company";
import { dashboardPlanningSnapshot } from "@/server/dashboardPlanning";
import { listNotepadFolders, listNotepadNotes } from "@/server/notepad";
import { employeePeopleSnapshot, listPeopleContracts, listPeopleFeedback, listPeopleRecognitions } from "@/server/people";
import { listSops } from "@/server/sops";
import { listAgencyTasks } from "@/server/tasks";

export function teamWorkspaceData(agencyId: string, userId: string, date?: string) {
  const people = employeePeopleSnapshot(agencyId, userId);
  if (!people) return null;
  const company = getCompanyProfile(agencyId);
  return {
    people,
    planning: dashboardPlanningSnapshot(agencyId, userId, date),
    tasks: listAgencyTasks(agencyId).filter(task => task.assigneeUserId === userId || task.createdBy === userId),
    notes: listNotepadNotes(agencyId, userId),
    folders: listNotepadFolders(agencyId, userId),
    progression: {
      company: { mission: company.mission, vision: company.vision, values: company.values },
      sops: listSops(agencyId).map(sop => ({ id: sop.id, title: sop.title, category: sop.category ?? sop.categories?.[0], resourceType: sop.resourceType })),
      recognitions: listPeopleRecognitions(agencyId, people.employee.id),
      feedback: listPeopleFeedback(agencyId, people.employee.id),
      contracts: listPeopleContracts(agencyId, people.employee.id),
    },
  };
}
