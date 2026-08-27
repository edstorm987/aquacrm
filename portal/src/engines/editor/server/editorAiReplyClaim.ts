import "server-only";

import crypto from "node:crypto";

import { getActiveDataRealmId, getBackendInfo } from "@/server/storage";

export type EditorAiReplyClaimState =
  | { state: "claimed"; leaseExpiresAt: number }
  | { state: "held"; leaseExpiresAt: number }
  | { state: "complete"; leaseExpiresAt: number };

export interface EditorAiReplyClaimScope {
  agencyId: string;
  projectId: string;
  threadId: string;
  messageId: string;
}

export interface EditorAiReplyClaimCoordinator {
  claim(claimKey: string, holderId: string, leaseMs: number): Promise<EditorAiReplyClaimState>;
  complete(claimKey: string, holderId: string): Promise<void>;
  release(claimKey: string, holderId: string): Promise<void>;
}

type MemoryClaim = {
  holderId: string;
  state: "claimed" | "complete";
  leaseExpiresAt: number;
};

export function editorAiReplyClaimKey(scope: EditorAiReplyClaimScope): string {
  return crypto
    .createHash("sha256")
    .update([scope.agencyId, scope.projectId, scope.threadId, scope.messageId].join("\u0000"))
    .digest("hex");
}

export function editorAiReplyClaimHolder(): string {
  return crypto.randomUUID();
}

/**
 * Local/test fallback. One process already shares the reply promise; this
 * coordinator gives the same state machine a deterministic unit-test seam.
 * Production serverless deployments use the database coordinator below.
 */
export function createMemoryEditorAiReplyClaimCoordinator(
  now: () => number = Date.now,
): EditorAiReplyClaimCoordinator {
  const claims = new Map<string, MemoryClaim>();
  return {
    async claim(claimKey, holderId, leaseMs) {
      const at = now();
      const existing = claims.get(claimKey);
      if (existing?.state === "complete") {
        return { state: "complete", leaseExpiresAt: existing.leaseExpiresAt };
      }
      if (existing && existing.holderId !== holderId && existing.leaseExpiresAt > at) {
        return { state: "held", leaseExpiresAt: existing.leaseExpiresAt };
      }
      const leaseExpiresAt = at + Math.max(1_000, leaseMs);
      claims.set(claimKey, { holderId, state: "claimed", leaseExpiresAt });
      return { state: "claimed", leaseExpiresAt };
    },
    async complete(claimKey, holderId) {
      const existing = claims.get(claimKey);
      if (!existing || existing.holderId !== holderId || existing.state !== "claimed") {
        throw new Error("editor_ai_reply_claim_not_held");
      }
      claims.set(claimKey, { ...existing, state: "complete" });
    },
    async release(claimKey, holderId) {
      const existing = claims.get(claimKey);
      if (existing?.holderId === holderId && existing.state === "claimed") claims.delete(claimKey);
    },
  };
}

const localCoordinator = createMemoryEditorAiReplyClaimCoordinator();

/**
 * Remote claims already use a realm-specific database app key. The in-memory
 * fallback has no app-key column, so carry the active realm in its key instead
 * or identical fixture ids in live and Sandbox would contend with each other.
 */
function localClaimKey(claimKey: string): string {
  return `${getActiveDataRealmId()}\u0000${claimKey}`;
}

function normaliseClaim(value: unknown): EditorAiReplyClaimState {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const state = row.state;
  const leaseExpiresAt = Number(row.leaseExpiresAt);
  if ((state === "claimed" || state === "held" || state === "complete") && Number.isFinite(leaseExpiresAt)) {
    return { state, leaseExpiresAt };
  }
  throw new Error("editor_ai_reply_claim_invalid");
}

const remoteCoordinator: EditorAiReplyClaimCoordinator = {
  async claim(claimKey, holderId, leaseMs) {
    const backend = getBackendInfo().kind;
    const realmId = getActiveDataRealmId();
    if (backend === "supabase") {
      const { claimEditorAiReply } = await import("@/server/storageSupabase");
      return normaliseClaim(await claimEditorAiReply(claimKey, holderId, leaseMs, {}, realmId));
    }
    if (backend === "postgres") {
      const { claimEditorAiReply } = await import("@/server/storagePostgres");
      return normaliseClaim(await claimEditorAiReply(claimKey, holderId, leaseMs, realmId));
    }
    return localCoordinator.claim(localClaimKey(claimKey), holderId, leaseMs);
  },
  async complete(claimKey, holderId) {
    const backend = getBackendInfo().kind;
    const realmId = getActiveDataRealmId();
    if (backend === "supabase") {
      const { completeEditorAiReply } = await import("@/server/storageSupabase");
      await completeEditorAiReply(claimKey, holderId, {}, realmId);
      return;
    }
    if (backend === "postgres") {
      const { completeEditorAiReply } = await import("@/server/storagePostgres");
      await completeEditorAiReply(claimKey, holderId, realmId);
      return;
    }
    await localCoordinator.complete(localClaimKey(claimKey), holderId);
  },
  async release(claimKey, holderId) {
    const backend = getBackendInfo().kind;
    const realmId = getActiveDataRealmId();
    if (backend === "supabase") {
      const { releaseEditorAiReply } = await import("@/server/storageSupabase");
      await releaseEditorAiReply(claimKey, holderId, {}, realmId);
      return;
    }
    if (backend === "postgres") {
      const { releaseEditorAiReply } = await import("@/server/storagePostgres");
      await releaseEditorAiReply(claimKey, holderId, realmId);
      return;
    }
    await localCoordinator.release(localClaimKey(claimKey), holderId);
  },
};

export function editorAiReplyClaimCoordinator(): EditorAiReplyClaimCoordinator {
  return remoteCoordinator;
}
