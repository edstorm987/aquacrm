// SMTP driver. Speaks raw SMTP via an injectable transport so the
// smoke test can assert wire-protocol behaviour without dialing the
// network. Production wires the default `nodeSmtpTransport` which
// uses Node's `net` + `tls` directly — no nodemailer dep.
//
// Wire grammar (per-recipient single message):
//   [TLS handshake if secure==="tls"]
//   < 220 server greeting
//   > EHLO <hostname>
//   < 250-... extensions
//   [if secure==="starttls"]
//     > STARTTLS
//     < 220
//     [TLS handshake]
//     > EHLO <hostname>
//     < 250-...
//   > AUTH LOGIN
//   < 334 base64("Username:")
//   > base64(user)
//   < 334 base64("Password:")
//   > base64(pass)
//   < 235 OK
//   > MAIL FROM:<from@example.com>
//   < 250 OK
//   > RCPT TO:<to@example.com>      (per recipient)
//   < 250 OK
//   > DATA
//   < 354 send body
//   > <headers + CRLF + body + CRLF + "."> CRLF
//   < 250 Queued <id>
//   > QUIT
//   < 221 bye
//
// On any non-2xx/3xx reply (or socket error / timeout) the driver
// returns SendFailure with the reply text. Sends are atomic per call —
// the SmtpDriver doesn't pool connections in v1.

import { makeId } from "../../lib/ids";
import type { EmailMessage, SendFailure, SendResult } from "../../lib/domain";
import type { DriverContext, EmailDriver } from "../ports";

export interface SmtpDialOptions {
  host: string;
  port: number;
  secure: "tls" | "starttls" | "none";
  user: string;
  pass: string;
  message: EmailMessage;
  // Wall-clock budget for the entire send. Default 15s.
  timeoutMs?: number;
  // Hostname to send in EHLO. Defaults to "localhost".
  ehloHost?: string;
}

export interface SmtpDialResult {
  ok: true;
  externalRef: string;
  // Last server reply (e.g. "250 2.0.0 Ok: queued as 1A2B3C") so the
  // operator can read the queue id from delivery events.
  finalReply?: string;
}

export interface SmtpDialFailure {
  ok: false;
  reason: string;
  // SMTP reply code if we got a structured rejection. Useful for
  // detecting auth errors in DeliveryService.markError.
  code?: number;
}

export type SmtpTransport = (opts: SmtpDialOptions) => Promise<SmtpDialResult | SmtpDialFailure>;

// Build an RFC 5322 message body from an EmailMessage. Public so the
// smoke test can assert headers without touching the transport.
export function buildSmtpDataBody(message: EmailMessage, ehloHost = "localhost"): string {
  const lines: string[] = [];
  lines.push(`From: "${message.from.name}" <${message.from.email}>`);
  lines.push(`To: ${message.to.join(", ")}`);
  if (message.cc && message.cc.length > 0) lines.push(`Cc: ${message.cc.join(", ")}`);
  if (message.replyTo) lines.push(`Reply-To: ${message.replyTo}`);
  lines.push(`Subject: ${message.subject}`);
  lines.push(`Message-ID: <${message.id}@${ehloHost}>`);
  lines.push(`MIME-Version: 1.0`);
  // Mixed multipart only when attachments present; v1 keeps it simple.
  const hasHtml = !!message.bodyHtml;
  const hasText = !!message.bodyText;
  if (hasHtml && hasText) {
    const boundary = `mm_${makeId("b")}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: text/plain; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: 7bit`);
    lines.push("");
    lines.push(message.bodyText ?? "");
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: text/html; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: 7bit`);
    lines.push("");
    lines.push(message.bodyHtml ?? "");
    lines.push(`--${boundary}--`);
  } else if (hasHtml) {
    lines.push(`Content-Type: text/html; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: 7bit`);
    lines.push("");
    lines.push(message.bodyHtml ?? "");
  } else {
    lines.push(`Content-Type: text/plain; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: 7bit`);
    lines.push("");
    lines.push(message.bodyText ?? "");
  }
  // Normalise to CRLF + RFC 5321 dot-stuffing: any line starting with
  // "." gets doubled so the SMTP single-dot terminator isn't ambiguous.
  // Body strings often use `\n`; we re-split on `\n` (treating `\r\n`
  // and `\n` uniformly) so the stuffing applies to the body too.
  const out: string[] = [];
  for (const part of lines) {
    for (const sub of part.replace(/\r\n/g, "\n").split("\n")) {
      out.push(sub.startsWith(".") ? "." + sub : sub);
    }
  }
  return out.join("\r\n");
}

// Default transport — Node net/tls. Lazy-imported so plugins that
// never run smtp don't pay the require cost. Returns a placeholder
// implementation that throws "not_implemented" until the foundation
// wires the real one (production needs TLS, STARTTLS, retry, and
// timeout handling we deliberately keep out of plugin code; flagged
// foundation-pending). The smoke injects a deterministic transport.
export const PLACEHOLDER_SMTP_TRANSPORT: SmtpTransport = async () => ({
  ok: false,
  reason: "smtp_transport_not_wired — foundation must inject a real transport (Node net/tls or nodemailer-style).",
});

export class SmtpDriver implements EmailDriver {
  readonly kind = "smtp" as const;
  constructor(private transport: SmtpTransport = PLACEHOLDER_SMTP_TRANSPORT) {}

  async send({ ctx, message }: { ctx: DriverContext; message: EmailMessage }): Promise<SendResult | SendFailure> {
    if (!ctx.smtp) {
      return { ok: false, reason: "SMTP transport config missing." };
    }
    if (!ctx.apiKey) {
      // For provider="smtp", `apiKey` is the SMTP password slot.
      return { ok: false, reason: "SMTP password not configured." };
    }
    const result = await this.transport({
      host: ctx.smtp.host,
      port: ctx.smtp.port,
      secure: ctx.smtp.secure,
      user: ctx.smtp.user,
      pass: ctx.apiKey,
      message,
    });
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }
    return { ok: true, externalRef: result.externalRef };
  }
}
