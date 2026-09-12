import "server-only";

import crypto from "node:crypto";

import { resolveSigningSecret } from "@/lib/server/auth/sessionToken";
import {
  provisionBoundClientPortalIdentity,
  updateBoundClientPortalPassword,
} from "@/lib/supabase/admin";
import { ensureHydrated, flushPendingWrites, getState, mutate } from "./storage";
import type { ClientPortalSetupOperation, ServerUser } from "./types";
import {
  bindSupabaseAuthIdentity,
  getUserById,
  markWelcomeComplete,
  setUserPasswordById,
} from "./users";
import { withPortalProviderLease, withPortalStateTransaction } from "./productWorkspaceCoordinator";

export interface ClientPortalSetupDependencies {
  applyProvider(input: {
    operation: ClientPortalSetupOperation;
    user: ServerUser;
    password: string;
  }): Promise<{ authUserId: string }>;
}

function operationId(userId: string, expectedSessionRev: number): string {
  return `client_setup_${crypto.createHash("sha256")
    .update("client-portal-setup-v1")
    .update("\0")
    .update(userId)
    .update("\0")
    .update(String(expectedSessionRev))
    .digest("hex")
    .slice(0, 32)}`;
}

function passwordFingerprint(id: string, password: string): string {
  return crypto.createHmac("sha256", resolveSigningSecret())
    .update("client-portal-setup-password-v1")
    .update("\0")
    .update(id)
    .update("\0")
    .update(password)
    .digest("hex");
}

function readOperation(id: string): ClientPortalSetupOperation | null {
  return getState().clientPortalSetupOperations[id] ?? null;
}

function writeOperation(operation: ClientPortalSetupOperation): void {
  mutate(state => { state.clientPortalSetupOperations[operation.id] = operation; });
}

function exactSubject(user: ServerUser, operation: ClientPortalSetupOperation): boolean {
  return user.id === operation.userId
    && user.email === operation.email
    && user.agencyId === operation.agencyId
    && user.clientId === operation.clientId
    && user.role === operation.role;
}

const defaultDependencies: ClientPortalSetupDependencies = {
  async applyProvider({ operation, user, password }) {
    const binding = {
      aquaUserId: user.id,
      agencyId: user.agencyId,
      clientId: user.clientId!,
    };
    if (operation.initialSupabaseAuthUserId) {
      const result = await updateBoundClientPortalPassword({
        authUserId: operation.initialSupabaseAuthUserId,
        email: user.email,
        password,
        binding,
      });
      return { authUserId: result.id };
    }
    const result = await provisionBoundClientPortalIdentity({
      email: user.email,
      password,
      name: user.name,
      binding,
      operationId: operation.id,
      operationKind: "client-setup",
    });
    return { authUserId: result.id };
  },
};

export async function executeClientPortalSetup(input: {
  userId: string;
  expectedSessionRev: number;
  password: string;
  dependencies?: ClientPortalSetupDependencies;
  now?: number;
}): Promise<{ operation: ClientPortalSetupOperation; user: ServerUser; completedNow: boolean }> {
  const id = operationId(input.userId, input.expectedSessionRev);
  const fingerprint = passwordFingerprint(id, input.password);
  const dependencies = input.dependencies ?? defaultDependencies;
  const now = input.now ?? Date.now();

  return withPortalProviderLease(`client-portal-setup:${input.userId}`, async () => {
    await ensureHydrated({ fresh: true });
    let user = getUserById(input.userId);
    if (
      !user
      || !user.clientId
      || (!user.supabaseAuthUserId && !user.emailVerifiedAt)
    ) throw new Error("client_setup_subject_invalid");
    let operation = readOperation(id);
    if (!operation) {
      if ((user.sessionRev ?? 0) !== input.expectedSessionRev) throw new Error("client_setup_epoch_changed");
      operation = await withPortalStateTransaction(`client-portal-setup:${id}`, () => {
        const existing = readOperation(id);
        if (existing) return existing;
        const created: ClientPortalSetupOperation = {
          id,
          userId: user!.id,
          email: user!.email,
          agencyId: user!.agencyId,
          clientId: user!.clientId!,
          role: user!.role,
          expectedSessionRev: input.expectedSessionRev,
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
      await flushPendingWrites();
    }
    if (operation.passwordFingerprint !== fingerprint) throw new Error("client_setup_password_changed");
    user = getUserById(operation.userId);
    if (!user || !exactSubject(user, operation)) throw new Error("client_setup_subject_changed");
    if (operation.status === "complete") {
      if (
        (user.sessionRev ?? 0) !== operation.expectedSessionRev + 1
        || !operation.providerUserId
        || user.supabaseAuthUserId !== operation.providerUserId
      ) throw new Error("client_setup_completion_inconsistent");
      return { operation, user, completedNow: false };
    }
    if ((user.sessionRev ?? 0) !== operation.expectedSessionRev) throw new Error("client_setup_epoch_changed");
    if (user.supabaseAuthUserId !== operation.initialSupabaseAuthUserId) {
      throw new Error("client_setup_provider_binding_changed");
    }

    if (operation.status === "accepted") {
      operation = await withPortalStateTransaction(`client-portal-setup:${id}`, () => {
        const current = readOperation(id);
        if (!current || current.status !== "accepted" || current.passwordFingerprint !== fingerprint) {
          throw new Error("client_setup_state_changed");
        }
        const next = {
          ...current,
          providerAttempts: current.providerAttempts + 1,
          providerLastError: undefined,
          providerOutcomeUnknown: undefined,
          updatedAt: Date.now(),
        } satisfies ClientPortalSetupOperation;
        writeOperation(next);
        return next;
      });
      await flushPendingWrites();
      let provider: { authUserId: string };
      try {
        provider = await dependencies.applyProvider({ operation, user, password: input.password });
      } catch {
        await withPortalStateTransaction(`client-portal-setup:${id}`, () => {
          const current = readOperation(id);
          if (!current || current.status !== "accepted") return;
          writeOperation({
            ...current,
            providerLastError: "provider_failed",
            providerOutcomeUnknown: true,
            updatedAt: Date.now(),
          });
        });
        await flushPendingWrites();
        throw new Error("client_setup_provider_failed");
      }
      operation = await withPortalStateTransaction(`client-portal-setup:${id}`, () => {
        const current = readOperation(id);
        if (!current || current.status !== "accepted" || current.passwordFingerprint !== fingerprint) {
          throw new Error("client_setup_state_changed");
        }
        const next: ClientPortalSetupOperation = {
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
      await flushPendingWrites();
    }

    const completed = await withPortalStateTransaction(`client-portal-setup:${id}`, () => {
      const current = readOperation(id);
      if (!current || current.status !== "provider-applied" || !current.providerUserId) {
        throw new Error("client_setup_provider_receipt_missing");
      }
      const currentUser = getUserById(current.userId);
      if (!currentUser || !exactSubject(currentUser, current)) throw new Error("client_setup_subject_changed");
      if (!currentUser.supabaseAuthUserId) {
        if (!bindSupabaseAuthIdentity(currentUser.id, current.providerUserId)) {
          throw new Error("client_setup_provider_binding_failed");
        }
      } else if (currentUser.supabaseAuthUserId !== current.providerUserId) {
        throw new Error("client_setup_provider_binding_changed");
      }
      const passwordUser = setUserPasswordById(currentUser.id, input.password, current.expectedSessionRev);
      if (!passwordUser) throw new Error("client_setup_epoch_changed");
      const welcomed = markWelcomeComplete(passwordUser.id);
      if (!welcomed) throw new Error("client_setup_subject_changed");
      const next: ClientPortalSetupOperation = {
        ...current,
        status: "complete",
        completedAt: Date.now(),
        updatedAt: Date.now(),
      };
      writeOperation(next);
      return { operation: next, user: welcomed };
    });
    await flushPendingWrites();
    return { ...completed, completedNow: true };
  });
}
