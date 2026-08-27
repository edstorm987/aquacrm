import "server-only";

import crypto from "node:crypto";

import {
  buildFulfillmentContainer,
  type CreateClientWithPhaseResult,
} from "@/built-ins/modules/fulfillment/src/server";
import { FOUNDATION_SERVICES } from "@/built-ins/runtime/foundation-adapters";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { makeInstallId } from "@/server/pluginInstalls";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { flushPendingWrites } from "@/server/storage";
import {
  createClient,
  getClientForAgency,
  type CreateClientInput,
} from "@/server/tenants";
import type { Client, ClientStage, PhaseDefinition } from "@/server/types";

const FULFILLMENT_PLUGIN_ID = "fulfillment";
const OPERATIONS_KEY = "client-lifecycle-operations:v1";

type StoredLifecycle = Omit<CreateClientWithPhaseResult, "client">;

interface ClientLifecycleOperationRecord {
  requestHash: string;
  status: "pending" | "incomplete" | "complete";
  clientId?: string;
  stage: ClientStage;
  attempts: number;
  lifecycle?: StoredLifecycle;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface ClientLifecycleOperationResult {
  ok: boolean;
  status: "incomplete" | "complete";
  client: Client;
  lifecycle?: StoredLifecycle;
  error?: string;
  retryable: boolean;
  replayed: boolean;
}

export class ClientLifecycleOperationConflictError extends Error {
  constructor() {
    super("This creation operation was already used with different details. Start a new creation attempt.");
    this.name = "ClientLifecycleOperationConflictError";
  }
}

export class ClientLifecyclePhaseNotFoundError extends Error {
  constructor(stage: string) {
    super(`The selected lifecycle phase (${stage}) no longer exists. Refresh and choose an available phase.`);
    this.name = "ClientLifecyclePhaseNotFoundError";
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter(key => object[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function requestHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function cleanOperationId(value: string): string {
  const operationId = value.trim();
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(operationId)) {
    throw new Error("A valid lifecycle operation id is required.");
  }
  return operationId;
}

function fulfillmentStorage(agencyId: string) {
  return makePluginStorage(makeInstallId({ agencyId }, FULFILLMENT_PLUGIN_ID));
}

function fulfillmentContainer(agencyId: string) {
  return buildFulfillmentContainer({
    clients: FOUNDATION_SERVICES.clients,
    pluginInstalls: FOUNDATION_SERVICES.pluginInstalls,
    pluginRuntime: FOUNDATION_SERVICES.pluginRuntime,
    registry: FOUNDATION_SERVICES.registry as never,
    phases: FOUNDATION_SERVICES.phases,
    activity: FOUNDATION_SERVICES.activity as never,
    events: FOUNDATION_SERVICES.events,
    variants: FOUNDATION_SERVICES.variants,
    storage: fulfillmentStorage(agencyId),
  });
}

export async function listAgencyLifecyclePhases(agencyId: string): Promise<PhaseDefinition[]> {
  const container = fulfillmentContainer(agencyId);
  const existing = await container.phaseService.listForAgency(agencyId);
  if (existing.length > 0) {
    const phases = existing as PhaseDefinition[];
    // Repair only the exact retired default signature. Agency-customised rows
    // remain untouched, including deliberate no-variant/no-plugin phases.
    const retiredEpicIntro = phases.find(phase =>
      phase.stage === "aqua-epic-intro"
      && phase.portalVariantId === "starter-epic-intro"
      && phase.pluginPreset.length === 0);
    if (retiredEpicIntro) {
      const repaired = await container.phaseService.upsert({
        ...retiredEpicIntro,
        pluginPreset: ["website-editor"],
        portalVariantId: "aqua-incubator",
      });
      return phases.map(phase => phase.id === repaired.id ? repaired as PhaseDefinition : phase);
    }
    return phases;
  }
  const seeded = await container.phaseService.seedDefaultPhases(agencyId);
  return seeded.phases as PhaseDefinition[];
}

async function materialise(
  agencyId: string,
  actor: string,
  client: Client,
  stage: ClientStage,
  metadata?: Record<string, unknown>,
  resume?: StoredLifecycle,
): Promise<StoredLifecycle> {
  const phases = await listAgencyLifecyclePhases(agencyId);
  if (!phases.some(phase => phase.stage === stage)) {
    throw new ClientLifecyclePhaseNotFoundError(stage);
  }
  const result = await fulfillmentContainer(agencyId).clientLifecycleService.materialiseExistingWithPhase({
    agencyId,
    actor,
    client: client as never,
    stage: stage as never,
    metadata,
    resume,
  });
  const { client: _client, ...lifecycle } = result;
  return lifecycle;
}

async function runOperation(input: {
  agencyId: string;
  actor: string;
  operationId: string;
  stage: ClientStage;
  metadata?: Record<string, unknown>;
  requestFingerprint: unknown;
  createInput?: CreateClientInput & { stage: ClientStage };
  existingClientId?: string;
}): Promise<ClientLifecycleOperationResult> {
  const operationId = cleanOperationId(input.operationId);
  const hash = requestHash(input.requestFingerprint);
  const storage = fulfillmentStorage(input.agencyId);
  // Operations share one agency record map, so they also share one durable
  // agency lock. This prevents two different creations from overwriting each
  // other's checkpoints on patch-based storage.
  const transactionKey = `client-lifecycle:${input.agencyId}`;

  return withPortalStateTransaction(transactionKey, async () => {
    const phases = await listAgencyLifecyclePhases(input.agencyId);
    if (!phases.some(phase => phase.stage === input.stage)) {
      throw new ClientLifecyclePhaseNotFoundError(input.stage);
    }
    const records = (await storage.get<Record<string, ClientLifecycleOperationRecord>>(OPERATIONS_KEY)) ?? {};
    const current = records[operationId];
    if (current && current.requestHash !== hash) throw new ClientLifecycleOperationConflictError();

    if (current?.status === "complete" && current.clientId) {
      const client = getClientForAgency(input.agencyId, current.clientId);
      if (!client) throw new Error("The completed lifecycle operation points to a missing client.");
      return {
        ok: true,
        status: "complete",
        client,
        lifecycle: current.lifecycle,
        retryable: false,
        replayed: true,
      };
    }

    const now = Date.now();
    let record: ClientLifecycleOperationRecord = current ?? {
      requestHash: hash,
      status: "pending",
      clientId: input.existingClientId,
      stage: input.stage,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    record = {
      ...record,
      status: "pending",
      attempts: record.attempts + 1,
      lastError: undefined,
      updatedAt: now,
    };
    await storage.set(OPERATIONS_KEY, { ...records, [operationId]: record });
    // The operation row must be durable before client/plugin/variant effects.
    await flushPendingWrites();

    let client = record.clientId
      ? getClientForAgency(input.agencyId, record.clientId)
      : null;
    if (!client) {
      if (!input.createInput) {
        throw new Error("The client for this lifecycle operation no longer exists.");
      }
      client = createClient(input.agencyId, input.createInput);
      record = { ...record, clientId: client.id, updatedAt: Date.now() };
      await storage.set(OPERATIONS_KEY, { ...records, [operationId]: record });
      // Persist the client checkpoint before any plugin or starter side effect.
      await flushPendingWrites();
    }

    try {
      const lifecycle = await materialise(
        input.agencyId,
        input.actor,
        client,
        input.stage,
        input.metadata,
        record.lifecycle,
      );
      const complete = lifecycle.complete;
      const error = complete ? undefined : lifecycle.failures.join("; ") || "Lifecycle setup is incomplete.";
      const finishedAt = Date.now();
      record = {
        ...record,
        status: complete ? "complete" : "incomplete",
        lifecycle,
        lastError: error,
        updatedAt: finishedAt,
        completedAt: complete ? finishedAt : undefined,
      };
      await storage.set(OPERATIONS_KEY, { ...records, [operationId]: record });
      await flushPendingWrites();
      return {
        ok: complete,
        status: complete ? "complete" : "incomplete",
        client,
        lifecycle,
        error,
        retryable: !complete,
        replayed: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record = {
        ...record,
        status: "incomplete",
        lastError: message.slice(0, 1_000),
        updatedAt: Date.now(),
      };
      await storage.set(OPERATIONS_KEY, { ...records, [operationId]: record });
      await flushPendingWrites();
      return {
        ok: false,
        status: "incomplete",
        client,
        error: message,
        retryable: true,
        replayed: false,
      };
    }
  });
}

export function createClientWithLifecycleOperation(input: {
  agencyId: string;
  actor: string;
  operationId: string;
  createInput: CreateClientInput & { stage: ClientStage };
  requestFingerprint?: unknown;
}): Promise<ClientLifecycleOperationResult> {
  return runOperation({
    agencyId: input.agencyId,
    actor: input.actor,
    operationId: input.operationId,
    stage: input.createInput.stage,
    metadata: input.createInput.metadata,
    createInput: input.createInput,
    requestFingerprint: input.requestFingerprint ?? input.createInput,
  });
}

export function ensureClientLifecycleOperation(input: {
  agencyId: string;
  actor: string;
  operationId: string;
  clientId: string;
  stage: ClientStage;
  metadata?: Record<string, unknown>;
  requestFingerprint?: unknown;
}): Promise<ClientLifecycleOperationResult> {
  return runOperation({
    agencyId: input.agencyId,
    actor: input.actor,
    operationId: input.operationId,
    stage: input.stage,
    metadata: input.metadata,
    existingClientId: input.clientId,
    requestFingerprint: input.requestFingerprint ?? {
      clientId: input.clientId,
      stage: input.stage,
      metadata: input.metadata,
    },
  });
}
