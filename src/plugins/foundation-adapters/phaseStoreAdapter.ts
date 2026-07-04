import "server-only";
import * as phases from "@/server/phases";
import type { PhaseStorePort } from "@/plugins/_types";

export const phaseStoreAdapter: PhaseStorePort = {
  listPhasesForAgency(agencyId) { return phases.listPhasesForAgency(agencyId); },
  getPhase(id) { return phases.getPhase(id); },
  upsertPhase(phase) { return phases.upsertPhase(phase); },
  deletePhase(id) { return phases.deletePhase(id); },
};
