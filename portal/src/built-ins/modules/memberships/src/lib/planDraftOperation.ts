export interface PlanDraftOperation {
  signature: string;
  operationId: string;
}

/**
 * Keep one id for an exact retry, but rotate it once the submitted intent
 * changes. Reusing an id after editing the form would correctly conflict with
 * the durable server command and leave the modal unable to submit the edit.
 */
export function operationForPlanDraft(
  previous: PlanDraftOperation | null,
  draft: unknown,
  createOperationId: () => string,
): PlanDraftOperation {
  const signature = JSON.stringify(draft);
  if (previous?.signature === signature) return previous;
  return { signature, operationId: createOperationId() };
}
