import {
  RemoteOperationDefinitiveError,
  withRemoteOperationDeadline,
  type RemoteOperationEvent,
} from "@/lib/server/remoteOperation";
import { assertLiveProviderAccess } from "@/lib/server/sandbox/providerPolicy";

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/**
 * A provider response reached us but OpenAI refused it. Keeping the HTTP
 * status on a typed error lets callers preserve their own safe user-facing
 * mapping without parsing provider text or losing the difference between a
 * network failure and a provider refusal.
 */
export class OpenAiResponseError extends RemoteOperationDefinitiveError {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message || `OpenAI request failed (${status}).`);
    this.name = "OpenAiResponseError";
    this.status = status;
  }
}

export async function requestOpenAiResponse(input: {
  apiKey: string;
  payload: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  onEvent?: (event: RemoteOperationEvent) => void;
}): Promise<Record<string, unknown>> {
  // This shared adapter is the final outbound fence. Route/UI checks are not
  // sufficient because assistants and editor workers can call it directly.
  assertLiveProviderAccess("OpenAI response generation");
  const fetchImpl = input.fetchImpl ?? fetch;
  return withRemoteOperationDeadline({
    operation: "OpenAI response generation",
    budget: "aiGeneration",
    // `store: false` prevents durable response storage, but it does not make a
    // started generation idempotent: the provider may have completed/charged
    // after our deadline. Never tell callers a blind retry is safe.
    outcome: "non-idempotent-write",
    signal: input.signal,
    timeoutMs: input.timeoutMs,
    onEvent: input.onEvent,
  }, async signal => {
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...input.payload, store: false }),
      cache: "no-store",
      signal,
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown> & {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new OpenAiResponseError(
        response.status,
        payload.error?.message || `OpenAI request failed (${response.status}).`,
      );
    }
    return payload;
  });
}
