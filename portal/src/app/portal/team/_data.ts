import "server-only";

import { getCompanyProfile } from "@/server/company";
import { dashboardPlanningSnapshot } from "@/server/dashboardPlanning";
import { listNotepadFolders, listNotepadNotes } from "@/server/notepad";
import { employeePeopleSnapshot, listPeopleContracts, listPeopleFeedback, listPeopleRecognitions } from "@/server/people";
import { listSops } from "@/engines/sop/server/sops";
import { listAgencyTasks } from "@/server/tasks";
import type { PeopleWorkspaceAccess } from "@/server/types";

export function teamWorkspaceData(
  agencyId: string,
  userId: string,
  date?: string,
  projection?: {
    workspaceAccess: PeopleWorkspaceAccess[];
    includePay: boolean;
    includeActions: boolean;
    includeSchedule: boolean;
  },
) {
  const people = employeePeopleSnapshot(agencyId, userId);
  if (!people) return null;
  const employee = {
    ...people.employee,
    workspaceAccess: projection?.workspaceAccess ?? people.employee.workspaceAccess,
  };
  // A hidden Pay station must not remain present in the RSC payload merely
  // because another Team station shares this snapshot.
  if (projection && !projection.includePay) {
    const record = employee as unknown as Record<string, unknown>;
    delete record.payBasis;
    delete record.basePayMinor;
    delete record.currency;
    record.commissionRules = [];
  }
  const company = getCompanyProfile(agencyId);
  return {
    people: {
      ...people,
      employee,
      shifts: projection && !projection.includeSchedule ? [] : people.shifts,
    },
    planning: dashboardPlanningSnapshot(agencyId, userId, date),
    tasks: projection && !projection.includeActions
      ? []
      : listAgencyTasks(agencyId).filter(task => task.assigneeUserId === userId || task.createdBy === userId),
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
