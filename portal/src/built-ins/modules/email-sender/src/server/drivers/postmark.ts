// Postmark driver. POSTs to Postmark's `/email` endpoint with the
// X-Postmark-Server-Token header. Webhook verification lives here too.
//
// Real production wiring is the user's job (set Postmark API key in
// install.config + verify domain in ProviderConfig). The driver
// itself is small + has no @postmark/* dependency — uses fetch.

import type {
  EmailMessage,
  PostmarkWebhookEvent,
  SendFailure,
  SendResult,
} from "../../lib/domain";
import type { DriverContext, EmailDriver } from "../ports";

const POSTMARK_API = "https://api.postmarkapp.com/email";

export class PostmarkDriver implements EmailDriver {
  readonly kind = "postmark" as const;

  // Allow the smoke test to inject a fetch implementation. Production
  // resolves via the global.
  constructor(private fetchImpl: typeof fetch = fetch) {}

  async send({ ctx, message }: { ctx: DriverContext; message: EmailMessage }): Promise<SendResult | SendFailure> {
    if (!ctx.apiKey) {
      return { ok: false, reason: "Postmark API key not configured." };
    }
    const body = {
      From: `${message.from.name} <${message.from.email}>`,
      To: message.to.join(", "),
      Cc: message.cc?.join(", "),
      Bcc: message.bcc?.join(", "),
      Subject: message.subject,
      HtmlBody: message.bodyHtml,
      TextBody: message.bodyText,
      ReplyTo: message.replyTo,
      MessageStream: "outbound",
      Attachments: message.attachments?.map(a => ({
        Name: a.filename,
        Content: a.contentBase64,
        ContentType: a.contentType,
      })),
    };
    let res: Response;
    try {
      res = await this.fetchImpl(POSTMARK_API, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": ctx.apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    let payload: unknown;
    try { payload = await res.json(); }
    catch { payload = null; }
    if (!res.ok) {
      const reason = (payload as { Message?: string } | null)?.Message ?? `Postmark ${res.status}`;
      return { ok: false, reason };
    }
    const messageId = (payload as { MessageID?: string } | null)?.MessageID;
    if (!messageId) {
      return { ok: false, reason: "Postmark response missing MessageID." };
    }
    return { ok: true, externalRef: messageId };
  }

  // Postmark webhook signature is the per-server "Webhook secret" the
  // agency sets in Postmark dashboard. They send it as a query param
  // `?secret=<value>` on each delivery callback. v1 verification:
  // exact-match comparison. (Postmark also offers basic auth on the
  // webhook URL; same comparison applies.)
  async verifyWebhook({ ctx, rawBody, signatureHeader }: {
    ctx: DriverContext;
    rawBody: string;
    signatureHeader: string;
  }): Promise<PostmarkWebhookEvent | null> {
    if (!ctx.webhookSecret) return null;
    if (signatureHeader !== ctx.webhookSecret) return null;
    try {
      const event = JSON.parse(rawBody) as PostmarkWebhookEvent;
      if (!event.RecordType || !event.MessageID) return null;
      return { ...event, _verified: true };
    } catch {
      return null;
    }
  }
}
