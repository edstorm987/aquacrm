import "server-only";

import { dueAutomationRuns, listAutomationFolders, listAutomationRuns, listAutomationWorkflows } from "@/server/automations";
import { listCustomAIs } from "@/server/customAIs";
import { getAgency } from "@/server/tenants";
import { listUsersForAgency } from "@/server/users";
import type { Role } from "@/server/types";

export async function automationWorkspaceData(agencyId: string, role: Role) {
  // NO SWEEP HERE (issue #21, 2026-08-27).
  //
  // This used to `await processAutomationSweep(agencyId)`, which resumes waiting
  // runs and EXECUTES them — so rendering the Marketing page could send a
  // customer an email. Not a seeder and not idempotent: a side effect with real
  // outward consequences, triggered by looking at a screen.
  //
  // The scheduler owns the sweep (`/api/internal/sweep`). The page reports the
  // backlog instead, so a scheduler that has stopped is visible rather than
  // silently compensated for by whoever happens to open Marketing.
  const agency = getAgency(agencyId);
  const team = listUsersForAgency(agencyId).filter(user => user.role.startsWith("agency-"));

  return {
    initialFolders: listAutomationFolders(agencyId),
    initialWorkflows: listAutomationWorkflows(agencyId),
    initialRuns: listAutomationRuns(agencyId, undefined, 150),
    /** Waiting runs past their due time that the scheduler has not taken. */
    dueRuns: dueAutomationRuns(agencyId),
    initialCustomAIs: listCustomAIs(agencyId),
    canEdit: role === "agency-owner" || role === "agency-manager",
    ownerEmail: agency?.ownerEmail || team.find(user => user.role === "agency-owner")?.email || "",
    team: team.map(user => ({ id: user.id, name: user.name, email: user.email })),
  };
}
