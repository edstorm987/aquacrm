// Phase definitions — CRUD over `PhaseDefinition` rows, scoped per agency.
//
// Phases are stored as data, not enum. Foundation reads (sidebar showing
// "Phase: Onboarding") go through `services.phases`; T2 owns the writes.
// Agency owners can edit / reorder / archive / add phases — the six
// defaults are seeded from `presets.ts` on first agency creation.

import type { AgencyId, PhaseDefinition, PhaseChecklistItem, ClientStage } from "../lib/tenancy";
import { makeId } from "../lib/ids";
import { buildDefaultPhases, DEFAULT_PHASE_PRESETS } from "./presets";
import type { PhaseStorePort } from "./ports";

export interface PhaseUpsertInput {
  id?: string;
  agencyId: AgencyId;
  stage: ClientStage;
  label: string;
  description?: string;
  order: number;
  pluginPreset: string[];
  portalVariantId?: string;
  checklist: PhaseChecklistItem[];
}

export class PhaseService {
  constructor(private store: PhaseStorePort) {}

  // Idempotent seed. Called once per agency (the foundation will trigger
  // this from the agency-creation flow). Skips agencies that already have
  // any phase definitions, so re-seeding doesn't clobber edits.
  async seedDefaultPhases(agencyId: AgencyId): Promise<{ seeded: boolean; phases: PhaseDefinition[] }> {
    const existing = await this.store.listPhasesForAgency(agencyId);
    if (existing.length > 0) {
      return { seeded: false, phases: existing };
    }
    const fresh = buildDefaultPhases(agencyId);
    for (const phase of fresh) {
      await this.store.upsertPhase(phase);
    }
    return { seeded: true, phases: fresh };
  }

  async listForAgency(agencyId: AgencyId): Promise<PhaseDefinition[]> {
    return this.store.listPhasesForAgency(agencyId);
  }

  async getPhase(id: string): Promise<PhaseDefinition | null> {
    return this.store.getPhase(id);
  }

  // Resolve the canonical phase row for a (agency, stage) pair. New
  // clients use this to find which PhaseDefinition matches their starting
  // stage so the right plugins install + variant applies.
  async getPhaseForStage(agencyId: AgencyId, stage: ClientStage): Promise<PhaseDefinition | null> {
    const all = await this.store.listPhasesForAgency(agencyId);
    return all.find(p => p.stage === stage) ?? null;
  }

  async upsert(input: PhaseUpsertInput): Promise<PhaseDefinition> {
    const id = input.id ?? makeId("phase");
    const row: PhaseDefinition = {
      id,
      agencyId: input.agencyId,
      stage: input.stage,
      label: input.label,
      description: input.description,
      order: input.order,
      pluginPreset: input.pluginPreset,
      portalVariantId: input.portalVariantId,
      checklist: input.checklist,
    };
    return this.store.upsertPhase(row);
  }

  async deletePhase(id: string): Promise<boolean> {
    return this.store.deletePhase(id);
  }

  // Helper: build a fresh checklist item from raw input — used by the
  // phase settings UI when an agency adds a new task to a template.
  buildChecklistItem(label: string, visibility: PhaseChecklistItem["visibility"]): PhaseChecklistItem {
    return { id: makeId("task"), label, visibility };
  }

  // Surface the canonical preset list — used by the new-client wizard
  // tooltip ("which plugins will install if I pick this preset?").
  describePresets(): readonly { stage: ClientStage; label: string; pluginPreset: readonly string[] }[] {
    return DEFAULT_PHASE_PRESETS.map(p => ({
      stage: p.stage,
      label: p.label,
      pluginPreset: p.pluginPreset,
    }));
  }
}
