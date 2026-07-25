// Webhook service. Verifies the provider's signed payload via the
// active driver, then updates the matching EmailMessage status +
// emits email.delivered / email.bounced events. Idempotent on
// provider event id (Postmark sends the same delivery callback up
// to a few times).
//
// Storage:
//   webhook/seen/<eventId>     → WebhookEventSeen

import { now } from "../lib/time";
import type { AgencyId } from "../lib/tenancy";
import type {
  PostmarkWebhookEvent,
  WebhookEventSeen,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EmailDriver,
  EventBusPort,
  StoragePort,
} from "./ports";
import type { EmailService } from "./emails";
import type { ProviderService } from "./provider";

const seenKey = (eventId: string): string => `webhook/seen/${eventId}`;

export interface WebhookHandleResult {
  ok: boolean;
  duplicate?: boolean;
  applied?: boolean;
  eventKind?: string;
  error?: string;
}

export class WebhookService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private emails: EmailService,
    private provider: ProviderService,
    private drivers: Map<string, EmailDriver>,
  ) {}

  async handle(args: { rawBody: string; signatureHeader: string }): Promise<WebhookHandleResult> {
    const cfg = await this.provider.get();
    const driver = this.drivers.get(cfg.provider);
    if (!driver?.verifyWebhook) {
      return { ok: false, error: `Provider ${cfg.provider} doesn't support webhooks.` };
    }
    const apiKey = await this.provider._readApiKey();
    const event = await driver.verifyWebhook({
      ctx: { apiKey, webhookSecret: cfg.webhookSecret, agencyId: this.agencyId },
      rawBody: args.rawBody,
      signatureHeader: args.signatureHeader,
    });
    if (!event) return { ok: false, error: "signature verification failed" };
    return this.apply(event);
  }

  // Direct entry point for tests / replay tooling.
  async apply(event: PostmarkWebhookEvent): Promise<WebhookHandleResult> {
    const eventId = `${event.RecordType}:${event.MessageID}`;
    const seen = await this.storage.get<WebhookEventSeen>(seenKey(eventId));
    if (seen) {
      return { ok: true, duplicate: true, applied: false, eventKind: event.RecordType };
    }
    await this.storage.set(seenKey(eventId), {
      id: eventId,
      eventId,
      receivedAt: now(),
    } satisfies WebhookEventSeen);

    const message = await this.emails.getByExternalRef(event.MessageID);
    if (!message) {
      // Unknown message — record the event seen (so we don't keep
      // reprocessing) and return ok-but-not-applied.
      return { ok: true, duplicate: false, applied: false, eventKind: event.RecordType };
    }

    let applied = false;
    switch (event.RecordType) {
      case "Delivery": {
        const recipient = event.Recipient ?? message.to[0] ?? "";
        // Status stays "sent" — Postmark fires Delivery after a successful
        // send. We just emit the public event for downstream consumers
        // (CRM activity timeline, etc.).
        this.events.emit({ agencyId: this.agencyId, clientId: message.clientId }, "email.delivered", {
          messageId: message.id,
          externalRef: message.externalRef,
          recipient,
          occurredAt: now(),
        });
        await this.activity.logActivity({
          agencyId: this.agencyId,
          clientId: message.clientId,
          category: "email",
          action: "email.delivered",
          message: `Email delivered to ${recipient}.`,
          metadata: { messageId: message.id, externalRef: message.externalRef },
        });
        applied = true;
        break;
      }
      case "Bounce": {
        await this.emails.markBounced(message.id, event.Description ?? event.Type);
        await this.activity.logActivity({
          agencyId: this.agencyId,
          clientId: message.clientId,
          category: "email",
          action: "email.bounced",
          message: `Email bounced${event.Type ? ` (${event.Type})` : ""}: ${event.Description ?? "unknown"}.`,
          metadata: { messageId: message.id, type: event.Type },
        });
        applied = true;
        break;
      }
      case "SpamComplaint": {
        this.events.emit({ agencyId: this.agencyId, clientId: message.clientId }, "email.spam_complaint", {
          messageId: message.id,
          recipient: event.Recipient,
        });
        applied = true;
        break;
      }
      case "Open": {
        this.events.emit({ agencyId: this.agencyId, clientId: message.clientId }, "email.opened", {
          messageId: message.id,
          recipient: event.Recipient,
        });
        applied = true;
        break;
      }
    }
    return { ok: true, duplicate: false, applied, eventKind: event.RecordType };
  }
}
