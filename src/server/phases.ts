import "server-only";
// Phases — lifecycle stages (Discovery → Live → Churned).
//
// T2's fulfillment plugin owns phase semantics (transitions, checklist
// algorithm, six default presets). Foundation owns the storage shape so
// the chrome can label the current stage without booting fulfillment.
//
// Round 2: added `upsertPhase` / `deletePhase` so the fulfillment plugin
// can seed defaults and edit phases via its `PhaseStorePort` adapter.

import { getState, mutate } from "./storage";
import type { ClientStage, PhaseDefinition } from "./types";

const DEFAULT_PHASE_LABELS: Record<ClientStage, string> = {
  lead: "Lead",
  discovery: "Discovery",
  design: "Design",
  development: "Development",
  onboarding: "Onboarding",
  live: "Live",
  churned: "Churned",
  "aqua-epic-intro":    "Epic Intro",
  "aqua-blueprint":     "Blueprint Setup",
  "aqua-diagnostics":   "Diagnostics / Foundations",
  "aqua-brand-builder": "Brand Builder + Verification",
  "aqua-traffic":       "Traffic (Expansion)",
  "aqua-mastery":       "Mastery & Ascension",
};

export function phaseLabel(stage: ClientStage): string {
  return DEFAULT_PHASE_LABELS[stage] ?? stage;
}

export function listPhasesForAgency(agencyId: string): PhaseDefinition[] {
  return Object.values(getState().phases)
    .filter(p => p.agencyId === agencyId)
    .sort((a, b) => a.order - b.order);
}

export function getPhase(id: string): PhaseDefinition | null {
  return getState().phases[id] ?? null;
}

export function upsertPhase(phase: PhaseDefinition): PhaseDefinition {
  let saved!: PhaseDefinition;
  mutate(state => {
    saved = { ...phase };
    state.phases[phase.id] = saved;
  });
  return saved;
}

export function getPhaseForClientStage(agencyId: string, stage: string): PhaseDefinition | null {
  return Object.values(getState().phases).find(
    p => p.agencyId === agencyId && p.stage === stage,
  ) ?? null;
}

export function deletePhase(id: string): boolean {
  let removed = false;
  mutate(state => {
    if (state.phases[id]) {
      delete state.phases[id];
      removed = true;
    }
  });
  return removed;
}
