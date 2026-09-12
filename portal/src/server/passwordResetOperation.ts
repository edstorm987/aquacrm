import "server-only";

import crypto from "node:crypto";

import type { PasswordResetPayload } from "@/lib/server/auth/passwordReset";
import { consumeResetNonce } from "@/lib/server/auth/passwordReset";
import { resolveSigningSecret } from "@/lib/server/auth/sessionToken";
import {
  provisionBoundClientPortalIdentity,
  provisionOrAdoptSupabaseIdentity,
  updateBoundClientPortalPassword,
  updateSupabasePasswordById,
} from "@/lib/supabase/admin";
import { ensureHydrated, getState, mutate } from "./storage";
import type { PasswordResetOperation, ServerUser } from "./types";
import { bindSupabaseAuthIdentity, getUserById, setUserPasswordById } from "./users";
import { withPortalProviderLease, withPortalStateTransaction } from "./productWorkspaceCoordinator";

export interface PasswordResetProviderDependencies {
  apply(input: {
    operation: PasswordResetOperation;
    user: ServerUser;
    password: string;
  }): Promise<{ authUserId: string }>;
}

export type PasswordResetProviderStrategy =
  | "update-bound-client"
  | "provision-bound-client"
  | "update-bound-account"
  | "provision-operation-account";

export function passwordResetProviderStrategy(
  operation: PasswordResetOperation,
  user: ServerUser,
): PasswordResetProviderStrategy {
  if (user.clientId) {
    return operation.initialSupabaseAuthUserId ? "update-bound-client" : "provision-bound-client";
  }
  return operation.initialSupabaseAuthUserId ? "update-bound-account" : "provision-operation-account";
}

function operationId(payload: PasswordResetPayload): string {
  return `password_reset_${crypto.createHash("sha256")
    .update("password-reset")
    .update("\0")
    .update(payload.userId)
    .update("\0")
    .update(payload.nonce)
    .digest("hex")
    .slice(0, 32)}`;
}

function passwordFingerprint(id: string, password: string): string {
  return crypto.createHmac("sha256", resolveSigningSecret())
    .update("password-reset-input")
    .update("\0")
    .update(id)
    .update("\0")
    .update(password)
    .digest("hex");
}

function currentOperation(id: string): PasswordResetOperation | null {
  return getState().passwordResetOperations[id] ?? null;
}

function writeOperation(operation: PasswordResetOperation): void {
  mutate(state => {
    state.passwordResetOperations[operation.id] = operation;
  });
}

function exactSubject(user: ServerUser, operation: PasswordResetOperation): boolean {
  return user.id === operation.userId
    && user.email === operation.email
    && user.agencyId === operation.agencyId
    && user.role === operation.role
    && user.clientId === operation.clientId;
}

function exactOperation(
  operation: PasswordResetOperation,
  payload: PasswordResetPayload,
  fingerprint: string,
): boolean {
  return operation.userId === payload.userId
    && operation.email === payload.email
    && operation.tokenNonce === payload.nonce
    && operation.tokenExpiresAt === payload.exp
    && operation.expectedSessionRev === payload.sessionRev
    && operation.passwordFingerprint === fingerprint;
}

const defaultProviderDependencies: PasswordResetProviderDependencies = {
  async apply({ operation, user, password }) {
    const strategy = passwordResetProviderStrategy(operation, user);
    if (strategy === "update-bound-client" || strategy === "provision-bound-client") {
      const binding = {
        aquaUserId: user.id,
        agencyId: user.agencyId,
        clientId: user.clientId!,
      };
      if (strategy === "update-bound-client") {
        const remote = await updateBoundClientPortalPassword({
          authUserId: operation.initialSupabaseAuthUserId!,
          email: user.email,
          password,
          binding,
        });
        return { authUserId: remote.id };
      }
      const remote = await provisionBoundClientPortalIdentity({
        email: user.email,
        password,
        name: user.name,
        binding,
        operationId: operation.id,
      });
      return { authUserId: remote.id };
    }

    if (strategy === "update-bound-account") {
      const remote = await updateSupabasePasswordById({
        authUserId: operation.initialSupabaseAuthUserId!,
        email: user.email,
        password,
      });
      return { authUserId: remote.id };
    }
    const remote = await provisionOrAdoptSupabaseIdentity({
      operationId: operation.id,
      email: user.email,
      password,
      name: user.name,
      role: user.role === "agency-owner" ? "owner" : "staff",
      agencyId: user.agencyId,
    });
    return { authUserId: remote.user.id };
  },
};

/**
 * Apply one reset as a resumable provider operation followed by one atomic
 * local password/session-epoch commit. The provider receipt is durable before
 * AquaCRM can report success.
 */
export async function executePasswordReset(input: {
  payload: PasswordResetPayload;
  password: string;
  dependencies?: PasswordResetProviderDependencies;
  now?: number;
}): Promise<{ operation: PasswordResetOperation; user: ServerUser; completedNow: boolean }> {
  const { payload, password } = input;
  const id = operationId(payload);
  const fingerprint = passwordFingerprint(id, password);
  const dependencies = input.dependencies ?? defaultProviderDependencies;
  const now = input.now ?? Date.now();

  return withPortalProviderLease(`password-reset:${payload.userId}`, async () => {
    await ensureHydrated({ fresh: true });
    let user = getUserById(payload.userId);
    if (!user || user.email !== payload.email) throw new Error("password_reset_invalid");
    let operation = currentOperation(id);

    if (!operation) {
      if ((user.sessionRev ?? 0) !== payload.sessionRev) throw new Error("reset_epoch_changed");
      if (!await consumeResetNonce(payload.nonce, payload.exp)) throw new Error("already_used");
      operation = await withPortalStateTransaction(`password-reset:${id}`, () => {
        const existing = currentOperation(id);
        if (existing) return existing;
        const created: PasswordResetOperation = {
          id,
          userId: user!.id,
          email: user!.email,
          agencyId: user!.agencyId,
          clientId: user!.clientId,
          role: user!.role,
          tokenNonce: payload.nonce,
          tokenExpiresAt: payload.exp,
          expectedSessionRev: payload.sessionRev,
          passwordFingerprint: fingerprint,
          initialSupabaseAuthUserId: user!.supabaseAuthUserId,
          status: "accepted",
          providerAttempts: 0,
          createdAt: now,
          updatedAt: now,
        };
        writeOperation(created);
        return created;
      });
    }

    if (!exactOperation(operation, payload, fingerprint)) throw new Error("password_reset_operation_mismatch");
    user = getUserById(operation.userId);
    if (!user || !exactSubject(user, operation)) throw new Error("password_reset_subject_changed");
    if (operation.status === "complete") {
      if (
        (user.sessionRev ?? 0) !== operation.expectedSessionRev + 1
        || !operation.providerUserId
        || user.supabaseAuthUserId !== operation.providerUserId
      ) {
        throw new Error("password_reset_completion_inconsistent");
      }
      return { operation, user, completedNow: false };
    }
    if (user.supabaseAuthUserId !== operation.initialSupabaseAuthUserId) {
      throw new Error("password_reset_provider_binding_changed");
    }
    if ((user.sessionRev ?? 0) !== operation.expectedSessionRev) throw new Error("reset_epoch_changed");

    if (operation.status === "accepted") {
      operation = await withPortalStateTransaction(`password-reset:${id}`, () => {
        const current = currentOperation(id);
        if (!current || !exactOperation(current, payload, fingerprint) || current.status !== "accepted") {
          throw new Error("password_reset_state_changed");
        }
        const next: PasswordResetOperation = {
          ...current,
          providerAttempts: current.providerAttempts + 1,
          providerLastError: undefined,
          providerOutcomeUnknown: undefined,
          updatedAt: Date.now(),
        };
        writeOperation(next);
        return next;
      });
      let provider: { authUserId: string };
      try {
        provider = await dependencies.apply({ operation, user, password });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Password provider update failed.";
        await withPortalStateTransaction(`password-reset:${id}`, () => {
          const current = currentOperation(id);
          if (!current || current.status !== "accepted") return;
          writeOperation({
            ...current,
            providerLastError: message.slice(0, 500),
            // A thrown provider call is conservatively ambiguous. Retrying is
            // safe only because the exact operation and password are reused.
            providerOutcomeUnknown: true,
            updatedAt: Date.now(),
          });
        });
        throw new Error("password_reset_provider_failed");
      }
      operation = await withPortalStateTransaction(`password-reset:${id}`, () => {
        const current = currentOperation(id);
        if (!current || current.status !== "accepted") throw new Error("password_reset_state_changed");
        const next: PasswordResetOperation = {
          ...current,
          status: "provider-applied",
          providerUserId: provider.authUserId,
          providerLastError: undefined,
          providerOutcomeUnknown: undefined,
          updatedAt: Date.now(),
        };
        writeOperation(next);
        return next;
      });
    }

    const completed = await withPortalStateTransaction(`password-reset:${id}`, () => {
      const current = currentOperation(id);
      if (!current || current.status !== "provider-applied" || !current.providerUserId) {
        throw new Error("password_reset_provider_receipt_missing");
      }
      const currentUser = getUserById(current.userId);
      if (!currentUser || !exactSubject(currentUser, current)) throw new Error("password_reset_subject_changed");
      if (!currentUser.supabaseAuthUserId) {
        if (!bindSupabaseAuthIdentity(currentUser.id, current.providerUserId)) {
          throw new Error("password_reset_provider_binding_failed");
        }
      } else if (currentUser.supabaseAuthUserId !== current.providerUserId) {
        throw new Error("password_reset_provider_binding_changed");
      }
      const saved = setUserPasswordById(currentUser.id, password, current.expectedSessionRev);
      if (!saved) throw new Error("reset_epoch_changed");
      const next: PasswordResetOperation = {
        ...current,
        status: "complete",
        completedAt: Date.now(),
        updatedAt: Date.now(),
      };
      writeOperation(next);
      return { operation: next, user: saved };
    });
    return { ...completed, completedNow: true };
  });
}

export function getPasswordResetOperation(payload: PasswordResetPayload): PasswordResetOperation | null {
  return currentOperation(operationId(payload));
}
