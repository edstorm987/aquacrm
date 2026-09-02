import type { PhaseTransitionApiResult } from "./transitionFeedback";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function nonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export interface ExpectedPhaseMutation {
  id?: string;
  stage: string;
  label: string;
}

/** Phase saves may only refresh after the returned row matches the submitted identity. */
export function isFulfillmentPhaseMutation(
  value: unknown,
  expected: ExpectedPhaseMutation,
): boolean {
  const payload = record(value);
  const phase = payload ? record(payload.phase) : null;
  return payload?.ok === true
    && nonBlankString(phase?.id)
    && nonBlankString(phase?.agencyId)
    && phase.stage === expected.stage
    && phase.label === expected.label
    && (!expected.id || phase.id === expected.id);
}

/** Delete responses carry the deleted phase id so a bare acknowledgement cannot refresh the page. */
export function isFulfillmentPhaseDelete(
  value: unknown,
  expectedPhaseId: string,
): boolean {
  const payload = record(value);
  return payload?.ok === true && payload.phaseId === expectedPhaseId;
}

export interface ExpectedClientCreation {
  operationId: string;
  name: string;
  stage: string;
}

export interface FulfillmentClientCreationPayload {
  ok: true;
  operationId: string;
  client: { id: string; name: string; slug: string };
  lifecycle: {
    phase: { id: string; agencyId: string; stage: string };
    checklist: { ok: true };
    complete: true;
    failures: [];
  };
  replayed: boolean;
}

/** Client creation continues only when the complete lifecycle and its exact stage are confirmed. */
export function isFulfillmentClientCreation(
  value: unknown,
  expected: ExpectedClientCreation,
): value is FulfillmentClientCreationPayload {
  const payload = record(value);
  const client = payload ? record(payload.client) : null;
  const lifecycle = payload ? record(payload.lifecycle) : null;
  const phase = lifecycle ? record(lifecycle.phase) : null;
  const checklist = lifecycle ? record(lifecycle.checklist) : null;
  return payload?.ok === true
    && payload.operationId === expected.operationId
    && nonBlankString(client?.id)
    && client.name === expected.name
    && nonBlankString(client.slug)
    && lifecycle?.complete === true
    && nonBlankString(phase?.id)
    && nonBlankString(phase.agencyId)
    && phase.stage === expected.stage
    && checklist?.ok === true
    && Array.isArray(lifecycle.failures)
    && lifecycle.failures.length === 0
    && typeof payload.replayed === "boolean";
}

export interface ExpectedChecklistTick {
  clientId: string;
  phaseId: string;
  itemId: string;
  done: boolean;
}

/** A tick is committed in the UI only when the exact progress cell is echoed back. */
export function isFulfillmentChecklistTick(
  value: unknown,
  expected: ExpectedChecklistTick,
): boolean {
  const payload = record(value);
  const progress = payload ? record(payload.progress) : null;
  const items = progress ? record(progress.items) : null;
  const item = items ? record(items[expected.itemId]) : null;
  return payload?.ok === true
    && progress?.clientId === expected.clientId
    && progress.phaseId === expected.phaseId
    && typeof progress.updatedAt === "number"
    && Number.isFinite(progress.updatedAt)
    && item?.done === expected.done;
}

export interface ExpectedPhaseTransition {
  operationId: string;
  clientId: string;
  stage: string;
}

/** Reload only for a completed transition receipt owned by this exact operation and client. */
export function isFulfillmentPhaseTransition(
  value: unknown,
  expected: ExpectedPhaseTransition,
): boolean {
  const payload = record(value);
  const client = payload ? record(payload.client) : null;
  return payload?.ok === true
    && payload.status === "complete"
    && payload.requestOperationId === expected.operationId
    && nonBlankString(payload.operationId)
    && payload.retryable === false
    && typeof payload.replayed === "boolean"
    && client?.id === expected.clientId
    && client.stage === expected.stage;
}

export function isFulfillmentPhaseTransitionFailure(
  value: unknown,
): value is PhaseTransitionApiResult {
  const payload = record(value);
  return payload?.ok === false
    && (payload.status === "incomplete" || payload.status === "rejected")
    && typeof payload.error === "string";
}

export interface ExpectedPluginMutation {
  clientId: string;
  pluginId: string;
  enabled: boolean;
}

/** Install/enable receipts must identify the exact client plugin and its requested state. */
export function isFulfillmentPluginMutation(
  value: unknown,
  expected: ExpectedPluginMutation,
): boolean {
  const payload = record(value);
  const install = payload ? record(payload.install) : null;
  return payload?.ok === true
    && nonBlankString(install?.id)
    && install.clientId === expected.clientId
    && install.pluginId === expected.pluginId
    && install.enabled === expected.enabled;
}

/** Uninstall has no remaining entity, so the API returns both removed scope identities. */
export function isFulfillmentPluginUninstall(
  value: unknown,
  expected: Omit<ExpectedPluginMutation, "enabled">,
): boolean {
  const payload = record(value);
  return payload?.ok === true
    && payload.clientId === expected.clientId
    && payload.pluginId === expected.pluginId;
}
