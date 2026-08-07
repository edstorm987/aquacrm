import { sendResendEmail } from "./resendEmail";

interface TransactionalEmailInput {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  agencyId: string;
  clientId?: string;
  externalRef: string;
}

export interface TransactionalEmailResult {
  delivered: boolean;
  via: "resend" | "unconfigured";
  reason?: string;
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.MILESYMEDIA_FROM_EMAIL?.trim();
  if (!apiKey || !fromEmail) {
    return {
      delivered: false,
      via: "unconfigured",
      reason: "RESEND_API_KEY and MILESYMEDIA_FROM_EMAIL are required.",
    };
  }

  const fromName = process.env.MILESYMEDIA_FROM_NAME?.trim() || "Milesymedia";
  const result = await sendResendEmail({
    to: input.to,
    from: `${fromName} <${fromEmail}>`,
    replyTo: process.env.MILESYMEDIA_REPLY_TO?.trim() || fromEmail,
    subject: input.subject,
    text: input.bodyText,
    html: input.bodyHtml,
    idempotencyKey: input.externalRef,
  });
  if (!result.ok) {
    return { delivered: false, via: "resend", reason: result.reason };
  }
  return { delivered: true, via: "resend" };
}
