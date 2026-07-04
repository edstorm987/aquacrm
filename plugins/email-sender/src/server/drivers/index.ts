// Driver registry. Maps ProviderKind → driver instance. v1 ships
// postmark + smtp + noop. SendGrid + Resend are R11+ stubs that
// throw on send so the agency knows to switch back to a wired
// provider.

import type { ProviderKind } from "../../lib/domain";
import type { EmailDriver } from "../ports";
import { NoopDriver } from "./noop";
import { PostmarkDriver } from "./postmark";
import { SmtpDriver, type SmtpTransport } from "./smtp";

export class StubDriver implements EmailDriver {
  constructor(public readonly kind: ProviderKind, private message: string) {}
  async send() {
    return { ok: false as const, reason: this.message };
  }
}

// Build the default registry. Tests can substitute by passing their
// own map into `buildEmailSenderContainer({ drivers })`. The
// optional `smtpTransport` arg lets the smoke inject a deterministic
// SMTP transport without mounting Node net/tls.
export function defaultDriverRegistry(
  fetchImpl: typeof fetch = fetch,
  smtpTransport?: SmtpTransport,
): Map<ProviderKind, EmailDriver> {
  const map = new Map<ProviderKind, EmailDriver>();
  map.set("none", new NoopDriver());
  map.set("postmark", new PostmarkDriver(fetchImpl));
  map.set("smtp", new SmtpDriver(smtpTransport));
  map.set("sendgrid", new StubDriver("sendgrid", "SendGrid driver — R11 stub. Switch provider to 'postmark' / 'smtp' / 'none' for now."));
  map.set("resend", new StubDriver("resend", "Resend driver — R11 stub. Switch provider to 'postmark' / 'smtp' / 'none' for now."));
  return map;
}

export { NoopDriver, PostmarkDriver, SmtpDriver };
export { buildSmtpDataBody, PLACEHOLDER_SMTP_TRANSPORT } from "./smtp";
export type { SmtpDialOptions, SmtpDialResult, SmtpDialFailure, SmtpTransport } from "./smtp";
