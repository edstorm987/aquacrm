import "server-only";

import type { PortalState } from "@/server/types";

/**
 * Expected validation failure at a boundary that is about to persist a SOP id.
 *
 * Missing and cross-agency ids deliberately share one error. A writer must not
 * reveal that an otherwise unknown id belongs to another tenant, and neither
 * case is safe to store.
 */
export class SopReferenceValidationError extends Error {
  readonly code = "sop_reference_not_found";

  constructor(
    readonly field: string,
    readonly sopIds: readonly string[],
  ) {
    const first = sopIds[0] ?? "unknown";
    super(`SOP “${first}” does not exist for this agency.`);
    this.name = "SopReferenceValidationError";
  }
}

/**
 * Canonicalise and prove every requested SOP against the state snapshot the
 * owner record will be written to. Call this from inside the owner's `mutate`
 * callback (and hold the shared lifecycle transaction in mounted handlers).
 */
export function assertSopReferencesExist(
  state: PortalState,
  agencyId: string,
  values: readonly unknown[] | undefined,
  field = "sopIds",
): string[] {
  const source = Array.isArray(values) ? values : [];
  const sopIds = [...new Set(source.flatMap(value => {
    const sopId = typeof value === "string" ? value.trim() : "";
    return sopId ? [sopId] : [];
  }))];
  const missing = sopIds.filter(sopId => state.sops[sopId]?.agencyId !== agencyId);
  if (missing.length) throw new SopReferenceValidationError(field, missing);
  return sopIds;
}

/** Validate one optional reference without turning an empty field into a link. */
export function assertOptionalSopReferenceExists(
  state: PortalState,
  agencyId: string,
  value: unknown,
  field = "sopId",
): string | undefined {
  return assertSopReferencesExist(state, agencyId, [value], field)[0];
}

/**
 * Products and client-specific product variations hide a second SOP list on
 * every process step. Keep both sites on one shared assertion so adding a new
 * writer cannot accidentally validate the visible list but miss the nested
 * operating process.
 */
export function assertProductSopReferencesExist(
  state: PortalState,
  agencyId: string,
  product: {
    sopIds?: readonly unknown[];
    internalWorkspace?: { processSteps?: readonly { sopIds?: readonly unknown[] }[] };
  },
  fieldPrefix = "product",
): void {
  assertSopReferencesExist(state, agencyId, product.sopIds, `${fieldPrefix}.sopIds`);
  for (const [index, step] of (product.internalWorkspace?.processSteps ?? []).entries()) {
    assertSopReferencesExist(
      state,
      agencyId,
      step.sopIds,
      `${fieldPrefix}.internalWorkspace.processSteps[${index}].sopIds`,
    );
  }
}
