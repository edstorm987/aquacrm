import { mayUseEnvironmentCredentials } from "@/lib/server/auth/founderAgency";
import { sendResendEmail } from "@/lib/server/email/resendEmail";
import { assertLiveProviderAccess } from "@/lib/server/sandbox/providerPolicy";
import { resolveScopedIntegrationConnectionValues, resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";

interface TransactionalEmailInput {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  agencyId: string;
  clientId?: string;
  fromName?: string;
  externalRef: string;
  signal?: AbortSignal;
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
  // Same rule as integration credentials: the env sender is the FOUNDER'S. If
  // any agency could count it as "configured", a new company would never be
  // prompted to connect Resend — and its mail would go out as his address.
  const envSender = mayUseEnvironmentCredentials(agencyId);
  const resendReady = Boolean(
    (resend.apiKey || (envSender && process.env.RESEND_API_KEY?.trim()))
    && (resend.fromEmail || (envSender && process.env.MILESYMEDIA_FROM_EMAIL?.trim())),
  );
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
  assertLiveProviderAccess("Transactional email delivery");
  const workspace = getAgencyWorkspaceSettings(input.agencyId);
  const requestedProvider = input.sender?.provider;
  const requestedValues = input.sender?.connectionId
    ? resolveScopedIntegrationConnectionValues(input.agencyId, input.sender.connectionId, input.clientId)
    : requestedProvider
      ? resolveIntegrationValues(input.agencyId, requestedProvider, { clientId: input.clientId })
      : null;
  const resend = requestedProvider === "smtp"
    ? {}
    : requestedValues ?? resolveIntegrationValues(input.agencyId, "resend", { clientId: input.clientId });
  const smtp = requestedProvider === "resend"
    ? {}
    : requestedValues ?? resolveIntegrationValues(input.agencyId, "smtp", { clientId: input.clientId });
  // ── The founder gate, applied to the SEND path at last ──────────────────
  //
  // The readiness check above has always gated the environment credentials on
  // `mayUseEnvironmentCredentials`; this line did not — so the UI told a
  // second agency "not connected" while its mail went out on the founder's
  // key, from his address, with his reply-to. Documented for months in
  // env-and-sellability.md §1.1 as deliberately unfixed; RESOLVED 2026-08-30
  // because the scouting outreach work multiplies traffic through this path
  // and a public demo tenant is on the roadmap. The realm fence protects
  // sandboxes; this protects LIVE tenants that are not the founder's.
  //
  // smoke-transactional-email.test.ts pinned the OLD behaviour and was
  // updated in the same change — that is the decision being recorded, not a
  // test drifting.
  const envMailAllowed = mayUseEnvironmentCredentials(input.agencyId);
  const apiKey = resend.apiKey || (!requestedProvider && envMailAllowed ? process.env.RESEND_API_KEY?.trim() : undefined);
  const resendFromEmail = resend.fromEmail || (!requestedProvider && envMailAllowed ? process.env.MILESYMEDIA_FROM_EMAIL?.trim() : undefined);

  if (apiKey && resendFromEmail) {
    // The founder's display name and reply-to are environment values too — a
    // buyer with their OWN key still inherited them, so replies routed to the
    // wrong business (Ed's finding, 2026-08-30). Same gate as the key.
    const fromName = input.fromName?.trim() || resend.fromName || workspace.legalName
      || (envMailAllowed ? process.env.MILESYMEDIA_FROM_NAME?.trim() : undefined) || "AquaCRM";
    const result = await sendResendEmail({
      apiKey,
      to: input.to,
      from: `${fromName} <${resendFromEmail}>`,
      replyTo: resend.replyTo || workspace.supportEmail || (envMailAllowed ? process.env.MILESYMEDIA_REPLY_TO?.trim() : undefined) || resendFromEmail,
      subject: input.subject,
      text: input.bodyText,
      html: input.bodyHtml,
      attachments: input.attachments?.map(attachment => ({
        filename: attachment.filename,
        content: attachment.content.toString("base64"),
        contentType: attachment.contentType,
      })),
      idempotencyKey: input.externalRef,
      signal: input.signal,
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
      const fromName = input.fromName?.trim() || smtp.fromName || workspace.legalName || "AquaOasis-Web";
      await transport.sendMail({
        to: input.to,
        from: { name: fromName, address: smtp.fromEmail },
        replyTo: smtp.replyTo || workspace.supportEmail || smtp.fromEmail,
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
