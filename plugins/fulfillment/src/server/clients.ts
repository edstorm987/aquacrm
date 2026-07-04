// Client creation flow with phase preset application.
//
// Splits cleanly into three steps that the API handler / page wraps in a
// transaction-flavoured "all-or-nothing":
//
//   1. Create the Client row (`clientStore.createClient`).
//   2. Install the phase's plugin preset for this client.
//   3. Apply the starter portal variant.
//   4. Initialise the checklist for the phase.
//   5. Activity log + event.
//
// On failure mid-flight the partial state is logged but not rolled back —
// the agency owner sees a client in an "incomplete" state and can retry.
// Future hardening: wrap in a unit-of-work once the storage layer
// exposes one.

import type {
  AgencyId,
  BrandKit,
  Client,
  ClientStage,
  PhaseDefinition,
  UserId,
} from "../lib/tenancy";
import type {
  ActivityLogPort,
  ClientStorePort,
  EventBusPort,
  PluginRuntimePort,
} from "./ports";
import type { ChecklistService } from "./checklist";
import type { PhaseService } from "./phases";
import type { StarterVariantService } from "./starterVariant";

export interface CreateClientWithPhaseInput {
  agencyId: AgencyId;
  actor: UserId;
  name: string;
  slug?: string;
  ownerEmail?: string;
  websiteUrl?: string;
  stage: ClientStage;             // pick one of the agency's phase rows
  brand?: Partial<BrandKit>;
  metadata?: Record<string, unknown>;
}

export interface CreateClientWithPhaseResult {
  client: Client;
  phase: PhaseDefinition;
  installs: { pluginId: string; ok: boolean; error?: string; skipped?: boolean }[];
  variant:
    | { ok: true; variantId: string; pageId?: string; siteId?: string }
    | { ok: false; error: string }
    | { skipped: true };
}

export class ClientLifecycleService {
  constructor(
    private clients: ClientStorePort,
    private runtime: PluginRuntimePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private phases: PhaseService,
    private checklist: ChecklistService,
    private variants: StarterVariantService,
  ) {}

  async createWithPhase(input: CreateClientWithPhaseInput): Promise<CreateClientWithPhaseResult> {
    const phase = await this.phases.getPhaseForStage(input.agencyId, input.stage);
    if (!phase) {
      throw new Error(
        `No phase definition for agency=${input.agencyId} stage=${input.stage}. ` +
        `Run seedDefaultPhases() first.`,
      );
    }

    const client = await this.clients.createClient(input.agencyId, {
      name: input.name,
      slug: input.slug,
      ownerEmail: input.ownerEmail,
      websiteUrl: input.websiteUrl,
      stage: input.stage,
      brand: input.brand,
      metadata: input.metadata,
    });

    const scope = { agencyId: input.agencyId, clientId: client.id };

    // Install the phase's preset plugins for this client.
    //
    // R7 — Soft-fail policy: an "unregistered plugin id" error from
    // the runtime is treated as `skipped: true` (not a hard install
    // failure). Caller can see which ids skipped via
    // `installs[i].skipped === true`. Same pattern as
    // TransitionService.advancePhase.
    const installs: CreateClientWithPhaseResult["installs"] = [];
    for (const pluginId of phase.pluginPreset) {
      const r = await this.runtime.installPlugin({
        pluginId,
        scope,
        installedBy: input.actor,
      });
      if (r.ok) {
        installs.push({ pluginId, ok: true });
      } else if (isUnregisteredPluginError(r.error)) {
        installs.push({ pluginId, ok: false, error: r.error, skipped: true });
        await this.activity.logActivity({
          agencyId: input.agencyId,
          clientId: client.id,
          actorUserId: input.actor,
          category: "phase",
          action: "phase.preset_plugin_skipped",
          message: `Phase preset plugin "${pluginId}" skipped on client creation — not registered in foundation.`,
          metadata: { pluginId, reason: r.error, phaseStage: phase.stage },
        });
        this.events.emit(scope, "phase.preset_plugin_skipped" as never, {
          pluginId, phaseId: phase.id, phaseStage: phase.stage, reason: r.error,
        });
      } else {
        installs.push({ pluginId, ok: false, error: r.error });
      }
    }

    // Apply starter portal variant (no-op shim until T3 ships).
    let variant: CreateClientWithPhaseResult["variant"] = { skipped: true };
    if (phase.portalVariantId) {
      variant = await this.variants.apply({
        agencyId: input.agencyId,
        clientId: client.id,
        variantId: phase.portalVariantId,
        role: "login",
        actor: input.actor,
      });
    }

    // Initialise checklist progress for the new phase.
    await this.checklist.initialiseFor({ clientId: client.id, phase });

    // Activity log.
    await this.activity.logActivity({
      agencyId: input.agencyId,
      clientId: client.id,
      actorUserId: input.actor,
      category: "tenant",
      action: "client.created",
      message: `Created ${client.name} in ${phase.label} phase.`,
      metadata: {
        phaseId: phase.id,
        stage: phase.stage,
        installedPlugins: installs.filter(i => i.ok).map(i => i.pluginId),
        failedPlugins: installs.filter(i => !i.ok).map(i => i.pluginId),
      },
    });

    // Note: T1's `tenants.createClient` already emits `client.created`.
    // We don't re-emit to avoid double-firing handlers.

    return { client, phase, installs, variant };
  }
}

// Same string-match heuristic as TransitionService — see
// `transitions.ts` for the rationale + future error-code migration.
function isUnregisteredPluginError(error: string): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes("not found")
    || lower.includes("not in registry")
    || lower.includes("not registered");
}
