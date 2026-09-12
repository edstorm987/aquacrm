import "server-only";

import crypto from "node:crypto";

import { resolveSigningSecret } from "@/lib/server/auth/sessionToken";
import { getState, mutate } from "./storage";
import type {
  PublicAuthLinkDeliveryOperation,
  PublicAuthLinkKind,
} from "./types";
import { withPortalStateTransaction } from "./productWorkspaceCoordinator";

const MAGIC_LINK_TTL_SECONDS = 15 * 60;
const PASSWORD_RESET_TTL_SECONDS = 24 * 60 * 60;

export interface PublicAuthLinkSubject {
  kind: PublicAuthLinkKind;
  userId: string;
  email: string;
  agencyId: string;
  clientId: string | null;
  sessionRev: number;
  presentation: string;
}

export interface PublicAuthLinkDeliveryReceipt {
  delivered: boolean;
  externalMessageId?: string;
  outcomeUnknown?: boolean;
  unavailable?: boolean;
}

function canonicalEmail(value: string): string {
  return value.trim().toLowerCase();
}

function digest(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("\0")).digest("hex");
}

export function publicAuthLinkOperationId(input: Pick<
  PublicAuthLinkSubject,
  "kind" | "email" | "agencyId" | "clientId"
>): string {
  return `public_auth_link_${digest(
    input.kind,
    input.agencyId.trim(),
    input.clientId?.trim() || "-",
    canonicalEmail(input.email),
  ).slice(0, 32)}`;
}

function exactSubject(
  operation: PublicAuthLinkDeliveryOperation,
  subject: PublicAuthLinkSubject,
): boolean {
  return operation.kind === subject.kind
    && operation.userId === subject.userId
    && operation.email === canonicalEmail(subject.email)
    && operation.agencyId === subject.agencyId.trim()
    && operation.clientId === (subject.clientId?.trim() || null);
}

function ttlSeconds(kind: PublicAuthLinkKind): number {
  return kind === "magic-link" ? MAGIC_LINK_TTL_SECONDS : PASSWORD_RESET_TTL_SECONDS;
}

function generationNonce(
  operationId: string,
  generation: number,
  createdAt: number,
): string {
  // Deterministic from server authority plus a durable timestamp. The bearer
  // itself is still an independently signed token and is never stored.
  return crypto.createHmac("sha256", resolveSigningSecret())
    .update("public-auth-link-generation-v1")
    .update("\0")
    .update(operationId)
    .update("\0")
    .update(String(generation))
    .update("\0")
    .update(String(createdAt))
    .digest("base64url")
    .slice(0, 32);
}

function writeOperation(operation: PublicAuthLinkDeliveryOperation): void {
  mutate(state => {
    state.publicAuthLinkDeliveryOperations[operation.id] = operation;
  });
}

/**
 * Commit or resume the only live delivery generation for one exact subject.
 * A changed presentation cannot rotate a still-live bearer; the first accepted
 * request owns the safe return path/brand until that generation is consumed or
 * expires.
 */
export async function preparePublicAuthLinkDelivery(
  input: PublicAuthLinkSubject & { now?: number },
): Promise<PublicAuthLinkDeliveryOperation> {
  const subject: PublicAuthLinkSubject = {
    ...input,
    userId: input.userId.trim(),
    email: canonicalEmail(input.email),
    agencyId: input.agencyId.trim(),
    clientId: input.clientId?.trim() || null,
    presentation: input.presentation.slice(0, 1_000),
  };
  if (
    !subject.userId
    || !subject.email
    || !subject.agencyId
    || !Number.isSafeInteger(subject.sessionRev)
    || subject.sessionRev < 0
  ) throw new Error("public_auth_link_subject_invalid");

  const id = publicAuthLinkOperationId(subject);
  const now = input.now ?? Date.now();
  return withPortalStateTransaction(`public-auth-link:${id}`, () => {
    const existing = getState().publicAuthLinkDeliveryOperations[id];
    if (existing && !exactSubject(existing, subject)) {
      throw new Error("public_auth_link_subject_changed");
    }
    const reusable = existing
      && existing.deliveryStatus !== "consumed"
      && existing.tokenExpiresAt > Math.floor(now / 1_000)
      && existing.expectedSessionRev === subject.sessionRev
      ? existing
      : null;
    const generation = reusable?.generation ?? (existing?.generation ?? 0) + 1;
    const createdAt = reusable?.createdAt ?? now;
    const tokenNonce = reusable?.tokenNonce ?? generationNonce(id, generation, createdAt);
    const operation: PublicAuthLinkDeliveryOperation = {
      id,
      kind: subject.kind,
      userId: subject.userId,
      email: subject.email,
      agencyId: subject.agencyId,
      clientId: subject.clientId,
      expectedSessionRev: subject.sessionRev,
      presentation: reusable?.presentation ?? subject.presentation,
      generation,
      tokenNonce,
      tokenExpiresAt: reusable?.tokenExpiresAt
        ?? Math.floor(now / 1_000) + ttlSeconds(subject.kind),
      providerOperationRef: reusable?.providerOperationRef
        ?? `public-auth:${subject.kind}:${id}:${generation}`,
      deliveryStatus: reusable?.deliveryStatus === "delivered" ? "delivered" : "pending",
      deliveryAttempts: (reusable?.deliveryAttempts ?? 0) + 1,
      deliveryLastAttemptAt: now,
      deliveryExternalMessageId: reusable?.deliveryExternalMessageId,
      deliveryLastError: undefined,
      deliveryOutcomeUnknown: undefined,
      deliveredAt: reusable?.deliveredAt,
      consumedAt: undefined,
      createdAt,
      updatedAt: now,
    };
    writeOperation(operation);
    return operation;
  });
}

/** Reconcile a possibly late provider receipt. Generation fencing prevents an
 * old task from overwriting a post-consumption resend. Success always wins over
 * a later failure for the same idempotent provider operation. */
export async function recordPublicAuthLinkDelivery(
  operationId: string,
  generation: number,
  result: PublicAuthLinkDeliveryReceipt,
  now = Date.now(),
): Promise<void> {
  const externalMessageId = result.externalMessageId?.trim().slice(0, 300);
  await withPortalStateTransaction(`public-auth-link:${operationId}`, () => {
    const operation = getState().publicAuthLinkDeliveryOperations[operationId];
    if (!operation || operation.generation !== generation || operation.deliveryStatus === "consumed") return;
    if (operation.deliveryStatus === "delivered" && !result.delivered) return;
    writeOperation({
      ...operation,
      deliveryStatus: result.delivered ? "delivered" : "failed",
      deliveryExternalMessageId: result.delivered
        ? externalMessageId || operation.deliveryExternalMessageId
        : operation.deliveryExternalMessageId,
      deliveryLastError: result.delivered
        ? undefined
        : result.unavailable ? "delivery_unavailable" : "provider_failed",
      deliveryOutcomeUnknown: result.delivered ? undefined : result.outcomeUnknown === true,
      deliveredAt: result.delivered ? operation.deliveredAt ?? now : operation.deliveredAt,
      updatedAt: now,
    });
  });
}

/** Mark the exact generation spent so the next challenged request can safely
 * mint one replacement. This never accepts an operation id from a browser. */
export async function markPublicAuthLinkConsumed(input: {
  kind: PublicAuthLinkKind;
  email: string;
  agencyId: string;
  clientId: string | null;
  nonce: string;
  now?: number;
}): Promise<void> {
  const id = publicAuthLinkOperationId(input);
  const now = input.now ?? Date.now();
  await withPortalStateTransaction(`public-auth-link:${id}`, () => {
    const operation = getState().publicAuthLinkDeliveryOperations[id];
    if (
      !operation
      || operation.kind !== input.kind
      || operation.tokenNonce !== input.nonce
      || operation.deliveryStatus === "consumed"
    ) return;
    writeOperation({
      ...operation,
      deliveryStatus: "consumed",
      consumedAt: now,
      updatedAt: now,
    });
  });
}
