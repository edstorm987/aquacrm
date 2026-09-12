import "server-only";

import crypto from "node:crypto";

import {
  withPortalProviderLease,
  withPortalStateTransaction,
} from "@/server/productWorkspaceCoordinator";
import { getState, mutate } from "@/server/storage";
import type {
  OutboundCommunicationOperation,
  OutboundCommunicationOperationResult,
  OutboundCommunicationSubjectReferences,
} from "@/server/types";

export const OUTBOUND_COMMUNICATION_REPLAY_RETENTION_DAYS = 30;
export const OUTBOUND_COMMUNICATION_REPLAY_RETENTION_MS =
  OUTBOUND_COMMUNICATION_REPLAY_RETENTION_DAYS * 24 * 60 * 60 * 1_000;

export interface OutboundCommunicationFingerprintInput {
  agencyId: string;
  clientId?: string;
  channel: "email" | "call";
  recipient: string;
  senderId: string;
  payload: Record<string, unknown>;
}

export interface ReplayProtectedOutboundInput {
  agencyId: string;
  clientId?: string;
  channel: OutboundCommunicationOperation["channel"];
  operationId: string;
  requestFingerprint: string;
  senderId: string;
  subjectReferences?: OutboundCommunicationSubjectReferences;
}

export interface ReplayProtectedOutboundResult {
  result: OutboundCommunicationOperationResult;
  replayed: boolean;
}

export class OutboundCommunicationReplayConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("That operation id was already used for different outreach. Reopen the action and try again.");
    this.name = "OutboundCommunicationReplayConflictError";
  }
}

/**
 * One canonical digest covering tenant, exact provider recipient, sender and
 * payload. The durable record stores only this digest, never message content or
 * recipient PII.
 */
export function buildOutboundCommunicationFingerprint(
  input: OutboundCommunicationFingerprintInput,
): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    agencyId: input.agencyId,
    clientId: input.clientId ?? "",
    channel: input.channel,
    recipient: input.recipient,
    senderId: input.senderId,
    payload: input.payload,
  })).digest("hex");
}

/**
 * Admit one non-idempotent provider operation durably before executing it.
 * A provider lease serialises two tabs/processes; the state record survives a
 * process loss. If an admitted operation has no durable result, replay refuses
 * to send again and reports an unknown outcome for provider reconciliation.
 */
export async function runReplayProtectedOutboundOperation(
  input: ReplayProtectedOutboundInput,
  execute: () => Promise<OutboundCommunicationOperationResult>,
): Promise<ReplayProtectedOutboundResult> {
  validateInput(input);
  const subjectReferences = normaliseSubjectReferences(input.subjectReferences);
  const recordId = outboundOperationRecordId(input.agencyId, input.channel, input.operationId);
  const lane = `outbound-communication:${recordId}`;

  return withPortalProviderLease(lane, async () => {
    const admission = await withPortalStateTransaction(lane, () => {
      const admissionTime = Date.now();
      mutate(state => {
        pruneExpiredOperationsInState(
          state.outboundCommunicationOperations,
          admissionTime,
          input.agencyId,
        );
      });
      const existing = getState().outboundCommunicationOperations[recordId];
      if (existing) {
        assertMatchingOperation(existing, input, subjectReferences);
        if (existing.result) return { kind: "replay" as const, result: existing.result };

        const result = unknownResult(
          input.channel,
          "A previous provider request was admitted but has no confirmed result. Check the provider before starting a new operation.",
        );
        const now = Date.now();
        mutate(state => {
          const current = state.outboundCommunicationOperations[recordId];
          if (current) state.outboundCommunicationOperations[recordId] = {
            ...current,
            status: "unknown",
            result,
            updatedAt: now,
            completedAt: now,
          };
        });
        return { kind: "replay" as const, result };
      }

      const now = admissionTime;
      const operation: OutboundCommunicationOperation = {
        id: recordId,
        agencyId: input.agencyId,
        ...(input.clientId ? { clientId: input.clientId } : {}),
        channel: input.channel,
        operationId: input.operationId,
        requestFingerprint: input.requestFingerprint,
        senderId: input.senderId,
        ...(subjectReferences ? { subjectReferences } : {}),
        status: "admitted",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + OUTBOUND_COMMUNICATION_REPLAY_RETENTION_MS,
      };
      mutate(state => { state.outboundCommunicationOperations[recordId] = operation; });
      return { kind: "execute" as const };
    });

    if (admission.kind === "replay") {
      return { result: admission.result, replayed: true };
    }

    let result: OutboundCommunicationOperationResult;
    try {
      result = normaliseResult(input.channel, await execute());
    } catch (error) {
      result = unknownResult(
        input.channel,
        `The provider request ended without a confirmed result. ${safeError(error)}`,
      );
    }

    try {
      const persisted = await withPortalStateTransaction(lane, () => {
        const existing = getState().outboundCommunicationOperations[recordId];
        if (!existing) throw new Error("outbound_communication_admission_missing");
        assertMatchingOperation(existing, input, subjectReferences);
        if (existing.result) return existing.result;
        const now = Date.now();
        mutate(state => {
          const current = state.outboundCommunicationOperations[recordId];
          if (current) state.outboundCommunicationOperations[recordId] = {
            ...current,
            status: result.outcomeUnknown
              ? "unknown"
              : result.successful
                ? "succeeded"
                : "failed",
            result,
            updatedAt: now,
            completedAt: now,
          };
        });
        return result;
      });
      return { result: persisted, replayed: false };
    } catch (error) {
      if (error instanceof OutboundCommunicationReplayConflictError) throw error;
      return {
        result: unknownResult(
          input.channel,
          "The provider may have completed the request, but Aqua could not save its result. Check the provider before starting a new operation.",
        ),
        replayed: false,
      };
    }
  });
}

/**
 * Remove replay admissions once their bounded duplicate-suppression window has
 * elapsed. Provider routes also prune their own agency before every admission;
 * the scheduled maintenance path calls this without an agency filter so idle
 * tenants do not retain the ledger indefinitely.
 */
export async function pruneExpiredOutboundCommunicationOperations(
  options: { agencyId?: string; now?: number } = {},
): Promise<number> {
  const agencyId = clean(options.agencyId, 160) || undefined;
  if (options.agencyId !== undefined && !agencyId) {
    throw new TypeError("invalid_outbound_communication_retention_agency");
  }
  const now = options.now ?? Date.now();
  if (!Number.isFinite(now) || now < 0) {
    throw new TypeError("invalid_outbound_communication_retention_time");
  }
  return withPortalStateTransaction(
    `outbound-communication-retention:${agencyId ?? "all"}`,
    () => {
      let removed = 0;
      mutate(state => {
        removed = pruneExpiredOperationsInState(
          state.outboundCommunicationOperations,
          now,
          agencyId,
        );
      });
      return removed;
    },
  );
}

export function outboundOperationRecordId(
  agencyId: string,
  channel: OutboundCommunicationOperation["channel"],
  operationId: string,
): string {
  return `outbound_${crypto.createHash("sha256")
    .update(`${agencyId}\u0000${channel}\u0000${operationId}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function validateInput(input: ReplayProtectedOutboundInput): void {
  if (!input.agencyId || !input.senderId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(input.operationId)) {
    throw new TypeError("invalid_outbound_communication_operation");
  }
  if (!/^[a-f0-9]{64}$/.test(input.requestFingerprint)) {
    throw new TypeError("invalid_outbound_communication_fingerprint");
  }
  const subjectReferences = normaliseSubjectReferences(input.subjectReferences);
  // This ledger exists around a non-idempotent external write. A digest of a
  // raw recipient is not erasable lineage: once that person later converts,
  // there is no safe way to decide which shared inbox/switchboard operation to
  // remove. Provider routes must resolve one exact scoped entity first, and the
  // replay layer enforces that invariant for every present and future caller.
  if (!input.clientId && !subjectReferences) {
    throw new TypeError("outbound_communication_subject_required");
  }
}

function assertMatchingOperation(
  operation: OutboundCommunicationOperation,
  input: ReplayProtectedOutboundInput,
  subjectReferences: OutboundCommunicationSubjectReferences | undefined,
): void {
  if (operation.agencyId !== input.agencyId
    || operation.clientId !== input.clientId
    || operation.channel !== input.channel
    || operation.operationId !== input.operationId
    || operation.requestFingerprint !== input.requestFingerprint
    || operation.senderId !== input.senderId
    || !sameSubjectReferences(operation.subjectReferences, subjectReferences)) {
    throw new OutboundCommunicationReplayConflictError();
  }
}

function normaliseSubjectReferences(
  value: OutboundCommunicationSubjectReferences | undefined,
): OutboundCommunicationSubjectReferences | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("invalid_outbound_communication_subject_references");
  }
  const result: OutboundCommunicationSubjectReferences = {};
  for (const key of ["prospectId", "leadId", "contactId"] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string") {
      throw new TypeError("invalid_outbound_communication_subject_references");
    }
    const id = raw.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(id)) {
      throw new TypeError("invalid_outbound_communication_subject_references");
    }
    result[key] = id;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function sameSubjectReferences(
  left: OutboundCommunicationSubjectReferences | undefined,
  right: OutboundCommunicationSubjectReferences | undefined,
): boolean {
  return left?.prospectId === right?.prospectId
    && left?.leadId === right?.leadId
    && left?.contactId === right?.contactId;
}

function pruneExpiredOperationsInState(
  operations: Record<string, OutboundCommunicationOperation>,
  now: number,
  agencyId?: string,
): number {
  let removed = 0;
  for (const [id, operation] of Object.entries(operations)) {
    if (agencyId && operation.agencyId !== agencyId) continue;
    const expiresAt = Number.isFinite(operation.expiresAt)
      ? Number(operation.expiresAt)
      : Number.isFinite(operation.createdAt)
        ? operation.createdAt + OUTBOUND_COMMUNICATION_REPLAY_RETENTION_MS
        : 0;
    if (expiresAt > now) continue;
    delete operations[id];
    removed += 1;
  }
  return removed;
}

function normaliseResult(
  channel: OutboundCommunicationOperation["channel"],
  result: OutboundCommunicationOperationResult,
): OutboundCommunicationOperationResult {
  const expectedVia = channel === "smtp-email" ? new Set(["smtp", "unconfigured"]) : new Set(["twilio"]);
  if (!expectedVia.has(result.via)) throw new Error("outbound_communication_provider_mismatch");
  const outcomeUnknown = result.outcomeUnknown === true;
  const retry = outcomeUnknown
    ? "reconcile-first" as const
    : result.successful
      ? validRetry(result.retry) ? result.retry : undefined
      : validRetry(result.retry) ? result.retry : "safe" as const;
  return {
    successful: result.successful === true && !outcomeUnknown,
    via: result.via,
    ...(clean(result.externalProviderId, 300) ? { externalProviderId: clean(result.externalProviderId, 300) } : {}),
    ...(clean(result.reason, 1_000) ? { reason: clean(result.reason, 1_000) } : {}),
    ...(validCode(result.code) ? { code: result.code } : {}),
    ...(outcomeUnknown ? { outcomeUnknown: true } : {}),
    ...(retry ? { retry } : {}),
  };
}

function unknownResult(
  channel: OutboundCommunicationOperation["channel"],
  reason: string,
): OutboundCommunicationOperationResult {
  return {
    successful: false,
    via: channel === "smtp-email" ? "smtp" : "twilio",
    reason: clean(reason, 1_000),
    outcomeUnknown: true,
    retry: "reconcile-first",
  };
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validCode(value: unknown): value is NonNullable<OutboundCommunicationOperationResult["code"]> {
  return value === "REMOTE_OPERATION_TIMEOUT"
    || value === "REMOTE_OPERATION_ABORTED"
    || value === "REMOTE_OPERATION_FAILED";
}

function validRetry(value: unknown): value is NonNullable<OutboundCommunicationOperationResult["retry"]> {
  return value === "safe" || value === "same-operation-key" || value === "reconcile-first";
}

function safeError(error: unknown): string {
  return clean(error instanceof Error ? error.message : "Provider status is unknown.", 500)
    || "Provider status is unknown.";
}
