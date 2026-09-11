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

// Nodemailer is loaded lazily, at send time, NOT as a static import (#190).
// A static `import nodemailer` pulls Nodemailer's Node-only base64/mime stack —
// with its bare `require('stream')` — into every graph that transitively
// reaches this module. This module is side-effect-registered by `_registry.ts`,
// which the radar probe scheduler drags into the `instrumentation.ts` bundle;
// on the instrumentation/Edge compile Nodemailer's bare Node builtins do not
// resolve and `next dev --webpack` (the documented verification lane) fails to
// compile. The transport is only needed when an SMTP message is actually sent,
// so it is imported inside `nodeSmtpTransport`, exactly as `transactionalEmail.ts`
// and `integrationConnections.ts` already do. `import type` is erased at build
// and creates no runtime edge.
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import {
  defaultDriverRegistry,
  registerEmailSenderFoundation,
  type EmailDriver,
  type SmtpTransport,
} from "@aqua/plugin-email-sender/server";
import { assertFreshWritesAllowed, assertWritesAllowed } from "@/lib/server/auth/securityControl";
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
  const { createTransport } = await import("nodemailer");
  const transport = createTransport(transportOptions);

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

// The plugin stays provider-neutral and testable, while this server-only
// production adapter supplies the incident boundary. Both Postmark HTTP and
// SMTP/Nodemailer therefore pass one tenant-aware check immediately before the
// selected driver can touch its provider.
function guardedEmailDriver(driver: EmailDriver): EmailDriver {
  return {
    kind: driver.kind,
    assertSendAllowed(ctx) {
      assertWritesAllowed("provider.email-plugin.delivery", { tenantId: ctx.agencyId });
    },
    async send(args) {
      await assertFreshWritesAllowed("provider.email-plugin.delivery", { tenantId: args.ctx.agencyId });
      return driver.send(args);
    },
    ...(driver.verifyWebhook ? {
      verifyWebhook: (args: Parameters<NonNullable<EmailDriver["verifyWebhook"]>>[0]) => driver.verifyWebhook!(args),
    } : {}),
    ...(driver.verifyIdentity ? {
      verifyIdentity: (args: Parameters<NonNullable<EmailDriver["verifyIdentity"]>>[0]) => driver.verifyIdentity!(args),
    } : {}),
  };
}

const productionEmailDrivers = new Map(
  [...defaultDriverRegistry(fetch, nodeSmtpTransport)]
    .map(([provider, driver]) => [provider, guardedEmailDriver(driver)] as const),
);

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
