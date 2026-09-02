import { getState, mutate } from "./storage";
import type { ActionMutationReceipt } from "./types";

export class ActionMutationReceiptError extends Error {}
export class ActionMutationConflictError extends Error {}

function receiptKey(agencyId: string, userId: string, operationId: string): string {
  return `${agencyId}|${userId}|${operationId}`;
}

export function actionOperationId(kind: ActionMutationReceipt["kind"], targetId: string, action = "", parkedUntil?: number): string {
  return `${kind}:${encodeURIComponent(targetId)}:${encodeURIComponent(action)}:${parkedUntil ?? 0}`;
}

export function matchingActionReceipt(input: Omit<ActionMutationReceipt, "createdAt" | "completedActionId">): ActionMutationReceipt | null {
  const receipt = getState().actionMutationReceipts[receiptKey(input.agencyId, input.userId, input.operationId)];
  if (!receipt) return null;
  if (receipt.kind !== input.kind || receipt.agencyId !== input.agencyId || receipt.userId !== input.userId
    || receipt.targetId !== input.targetId || receipt.action !== input.action || receipt.parkedUntil !== input.parkedUntil) {
    throw new ActionMutationReceiptError("That operation id belongs to a different action.");
  }
  return receipt;
}

export function recordActionReceipt(receipt: ActionMutationReceipt): void {
  mutate(state => {
    const cutoff = receipt.createdAt - 30 * 24 * 60 * 60 * 1000;
    for (const [key, existing] of Object.entries(state.actionMutationReceipts)) {
      if (existing.createdAt < cutoff) delete state.actionMutationReceipts[key];
    }
    state.actionMutationReceipts[receiptKey(receipt.agencyId, receipt.userId, receipt.operationId)] = receipt;
  });
}
