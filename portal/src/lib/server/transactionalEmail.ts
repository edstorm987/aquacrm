import { sendResendEmail } from "./resendEmail";
import { resolveIntegrationConnectionValues, resolveIntegrationValues } from "./integrationConnections";

interface TransactionalEmailInput {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  agencyId: string;
  clientId?: string;
  fromName?: string;
  externalRef: string;
  sender?: { provider: "resend" | "smtp"; connectionId?: string };
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

export interface TransactionalEmailResult {
  delivered: boolean;
  via: "resend" | "smtp" | "unconfigured";
  externalMessageId?: string;
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
  const resend = resolveIntegrationValues(agencyId, "resend", { clientId });
  const smtp = resolveIntegrationValues(agencyId, "smtp", { clientId });
  const resendReady = Boolean((resend.apiKey || process.env.RESEND_API_KEY?.trim()) && (resend.fromEmail || process.env.MILESYMEDIA_FROM_EMAIL?.trim()));
  const smtpReady = Boolean(smtp.host && smtp.port && smtp.username && smtp.password && smtp.fromEmail);
  return resendReady || smtpReady
    ? { configured: true }
    : {
        configured: false,
        reason: "Connect Resend or SMTP and add a sender email in Company -> Connections.",
      };
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult> {
  const requestedProvider = input.sender?.provider;
  const requestedValues = input.sender?.connectionId
    ? resolveIntegrationConnectionValues(input.agencyId, input.sender.connectionId)
    : requestedProvider
      ? resolveIntegrationValues(input.agencyId, requestedProvider, { clientId: input.clientId })
      : null;
  const resend = requestedProvider === "smtp"
    ? {}
    : requestedValues ?? resolveIntegrationValues(input.agencyId, "resend", { clientId: input.clientId });
  const smtp = requestedProvider === "resend"
    ? {}
    : requestedValues ?? resolveIntegrationValues(input.agencyId, "smtp", { clientId: input.clientId });
  const apiKey = resend.apiKey || (!requestedProvider ? process.env.RESEND_API_KEY?.trim() : undefined);
  const resendFromEmail = resend.fromEmail || (!requestedProvider ? process.env.MILESYMEDIA_FROM_EMAIL?.trim() : undefined);

  if (apiKey && resendFromEmail) {
    const fromName = input.fromName?.trim() || resend.fromName || process.env.MILESYMEDIA_FROM_NAME?.trim() || "AquaOasis-Web";
    const result = await sendResendEmail({
      apiKey,
      to: input.to,
      from: `${fromName} <${resendFromEmail}>`,
      replyTo: resend.replyTo || process.env.MILESYMEDIA_REPLY_TO?.trim() || resendFromEmail,
      subject: input.subject,
      text: input.bodyText,
      html: input.bodyHtml,
      attachments: input.attachments?.map(attachment => ({
        filename: attachment.filename,
        content: attachment.content.toString("base64"),
        contentType: attachment.contentType,
      })),
      idempotencyKey: input.externalRef,
    });
    if (!result.ok) return { delivered: false, via: "resend", reason: result.reason };
    return { delivered: true, via: "resend" };
  }

  if (smtp.host && smtp.port && smtp.username && smtp.password && smtp.fromEmail) {
    try {
      const { createTransport } = await import("nodemailer");
      const port = Number(smtp.port);
      const transport = createTransport({
        host: smtp.host,
        port: Number.isFinite(port) ? port : 587,
        secure: port === 465,
        auth: { user: smtp.username, pass: smtp.password },
      });
      const fromName = input.fromName?.trim() || smtp.fromName || "AquaOasis-Web";
      await transport.sendMail({
        to: input.to,
        from: { name: fromName, address: smtp.fromEmail },
        replyTo: smtp.replyTo || smtp.fromEmail,
        subject: input.subject,
        text: input.bodyText,
        html: input.bodyHtml,
        attachments: input.attachments?.map(attachment => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        })),
        headers: { "x-aquacrm-reference": input.externalRef },
      });
      return { delivered: true, via: "smtp" };
    } catch (error) {
      return { delivered: false, via: "smtp", reason: error instanceof Error ? error.message : "SMTP delivery failed." };
    }
  }

  {
    return {
      delivered: false,
      via: "unconfigured",
      reason: "Connect Resend or SMTP and add a sender email in Company → Connections.",
    };
  }
}
