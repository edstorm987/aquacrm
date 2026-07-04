// No-op driver. Doesn't talk to any real provider — just logs to
// activity (foundation's ActivityLogPort) and returns a synthetic
// externalRef. Used when ProviderConfig.provider === "none" (the
// default until an agency configures a real provider) and as the
// smoke-test default.

import { makeId } from "../../lib/ids";
import type { EmailMessage, SendFailure, SendResult } from "../../lib/domain";
import type { DriverContext, EmailDriver } from "../ports";

export class NoopDriver implements EmailDriver {
  readonly kind = "none" as const;

  async send(_args: { ctx: DriverContext; message: EmailMessage }): Promise<SendResult | SendFailure> {
    // Synthesise a stable-looking externalRef so the rest of the
    // pipeline (status update, idempotency) behaves identically.
    return { ok: true, externalRef: `noop_${makeId("ref")}` };
  }
}
