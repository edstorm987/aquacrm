import { CheckedMutationError } from "@/lib/client/checkedMutation";

const STORAGE_PREFIX = "aqua:memberships:pending-operation:";

function storageKey(scope: string, action: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope)}:${encodeURIComponent(action)}`;
}

function createOperationId(action: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `membership-${action.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80)}-${random}`;
}

/** Retain the exact browser intent across retries and same-tab reloads. */
export function pendingMembershipOperationId(scope: string, action: string): string {
  const key = storageKey(scope, action);
  try {
    const existing = sessionStorage.getItem(key)?.trim();
    if (existing) return existing;
    const created = createOperationId(action);
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return createOperationId(action);
  }
}

export function clearPendingMembershipOperation(scope: string, action: string): void {
  try { sessionStorage.removeItem(storageKey(scope, action)); }
  catch { /* Storage can be unavailable in hardened browser contexts. */ }
}

export function clearMembershipOperationAfterDefinitiveFailure(
  error: unknown,
  scope: string,
  action: string,
): void {
  if (error instanceof CheckedMutationError && error.status === 409) {
    clearPendingMembershipOperation(scope, action);
  }
}
