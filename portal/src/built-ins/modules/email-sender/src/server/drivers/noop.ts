// Disabled-provider driver. It never talks to a provider and must never
// fabricate external delivery. DeliveryService normally rejects `none`
// before invoking a driver; this failure is defense in depth for direct use.

import {
  EMAIL_DELIVERY_DISABLED_REASON,
  type EmailMessage,
  type SendFailure,
  type SendResult,
} from "../../lib/domain";
import type { DriverContext, EmailDriver } from "../ports";

export class NoopDriver implements EmailDriver {
  readonly kind = "none" as const;

  async send(_args: { ctx: DriverContext; message: EmailMessage }): Promise<SendResult | SendFailure> {
    return { ok: false, reason: EMAIL_DELIVERY_DISABLED_REASON };
  }
}
