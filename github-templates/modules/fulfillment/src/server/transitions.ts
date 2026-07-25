// Phase transitions — advancing a client from one phase to the next.
//
// Algorithm (locked in `04-architecture.md §7` and Decisions log #4):
//
//   1. Disable old phase's plugins (`enabled = false`, config preserved).
//   2. Enable / install new phase's plugins (re-enable if already present).
//   3. Apply new phase's starter portal variant (T3 integration via
//      `StarterVariantService`).
//   4. Update `client.stage = toPhase.stage`.
//   5. Initialise the checklist progress for the new phase.
//   6. Append an `ActivityLog` entry.
//   7. Emit `phase.advanced` on the eventBus.
//
// Auto-disable, config preserved. Reversible. Never auto-uninstall.

import type {
  AgencyId,
  ClientId,
  Client,
  PhaseDefinition,
  UserId,
} from "../lib/tenancy";
import type {
  ActivityLogPort,
  ClientStorePort,
  EventBusPort,
  PluginRuntimePort,
  PluginInstallStorePort,
} from "./ports";
import type { ChecklistService } from "./checklist";
import type { StarterVariantService } from "./starterVariant";

export interface AdvancePhaseArgs {
  agencyId: AgencyId;
  clientId: ClientId;
  fromPhase: PhaseDefinition;
  toPhase: PhaseDefinition;
  actor: UserId;
}

export interface AdvancePhaseResult {
  ok: true;
  client: Client;
  disabled: string[];
  enabled: string[];
  // R7 — plugins referenced in the preset but skipped because they're
  // not in the foundation registry. Soft-fail rather than hard-fail
  // (matches the variant-id soft-fail in step 3 — same architecture
  // spirit). Re-running advancePhase after T1 wires the registry
  // picks them up automatically.
  skipped: { pluginId: string; error: string }[];
  variant:
    | { ok: true; variantId: string; pageId?: string; siteId?: string }
    | { ok: false; error: string }
    | { skipped: true };
}

export interface AdvancePhaseFailure {
  ok: false;
  error: string;
  step: "disable" | "enable" | "variant" | "client" | "checklist" | "log";
  partial?: { disabled: string[]; enabled: string[] };
}

export class TransitionService {
  constructor(
    private clients: ClientStorePort,
    private installs: PluginInstallStorePort,
    private runtime: PluginRuntimePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private checklist: ChecklistService,
    private variants: StarterVariantService,
  ) {}

  async advancePhase(args: AdvancePhaseArgs): Promise<AdvancePhaseResult | AdvancePhaseFailure> {
    const scope = { agencyId: args.agencyId, clientId: args.clientId };

    // Sanity: same agency, both phases.
    if (args.fromPhase.agencyId !== args.agencyId || args.toPhase.agencyId !== args.agencyId) {
      return {
        ok: false,
        error: "Phase definitions don't belong to this agency.",
        step: "disable",
      };
    }

    // 1. Disable old phase plugins (only the ones not also in the new phase).
    const disabled: string[] = [];
    const newSet = new Set(args.toPhase.pluginPreset);
    for (const pluginId of args.fromPhase.pluginPreset) {
      if (newSet.has(pluginId)) continue;
      const result = await this.runtime.setEnabled({
        pluginId,
        scope,
        enabled: false,
        actor: args.actor,
      });
      if (!result.ok) {
        return {
          ok: false,
          error: `disable ${pluginId}: ${result.error}`,
          step: "disable",
          partial: { disabled, enabled: [] },
        };
      }
      disabled.push(pluginId);
    }

    // 2. Enable / install new phase plugins.
    //
    // Soft-fail policy (R7): plugin ids in the preset that aren't in
    // the foundation registry yet (or fail with a "not found" /
    // "not in registry" runtime error) are SKIPPED rather than
    // aborting the phase advance. The skipped plugin is logged as a
    // WARN activity entry + a `phase.preset_plugin_skipped` event
    // emit; phase.advanced still fires and the client moves stage.
    // This matches Bug B's variant-id soft-fail (architecture §7).
    // Real registry-side errors (auth, scope policy mismatch,
    // dependency unmet) still hard-fail.
    const enabled: string[] = [];
    const skipped: { pluginId: string; error: string }[] = [];
    for (const pluginId of args.toPhase.pluginPreset) {
      const existing = await this.installs.getInstall(scope, pluginId);
      if (existing) {
        if (!existing.enabled) {
          const r = await this.runtime.setEnabled({
            pluginId,
            scope,
            enabled: true,
            actor: args.actor,
          });
          if (!r.ok) {
            return {
              ok: false,
              error: `re-enable ${pluginId}: ${r.error}`,
              step: "enable",
              partial: { disabled, enabled },
            };
          }
        }
        enabled.push(pluginId);
      } else {
        const r = await this.runtime.installPlugin({
          pluginId,
          scope,
          installedBy: args.actor,
        });
        if (r.ok) {
          enabled.push(pluginId);
        } else if (isUnregisteredPluginError(r.error)) {
          skipped.push({ pluginId, error: r.error });
          await this.activity.logActivity({
            agencyId: args.agencyId,
            clientId: args.clientId,
            actorUserId: args.actor,
            category: "phase",
            action: "phase.preset_plugin_skipped",
            message: `Phase preset plugin "${pluginId}" skipped — not registered in foundation. Will install on next phase advance once T1 wires it.`,
            metadata: { pluginId, reason: r.error, phaseStage: args.toPhase.stage },
          });
          this.events.emit(scope, "phase.preset_plugin_skipped" as never, {
            pluginId,
            phaseId: args.toPhase.id,
            phaseStage: args.toPhase.stage,
            reason: r.error,
          });
        } else {
          return {
            ok: false,
            error: `install ${pluginId}: ${r.error}`,
            step: "enable",
            partial: { disabled, enabled },
          };
        }
      }
    }

    // 3. Apply starter portal variant (T3 integration; no-op until T3 lands).
    let variant: AdvancePhaseResult["variant"] = { skipped: true };
    if (args.toPhase.portalVariantId) {
      variant = await this.variants.apply({
        agencyId: args.agencyId,
        clientId: args.clientId,
        variantId: args.toPhase.portalVariantId,
        role: "login",
        actor: args.actor,
      });
      if (!variant.ok) {
        // Soft-fail: log + continue. The phase advance still succeeds —
        // the variant can be re-applied manually from the editor.
        this.activity.logActivity({
          agencyId: args.agencyId,
          clientId: args.clientId,
          actorUserId: args.actor,
          category: "phase",
          action: "phase.variant_apply_failed",
          message: `Variant ${args.toPhase.portalVariantId} could not be applied: ${variant.error}`,
          metadata: { variantId: args.toPhase.portalVariantId },
        });
      }
    }

    // 4. Update client.stage.
    const updated = await this.clients.updateClient(args.agencyId, args.clientId, {
      stage: args.toPhase.stage,
    });
    if (!updated) {
      return {
        ok: false,
        error: `client ${args.clientId} not found or not in agency ${args.agencyId}`,
        step: "client",
        partial: { disabled, enabled },
      };
    }

    // 5. Initialise checklist for the new phase.
    await this.checklist.initialiseFor({
      clientId: args.clientId,
      phase: args.toPhase,
    });

    // 6. Activity log.
    await this.activity.logActivity({
      agencyId: args.agencyId,
      clientId: args.clientId,
      actorUserId: args.actor,
      category: "phase",
      action: "phase.advanced",
      message: `Advanced to ${args.toPhase.label}.`,
      metadata: {
        from: args.fromPhase.id,
        fromStage: args.fromPhase.stage,
        to: args.toPhase.id,
        toStage: args.toPhase.stage,
        disabled,
        enabled,
        skipped: skipped.map(s => s.pluginId),
      },
    });

    // 7. Event bus.
    this.events.emit(scope, "phase.advanced", {
      from: args.fromPhase.id,
      to: args.toPhase.id,
      fromStage: args.fromPhase.stage,
      toStage: args.toPhase.stage,
      disabled,
      enabled,
      skipped: skipped.map(s => s.pluginId),
      actor: args.actor,
    });

    return { ok: true, client: updated, disabled, enabled, skipped, variant };
  }
}

// Error-string detection for the runtime's "unregistered plugin"
// failure mode. The foundation's `_runtime.installPlugin` returns
// `{ ok: false, error: 'Plugin "X" not found.' }` for unregistered
// ids — no error code today, so we match on the message. Real
// runtime-side errors (scope-policy mismatch, dependency unmet,
// auth) carry distinct messages and still hard-fail the advance.
//
// When the runtime grows an explicit error code, this helper switches
// to that. For now it's a string match — narrow + agnostic to the
// plugin id.
function isUnregisteredPluginError(error: string): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes("not found")
    || lower.includes("not in registry")
    || lower.includes("not registered");
}
