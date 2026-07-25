import "server-only";
import * as phases from "@/server/phases";
import type { PhaseStorePort } from "@/built-ins/runtime/_types";

export const phaseStoreAdapter: PhaseStorePort = {
  listPhasesForAgency(agencyId) { return phases.listPhasesForAgency(agencyId); },
  getPhase(id) { return phases.getPhase(id); },
  upsertPhase(phase) { return phases.upsertPhase(phase); },
  deletePhase(id) { return phases.deletePhase(id); },
};
