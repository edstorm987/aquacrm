// Plan service — CRUD + ordering + Stripe-price-id sync.
//
// Storage layout (per-install):
//   memberships/plans/<planId>     — Plan row
//   memberships/plans/index        — string[] of plan ids
//
// Stripe sync rule: when `priceMonthly` / `priceAnnual` / `currency`
// change OR when a plan is created from scratch, we create new Stripe
// Price objects (Stripe Prices are immutable) and stash their ids on
// the plan. Existing subscribers stay on their old prices; new
// signups use the new ones.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type {
  AgencyId,
  ClientId,
  UserId,
} from "../lib/tenancy";
import type {
  CreatePlanInput,
  Currency,
  Plan,
  UpdatePlanPatch,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
  StripePort,
  StripePrice,
} from "./ports";
import {
  assertCreatePlanInput,
  assertPlan,
  assertProviderId,
  assertUpdatePlanPatch,
} from "../lib/runtimeValidation";
import {
  PlanHasDependantsError,
  planDependencyInventoryFromStorage,
  withMembershipDependencyLock,
} from "./dependencies";

const PLAN_INDEX_KEY = "memberships/plans/index";
const planKey = (id: string): string => `memberships/plans/${id}`;

export const PLAN_PRICE_COMMAND_PREFIX = "memberships/plan-price-command/";
const planPriceCommandKey = (id: string): string => `${PLAN_PRICE_COMMAND_PREFIX}${encodeURIComponent(id)}`;

type PlanPriceCommandStage = "pending" | "provider_applied" | "completed" | "conflicted";

const planPriceCommandStageRank: Record<PlanPriceCommandStage, number> = {
  pending: 0,
  provider_applied: 1,
  completed: 2,
  conflicted: 2,
};

export interface PlanPriceProvisioningCommand {
  id: string;
  signature: string;
  kind: "create" | "update";
  stage: PlanPriceCommandStage;
  agencyId: AgencyId;
  clientId: ClientId;
  actor: UserId;
  planId: string;
  /** Exact plan snapshot the provider outcome is intended for. */
  candidate: Plan;
  /** Full target snapshot for an update. A mismatch makes the outcome stale. */
  baseFingerprint?: string;
  changedFields: string[];
  monthlyPrice?: StripePrice;
  annualPrice?: StripePrice;
  result?: Plan;
  failure?: string;
  createdAt: number;
  updatedAt: number;
}

export class PlanPriceOperationConflictError extends Error {
  constructor(readonly operationId: string, message: string) {
    super(message);
    this.name = "PlanPriceOperationConflictError";
  }
}

/** A caller-controlled plan value failed domain validation. */
export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanValidationError";
  }
}

/**
 * Stripe did not produce a durable outcome for this operation. The command is
 * deliberately left retryable under the same operation id.
 */
export class PlanPriceProvisioningRetryableError extends Error {
  constructor(
    readonly operationId: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PlanPriceProvisioningRetryableError";
  }
}

function asPlanValidation(error: unknown): PlanValidationError {
  if (error instanceof PlanValidationError) return error;
  return new PlanValidationError(error instanceof Error ? error.message : String(error));
}

const localPlanProviderTails = new Map<string, Promise<void>>();

async function localPlanProviderExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = localPlanProviderTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  localPlanProviderTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (localPlanProviderTails.get(key) === tail) localPlanProviderTails.delete(key);
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  );
}

function fingerprint(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function compactHash(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function normaliseOperationId(value?: string): string {
  if (value === undefined) return makeId("plan_price_operation");
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!cleaned) throw new PlanValidationError("operationId: must not be blank");
  if (cleaned.length > 160) throw new PlanValidationError("operationId: must be at most 160 characters");
  return cleaned;
}

/** Where the outcome of the default-plan seed is recorded. */
export const SEED_REPORT_KEY = "memberships/plans/seed-report";

/** One default plan that could not be created, and why. */
export interface SeedDefaultsFailure {
  name: string;
  priceMonthly: number;
  reason: string;
}

export interface SeedDefaultsResult {
  seeded: number;
  existed: number;
  /** Empty on a clean seed. Non-empty means the install is only partly set up. */
  failed: SeedDefaultsFailure[];
}

/** The persisted record of the last seed attempt, read back by the healthcheck. */
export interface SeedReport extends SeedDefaultsResult {
  at: number;
  currency: string;
}

export class PlanService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private stripe: StripePort,
  ) {}

  async list(): Promise<Plan[]> {
    const index = (await this.storage.get<string[]>(PLAN_INDEX_KEY)) ?? [];
    const out: Plan[] = [];
    for (const id of index) {
      const row = await this.storage.get<Plan>(planKey(id));
      if (row) out.push(row);
    }
    return out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  async listActive(): Promise<Plan[]> {
    return (await this.list()).filter(p => p.status === "active");
  }

  async get(id: string): Promise<Plan | null> {
    const row = await this.storage.get<Plan>(planKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  async create(input: CreatePlanInput, actor: UserId, requestedOperationId?: string): Promise<Plan> {
    try { assertCreatePlanInput(input); }
    catch (error) { throw asPlanValidation(error); }
    const operationId = normaliseOperationId(requestedOperationId);
    const signature = fingerprint({ actor, input, kind: "create" });
    const command = await this.withDependencyGraph(async () => {
      const existingCommand = await this.readMatchingCommand(operationId, signature, "create");
      if (existingCommand) return existingCommand;

      // The durable intent owns both the generated id and ordering decision.
      // Every retry — including another process — therefore converges on the
      // same eventual plan row.
      const existing = await this.list();
      const order = input.order ?? (existing.length > 0
        ? Math.max(...existing.map(plan => plan.order)) + 10
        : 10);
      const ts = now();
      const candidate: Plan = {
        id: makeId("plan"),
        agencyId: this.agencyId,
        clientId: this.clientId,
        name: input.name.trim(),
        description: input.description,
        priceMonthly: input.priceMonthly,
        priceAnnual: input.priceAnnual ?? 0,
        currency: input.currency,
        features: [...(input.features ?? [])],
        benefitIds: [...(input.benefitIds ?? [])],
        status: "active",
        order,
        trialDays: input.trialDays,
        createdAt: ts,
        updatedAt: ts,
      };
      try { assertPlan(candidate); }
      catch (error) { throw asPlanValidation(error); }
      await this.assertBenefitReferences(candidate.benefitIds);
      return this.saveCommand({
        id: operationId,
        signature,
        kind: "create",
        stage: "pending",
        agencyId: this.agencyId,
        clientId: this.clientId,
        actor,
        planId: candidate.id,
        candidate,
        changedFields: Object.keys(input),
        createdAt: ts,
        updatedAt: ts,
      });
    });

    const plan = await this.executePriceCommand(command);
    await this.logCommandActivity(command, plan);
    return plan;
  }

  async update(
    id: string,
    patch: UpdatePlanPatch,
    actor: UserId,
    requestedOperationId?: string,
  ): Promise<Plan | null> {
    try { assertUpdatePlanPatch(patch); }
    catch (error) { throw asPlanValidation(error); }
    const operationId = normaliseOperationId(requestedOperationId);
    const signature = fingerprint({ actor, id, kind: "update", patch });
    const started = await this.withDependencyGraph(async () => {
      const existingCommand = await this.readMatchingCommand(operationId, signature, "update");
      if (existingCommand) return { command: existingCommand } as const;

      const existing = await this.get(id);
      if (!existing) return { missing: true } as const;
      const priceChanged = (patch.priceMonthly !== undefined && patch.priceMonthly !== existing.priceMonthly)
        || (patch.priceAnnual !== undefined && patch.priceAnnual !== existing.priceAnnual)
        || (patch.currency !== undefined && patch.currency !== existing.currency);
      const next: Plan = {
        ...existing,
        ...patch,
        name: patch.name?.trim() ?? existing.name,
        features: patch.features ? [...patch.features] : existing.features,
        benefitIds: patch.benefitIds ? [...patch.benefitIds] : existing.benefitIds,
        updatedAt: now(),
      };
      try { assertPlan(next); }
      catch (error) { throw asPlanValidation(error); }
      await this.assertBenefitReferences(next.benefitIds);

      // No provider outcome is involved, so this remains a single short graph
      // mutation. Price changes take the durable command path below.
      if (!priceChanged) {
        await this.storage.set(planKey(id), next);
        return { direct: next } as const;
      }

      const active = await this.activePriceCommandForPlan(id, operationId);
      if (active) {
        throw new PlanPriceOperationConflictError(
          operationId,
          `Plan ${id} already has unfinished price operation ${active.id}. Retry that operation first.`,
        );
      }

      const ts = now();
      const command = await this.saveCommand({
        id: operationId,
        signature,
        kind: "update",
        stage: "pending",
        agencyId: this.agencyId,
        clientId: this.clientId,
        actor,
        planId: id,
        candidate: next,
        baseFingerprint: fingerprint(existing),
        changedFields: Object.keys(patch),
        createdAt: ts,
        updatedAt: ts,
      });
      return { command } as const;
    });

    if ("missing" in started) return null;
    if ("direct" in started && started.direct) {
      await this.logDirectUpdate(started.direct, actor, Object.keys(patch));
      return started.direct;
    }
    const plan = await this.executePriceCommand(started.command);
    await this.logCommandActivity(started.command, plan);
    return plan;
  }

  // Soft archive: status flips to "archived"; existing subscribers keep
  // paying their old plan. New signups can't pick this plan from the
  // tier grid because we filter by status === "active" everywhere
  // public-facing.
  async archive(id: string, actor: UserId): Promise<Plan | null> {
    return this.update(id, { status: "archived" }, actor);
  }

  async delete(id: string, actor: UserId): Promise<boolean> {
    return withMembershipDependencyLock(this.storage, this.agencyId, this.clientId, async () => {
      const existing = await this.get(id);
      if (!existing) return false;
      const dependencies = await planDependencyInventoryFromStorage(
        this.storage,
        this.agencyId,
        this.clientId,
        id,
      );
      if (dependencies.total > 0) throw new PlanHasDependantsError(existing.name, dependencies);
      await this.storage.del(planKey(id));
      const index = (await this.storage.get<string[]>(PLAN_INDEX_KEY)) ?? [];
      await this.storage.set(PLAN_INDEX_KEY, index.filter(x => x !== id));
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: this.clientId,
        actorUserId: actor,
        category: "memberships",
        action: "membership.plan_deleted",
        message: `Deleted plan "${existing.name}".`,
        metadata: { planId: id },
      });
      return true;
    });
  }

  private async withDependencyGraph<T>(operation: () => Promise<T>): Promise<T> {
    return withMembershipDependencyLock(this.storage, this.agencyId, this.clientId, operation);
  }

  private async withPlanProvider<T>(planId: string, operation: () => Promise<T>): Promise<T> {
    const key = `membership-plan-price-provider:${this.agencyId}:${this.clientId}:${planId}`;
    // This process-local lane sequences the whole state machine without
    // keeping a storage transaction open around remote I/O. Cross-process
    // convergence is provided per cadence below by the durable keyed lane plus
    // the provider's idempotency key.
    return localPlanProviderExclusive(key, operation);
  }

  private async withProviderCadence<T>(
    command: PlanPriceProvisioningCommand,
    cadence: "monthly" | "annual",
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `membership-plan-price-provider:${this.agencyId}:${this.clientId}:${command.planId}:${command.id}:${cadence}`;
    // `StoragePort.runExclusive` maps to a whole PortalState transaction on
    // file/Postgres installations. Never put Stripe inside it: the provider's
    // idempotency key is the cross-process convergence primitive, while this
    // narrow lane only suppresses duplicate calls in the current process.
    return localPlanProviderExclusive(key, operation);
  }

  private async readMatchingCommand(
    operationId: string,
    signature: string,
    kind: PlanPriceProvisioningCommand["kind"],
  ): Promise<PlanPriceProvisioningCommand | null> {
    const command = await this.storage.get<PlanPriceProvisioningCommand>(planPriceCommandKey(operationId));
    if (!command) return null;
    if (
      command.agencyId !== this.agencyId
      || command.clientId !== this.clientId
      || command.kind !== kind
      || command.signature !== signature
    ) {
      throw new PlanPriceOperationConflictError(
        operationId,
        "operationId was already used for a different membership plan change.",
      );
    }
    if (command.stage === "conflicted") {
      throw new PlanPriceOperationConflictError(
        operationId,
        command.failure ?? "The membership plan changed before this provider outcome could be applied.",
      );
    }
    return command;
  }

  private async activePriceCommandForPlan(
    planId: string,
    exceptOperationId: string,
  ): Promise<PlanPriceProvisioningCommand | null> {
    const keys = await this.storage.list(PLAN_PRICE_COMMAND_PREFIX);
    for (const key of keys) {
      const command = await this.storage.get<PlanPriceProvisioningCommand>(key);
      if (
        command
        && command.id !== exceptOperationId
        && command.kind === "update"
        && command.planId === planId
        && command.agencyId === this.agencyId
        && command.clientId === this.clientId
        && (command.stage === "pending" || command.stage === "provider_applied")
      ) {
        return command;
      }
    }
    return null;
  }

  private async saveCommand(
    command: PlanPriceProvisioningCommand,
  ): Promise<PlanPriceProvisioningCommand> {
    const current = await this.storage.get<PlanPriceProvisioningCommand>(planPriceCommandKey(command.id));
    if (
      current
      && current.signature === command.signature
      && current.kind === command.kind
      && (
        planPriceCommandStageRank[current.stage] > planPriceCommandStageRank[command.stage]
        || (
          planPriceCommandStageRank[current.stage] === 2
          && current.stage !== command.stage
        )
      )
    ) {
      return current;
    }
    const next = current
      && current.signature === command.signature
      && current.kind === command.kind
      ? {
          ...current,
          ...command,
          monthlyPrice: command.monthlyPrice ?? current.monthlyPrice,
          annualPrice: command.annualPrice ?? current.annualPrice,
          result: command.result ?? current.result,
          updatedAt: now(),
        }
      : { ...command, updatedAt: now() };
    await this.storage.set(planPriceCommandKey(command.id), next);
    return next;
  }

  private providerKey(command: PlanPriceProvisioningCommand, cadence: "monthly" | "annual" | "activity"): string {
    const raw = [
      "memberships",
      this.agencyId,
      this.clientId,
      command.planId,
      command.id,
      cadence,
    ].join(":");
    if (raw.length <= 240) return raw;
    const digest = `${compactHash(raw, 2_166_136_261)}${compactHash(raw, 2_654_435_761)}`;
    return `${raw.slice(0, 200)}:${digest}:${cadence}`;
  }

  private outcomeReady(command: PlanPriceProvisioningCommand): boolean {
    return (command.candidate.priceMonthly <= 0 || Boolean(command.monthlyPrice))
      && (command.candidate.priceAnnual <= 0 || Boolean(command.annualPrice));
  }

  private materialisePlan(command: PlanPriceProvisioningCommand): Plan {
    if (!this.outcomeReady(command)) {
      throw new Error(`Plan price operation ${command.id} has an incomplete provider outcome.`);
    }
    if (command.monthlyPrice) assertProviderId(command.monthlyPrice.id, "stripePriceIdMonthly");
    if (command.annualPrice) assertProviderId(command.annualPrice.id, "stripePriceIdAnnual");
    const plan: Plan = {
      ...command.candidate,
      stripePriceIdMonthly: command.candidate.priceMonthly > 0 ? command.monthlyPrice!.id : undefined,
      stripePriceIdAnnual: command.candidate.priceAnnual > 0 ? command.annualPrice!.id : undefined,
    };
    assertPlan(plan);
    return plan;
  }

  private async markConflict(
    command: PlanPriceProvisioningCommand,
    message: string,
  ): Promise<PlanPriceProvisioningCommand> {
    return this.saveCommand({ ...command, stage: "conflicted", failure: message });
  }

  private async ensurePlanIndexed(planId: string): Promise<void> {
    const index = (await this.storage.get<string[]>(PLAN_INDEX_KEY)) ?? [];
    if (!index.includes(planId)) await this.storage.set(PLAN_INDEX_KEY, [...index, planId]);
  }

  private async validateBeforeProvider(
    command: PlanPriceProvisioningCommand,
  ): Promise<{ command: PlanPriceProvisioningCommand; conflict?: string }> {
    return this.withDependencyGraph(async () => {
      const current = await this.storage.get<PlanPriceProvisioningCommand>(planPriceCommandKey(command.id));
      if (!current || current.signature !== command.signature || current.kind !== command.kind) {
        return { command, conflict: "The durable membership plan operation could not be recovered." };
      }
      if (current.stage === "completed") return { command: current };
      if (current.stage === "conflicted") {
        return { command: current, conflict: current.failure ?? "The membership plan operation is stale." };
      }

      const target = await this.get(current.planId);
      if (current.kind === "create") {
        if (!target) return { command: current };
        if (this.outcomeReady(current) && fingerprint(target) === fingerprint(this.materialisePlan(current))) {
          await this.ensurePlanIndexed(target.id);
          return { command: await this.saveCommand({ ...current, stage: "completed", result: target }) };
        }
        const message = "A different plan already occupies this provisioning operation's target id.";
        return { command: await this.markConflict(current, message), conflict: message };
      }

      if (target && this.outcomeReady(current) && fingerprint(target) === fingerprint(this.materialisePlan(current))) {
        return { command: await this.saveCommand({ ...current, stage: "completed", result: target }) };
      }
      if (target && fingerprint(target) === current.baseFingerprint) return { command: current };
      const message = target
        ? "The membership plan changed before its new provider prices could be applied."
        : "The membership plan was deleted before its new provider prices could be applied.";
      return { command: await this.markConflict(current, message), conflict: message };
    });
  }

  private async commitPriceCommand(
    command: PlanPriceProvisioningCommand,
  ): Promise<{ command: PlanPriceProvisioningCommand; result?: Plan; conflict?: string }> {
    return this.withDependencyGraph(async () => {
      const current = await this.storage.get<PlanPriceProvisioningCommand>(planPriceCommandKey(command.id));
      if (!current || current.signature !== command.signature || current.kind !== command.kind) {
        return { command, conflict: "The durable membership plan operation could not be recovered." };
      }
      if (current.stage === "completed" && current.result) {
        return { command: current, result: current.result };
      }
      if (current.stage === "conflicted") {
        return { command: current, conflict: current.failure ?? "The membership plan operation is stale." };
      }

      const result = this.materialisePlan(current);
      let target = await this.get(current.planId);
      if (target && fingerprint(target) === fingerprint(result)) {
        if (current.kind === "create") await this.ensurePlanIndexed(target.id);
        const completed = await this.saveCommand({ ...current, stage: "completed", result: target });
        return { command: completed, result: target };
      }
      if (current.kind === "create" ? Boolean(target) : !target || fingerprint(target) !== current.baseFingerprint) {
        const message = target
          ? "The membership plan changed before its new provider prices could be applied."
          : "The membership plan was deleted before its new provider prices could be applied.";
        return { command: await this.markConflict(current, message), conflict: message };
      }

      try {
        // Benefit references can change while Stripe is working. Re-check them
        // in the same graph transaction as the final parent write.
        await this.assertBenefitReferences(result.benefitIds);
      } catch (error) {
        // A missing/wrong-scope reference makes this exact provider outcome
        // stale. A storage failure says nothing about the reference and must
        // leave the provider-applied command retryable instead of poisoning it
        // as a permanent conflict.
        if (!(error instanceof PlanValidationError)) throw error;
        const message = error instanceof Error ? error.message : String(error);
        return { command: await this.markConflict(current, message), conflict: message };
      }

      await this.storage.set(planKey(result.id), result);
      if (current.kind === "create") {
        await this.ensurePlanIndexed(result.id);
      }
      target = result;
      const completed = await this.saveCommand({ ...current, stage: "completed", result: target });
      return { command: completed, result: target };
    });
  }

  private async provisionCadence(
    command: PlanPriceProvisioningCommand,
    cadence: "monthly" | "annual",
  ): Promise<PlanPriceProvisioningCommand> {
    return this.withProviderCadence(command, cadence, async () => {
      const current = await this.readMatchingCommand(command.id, command.signature, command.kind);
      if (!current) throw new Error(`Plan price operation ${command.id} was not persisted.`);
      if (current.stage === "completed" || current.stage === "conflicted") return current;
      const existingOutcome = cadence === "monthly" ? current.monthlyPrice : current.annualPrice;
      if (existingOutcome) return current;
      const unitAmount = cadence === "monthly"
        ? current.candidate.priceMonthly
        : current.candidate.priceAnnual;
      if (unitAmount <= 0) return current;
      // Remote I/O is intentionally outside every storage/graph transaction.
      // If the process dies after Stripe succeeds, retrying this same key
      // adopts the original Price and reaches the short checkpoint below.
      let price: StripePrice;
      try {
        price = await this.stripe.createPrice({
          product: { name: current.candidate.name, description: current.candidate.description },
          unitAmount,
          currency: current.candidate.currency,
          recurring: { interval: cadence === "monthly" ? "month" : "year" },
          metadata: { planId: current.planId, billing: cadence, operationId: current.id },
          idempotencyKey: this.providerKey(current, cadence),
        });
        assertProviderId(price.id, cadence === "monthly" ? "stripePriceIdMonthly" : "stripePriceIdAnnual");
      } catch (error) {
        throw new PlanPriceProvisioningRetryableError(
          current.id,
          error instanceof Error ? error.message : String(error),
          { cause: error },
        );
      }
      return this.withDependencyGraph(async () => {
        const latest = await this.storage.get<PlanPriceProvisioningCommand>(planPriceCommandKey(current.id));
        if (!latest || latest.signature !== current.signature || latest.kind !== current.kind) {
          throw new PlanPriceOperationConflictError(
            current.id,
            "The durable membership plan operation could not be recovered after provider success.",
          );
        }
        if (latest.stage === "completed") return latest;
        const existingOutcome = cadence === "monthly" ? latest.monthlyPrice : latest.annualPrice;
        if (existingOutcome) {
          if (existingOutcome.id !== price.id) {
            throw new PlanPriceOperationConflictError(
              current.id,
              `Stripe returned conflicting ${cadence} outcomes for the same idempotency key.`,
            );
          }
          return latest;
        }
        return this.saveCommand(cadence === "monthly"
          ? { ...latest, monthlyPrice: price }
          : { ...latest, annualPrice: price });
      });
    });
  }

  private async executePriceCommand(initial: PlanPriceProvisioningCommand): Promise<Plan> {
    return this.withPlanProvider(initial.planId, async () => {
      let command = await this.readMatchingCommand(initial.id, initial.signature, initial.kind);
      if (!command) throw new Error(`Plan price operation ${initial.id} was not persisted.`);
      if (command.stage === "completed" && command.result) return command.result;

      const validated = await this.validateBeforeProvider(command);
      command = validated.command;
      if (validated.conflict) throw new PlanPriceOperationConflictError(command.id, validated.conflict);
      if (command.stage === "completed" && command.result) return command.result;

      // Price objects are immutable. Each cadence gets its own stable key and
      // durable transaction. Monthly therefore commits before annual starts;
      // a later annual failure cannot erase or duplicate the monthly outcome.
      if (command.candidate.priceMonthly > 0 && !command.monthlyPrice) {
        command = await this.provisionCadence(command, "monthly");
      }
      if (command.stage === "completed" && command.result) return command.result;
      if (command.stage === "conflicted") {
        throw new PlanPriceOperationConflictError(command.id, command.failure ?? "The membership plan operation is stale.");
      }
      if (command.candidate.priceAnnual > 0 && !command.annualPrice) {
        const annualValidation = await this.validateBeforeProvider(command);
        command = annualValidation.command;
        if (annualValidation.conflict) {
          throw new PlanPriceOperationConflictError(command.id, annualValidation.conflict);
        }
        if (command.stage === "completed" && command.result) return command.result;
        command = await this.provisionCadence(command, "annual");
      }
      if (command.stage === "completed" && command.result) return command.result;
      if (command.stage === "conflicted") {
        throw new PlanPriceOperationConflictError(command.id, command.failure ?? "The membership plan operation is stale.");
      }
      command = await this.saveCommand({ ...command, stage: "provider_applied" });

      const committed = await this.commitPriceCommand(command);
      if (committed.conflict || !committed.result) {
        throw new PlanPriceOperationConflictError(
          command.id,
          committed.conflict ?? "The membership plan provider outcome could not be committed.",
        );
      }
      return committed.result;
    });
  }

  private async logCommandActivity(command: PlanPriceProvisioningCommand, plan: Plan): Promise<void> {
    const created = command.kind === "create";
    await this.activity.logActivity({
      idempotencyKey: this.providerKey(command, "activity"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: command.actor,
      category: "memberships",
      action: created ? "membership.plan_created" : "membership.plan_updated",
      message: created
        ? `Created plan "${plan.name}" at ${formatMoney(plan.priceMonthly, plan.currency)}/mo.`
        : `Updated plan "${plan.name}".`,
      metadata: created
        ? { planId: plan.id, priceMonthly: plan.priceMonthly, currency: plan.currency, operationId: command.id }
        : { planId: plan.id, fields: command.changedFields, priceChanged: true, operationId: command.id },
    });
  }

  private async logDirectUpdate(plan: Plan, actor: UserId, fields: string[]): Promise<void> {
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "memberships",
      action: "membership.plan_updated",
      message: `Updated plan "${plan.name}".`,
      metadata: { planId: plan.id, fields, priceChanged: false },
    });
  }

  // Idempotent. Seeds Bronze / Silver / Gold defaults if no plans exist
  // yet for this client. Called from `onInstall`.
  //
  // Silver and Gold are PAID, so each needs a Stripe Price. With no Stripe
  // configured those two throw and only free Bronze survives. That partial
  // outcome is REPORTED, never swallowed: `failed` names each plan that could
  // not be created and why, so `onInstall` can record it and the healthcheck
  // can stop reporting a half-seeded install as green.
  async seedDefaults(
    actor: UserId,
    currency: Currency = "usd",
  ): Promise<SeedDefaultsResult> {
    const existing = await this.list();
    if (existing.length > 0) return { seeded: 0, existed: existing.length, failed: [] };

    const defaults: CreatePlanInput[] = [
      {
        name: "Bronze",
        description: "Free tier — basic access.",
        priceMonthly: 0,
        priceAnnual: 0,
        currency,
        features: ["Read-only access", "Community support"],
        order: 10,
      },
      {
        name: "Silver",
        description: "Most popular — full access plus member perks.",
        priceMonthly: 999,            // $9.99
        priceAnnual: 9999,            // $99.99 = ~17% off monthly
        currency,
        features: ["Full access", "Member discount on store", "Priority support"],
        trialDays: 7,
        order: 20,
      },
      {
        name: "Gold",
        description: "Top tier — everything in Silver plus exclusive content + concierge.",
        priceMonthly: 2499,           // $24.99
        priceAnnual: 24999,           // $249.99
        currency,
        features: ["Everything in Silver", "Exclusive content", "1-on-1 concierge"],
        trialDays: 14,
        order: 30,
      },
    ];

    let seeded = 0;
    const failed: SeedDefaultsFailure[] = [];
    for (const def of defaults) {
      try {
        await this.create(
          def,
          actor,
          `membership-default-plan:${this.agencyId}:${this.clientId}:${currency}:${def.name.toLowerCase()}`,
        );
        seeded += 1;
      } catch (err) {
        // Keep going — a later default may still be creatable — but record
        // exactly which one failed and why. Swallowing this is how an install
        // ends up with free Bronze only and no surface saying so.
        failed.push({
          name: def.name,
          priceMonthly: def.priceMonthly,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const report: SeedReport = { at: now(), currency, seeded, existed: 0, failed };
    await this.storage.set(SEED_REPORT_KEY, report);
    return { seeded, existed: 0, failed };
  }

  /**
   * The recorded outcome of the last default-plan seed, or null if this install
   * never ran one. The healthcheck reads it so a half-seeded install (free
   * Bronze only, because Stripe was not configured) cannot report as green.
   */
  async getSeedReport(): Promise<SeedReport | null> {
    return (await this.storage.get<SeedReport>(SEED_REPORT_KEY)) ?? null;
  }

  private async assertBenefitReferences(benefitIds: string[]): Promise<void> {
    for (const benefitId of benefitIds) {
      const benefit = await this.storage.get<{ agencyId?: string; clientId?: string }>(`memberships/benefits/${benefitId}`);
      if (!benefit || benefit.agencyId !== this.agencyId || benefit.clientId !== this.clientId) {
        throw new PlanValidationError(`benefitIds: benefit ${benefitId} does not exist in this install`);
      }
    }
  }
}

function formatMoney(cents: number, currency: string): string {
  const dollars = (cents / 100).toFixed(2);
  const symbol = currency === "usd" ? "$" : currency === "gbp" ? "£" : currency === "eur" ? "€" : "";
  return `${symbol}${dollars}`;
}
