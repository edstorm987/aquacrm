import { withRemoteOperationDeadline, type RemoteOperationOutcome } from "@/lib/server/remoteOperation";
import { assertLiveProviderAccess } from "@/lib/server/sandbox/providerPolicy";

export interface StripeHttpRequest {
  secretKey: string;
  path: string;
  method?: "GET" | "POST";
  form?: URLSearchParams;
  idempotencyKey?: string;
  outcome: RemoteOperationOutcome;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface StripeHttpResponse<T> {
  ok: boolean;
  status: number;
  body: T;
}

/** A bounded Stripe exchange, including response-body delivery. */
export function stripeHttpRequest<T>(input: StripeHttpRequest): Promise<StripeHttpResponse<T>> {
  assertLiveProviderAccess("Stripe");
  const method = input.method ?? (input.form ? "POST" : "GET");
  return withRemoteOperationDeadline({
    operation: `Stripe ${method} ${input.path}`,
    budget: method === "GET" ? "providerRead" : "providerWrite",
    outcome: input.outcome,
    signal: input.signal,
    timeoutMs: input.timeoutMs,
  }, async signal => {
    const response = await fetch(`https://api.stripe.com${input.path}`, {
      method,
      headers: {
        authorization: `Bearer ${input.secretKey}`,
        ...(input.form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        ...(method === "POST" && input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : {}),
      },
      ...(input.form ? { body: input.form } : {}),
      cache: "no-store",
      signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json() as T,
    };
  });
}
