export type MutationFailureKind = "transport" | "response" | "http" | "domain";

export class CheckedMutationError extends Error {
  readonly kind: MutationFailureKind;
  readonly status?: number;

  constructor(message: string, kind: MutationFailureKind, status?: number) {
    super(message);
    this.name = "CheckedMutationError";
    this.kind = kind;
    this.status = status;
  }
}

type MutationFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface CheckedJsonMutationOptions<T> {
  fallback: string;
  validate?: (payload: T) => boolean;
  fetcher?: MutationFetcher;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function payloadMessage(payload: unknown): string | null {
  const body = record(payload);
  if (!body) return null;
  for (const key of ["error", "message", "reason"] as const) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function fallbackWithStatus(fallback: string, status: number): string {
  return status > 0 ? `${fallback} (HTTP ${status}).` : fallback;
}

/**
 * Run one client-side JSON mutation and reject every non-success boundary:
 * transport, unreadable JSON, non-2xx HTTP, `{ok:false}` and caller validation.
 */
export async function checkedJsonMutation<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  options: CheckedJsonMutationOptions<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(input, init);
  } catch {
    throw new CheckedMutationError(
      `${options.fallback} Check your connection and try again.`,
      "transport",
    );
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new CheckedMutationError(
      `${options.fallback} The server response could not be read.`,
      "response",
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = text.trim() ? JSON.parse(text) : null;
  } catch {
    throw new CheckedMutationError(
      `${options.fallback} The server returned an unreadable response.`,
      "response",
      response.status,
    );
  }

  if (!response.ok) {
    throw new CheckedMutationError(
      payloadMessage(payload) ?? fallbackWithStatus(options.fallback, response.status),
      "http",
      response.status,
    );
  }

  const body = record(payload);
  if (body?.ok === false) {
    throw new CheckedMutationError(
      payloadMessage(payload) ?? options.fallback,
      "domain",
      response.status,
    );
  }

  if (payload === null || (options.validate && !options.validate(payload as T))) {
    throw new CheckedMutationError(
      payloadMessage(payload) ?? options.fallback,
      "domain",
      response.status,
    );
  }

  return payload as T;
}

export function mutationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof CheckedMutationError ? error.message : fallback;
}
