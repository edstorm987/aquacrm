type RetryableWebhookStatus = 500 | 502 | 503;
type PublicWebhookProvider =
  | "stripe-affiliates"
  | "stripe-commercial"
  | "stripe-ecommerce"
  | "stripe-finance"
  | "stripe-memberships";
type PublicWebhookPhase =
  | "account-update"
  | "apply"
  | "configuration"
  | "onboarding-service"
  | "reconcile"
  | "subscription-lookup"
  | "subscription-stop"
  | "transfer-paid"
  | "verification";

function response(
  error: "webhook_refused" | "webhook_unavailable" | "webhook_processing_failed",
  status: 400 | RetryableWebhookStatus,
): Response {
  return new Response(JSON.stringify({
    ok: false,
    error,
    ...(status >= 500 ? { retryable: true } : {}),
  }), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

type WebhookFailureCategory =
  | "invalid_input"
  | "runtime_error"
  | "aggregate_error"
  | "operational_error"
  | "non_error";

/**
 * Keep anonymous-webhook diagnostics useful without handing mutable Error
 * fields to the logger. `name`, `message` and `stack` can all contain provider,
 * tenant or credential detail; only this fixed vocabulary may leave here.
 */
function failureCategory(error: unknown): WebhookFailureCategory {
  if (error instanceof SyntaxError || error instanceof URIError) return "invalid_input";
  if (error instanceof TypeError || error instanceof RangeError || error instanceof ReferenceError) {
    return "runtime_error";
  }
  if (error instanceof AggregateError) return "aggregate_error";
  if (error instanceof Error) return "operational_error";
  return "non_error";
}

/** Expected external refusal. Do not reflect provider/configuration detail. */
export function publicWebhookRefused(): Response {
  return response("webhook_refused", 400);
}

/** Local/provider configuration cannot currently accept a genuine delivery. */
export function publicWebhookUnavailable(
  provider: PublicWebhookProvider,
  phase: PublicWebhookPhase,
  error?: unknown,
): Response {
  console.error(
    `[provider-webhook] ${provider}:${phase} unavailable`,
    ...(error === undefined ? [] : [{ failureCategory: failureCategory(error) }]),
  );
  return response("webhook_unavailable", 503);
}

/** A verified delivery failed during retryable processing. */
export function publicWebhookProcessingFailed(
  provider: PublicWebhookProvider,
  phase: PublicWebhookPhase,
  error: unknown,
  status: RetryableWebhookStatus = 503,
): Response {
  console.error(`[provider-webhook] ${provider}:${phase} failed`, {
    failureCategory: failureCategory(error),
  });
  return response("webhook_processing_failed", status);
}

/** Persistence failed after a plugin mutation. Never log route or error detail. */
export function logPluginDispatcherFlushFailure(error: unknown): void {
  console.error("[plugin-dispatcher] persistence failed", {
    failureCategory: failureCategory(error),
  });
}
