import { sendResendEmail } from "./resendEmail";
import { resolveIntegrationValues } from "./integrationConnections";

interface TransactionalEmailInput {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  agencyId: string;
  clientId?: string;
  fromName?: string;
  externalRef: string;
}

export interface TransactionalEmailResult {
  delivered: boolean;
  via: "resend" | "unconfigured";
  reason?: string;
}

export interface TransactionalEmailReadiness {
  configured: boolean;
  reason?: string;
}

export function transactionalEmailReadiness(
  agencyId: string,
  clientId?: string,
): TransactionalEmailReadiness {
  const managed = resolveIntegrationValues(agencyId, "resend", { clientId });
  const apiKey = managed.apiKey || process.env.RESEND_API_KEY?.trim();
  const fromEmail = managed.fromEmail || process.env.MILESYMEDIA_FROM_EMAIL?.trim();
  return apiKey && fromEmail
    ? { configured: true }
    : {
        configured: false,
        reason: "Connect Resend and add a sender email in Company -> Connections.",
      };
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult> {
  const managed = resolveIntegrationValues(input.agencyId, "resend", { clientId: input.clientId });
  const apiKey = managed.apiKey || process.env.RESEND_API_KEY?.trim();
  const fromEmail = managed.fromEmail || process.env.MILESYMEDIA_FROM_EMAIL?.trim();
  if (!apiKey || !fromEmail) {
    return {
      delivered: false,
      via: "unconfigured",
      reason: "Connect Resend and add a sender email in Company → Connections.",
    };
  }

  const fromName = input.fromName?.trim() || managed.fromName || process.env.MILESYMEDIA_FROM_NAME?.trim() || "AquaOasis-Web";
  const result = await sendResendEmail({
    apiKey,
    to: input.to,
    from: `${fromName} <${fromEmail}>`,
    replyTo: managed.replyTo || process.env.MILESYMEDIA_REPLY_TO?.trim() || fromEmail,
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
