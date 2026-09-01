import "server-only";
// Email-sender plugin foundation registration. Closes Gap #3 from
// the chapter #161 HC → leads-pipeline integration verification —
// without this side-effect import, leads-pipeline's `emailEnqueuePort`
// (chapter #159) and the forgotten-password route (chapter #160)
// both throw "foundation pending" because email-sender's
// `isFoundationRegistered()` returns false.
//
// Mirrors `publicFunnelFoundation.ts` + `leadsPipelineFoundation.ts`
// shape: shared ports from `_foundationPorts.ts`, idempotent
// `registered` flag, boot side-effect call at module bottom.
//
// Email-sender's TenantPort shape is `{ getAgency }` (not the broader
// `{ getClient, getClientForAgency }` of the shared tenantPort);
// foundation runtime types do the validation, the structural cast
// bridges TypeScript — same pattern every other plugin uses.
//
// The plugin keeps its provider-neutral driver contracts, while this
// server-only adapter owns the Node transport. Postmark uses fetch directly;
// SMTP is injected here through Nodemailer so choosing SMTP in the mounted
// Settings page is a real production path rather than the plugin's safe
// placeholder transport. SendGrid and Resend remain visibly labelled as
// unavailable in Settings until their own drivers ship.

import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import {
  defaultDriverRegistry,
  registerEmailSenderFoundation,
  type SmtpTransport,
} from "@aqua/plugin-email-sender/server";
import { getAgency } from "@/server/tenants";
import {
  activityPort,
  eventBusPort,
  pluginInstallStorePort,
} from "./_foundationPorts";

// Email-sender uses `getAgency` rather than the shared tenantPort's
// client-scoped methods. Wrap so the structural shape lines up.
const emailSenderTenantPort = {
  getAgency(id: string) {
    return getAgency(id);
  },
};

/**
 * Production SMTP transport for the provider-neutral Email Sender module.
 *
 * Keeping this in the server-only foundation avoids leaking Node's socket/TLS
 * dependencies into the plugin's browser graph. Nodemailer owns protocol
 * negotiation, certificate validation and deadlines; the plugin still owns
 * tenant configuration, delivery state and retry behaviour.
 */
export const nodeSmtpTransport: SmtpTransport = async options => {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const transportOptions: SMTPTransport.Options = {
    host: options.host,
    port: options.port,
    secure: options.secure === "tls",
    requireTLS: options.secure === "starttls",
    ignoreTLS: options.secure === "none",
    auth: options.user ? { user: options.user, pass: options.pass } : undefined,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  };
  const transport = nodemailer.createTransport(transportOptions);

  try {
    const result = await transport.sendMail({
      from: { name: options.message.from.name, address: options.message.from.email },
      to: options.message.to,
      cc: options.message.cc,
      bcc: options.message.bcc,
      replyTo: options.message.replyTo,
      subject: options.message.subject,
      text: options.message.bodyText,
      html: options.message.bodyHtml,
      attachments: options.message.attachments?.map(attachment => ({
        filename: attachment.filename,
        content: attachment.contentBase64,
        encoding: "base64" as const,
        contentType: attachment.contentType,
      })),
      messageId: `<${options.message.id}@${options.ehloHost ?? "aquacrm.local"}>`,
    });
    const externalRef = result.messageId || result.response;
    if (!externalRef) {
      return { ok: false, reason: "SMTP accepted the message without returning a delivery reference." };
    }
    return { ok: true, externalRef, finalReply: result.response };
  } catch (error) {
    const smtpError = error as Error & { responseCode?: number; response?: string };
    return {
      ok: false,
      reason: smtpError.response || smtpError.message || "SMTP delivery failed.",
      code: smtpError.responseCode,
    };
  } finally {
    transport.close();
  }
};

const productionEmailDrivers = defaultDriverRegistry(fetch, nodeSmtpTransport);

let registered = false;

export function ensureEmailSenderFoundationRegistered(): void {
  if (registered) return;
  registerEmailSenderFoundation({
    tenant: emailSenderTenantPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
    drivers: productionEmailDrivers,
    // marketingTemplates intentionally omitted — agency-marketing
    // exposes its own template store via its plugin foundation; when
    // both are installed in the same agency, the cross-plugin wiring
    // lands in a future round (foundation R6 router work).
  } as unknown as Parameters<typeof registerEmailSenderFoundation>[0]);
  registered = true;
}

ensureEmailSenderFoundationRegistered();
