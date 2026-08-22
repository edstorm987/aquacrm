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

/**
 * Apply a phase to a client, on behalf of `agencyId`.
 *
 * `agencyId` is REQUIRED and is the caller's own tenant — it is not derived
 * from the client, and it is not optional. Both ids in the signature come from
 * a request body, and the only check used to be `client.agencyId ===
 * phase.agencyId`: name a client in agency B AND a phase in agency B and the
 * two agreed with each other, so an owner in agency A moved a stranger's client
 * to a new stage and installed plugins into their workspace. Same class as the
 * plugin dispatcher's `?agencyId=` hole, one layer up: the request named the
 * tenant, and nothing asked whether the caller belonged to it.
 *
 * A client outside the caller's agency answers `client_not_found`, the same as
 * one that does not exist — a distinct "wrong agency" error would confirm the
 * stranger's client id to whoever probed for it.
 */
export async function applyPhaseToClient(
  clientId: string,
  phaseId: string,
  agencyId: string,
): Promise<ApplyResult | ApplyError> {
  const phase = getPhase(phaseId);
  if (!phase || phase.agencyId !== agencyId) return { ok: false, error: "phase_not_found" };

  const client = getClient(clientId);
  if (!client || client.agencyId !== agencyId) return { ok: false, error: "client_not_found" };

  if (client.agencyId !== phase.agencyId) {
    return { ok: false, error: "phase_agency_mismatch" };
  }

  // 1) Move the client to the phase's stage.
  updateClient(client.agencyId, clientId, { stage: phase.stage });

  // 2) Install plugins in the preset, idempotent.
  const installedNow: string[] = [];
  const alreadyPresent: string[] = [];

  if (phase.pluginPreset.length > 0) {
    const { installPlugin, getInstall } = await import("@/built-ins/runtime/_runtime");
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
