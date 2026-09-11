import {
  RemoteOperationDefinitiveError,
  withRemoteOperationDeadline,
  type RemoteOperationEvent,
} from "@/lib/server/remoteOperation";
import { assertLiveProviderAccess } from "@/lib/server/sandbox/providerPolicy";
import { assertFreshWritesAllowed, isAiDisabled } from "@/lib/server/auth/securityControl";
import { recordSecurityEvent } from "@/lib/server/security/securityEvents";

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/**
 * The AI kill switch is ON (assume-breach containment, Phase 3). Thrown before
 * any provider I/O; the caller's user-facing mapping applies.
 */
export class AiDisabledError extends RemoteOperationDefinitiveError {
  constructor(reason: string) {
    super(`AI generation is disabled by the security control plane (${reason}).`);
    this.name = "AiDisabledError";
  }
}

/** This tenant (or the whole app) has exhausted its AI call budget for the window. */
export class AiQuotaExceededError extends RemoteOperationDefinitiveError {
  constructor(scope: string) {
    super(`AI call quota exhausted for ${scope}. The window resets within the hour.`);
    this.name = "AiQuotaExceededError";
  }
}

// Per-tenant sliding-hour quota. In-memory is honest for the single-instance
// Railway deployment; a multi-instance rollout needs a shared counter (tracked
// as a Phase-4 item alongside the distributed rate limiter).
const QUOTA_WINDOW_MS = 60 * 60 * 1000;
const callLog = new Map<string, number[]>();

function quotaLimit(): number {
  const parsed = Number.parseInt(process.env.PORTAL_AI_CALLS_PER_HOUR ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
}

function consumeQuota(scope: string): boolean {
  const now = Date.now();
  const entries = (callLog.get(scope) ?? []).filter(at => now - at < QUOTA_WINDOW_MS);
  if (entries.length >= quotaLimit()) {
    callLog.set(scope, entries);
    return false;
  }
  entries.push(now);
  callLog.set(scope, entries);
  return true;
}

/** Test seam: clear the in-memory quota window. */
export function resetAiQuotaForTest(): void {
  callLog.clear();
}

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
  /** Trusted tenant scope for admission, quota and incident attribution. */
  tenantId: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  onEvent?: (event: RemoteOperationEvent) => void;
}): Promise<Record<string, unknown>> {
  // This shared adapter is the final outbound fence. Route/UI checks are not
  // sufficient because assistants and editor workers can call it directly.
  await assertFreshWritesAllowed("provider.openai.generate", { tenantId: input.tenantId });
  assertLiveProviderAccess("OpenAI response generation");
  // AI KILL SWITCH + per-tenant quota (Phase 3) — enforced at the ONE adapter
  // every AI generation passes through, before any provider I/O. Prompt
  // contents are never logged or evented.
  const disabled = isAiDisabled();
  if (disabled) throw new AiDisabledError(disabled.reason);
  const quotaScope = input.tenantId;
  if (!consumeQuota(quotaScope)) {
    recordSecurityEvent({
      kind: "ai.quota-exceeded",
      severity: "warning",
      tenantId: input.tenantId,
      detail: { scope: quotaScope, limitPerHour: quotaLimit() },
    });
    throw new AiQuotaExceededError(quotaScope);
  }
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
