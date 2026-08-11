import "server-only";

import { listAutomationFolders, listAutomationRuns, listAutomationWorkflows, processAutomationSweep } from "@/server/automations";
import { listCustomAIs } from "@/server/customAIs";
import { getAgency } from "@/server/tenants";
import { listUsersForAgency } from "@/server/users";
import type { Role } from "@/server/types";

export async function automationWorkspaceData(agencyId: string, role: Role) {
  await processAutomationSweep(agencyId);
  const agency = getAgency(agencyId);
  const team = listUsersForAgency(agencyId).filter(user => user.role.startsWith("agency-"));

  return {
    initialFolders: listAutomationFolders(agencyId),
    initialWorkflows: listAutomationWorkflows(agencyId),
    initialRuns: listAutomationRuns(agencyId, undefined, 150),
    initialCustomAIs: listCustomAIs(agencyId),
    canEdit: role === "agency-owner" || role === "agency-manager",
    ownerEmail: agency?.ownerEmail || team.find(user => user.role === "agency-owner")?.email || "",
    team: team.map(user => ({ id: user.id, name: user.name, email: user.email })),
  };
}
