export type MutationFailureKind = "transport" | "response" | "http" | "domain";

export class CheckedMutationError extends Error {
  readonly kind: MutationFailureKind;
  readonly status?: number;
  /** Parsed JSON only. Callers must still validate any structured detail. */
  readonly payload?: unknown;

  constructor(message: string, kind: MutationFailureKind, status?: number, payload?: unknown) {
    super(message);
    this.name = "CheckedMutationError";
    this.kind = kind;
    this.status = status;
    this.payload = payload;
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

const MAX_SERVER_MESSAGE_LENGTH = 240;
const SECRET_BEARING_MESSAGE = new RegExp([
  String.raw`\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{8,}\b`,
  String.raw`\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b`,
  String.raw`\bAKIA[0-9A-Z]{16}\b`,
  String.raw`\bxox(?:b|p|a|r|s)-[A-Za-z0-9-]{10,}\b`,
  String.raw`\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}\b`,
  String.raw`\bgithub_pat_[A-Za-z0-9_]{20,}\b`,
  String.raw`\bBearer\s+\S+`,
  String.raw`\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b`,
  String.raw`-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE KEY-----`,
  String.raw`\b(?:api[_ -]?key|token|password|secret|authorization)\s*[:=]\s*\S+`,
  String.raw`\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*\S+`,
  String.raw`\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s@]+@`,
].join("|"), "i");

function payloadMessage(payload: unknown): string | null {
  const body = record(payload);
  if (!body) return null;
  for (const key of ["error", "message", "reason"] as const) {
    const value = body[key];
    if (typeof value !== "string") continue;
    if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)) return null;
    const message = value.trim();
    if (!message || message.length > MAX_SERVER_MESSAGE_LENGTH) return null;
    if (SECRET_BEARING_MESSAGE.test(message)) return null;
    return message.replace(/ {2,}/g, " ");
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
    if (response.status >= 500 && response.status < 600) {
      throw new CheckedMutationError(
        fallbackWithStatus(options.fallback, response.status),
        "http",
        response.status,
      );
    }
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
    if (response.status >= 500 && response.status < 600) {
      throw new CheckedMutationError(
        fallbackWithStatus(options.fallback, response.status),
        "http",
        response.status,
      );
    }
    throw new CheckedMutationError(
      `${options.fallback} The server returned an unreadable response.`,
      "response",
      response.status,
    );
  }

  if (!response.ok) {
    const clientRefusal = response.status >= 400 && response.status < 500;
    throw new CheckedMutationError(
      (clientRefusal ? payloadMessage(payload) : null)
        ?? fallbackWithStatus(options.fallback, response.status),
      "http",
      response.status,
      clientRefusal ? payload : undefined,
    );
  }

  const body = record(payload);
  if (body?.ok === false) {
    throw new CheckedMutationError(
      payloadMessage(payload) ?? options.fallback,
      "domain",
      response.status,
      payload,
    );
  }

  if (payload === null || (options.validate && !options.validate(payload as T))) {
    throw new CheckedMutationError(
      payloadMessage(payload) ?? options.fallback,
      "domain",
      response.status,
      payload,
    );
  }

  return payload as T;
}

export function mutationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof CheckedMutationError ? error.message : fallback;
}
