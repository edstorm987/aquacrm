import "server-only";
// PhaseApplier — applies a phase preset to a client.
//
// Chapter `04-phases-presets-architecture.md` (2026-05-08). When Ed
// transitions a client to a new phase (manually, via pipeline kanban
// move, or on first onboarding), this helper:
//
//   1. Verifies the phase belongs to the client's agency.
//   2. Updates the client's `stage` to the phase's `stage`.
//   3. Idempotently installs every plugin in `phase.pluginPreset`
//      at the client scope.
//   4. Returns the resolved phase + the list of plugins installed
//      this run (vs. already present).
//
// This is the SOLE entry point for "make this client look like this
// phase". Direct stage mutations elsewhere should migrate to call
// this so plugin enablement stays in sync with stage.

import { getPhase } from "./phases";
import { getClient, updateClient } from "./tenants";

export interface ApplyResult {
  ok: true;
  clientId: string;
  phaseId: string;
  stage: string;
  pluginsInstalledNow: string[];
  pluginsAlreadyPresent: string[];
}

export interface ApplyError {
  ok: false;
  error:
    | "phase_not_found"
    | "client_not_found"
    | "phase_agency_mismatch";
}

export async function applyPhaseToClient(
  clientId: string,
  phaseId: string,
): Promise<ApplyResult | ApplyError> {
  const phase = getPhase(phaseId);
  if (!phase) return { ok: false, error: "phase_not_found" };

  const client = getClient(clientId);
  if (!client) return { ok: false, error: "client_not_found" };

  if (client.agencyId !== phase.agencyId) {
    return { ok: false, error: "phase_agency_mismatch" };
  }

  // 1) Move the client to the phase's stage.
  updateClient(client.agencyId, clientId, { stage: phase.stage });

  // 2) Install plugins in the preset, idempotent.
  const installedNow: string[] = [];
  const alreadyPresent: string[] = [];

  if (phase.pluginPreset.length > 0) {
    const { installPlugin, getInstall } = await import("@/plugins/_runtime");
    for (const pluginId of phase.pluginPreset) {
      const scope = { agencyId: client.agencyId, clientId };
      if (getInstall(scope, pluginId)) {
        alreadyPresent.push(pluginId);
        continue;
      }
      try {
        await installPlugin(pluginId, {
          scope,
          installedBy: `phase-applier:${phaseId}`,
        });
        installedNow.push(pluginId);
      } catch (e) {
        // Don't tank the apply if one plugin fails — log + continue. The
        // applier returns success with the partial install record so the
        // caller can decide how to surface.
        // eslint-disable-next-line no-console
        console.warn(
          `[phaseApplier] install ${pluginId} failed for client=${clientId}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  return {
    ok: true,
    clientId,
    phaseId,
    stage: phase.stage,
    pluginsInstalledNow: installedNow,
    pluginsAlreadyPresent: alreadyPresent,
  };
}
