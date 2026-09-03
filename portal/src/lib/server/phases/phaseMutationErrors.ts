import "server-only";

import { NextResponse } from "next/server";

import { AuthError, authErrorResponse } from "@/lib/server/auth/auth";
import { captureError, type ObservabilityBreadcrumb } from "@/lib/server/observability";
import { DevFileConflictError } from "@/lib/server/dev/devFileTransaction";
import { ProductWorkspaceBusyError, ProductWorkspaceLeaseLostError } from "@/server/productWorkspaceCoordinator";

/**
 * One error classification for the Agency Phase Admin routes (upsert, delete,
 * preview-as-client-at-phase). Refusals the caller can act on carry an
 * authored message; anything else is captured server-side (issue #132 sink)
 * and answered with a generic 500, so no exception text reaches the browser.
 *
 *   - AuthError                     → 401/403 (the shared auth translation)
 *   - PhaseMutationNotFoundError    → 404
 *   - PhaseMutationRequestError     → 400
 *   - PhaseMutationConflictError    → 409
 *   - anything else                 → captured, generic 500
 */

export class PhaseMutationRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhaseMutationRequestError";
  }
}

export class PhaseMutationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhaseMutationNotFoundError";
  }
}

export class PhaseMutationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhaseMutationConflictError";
  }
}

export const CONTENTION_MESSAGE = "This workspace is being updated in another session. Try again in a moment.";

function refusal(status: number, message: string): Response {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function phaseMutationErrorResponse(
  error: unknown,
  input: { fallback: string; breadcrumb?: ObservabilityBreadcrumb },
): Response {
  if (error instanceof AuthError) return authErrorResponse(error);
  if (error instanceof PhaseMutationNotFoundError) return refusal(404, error.message);
  if (error instanceof PhaseMutationRequestError) return refusal(400, error.message);
  if (error instanceof PhaseMutationConflictError) return refusal(409, error.message);
  // Lock contention and a lost lease are expected outcomes of the portal
  // state transaction, not failures: answer the coordinator's authored retry
  // message as a 409 like the sibling coordinated routes, and keep them out
  // of the issue #132 error sink.
  if (error instanceof ProductWorkspaceBusyError || error instanceof ProductWorkspaceLeaseLostError || error instanceof DevFileConflictError) {
    return refusal(409, CONTENTION_MESSAGE);
  }
  captureError(error, input.breadcrumb);
  return refusal(500, input.fallback);
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Optional text field: absent, or a string of at most `max` characters. Over-
 * length input is REFUSED, never truncated: a silently shortened write would
 * answer 200 with a phase that no longer matches what the browser submitted,
 * so its receipt would be rejected and a retry would duplicate the phase.
 */
export function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new PhaseMutationRequestError(`${field} must be text.`);
  if (value.length > max) throw new PhaseMutationRequestError(`${field} must be ${max.toLocaleString("en-GB")} characters or fewer.`);
  return value;
}
