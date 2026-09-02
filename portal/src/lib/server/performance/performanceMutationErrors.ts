import "server-only";

import { NextResponse } from "next/server";

import { AuthError, authErrorResponse } from "@/lib/server/auth/auth";
import { captureError, type ObservabilityBreadcrumb } from "@/lib/server/observability";
import { ClientMilestoneValidationError } from "@/server/clientMilestones";
import {
  PerformanceExperimentConflictError,
  PerformanceExperimentValidationError,
} from "@/server/performanceExperiments";

/**
 * One error classification for the Performance mutation routes (experiments,
 * milestones, monthly reports). Before this helper the experiments route
 * answered EVERY thrown error as `400 { error: error.message }`, so a storage
 * or transaction failure surfaced its internal text to the browser as if the
 * caller had sent a bad request, and the milestones route re-threw anything
 * that was not an AuthError, so a blank title became an unhandled 500.
 *
 * The contract, in order:
 *   - AuthError                      → 401/403 (the shared auth translation)
 *   - PerformanceMutationNotFoundError → 404 with the safe message
 *   - typed validation refusals      → 400 with the safe message
 *   - PerformanceExperimentConflictError → 409 with the safe message
 *   - anything else                  → captured server-side, generic 500
 *
 * The 400/404/409 messages are authored constants inside this codebase, never
 * a wrapped provider or driver error, which is what makes them safe to render.
 */

/** The request cannot be parsed or names a value the route refuses up front. */
export class PerformanceMutationRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PerformanceMutationRequestError";
  }
}

/** The addressed client, experiment, milestone or report does not exist in this agency. */
export class PerformanceMutationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PerformanceMutationNotFoundError";
  }
}

function refusal(status: number, message: string): Response {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function performanceMutationErrorResponse(
  error: unknown,
  input: { fallback: string; breadcrumb?: ObservabilityBreadcrumb },
): Response {
  if (error instanceof AuthError) return authErrorResponse(error);
  if (error instanceof PerformanceMutationNotFoundError) return refusal(404, error.message);
  if (
    error instanceof PerformanceMutationRequestError
    || error instanceof PerformanceExperimentValidationError
    || error instanceof ClientMilestoneValidationError
  ) {
    return refusal(400, error.message);
  }
  if (error instanceof PerformanceExperimentConflictError) return refusal(409, error.message);
  captureError(error, input.breadcrumb);
  return refusal(500, input.fallback);
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
