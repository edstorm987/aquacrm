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
// On failure mid-flight the partial state is returned explicitly as
// `complete: false`. Foundation callers persist an operation checkpoint before
// invoking this service, so the same client can be resumed without creating a
// duplicate.

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
  checklist: { ok: true } | { ok: false; error: string };
  complete: boolean;
  failures: string[];
}

export interface MaterialiseClientPhaseInput {
  agencyId: AgencyId;
  actor: UserId;
  client: Client;
  stage: ClientStage;
  metadata?: Record<string, unknown>;
  resume?: Pick<CreateClientWithPhaseResult, "phase" | "installs" | "variant" | "checklist">;
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
    const client = await this.clients.createClient(input.agencyId, {
      name: input.name,
      slug: input.slug,
      ownerEmail: input.ownerEmail,
      websiteUrl: input.websiteUrl,
      stage: input.stage,
      brand: input.brand,
      metadata: input.metadata,
    });

    return this.materialiseExistingWithPhase({
      agencyId: input.agencyId,
      actor: input.actor,
      client,
      stage: input.stage,
      metadata: input.metadata,
    });
  }

  async materialiseExistingWithPhase(input: MaterialiseClientPhaseInput): Promise<CreateClientWithPhaseResult> {
    const phase = await this.phases.getPhaseForStage(input.agencyId, input.stage);
    if (!phase) {
      throw new Error(
        `No phase definition for agency=${input.agencyId} stage=${input.stage}.`,
      );
    }
    const storedClient = await this.clients.getClientForAgency(input.agencyId, input.client.id);
    if (!storedClient) throw new Error("Client does not belong to this agency.");
    const client = storedClient;
    const orderedPhases = (await this.phases.listForAgency(input.agencyId))
      .sort((left, right) => left.order - right.order);
    const startingStageIndex = orderedPhases.findIndex(candidate => candidate.id === phase.id);
    const skippedStageCount = Math.max(0, startingStageIndex);
    const lifecycleStartReason = typeof input.metadata?.lifecycleStartReason === "string"
      ? input.metadata.lifecycleStartReason.trim().slice(0, 500)
      : undefined;

    const scope = { agencyId: input.agencyId, clientId: client.id };
    const resume = input.resume?.phase.id === phase.id ? input.resume : undefined;

    // Install the phase's preset plugins for this client.
    //
    // Preserve the old `skipped` classification for observability, but a
    // missing registered plugin is still an incomplete lifecycle operation.
    // Creation callers must never translate a partial preset into success.
    const installs: CreateClientWithPhaseResult["installs"] = [];
    for (const pluginId of phase.pluginPreset) {
      const prior = resume?.installs.find(item => item.pluginId === pluginId);
      if (prior?.ok) {
        installs.push(prior);
        continue;
      }
      let r: Awaited<ReturnType<PluginRuntimePort["installPlugin"]>>;
      try {
        r = await this.runtime.installPlugin({
          pluginId,
          scope,
          installedBy: input.actor,
        });
      } catch (error) {
        r = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      if (r.ok) {
        installs.push({ pluginId, ok: true });
      } else if (isUnregisteredPluginError(r.error)) {
        installs.push({ pluginId, ok: false, error: r.error, skipped: true });
        await this.activity.logActivity({
          idempotencyKey: `client-lifecycle:${client.id}:${phase.id}:plugin-skipped:${pluginId}`,
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
    const priorVariant = resume?.variant;
    let variant: CreateClientWithPhaseResult["variant"] = priorVariant
      && "ok" in priorVariant
      && priorVariant.ok === true
      && priorVariant.variantId === phase.portalVariantId
      ? priorVariant
      : { skipped: true };
    if (phase.portalVariantId && !("ok" in variant && variant.ok === true)) {
      try {
        variant = await this.variants.apply({
          agencyId: input.agencyId,
          clientId: client.id,
          variantId: phase.portalVariantId,
          role: "account",
          actor: input.actor,
        });
      } catch (error) {
        variant = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    // Initialise once. A retry after a later failure must not reset work that
    // already exists for this client/phase pair.
    let checklist: CreateClientWithPhaseResult["checklist"] = resume?.checklist ?? { ok: false, error: "not initialised" };
    if (!checklist.ok) {
      try {
        await this.checklist.initialiseFor({ clientId: client.id, phase });
        checklist = { ok: true };
      } catch (error) {
        checklist = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    const failures = [
      ...installs.filter(item => !item.ok).map(item =>
        `Plugin ${item.pluginId}: ${item.error ?? "installation failed"}`),
      ...(variant && "ok" in variant && variant.ok === false
        ? [`Starter variant ${phase.portalVariantId ?? "unknown"}: ${variant.error}`]
        : []),
      ...(!checklist.ok ? [`Checklist: ${checklist.error}`] : []),
    ];
    const complete = failures.length === 0;

    // Activity log.
    await this.activity.logActivity({
      idempotencyKey: `client-lifecycle:${client.id}:${phase.id}:${complete ? "complete" : "incomplete"}`,
      agencyId: input.agencyId,
      clientId: client.id,
      actorUserId: input.actor,
      category: "tenant",
      action: complete ? "client.created" : "client.lifecycle_incomplete",
      message: complete
        ? skippedStageCount > 0
          ? `Created ${client.name} directly in ${phase.label}, bypassing ${skippedStageCount} ${skippedStageCount === 1 ? "earlier stage" : "earlier stages"}.${lifecycleStartReason ? ` Reason: ${lifecycleStartReason}` : ""}`
          : `Created ${client.name} in ${phase.label} phase.`
        : `Client ${client.name} was created in ${phase.label}, but lifecycle setup is incomplete: ${failures.join("; ")}`,
      metadata: {
        phaseId: phase.id,
        stage: phase.stage,
        installedPlugins: installs.filter(i => i.ok).map(i => i.pluginId),
        failedPlugins: installs.filter(i => !i.ok).map(i => i.pluginId),
        directLifecycleStart: skippedStageCount > 0,
        skippedStageCount,
        lifecycleStartReason,
        lifecycleComplete: complete,
        failures,
      },
    });

    // Note: T1's `tenants.createClient` already emits `client.created`.
    // We don't re-emit to avoid double-firing handlers.

    return { client, phase, installs, variant, checklist, complete, failures };
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
