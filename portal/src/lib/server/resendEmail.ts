type ResendEmailInput = {
  from: string;
  to: string | string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
};

export type ResendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; reason: string; unconfigured?: boolean };

function failureReason(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `Resend returned ${status}.`;
}

export async function sendResendEmail(input: ResendEmailInput): Promise<ResendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "RESEND_API_KEY is required.", unconfigured: true };
  }

  try {
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
      }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null) as { id?: unknown } | null;
    if (!response.ok) return { ok: false, reason: failureReason(payload, response.status) };
    return { ok: true, id: typeof payload?.id === "string" ? payload.id : undefined };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Resend request failed.",
    };
  }
}
