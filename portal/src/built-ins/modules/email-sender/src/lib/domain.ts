// Email-sender domain. Per-install plugin storage. `scopePolicy: "agency"` —
// install carries the agency's outbound infrastructure config (provider,
// API key, sender identities, default from). Per-client overrides land
// on individual messages via `clientId`.

import type { AgencyId, ClientId, PluginId, UserId } from "./tenancy";

// ─── Provider ────────────────────────────────────────────────────────────

export type ProviderKind = "postmark" | "sendgrid" | "resend" | "smtp" | "none";

export type ProviderStatus = "active" | "unconfigured" | "error";

export interface ProviderConfig {
  agencyId: AgencyId;
  provider: ProviderKind;
  // Last 4 characters only. The full key lives in the plugin's own private
  // storage slot (`provider/api-key`), which is server-side and is never put
  // on `install.config` — that record is handed to page props and so to the
  // browser.
  apiKeyMasked?: string;
  // Postmark's sender-signature API is ACCOUNT-level, so it needs a different
  // credential from the per-server send token. Masked here for the same reason.
  accountTokenMasked?: string;
  defaultFromIdentityId?: string;
  // The webhook SIGNING secret. Server-only: `WebhookService` compares it
  // against what the provider sends. It is a credential like the tokens
  // above, so it never leaves the server — see `PublicProviderConfig`.
  webhookSecret?: string;
  status: ProviderStatus;
  testedAt?: number;
  errorMessage?: string;
  // SMTP transport config (populated when provider === "smtp"). The
  // password lives in the same private slot as `apiKey` so it never
  // round-trips through API responses.
  smtp?: SmtpConfig;
  updatedAt: number;
}

/**
 * `ProviderConfig` as anything outside the server may see it.
 *
 * The send token and the account token were already masked on the row, but the
 * webhook signing secret was not: it sat on `ProviderConfig` in clear text, so
 * returning that row from an API route — or handing it to a client component as
 * a prop — puts a signing secret in the browser. It is verifying evidence that
 * a webhook really came from the provider, so it gets the same treatment as the
 * other two: a 4-character tail, and a blank box means "keep the stored one".
 *
 * Server code keeps using `ProviderConfig` (WebhookService needs the real
 * value); every outward-facing surface uses this.
 */
export type PublicProviderConfig = Omit<ProviderConfig, "webhookSecret"> & {
  webhookSecretMasked?: string;
};

export interface UpdateProviderInput {
  provider?: ProviderKind;
  apiKey?: string;                   // full key — masked in the config row, stored privately
  accountToken?: string;             // Postmark account-level token, same treatment
  defaultFromIdentityId?: string;
  webhookSecret?: string;
  smtp?: SmtpConfig;
}

// SMTP transport config. Public part — the password is stored
// separately under the same private slot used by Postmark's apiKey
// (so PROVIDER_API_KEY = SMTP password when provider === "smtp").
export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  // "tls" — implicit TLS on port 465.
  // "starttls" — STARTTLS upgrade on port 587 / 25.
  // "none" — plain SMTP (test only; never use in prod).
  secure: "tls" | "starttls" | "none";
}

// ─── Sender identity ─────────────────────────────────────────────────────

export type SenderIdentityStatus = "active" | "pending" | "failed";

export interface SenderIdentity {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;
  name: string;
  email: string;
  verifiedAt?: number;
  isDefault: boolean;
  status: SenderIdentityStatus;
  // ── Verification evidence ──────────────────────────────────────────────
  //
  // `status: "active"` is a claim that the ACTIVE PROVIDER confirmed this
  // address. These three fields are what makes that claim checkable, and they
  // exist because it used to be unearned: `verifyDomain` marked any address
  // active on the spot without asking anybody.
  //
  //  • `verificationSource` — which provider vouched, e.g. "postmark".
  //  • `verificationCheckedAt` — when we last ASKED (set on success and on
  //    failure, so "we tried and were told no" is distinguishable from
  //    "nobody has ever asked").
  //  • `verificationError` — why the last attempt did not produce evidence.
  verificationSource?: ProviderKind;
  verificationCheckedAt?: number;
  verificationError?: string;
  createdAt: number;
  updatedAt: number;
}

/** What a driver answers when asked to confirm a sender address. */
export type IdentityVerification =
  | { verified: true; evidence: string }
  | { verified: false; reason: string };

export interface CreateIdentityInput {
  name: string;
  email: string;
  clientId?: ClientId;
  isDefault?: boolean;
}

export interface UpdateIdentityPatch {
  name?: string;
  email?: string;
  isDefault?: boolean;
  status?: SenderIdentityStatus;
}

// ─── EmailMessage ────────────────────────────────────────────────────────

export type EmailStatus = "queued" | "sending" | "sent" | "failed" | "bounced";

export interface EmailAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
}

export interface EmailFrom {
  name: string;
  email: string;
}

export interface EmailMessage {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;
  to: string[];
  cc?: string[];
  bcc?: string[];
  from: EmailFrom;
  replyTo?: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  templateId?: string;
  templateValues?: Record<string, string>;
  attachments?: EmailAttachment[];
  status: EmailStatus;
  failureReason?: string;
  externalRef?: string;              // Postmark/SendGrid message id
  scheduledFor?: number;             // null = send asap
  sentAt?: number;
  createdAt: number;
  updatedAt: number;
  triggeredByPlugin?: PluginId;      // "memberships"|"forms"|"affiliates"|...
  // Idempotency key. fnv1a(triggeredByPlugin + ":" + externalRef-or-payloadHash).
  // Re-enqueue with the same key collapses onto the prior row.
  idempotencyKey: string;
}

export interface EnqueueInput {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  from?: EmailFrom;                  // defaults to provider's default identity
  replyTo?: string;
  subject?: string;                  // optional when templateId set; template's subject wins
  bodyHtml?: string;
  bodyText?: string;
  templateId?: string;
  templateValues?: Record<string, string>;
  attachments?: EmailAttachment[];
  scheduledFor?: number;
  triggeredByPlugin?: PluginId;
  externalRef?: string;              // caller-supplied for cross-plugin idempotency
  clientId?: ClientId;
}

export interface MessageFilter {
  status?: EmailStatus;
  triggeredByPlugin?: PluginId;
  fromCreatedAt?: number;
  toCreatedAt?: number;
}

// ─── Webhook event ───────────────────────────────────────────────────────

export type WebhookEventKind = "Delivery" | "Bounce" | "SpamComplaint" | "Open";

export interface WebhookEventSeen {
  id: string;
  eventId: string;                   // provider's webhook id
  receivedAt: number;
}

export interface PostmarkWebhookEvent {
  RecordType: WebhookEventKind;
  MessageID: string;                 // Postmark message id
  Recipient?: string;
  DeliveredAt?: string;
  BouncedAt?: string;
  Type?: string;                     // bounce type
  Description?: string;
  // Internal — set by the webhook signature verifier.
  _verified?: boolean;
}

// ─── Send result ─────────────────────────────────────────────────────────

export interface SendResult {
  ok: true;
  externalRef: string;
}

export interface SendFailure {
  ok: false;
  reason: string;
}

export const EMAIL_DELIVERY_DISABLED_REASON =
  "Email delivery is disabled because no provider is configured. The message remains queued.";

// ─── Cross-plugin event payloads ─────────────────────────────────────────

export interface EmailDeliveredEvent {
  messageId: string;
  externalRef?: string;
  recipient: string;
  occurredAt: number;
}

export interface EmailBouncedEvent {
  messageId: string;
  externalRef?: string;
  recipient: string;
  bounceType?: string;
  description?: string;
  occurredAt: number;
}

// ─── Cross-plugin event subscriber descriptor ────────────────────────────
//
// Foundation's R6 event router reads these declarations off the
// foundationAdapter at boot and subscribes the matching handler. The
// shape is plain data so the registry can inspect without invoking.

export type SubscribedEventName =
  | "forms.notification.requested"
  | "membership.subscription_changed"
  | "affiliate.payout_completed"
  | "auth.bootstrap.signup";

export interface EventSubscription {
  event: SubscribedEventName;
  handler: string;                   // method name on EmailService — invoked via reflection
  description: string;
}

// Used by the EmailService to remember that a particular triggered-by
// payload has already produced a message. Stored under
// `email/idem/<key>` → messageId.
export interface IdempotencyEntry {
  messageId: string;
  triggeredByPlugin?: PluginId;
  externalRef?: string;
  createdAt: number;
}

export type { UserId };
