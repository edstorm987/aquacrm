import {
  isRemoteOperationError,
  withRemoteOperationDeadline,
  type RemoteOperationRetry,
} from "@/lib/server/remoteOperation";
import { assertLiveProviderAccess } from "@/lib/server/sandbox/providerPolicy";

type ResendEmailInput = {
  apiKey?: string;
  from: string;
  to: string | string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type ResendEmailResult =
  | { ok: true; id?: string }
  | {
      ok: false;
      reason: string;
      unconfigured?: boolean;
      code?: "REMOTE_OPERATION_TIMEOUT" | "REMOTE_OPERATION_ABORTED" | "REMOTE_OPERATION_FAILED";
      outcomeUnknown?: boolean;
      retry?: RemoteOperationRetry;
    };

function failureReason(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `Resend returned ${status}.`;
}

export async function sendResendEmail(input: ResendEmailInput): Promise<ResendEmailResult> {
  const apiKey = input.apiKey?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "RESEND_API_KEY is required.", unconfigured: true };
  }

  try {
    assertLiveProviderAccess("Resend email delivery");
    const { response, payload } = await withRemoteOperationDeadline({
      operation: "Resend email delivery",
      budget: "providerWrite",
      outcome: input.idempotencyKey ? "idempotent-write" : "non-idempotent-write",
      signal: input.signal,
      timeoutMs: input.timeoutMs,
    }, async signal => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: input.from,
          to: Array.isArray(input.to) ? input.to : [input.to],
          reply_to: input.replyTo || undefined,
          subject: input.subject,
          text: input.text,
          html: input.html,
          attachments: input.attachments?.map(attachment => ({
            filename: attachment.filename,
            content: attachment.content,
            content_type: attachment.contentType,
          })),
        }),
        cache: "no-store",
        signal,
      });
      const payload = await response.json().catch(() => null) as { id?: unknown } | null;
      return { response, payload };
    });

    if (!response.ok) return { ok: false, reason: failureReason(payload, response.status) };
    return { ok: true, id: typeof payload?.id === "string" ? payload.id : undefined };
  } catch (error) {
    if (isRemoteOperationError(error)) {
      return {
        ok: false,
        reason: error.message,
        code: error.code,
        outcomeUnknown: error.outcomeUnknown,
        retry: error.retry,
      };
    }
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Resend request failed.",
    };
  }
}
