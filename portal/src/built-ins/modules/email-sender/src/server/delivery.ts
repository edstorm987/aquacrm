// DeliveryService — runs the actual provider call. Picks the driver
// for the agency's configured provider, calls send(), updates the
// message status accordingly. Idempotent on (messageId, externalRef)
// because EmailService transitions guard against double-sending.

import type { AgencyId } from "../lib/tenancy";
import type { EmailMessage, ProviderKind } from "../lib/domain";
import type { DriverContext, EmailDriver } from "./ports";
import type { EmailService } from "./emails";
import type { ProviderService } from "./provider";

export class DeliveryService {
  constructor(
    private agencyId: AgencyId,
    private emails: EmailService,
    private provider: ProviderService,
    private drivers: Map<ProviderKind, EmailDriver>,
  ) {}

  async deliver(messageId: string): Promise<{ ok: boolean; externalRef?: string; reason?: string }> {
    const message = await this.emails.get(messageId);
    if (!message) return { ok: false, reason: "Message not found." };
    if (message.status === "sent") {
      return { ok: true, externalRef: message.externalRef };
    }
    if (message.status === "failed" || message.status === "bounced") {
      return { ok: false, reason: `Message in terminal state ${message.status}.` };
    }

    // Flip queued → sending so concurrent delivery attempts don't double-fire.
    const sending = await this.emails.markSending(messageId);
    if (!sending || sending.status !== "sending") {
      // Concurrent delivery beat us; just check the final state.
      const final = await this.emails.get(messageId);
      if (final?.status === "sent") return { ok: true, externalRef: final.externalRef };
      return { ok: false, reason: "Message could not be marked sending." };
    }

    const cfg = await this.provider.get();
    const driver = this.drivers.get(cfg.provider);
    if (!driver) {
      const reason = `No driver registered for provider ${cfg.provider}.`;
      await this.emails.markFailed(messageId, reason);
      return { ok: false, reason };
    }
    const apiKey = await this.provider._readApiKey();
    const ctx: DriverContext = {
      apiKey,
      webhookSecret: cfg.webhookSecret,
      agencyId: this.agencyId,
      ...(cfg.smtp ? { smtp: cfg.smtp } : {}),
    };
    const result = await driver.send({ ctx, message: sending });
    if (result.ok) {
      await this.emails.markSent(messageId, result.externalRef);
      await this.provider.markActive();
      return { ok: true, externalRef: result.externalRef };
    }
    await this.emails.markFailed(messageId, result.reason);
    if (looksLikeAuthError(result.reason)) {
      await this.provider.markError(result.reason);
    }
    return { ok: false, reason: result.reason };
  }

  // Retry a previously-failed message. Callable from OutboxPage's
  // retry button. Resets to queued + delivers.
  async retry(messageId: string): Promise<{ ok: boolean; externalRef?: string; reason?: string }> {
    const message = await this.emails.get(messageId);
    if (!message) return { ok: false, reason: "Message not found." };
    if (message.status !== "failed" && message.status !== "bounced") {
      return { ok: false, reason: `Cannot retry ${message.status} message.` };
    }
    const reset = await this.emails.resetForRetry(messageId);
    if (!reset) return { ok: false, reason: "Could not reset message for retry." };
    return this.deliver(messageId);
  }
}

function looksLikeAuthError(reason: string): boolean {
  const lower = reason.toLowerCase();
  return lower.includes("auth") || lower.includes("unauthor") || lower.includes("api key") || lower.includes("forbidden");
}
