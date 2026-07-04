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
  apiKeyMasked?: string;             // last 4 chars only; full key in install.config
  defaultFromIdentityId?: string;
  webhookSecret?: string;            // for delivery-status webhook signature verify
  status: ProviderStatus;
  testedAt?: number;
  errorMessage?: string;
  // SMTP transport config (populated when provider === "smtp"). The
  // password lives in the same private slot as `apiKey` so it never
  // round-trips through API responses.
  smtp?: SmtpConfig;
  updatedAt: number;
}

export interface UpdateProviderInput {
  provider?: ProviderKind;
  apiKey?: string;                   // full key — masked + stored in install.config
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
  createdAt: number;
  updatedAt: number;
}

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
