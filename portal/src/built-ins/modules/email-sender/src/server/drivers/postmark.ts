// Postmark driver. POSTs to Postmark's `/email` endpoint with the
// X-Postmark-Server-Token header. Webhook verification and sender-signature
// verification live here too.
//
// Credentials are supplied per agency through the plugin's own Settings page,
// which writes them into the module's private provider slots — never onto
// `install.config`, which reaches the browser. The driver itself is small and
// has no @postmark/* dependency — it uses fetch, injectable for tests.

import type {
  EmailMessage,
  IdentityVerification,
  PostmarkWebhookEvent,
  SendFailure,
  SendResult,
  SenderIdentity,
} from "../../lib/domain";
import type { DriverContext, EmailDriver } from "../ports";

const POSTMARK_API = "https://api.postmarkapp.com/email";
// Sender signatures are an ACCOUNT-level resource: this endpoint refuses the
// per-server send token, which is why `DriverContext.accountToken` exists.
const POSTMARK_SENDERS_API = "https://api.postmarkapp.com/senders?count=500&offset=0";

export const POSTMARK_ACCOUNT_TOKEN_MISSING =
  "Postmark's sender-signature API needs the account-level API token. "
  + "Add the Postmark account token in Email sender → Settings, then verify again.";

interface PostmarkSenderSignature {
  ID?: number;
  EmailAddress?: string;
  Confirmed?: boolean;
}

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

  // Ask Postmark whether this address is a CONFIRMED sender signature.
  //
  // The answer is Postmark's, not ours: an address it has never heard of, or
  // one whose confirmation email nobody clicked, comes back unverified with
  // the reason said out loud. There is deliberately no local shortcut — the
  // previous implementation of this step stamped every address "active" the
  // moment somebody pressed the button, which read exactly like a real check.
  async verifyIdentity({ ctx, identity }: {
    ctx: DriverContext;
    identity: SenderIdentity;
  }): Promise<IdentityVerification> {
    if (!ctx.accountToken) {
      return { verified: false, reason: POSTMARK_ACCOUNT_TOKEN_MISSING };
    }
    let res: Response;
    try {
      res = await this.fetchImpl(POSTMARK_SENDERS_API, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "X-Postmark-Account-Token": ctx.accountToken,
        },
      });
    } catch (err) {
      return { verified: false, reason: err instanceof Error ? err.message : String(err) };
    }
    let payload: unknown;
    try { payload = await res.json(); }
    catch { payload = null; }
    if (!res.ok) {
      const message = (payload as { Message?: string } | null)?.Message;
      return { verified: false, reason: message ?? `Postmark ${res.status} when listing sender signatures.` };
    }
    const signatures = (payload as { SenderSignatures?: PostmarkSenderSignature[] } | null)?.SenderSignatures;
    if (!Array.isArray(signatures)) {
      return { verified: false, reason: "Postmark response did not contain SenderSignatures." };
    }
    const wanted = identity.email.trim().toLowerCase();
    const match = signatures.find(s => (s.EmailAddress ?? "").trim().toLowerCase() === wanted);
    if (!match) {
      return {
        verified: false,
        reason: `Postmark has no sender signature for ${identity.email}. Add it in Postmark and confirm the email it sends.`,
      };
    }
    if (!match.Confirmed) {
      return {
        verified: false,
        reason: `Postmark has ${identity.email} but it is not confirmed yet — the confirmation email has not been actioned.`,
      };
    }
    return {
      verified: true,
      evidence: `Postmark sender signature ${match.ID ?? "?"} is confirmed for ${identity.email}.`,
    };
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
