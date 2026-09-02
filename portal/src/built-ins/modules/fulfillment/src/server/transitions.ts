// Phase transitions — advancing a client from one phase to the next.
//
// Algorithm (locked in `04-architecture.md §7` and Decisions log #4):
//
//   1. Persist/claim one retryable transition operation.
//   2. Enable / install every required target plugin while the old phase stays live.
//   3. Apply the target starter portal variant (T3 integration via
//      `StarterVariantService`).
//   4. Disable old-only plugins, preserving their config.
//   5. Initialise the target checklist, then publish `client.stage`.
//   6. Append one idempotent `ActivityLog` entry.
//   7. Mark the operation complete, then emit `phase.advanced`.
//
// Every checkpoint is resumable. Missing plugins and failed variants are
// incomplete work, never hidden inside `ok:true`.

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
import { withClientPhaseMutationLock, type ChecklistService } from "./checklist";
import type { StarterVariantService } from "./starterVariant";
import type { PluginStorage } from "../lib/aquaPluginTypes";

export interface AdvancePhaseArgs {
  agencyId: AgencyId;
  clientId: ClientId;
  fromPhase: PhaseDefinition;
  toPhase: PhaseDefinition;
  actor: UserId;
  reason?: string;
  directJump?: boolean;
  skippedStageCount?: number;
  operationId?: string;
  /** The API supplies the install setting; legacy direct service callers omit it. */
  advanceRequiresAllTasks?: boolean;
}

export interface AdvancePhaseResult {
  ok: true;
  status: "complete";
  requestOperationId: string;
  operationId: string;
  retryable: false;
  replayed: boolean;
  client: Client;
  disabled: string[];
  enabled: string[];
  // Successful transitions have no skipped requirements. The field remains
  // for response compatibility; unavailable preset plugins are returned on
  // an `incomplete` result and picked up by retry after registration.
  skipped: { pluginId: string; error: string }[];
  variant:
    | { ok: true; variantId: string; pageId?: string; siteId?: string }
    | { ok: false; error: string }
    | { skipped: true };
}

export interface AdvancePhaseFailure {
  ok: false;
  status: "incomplete" | "rejected";
  requestOperationId: string;
  operationId?: string;
  retryable: boolean;
  error: string;
  step: "disable" | "enable" | "variant" | "client" | "checklist" | "log";
  partial?: { disabled: string[]; enabled: string[] };
  skipped?: { pluginId: string; error: string }[];
  variant?: AdvancePhaseResult["variant"];
}

type TransitionStep = AdvancePhaseFailure["step"];

interface TransitionOperationRecord {
  operationId: string;
  requestKey: string;
  agencyId: string;
  clientId: string;
  fromPhaseId: string;
  toPhaseId: string;
  status: "pending" | "incomplete" | "complete";
  attempts: number;
  disabled: string[];
  enabled: string[];
  skipped: { pluginId: string; error: string }[];
  variant: AdvancePhaseResult["variant"];
  clientUpdated: boolean;
  checklistInitialised: boolean;
  activityLogged: boolean;
  checklistOverride?: boolean;
  openRequiredTasks?: number;
  failedStep?: TransitionStep;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

const TRANSITION_OPERATIONS_KEY = "phase-transition-operations:v1";

export class TransitionService {
  private memoryRecords: Record<string, TransitionOperationRecord> = {};

  constructor(
    private clients: ClientStorePort,
    private installs: PluginInstallStorePort,
    private runtime: PluginRuntimePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private checklist: ChecklistService,
    private variants: StarterVariantService,
    private storage?: PluginStorage,
  ) {}

  async advancePhase(args: AdvancePhaseArgs): Promise<AdvancePhaseResult | AdvancePhaseFailure> {
    const run = () => this.runAdvancePhase(args);
    return this.storage
      ? withClientPhaseMutationLock(this.storage, args.clientId, run)
      : run();
  }

  private async runAdvancePhase(args: AdvancePhaseArgs): Promise<AdvancePhaseResult | AdvancePhaseFailure> {
    const scope = { agencyId: args.agencyId, clientId: args.clientId };
    const isDirectJump = args.directJump === true;
    const skippedStageCount = args.skippedStageCount ?? 0;
    const requestedId = cleanOperationId(args.operationId)
      ?? `legacy:${args.clientId}:${args.fromPhase.id}:${args.toPhase.id}:${args.actor}`;

    // Sanity: same agency, both phases.
    if (args.fromPhase.agencyId !== args.agencyId || args.toPhase.agencyId !== args.agencyId) {
      return {
        ok: false,
        status: "rejected",
        requestOperationId: requestedId,
        error: "Phase definitions don't belong to this agency.",
        step: "disable",
        retryable: false,
      };
    }

    const records = this.storage
      ? (await this.storage.get<Record<string, TransitionOperationRecord>>(TRANSITION_OPERATIONS_KEY)) ?? {}
      : this.memoryRecords;
    const requestKey = [args.agencyId, args.clientId, args.fromPhase.id, args.toPhase.id, args.reason ?? ""].join("\u0000");
    let record = records[requestedId]
      ?? Object.values(records).find(item => item.status !== "complete" && item.requestKey === requestKey);
    if (record && record.requestKey !== requestKey) {
      return { ok: false, status: "rejected", requestOperationId: requestedId, operationId: requestedId, retryable: false, error: "That transition operation id belongs to a different request.", step: "enable" };
    }
    if (record?.status === "complete") {
      const client = await Promise.resolve(this.clients.getClientForAgency(args.agencyId, args.clientId));
      if (!client || client.stage !== args.toPhase.stage) {
        return { ok: false, status: "rejected", requestOperationId: requestedId, operationId: record.operationId, retryable: false, error: "The completed transition no longer matches the client's current stage.", step: "client" };
      }
      return {
        ok: true, status: "complete", requestOperationId: requestedId, operationId: record.operationId, retryable: false, replayed: true,
        client, disabled: record.disabled, enabled: record.enabled, skipped: [], variant: record.variant,
      };
    }

    const currentClient = await Promise.resolve(this.clients.getClientForAgency(args.agencyId, args.clientId));
    if (!currentClient) {
      return { ok: false, status: "rejected", requestOperationId: requestedId, operationId: requestedId, retryable: false, error: "Client not found.", step: "client" };
    }
    const alreadyPublished = record?.clientUpdated === true && currentClient.stage === args.toPhase.stage;
    if (!alreadyPublished && currentClient.stage !== args.fromPhase.stage) {
      return {
        ok: false,
        status: "rejected",
        requestOperationId: requestedId,
        operationId: requestedId,
        retryable: false,
        error: `Client is currently in ${currentClient.stage}, not ${args.fromPhase.stage}. Refresh before advancing.`,
        step: "client",
      };
    }

    let checklistOverride = record?.checklistOverride === true;
    let openRequiredTasks = record?.openRequiredTasks ?? 0;
    if (!alreadyPublished && args.advanceRequiresAllTasks !== undefined) {
      const checklist = await this.checklist.viewFor({
        agencyId: args.agencyId,
        clientId: args.clientId,
        phase: args.fromPhase,
      });
      openRequiredTasks = checklist.internalTotal + checklist.clientTotal
        - checklist.internalDone - checklist.clientDone;
      checklistOverride = openRequiredTasks > 0 && args.advanceRequiresAllTasks === false;
      if (args.advanceRequiresAllTasks === true && openRequiredTasks > 0) {
        return {
          ok: false,
          status: "rejected",
          requestOperationId: requestedId,
          operationId: requestedId,
          retryable: true,
          error: `Complete all required checklist items before advancing (${openRequiredTasks} open).`,
          step: "checklist",
        };
      }
    }

    const now = Date.now();
    record = record ?? {
      operationId: requestedId,
      requestKey,
      agencyId: args.agencyId,
      clientId: args.clientId,
      fromPhaseId: args.fromPhase.id,
      toPhaseId: args.toPhase.id,
      status: "pending",
      attempts: 0,
      disabled: [],
      enabled: [],
      skipped: [],
      variant: { skipped: true },
      clientUpdated: false,
      checklistInitialised: false,
      activityLogged: false,
      checklistOverride,
      openRequiredTasks,
      createdAt: now,
      updatedAt: now,
    };
    record = {
      ...record,
      status: "pending",
      attempts: record.attempts + 1,
      failedStep: undefined,
      lastError: undefined,
      enabled: [],
      disabled: [],
      skipped: [],
      checklistOverride,
      openRequiredTasks,
      updatedAt: now,
    };
    await this.saveRecord(records, record);

    let step: TransitionStep = "enable";
    const incomplete = async (error: string): Promise<AdvancePhaseFailure> => {
      record = { ...record!, status: "incomplete", failedStep: step, lastError: error.slice(0, 1_000), updatedAt: Date.now() };
      await this.saveRecord(records, record);
      return {
        ok: false,
        status: "incomplete",
        requestOperationId: requestedId,
        operationId: record.operationId,
        retryable: true,
        error,
        step,
        partial: { disabled: record.disabled, enabled: record.enabled },
        skipped: record.skipped,
        variant: record.variant,
      };
    };

    try {
      // Prepare every required target plugin before disabling the old phase.
      for (const pluginId of args.toPhase.pluginPreset) {
        const existing = await Promise.resolve(this.installs.getInstall(scope, pluginId));
        if (existing?.enabled) {
          record.enabled.push(pluginId);
          continue;
        }
        const result = existing
          ? await this.runtime.setEnabled({ pluginId, scope, enabled: true, actor: args.actor })
          : await this.runtime.installPlugin({ pluginId, scope, installedBy: args.actor });
        if (!result.ok) {
          if (isUnregisteredPluginError(result.error)) {
            record.skipped.push({ pluginId, error: result.error });
            await this.saveRecord(records, record);
            continue;
          }
          await this.saveRecord(records, record);
          return incomplete(`${existing ? "re-enable" : "install"} ${pluginId}: ${result.error}`);
        }
        record.enabled.push(pluginId);
        await this.saveRecord(records, record);
      }
      if (record.skipped.length) {
        return incomplete(`Required preset plugins are unavailable: ${record.skipped.map(item => item.pluginId).join(", ")}.`);
      }

      // A requested starter variant is required transition work, not a hidden warning.
      step = "variant";
      if (args.toPhase.portalVariantId && !("ok" in record.variant && record.variant.ok)) {
        record.variant = await this.variants.apply({
          agencyId: args.agencyId,
          clientId: args.clientId,
          variantId: args.toPhase.portalVariantId,
          role: "account",
          actor: args.actor,
        });
        await this.saveRecord(records, record);
        if (!record.variant.ok) return incomplete(`apply variant ${args.toPhase.portalVariantId}: ${record.variant.error}`);
      }

      // Only retire old-phase plugins after the target is ready.
      step = "disable";
      const newSet = new Set(args.toPhase.pluginPreset);
      for (const pluginId of args.fromPhase.pluginPreset) {
        if (newSet.has(pluginId)) continue;
        const existing = await Promise.resolve(this.installs.getInstall(scope, pluginId));
        if (!existing || !existing.enabled) {
          record.disabled.push(pluginId);
          continue;
        }
        const result = await this.runtime.setEnabled({ pluginId, scope, enabled: false, actor: args.actor });
        if (!result.ok) return incomplete(`disable ${pluginId}: ${result.error}`);
        record.disabled.push(pluginId);
        await this.saveRecord(records, record);
      }

      step = "checklist";
      if (!record.checklistInitialised) {
        await this.checklist.initialiseFor({ clientId: args.clientId, phase: args.toPhase });
        record.checklistInitialised = true;
        await this.saveRecord(records, record);
      }

      // Publish the new stage only after its plugins, variant and checklist exist.
      step = "client";
      let updated = await Promise.resolve(this.clients.getClientForAgency(args.agencyId, args.clientId));
      if (!updated) return incomplete(`client ${args.clientId} not found or not in agency ${args.agencyId}`);
      if (updated.stage !== args.toPhase.stage) {
        updated = await Promise.resolve(this.clients.updateClient(args.agencyId, args.clientId, { stage: args.toPhase.stage }));
        if (!updated) return incomplete(`client ${args.clientId} not found or not in agency ${args.agencyId}`);
      }
      record.clientUpdated = true;
      await this.saveRecord(records, record);

      step = "log";
      if (!record.activityLogged) {
        await Promise.resolve(this.activity.logActivity({
          idempotencyKey: `phase-transition:${record.operationId}:advanced`,
          agencyId: args.agencyId,
          clientId: args.clientId,
          actorUserId: args.actor,
          category: "phase",
          action: "phase.advanced",
          message: isDirectJump
            ? `Moved directly to ${args.toPhase.label}, bypassing ${skippedStageCount} ${skippedStageCount === 1 ? "stage" : "stages"}.${args.reason ? ` Reason: ${args.reason}` : ""}`
            : `${args.toPhase.order >= args.fromPhase.order ? "Advanced" : "Moved back"} to ${args.toPhase.label}.${args.reason ? ` Reason: ${args.reason}` : ""}${checklistOverride ? ` Checklist override: ${openRequiredTasks} required item(s) remained open.` : ""}`,
          metadata: {
            operationId: record.operationId,
            from: args.fromPhase.id,
            fromStage: args.fromPhase.stage,
            to: args.toPhase.id,
            toStage: args.toPhase.stage,
            disabled: record.disabled,
            enabled: record.enabled,
            directJump: isDirectJump,
            skippedStageCount,
            reason: args.reason,
            checklistOverride,
            openRequiredTasks,
          },
        }));
        record.activityLogged = true;
      }

      record = { ...record, status: "complete", failedStep: undefined, lastError: undefined, updatedAt: Date.now(), completedAt: Date.now() };
      await this.saveRecord(records, record);

      try {
        this.events.emit(scope, "phase.advanced", {
          operationId: record.operationId,
          from: args.fromPhase.id,
          to: args.toPhase.id,
          fromStage: args.fromPhase.stage,
          toStage: args.toPhase.stage,
          disabled: record.disabled,
          enabled: record.enabled,
          skipped: [],
          actor: args.actor,
          directJump: isDirectJump,
          skippedStageCount,
          reason: args.reason,
          checklistOverride,
          openRequiredTasks,
        });
      } catch {
        // A non-durable subscriber notification cannot make committed state ambiguous.
      }

      return {
        ok: true,
        status: "complete",
        requestOperationId: requestedId,
        operationId: record.operationId,
        retryable: false,
        replayed: false,
        client: updated,
        disabled: record.disabled,
        enabled: record.enabled,
        skipped: [],
        variant: record.variant,
      };
    } catch (error) {
      return incomplete(error instanceof Error ? error.message : String(error));
    }
  }

  private async saveRecord(records: Record<string, TransitionOperationRecord>, record: TransitionOperationRecord) {
    records[record.operationId] = record;
    this.memoryRecords = records;
    if (this.storage) await this.storage.set(TRANSITION_OPERATIONS_KEY, records);
  }
}

function cleanOperationId(value: string | undefined): string | null {
  const clean = value?.trim();
  return clean && /^[a-zA-Z0-9:_-]{8,200}$/.test(clean) ? clean : null;
}

// Error-string classification for the runtime's "unregistered plugin"
// incomplete mode. The foundation's `_runtime.installPlugin` returns
// `{ ok: false, error: 'Plugin "X" not found.' }` for unregistered
// ids — no error code today, so we match on the message. Real
// runtime-side errors (scope-policy mismatch, dependency unmet,
// auth) carry distinct messages. Both forms remain retryable incomplete
// operations; the classified form also names every unavailable plugin.
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
