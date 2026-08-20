import "server-only";

import crypto from "crypto";

import { logActivity } from "@/server/activity";
import { getState, mutate } from "@/server/storage";
import type {
  ExternalAssistantApiKey,
  ExternalAssistantApiPermission,
} from "@/server/types";

export const EXTERNAL_ASSISTANT_PERMISSIONS = [
  "advisor:read",
  "actions:propose",
  "context:read",
  "records:read",
  "search:read",
  "export:read",
] as const satisfies readonly ExternalAssistantApiPermission[];

export interface ExternalAssistantApiKeySummary {
  id: string;
  name: string;
  tokenPrefix: string;
  fingerprint: string;
  modules: string[];
  permissions: ExternalAssistantApiPermission[];
  createdAt: number;
  createdBy: string;
  expiresAt?: number;
  lastUsedAt?: number;
  revokedAt?: number;
  revokedBy?: string;
  status: "active" | "expired" | "revoked";
}

interface ApiKeyInput {
  agencyId: string;
  name: string;
  modules: string[];
  permissions: ExternalAssistantApiPermission[];
  createdBy: string;
  expiresAt?: number;
}

const MAX_ACTIVE_KEYS = 20;

export function listExternalAssistantApiKeys(agencyId: string): ExternalAssistantApiKeySummary[] {
  return Object.values(getState().externalAssistantApiKeys)
    .filter(key => key.agencyId === agencyId)
    .sort((left, right) => right.createdAt - left.createdAt)
    .map(toSummary);
}

export function createExternalAssistantApiKey(input: ApiKeyInput): {
  key: ExternalAssistantApiKeySummary;
  token: string;
} {
  const activeCount = Object.values(getState().externalAssistantApiKeys)
    .filter(key => key.agencyId === input.agencyId && keyStatus(key) === "active")
    .length;
  if (activeCount >= MAX_ACTIVE_KEYS) throw new Error("active_key_limit_reached");

  const key = buildKey(input);
  mutate(state => {
    state.externalAssistantApiKeys[key.record.id] = key.record;
  });
  logActivity({
    agencyId: input.agencyId,
    actorEmail: input.createdBy,
    category: "integrations",
    action: "external_ai.key_created",
    message: `Created external AI key “${key.record.name}”.`,
    metadata: {
      keyId: key.record.id,
      fingerprint: key.record.fingerprint,
      modules: key.record.modules,
      permissions: key.record.permissions,
      expiresAt: key.record.expiresAt,
    },
  });
  return { key: toSummary(key.record), token: key.token };
}

export function revokeExternalAssistantApiKey(input: {
  agencyId: string;
  keyId: string;
  revokedBy: string;
}): ExternalAssistantApiKeySummary {
  const existing = getState().externalAssistantApiKeys[input.keyId];
  if (!existing || existing.agencyId !== input.agencyId) throw new Error("api_key_not_found");
  if (existing.revokedAt) return toSummary(existing);

  const revokedAt = Date.now();
  mutate(state => {
    const key = state.externalAssistantApiKeys[input.keyId];
    if (!key || key.agencyId !== input.agencyId) return;
    key.revokedAt = revokedAt;
    key.revokedBy = input.revokedBy;
  });
  logActivity({
    agencyId: input.agencyId,
    actorEmail: input.revokedBy,
    category: "integrations",
    action: "external_ai.key_revoked",
    message: `Revoked external AI key “${existing.name}”.`,
    metadata: { keyId: existing.id, fingerprint: existing.fingerprint },
  });
  return toSummary({ ...existing, revokedAt, revokedBy: input.revokedBy });
}

export function rotateExternalAssistantApiKey(input: {
  agencyId: string;
  keyId: string;
  createdBy: string;
}): { key: ExternalAssistantApiKeySummary; token: string } {
  const existing = getState().externalAssistantApiKeys[input.keyId];
  if (!existing || existing.agencyId !== input.agencyId) throw new Error("api_key_not_found");
  if (keyStatus(existing) !== "active") throw new Error("api_key_not_active");

  const replacement = buildKey({
    agencyId: existing.agencyId,
    name: `${existing.name} (rotated)`,
    modules: existing.modules,
    permissions: existing.permissions,
    createdBy: input.createdBy,
    expiresAt: existing.expiresAt,
  });
  const revokedAt = Date.now();
  mutate(state => {
    const current = state.externalAssistantApiKeys[input.keyId];
    if (!current || current.agencyId !== input.agencyId) return;
    current.revokedAt = revokedAt;
    current.revokedBy = input.createdBy;
    state.externalAssistantApiKeys[replacement.record.id] = replacement.record;
  });
  logActivity({
    agencyId: input.agencyId,
    actorEmail: input.createdBy,
    category: "integrations",
    action: "external_ai.key_rotated",
    message: `Rotated external AI key “${existing.name}”.`,
    metadata: {
      previousKeyId: existing.id,
      replacementKeyId: replacement.record.id,
      replacementFingerprint: replacement.record.fingerprint,
    },
  });
  return { key: toSummary(replacement.record), token: replacement.token };
}

export function findExternalAssistantApiKey(token: string): ExternalAssistantApiKey | null {
  const suppliedHash = hashToken(token);
  return Object.values(getState().externalAssistantApiKeys).find(key => (
    keyStatus(key) === "active" && constantTimeHashEqual(suppliedHash, key.tokenHash)
  )) ?? null;
}

export function touchExternalAssistantApiKey(keyId: string): void {
  const existing = getState().externalAssistantApiKeys[keyId];
  if (!existing || (existing.lastUsedAt && Date.now() - existing.lastUsedAt < 60_000)) return;
  mutate(state => {
    const key = state.externalAssistantApiKeys[keyId];
    if (key) key.lastUsedAt = Date.now();
  });
}

function buildKey(input: ApiKeyInput): { record: ExternalAssistantApiKey; token: string } {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.length < 2) throw new Error("invalid_key_name");
  if (!input.modules.length) throw new Error("modules_required");
  if (!input.permissions.length) throw new Error("permissions_required");
  if (input.expiresAt && input.expiresAt <= Date.now()) throw new Error("invalid_expiry");

  const token = `aqa_${crypto.randomBytes(32).toString("base64url")}`;
  const tokenHash = hashToken(token);
  const now = Date.now();
  return {
    token,
    record: {
      id: `aik_${crypto.randomBytes(8).toString("hex")}`,
      agencyId: input.agencyId,
      name,
      tokenHash,
      tokenPrefix: `${token.slice(0, 12)}…`,
      fingerprint: tokenHash.slice(0, 12),
      modules: [...new Set(input.modules)],
      permissions: [...new Set(input.permissions)],
      createdAt: now,
      createdBy: input.createdBy,
      expiresAt: input.expiresAt,
    },
  };
}

function toSummary(key: ExternalAssistantApiKey): ExternalAssistantApiKeySummary {
  return {
    id: key.id,
    name: key.name,
    tokenPrefix: key.tokenPrefix,
    fingerprint: key.fingerprint,
    modules: key.modules,
    permissions: key.permissions,
    createdAt: key.createdAt,
    createdBy: key.createdBy,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    revokedBy: key.revokedBy,
    status: keyStatus(key),
  };
}

function keyStatus(key: ExternalAssistantApiKey): ExternalAssistantApiKeySummary["status"] {
  if (key.revokedAt) return "revoked";
  if (key.expiresAt && key.expiresAt <= Date.now()) return "expired";
  return "active";
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function constantTimeHashEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
