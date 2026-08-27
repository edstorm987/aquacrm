export const REMOTE_OPERATION_BUDGET_MS = {
  storageRead: 10_000,
  storageWrite: 15_000,
  providerRead: 10_000,
  providerWrite: 20_000,
  aiGeneration: 45_000,
} as const;

export type RemoteOperationBudget = keyof typeof REMOTE_OPERATION_BUDGET_MS;
export type RemoteOperationOutcome = "read" | "idempotent-write" | "non-idempotent-write";
export type RemoteOperationRetry = "safe" | "same-operation-key" | "reconcile-first";
export type RemoteOperationFailureKind = "timeout" | "aborted" | "failed";
export type RemoteOperationStatus = "succeeded" | "timed-out" | "aborted" | "failed";

export interface RemoteOperationEvent {
  operation: string;
  budget: RemoteOperationBudget;
  outcome: RemoteOperationOutcome;
  timeoutMs: number;
  durationMs: number;
  status: RemoteOperationStatus;
  outcomeUnknown?: boolean;
  retry?: RemoteOperationRetry;
}

export interface RemoteOperationOptions {
  operation: string;
  budget: RemoteOperationBudget;
  outcome: RemoteOperationOutcome;
  signal?: AbortSignal;
  /** Test and exceptional-provider override; ordinary callers use the named budget. */
  timeoutMs?: number;
  /** Optional deterministic sink for tests or a request-scoped telemetry bridge. */
  onEvent?: (event: RemoteOperationEvent) => void;
}

/** A provider response definitively rejected the operation, so its outcome is known. */
export class RemoteOperationDefinitiveError extends Error {}

export class RemoteOperationError extends Error {
  readonly code: "REMOTE_OPERATION_TIMEOUT" | "REMOTE_OPERATION_ABORTED" | "REMOTE_OPERATION_FAILED";
  readonly kind: RemoteOperationFailureKind;
  readonly operation: string;
  readonly budget: RemoteOperationBudget;
  readonly timeoutMs: number;
  readonly outcome: RemoteOperationOutcome;
  readonly outcomeUnknown: boolean;
  readonly retry: RemoteOperationRetry;

  constructor(args: {
    kind: RemoteOperationFailureKind;
    operation: string;
    budget: RemoteOperationBudget;
    timeoutMs: number;
    outcome: RemoteOperationOutcome;
    started: boolean;
    cause?: unknown;
  }) {
    const outcomeUnknown = args.started && args.outcome !== "read";
    const retry: RemoteOperationRetry = !outcomeUnknown || args.outcome === "read"
      ? "safe"
      : args.outcome === "idempotent-write"
        ? "same-operation-key"
        : "reconcile-first";
    const causeMessage = args.cause instanceof Error && args.cause.message.trim()
      ? ` (${args.cause.message.trim()})`
      : "";
    const event = args.kind === "timeout"
      ? `timed out after ${args.timeoutMs}ms`
      : args.kind === "aborted"
        ? "was cancelled"
        : `failed after the remote request started${causeMessage}`;
    const recovery = retry === "safe"
      ? "It is safe to retry."
      : retry === "same-operation-key"
        ? "The provider outcome is unknown; retry only with the same operation key."
        : "The provider outcome is unknown; reconcile with the provider before retrying.";
    super(`${args.operation} ${event}. ${recovery}`);
    if (args.cause !== undefined) Object.defineProperty(this, "cause", { value: args.cause });
    this.name = "RemoteOperationError";
    this.code = args.kind === "timeout"
      ? "REMOTE_OPERATION_TIMEOUT"
      : args.kind === "aborted"
        ? "REMOTE_OPERATION_ABORTED"
        : "REMOTE_OPERATION_FAILED";
    this.kind = args.kind;
    this.operation = args.operation;
    this.budget = args.budget;
    this.timeoutMs = args.timeoutMs;
    this.outcome = args.outcome;
    this.outcomeUnknown = outcomeUnknown;
    this.retry = retry;
  }
}

export function isRemoteOperationError(error: unknown): error is RemoteOperationError {
  return error instanceof RemoteOperationError;
}

/**
 * Runs an operation with one signal that combines caller cancellation and an
 * application deadline. The Promise race is deliberate: callers still settle
 * even when a faulty provider adapter ignores its AbortSignal.
 */
export async function withRemoteOperationDeadline<T>(
  options: RemoteOperationOptions,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeoutMs = resolveTimeoutMs(options);
  const startedAt = Date.now();
  if (options.signal?.aborted) {
    const error = operationError(options, timeoutMs, "aborted", false);
    emitRemoteOperationEvent(options, timeoutMs, startedAt, "aborted", error);
    throw error;
  }

  const controller = new AbortController();
  let started = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let callerAbort: (() => void) | undefined;

  const interruption = new Promise<never>((_, reject) => {
    const interrupt = (kind: RemoteOperationFailureKind) => {
      const error = operationError(options, timeoutMs, kind, started);
      controller.abort(error);
      reject(error);
    };

    timeout = setTimeout(() => interrupt("timeout"), timeoutMs);
    if (options.signal) {
      callerAbort = () => interrupt("aborted");
      options.signal.addEventListener("abort", callerAbort, { once: true });
    }
  });

  const pending = Promise.resolve().then(() => {
    if (controller.signal.aborted) throw controller.signal.reason;
    started = true;
    return operation(controller.signal);
  });

  try {
    const result = await Promise.race([pending, interruption]);
    emitRemoteOperationEvent(options, timeoutMs, startedAt, "succeeded");
    return result;
  } catch (error) {
    const wrapped = !(error instanceof RemoteOperationError)
      && !(error instanceof RemoteOperationDefinitiveError)
      && started
      && options.outcome !== "read"
      ? operationError(options, timeoutMs, "failed", true, error)
      : error;
    const status: RemoteOperationStatus = wrapped instanceof RemoteOperationError
      ? wrapped.kind === "timeout"
        ? "timed-out"
        : wrapped.kind === "aborted"
          ? "aborted"
          : "failed"
      : "failed";
    emitRemoteOperationEvent(options, timeoutMs, startedAt, status, wrapped);
    throw wrapped;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (options.signal && callerAbort) options.signal.removeEventListener("abort", callerAbort);
  }
}

function emitRemoteOperationEvent(
  options: RemoteOperationOptions,
  timeoutMs: number,
  startedAt: number,
  status: RemoteOperationStatus,
  error?: unknown,
): void {
  const remoteError = error instanceof RemoteOperationError ? error : undefined;
  const event: RemoteOperationEvent = {
    operation: options.operation,
    budget: options.budget,
    outcome: options.outcome,
    timeoutMs,
    durationMs: Math.max(0, Date.now() - startedAt),
    status,
    ...(remoteError ? {
      outcomeUnknown: remoteError.outcomeUnknown,
      retry: remoteError.retry,
    } : {}),
  };

  try {
    options.onEvent?.(event);
  } catch {
    // Instrumentation must never change the provider outcome.
  }

  if (process.env.NODE_ENV !== "production") return;
  const payload = JSON.stringify({
    level: status === "succeeded" ? "info" : "warn",
    message: "remote_operation",
    ...event,
  });
  if (status === "succeeded") console.info(payload);
  else console.warn(payload);
}

function resolveTimeoutMs(options: RemoteOperationOptions): number {
  const timeoutMs = options.timeoutMs ?? REMOTE_OPERATION_BUDGET_MS[options.budget];
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Remote operation timeout must be a positive finite number.");
  }
  return Math.round(timeoutMs);
}

function operationError(
  options: RemoteOperationOptions,
  timeoutMs: number,
  kind: RemoteOperationFailureKind,
  started: boolean,
  cause?: unknown,
): RemoteOperationError {
  return new RemoteOperationError({
    kind,
    operation: options.operation,
    budget: options.budget,
    timeoutMs,
    outcome: options.outcome,
    started,
    cause,
  });
}
