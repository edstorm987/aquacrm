import { PostmarkDriver } from "@/built-ins/modules/email-sender/src/server/drivers/postmark";
import type { EmailMessage } from "@/built-ins/modules/email-sender/src/lib/domain";

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
  via: "postmark" | "unconfigured";
  reason?: string;
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult> {
  const apiKey = process.env.POSTMARK_SERVER_TOKEN?.trim();
  const fromEmail = process.env.MILESYMEDIA_FROM_EMAIL?.trim();
  if (!apiKey || !fromEmail) {
    return {
      delivered: false,
      via: "unconfigured",
      reason: "POSTMARK_SERVER_TOKEN and MILESYMEDIA_FROM_EMAIL are required.",
    };
  }

  const now = Date.now();
  const message: EmailMessage = {
    id: `system_${now}`,
    agencyId: input.agencyId,
    clientId: input.clientId,
    to: [input.to],
    from: {
      name: process.env.MILESYMEDIA_FROM_NAME?.trim() || "Milesymedia",
      email: fromEmail,
    },
    replyTo: process.env.MILESYMEDIA_REPLY_TO?.trim() || fromEmail,
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    status: "sending",
    externalRef: input.externalRef,
    createdAt: now,
    updatedAt: now,
    triggeredByPlugin: "foundation:auth",
    idempotencyKey: input.externalRef,
  };

  const result = await new PostmarkDriver().send({
    ctx: { apiKey, agencyId: input.agencyId },
    message,
  });
  if (!result.ok) {
    return { delivered: false, via: "postmark", reason: result.reason };
  }
  return { delivered: true, via: "postmark" };
}
