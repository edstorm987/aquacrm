// Foundation port contracts for the email-sender plugin.
//
// Five standard ports + one OPTIONAL MarketingTemplatePort. Send
// happens via a swappable Driver interface (postmark / no-op /
// future sendgrid / future resend) — declared here so foundation
// or smoke can substitute.

import type {
  ActivityCategory,
  ActivityEntry,
  Agency,
  AgencyId,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";

export interface StoragePort {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface TenantPort {
  getAgency(id: AgencyId): Promise<Agency | null> | Agency | null;
}

export interface LogActivityInput {
  agencyId: AgencyId;
  clientId?: ClientId;
  actorUserId?: UserId;
  actorEmail?: string;
  category: ActivityCategory;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ListActivityFilter {
  agencyId: AgencyId;
  clientId?: ClientId;
  limit?: number;
}

export interface ActivityLogPort {
  logActivity(input: LogActivityInput): Promise<ActivityEntry> | ActivityEntry;
  listActivity(filter: ListActivityFilter): Promise<ActivityEntry[]> | ActivityEntry[];
}

export type EmailEventName =
  | "email.queued"
  | "email.sent"
  | "email.failed"
  | "email.delivered"
  | "email.bounced"
  | "email.spam_complaint"
  | "email.opened"
  | "email.identity.created"
  | "email.identity.verified"
  | "email.provider.updated";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: EmailEventName | string,
    payload: T,
  ): void;
}

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): Promise<PluginInstall | null> | PluginInstall | null;
}

// ─── Optional cross-plugin port: agency-marketing's templates ───────────
//
// When agency-marketing is installed for the same agency, foundation
// supplies a port that loads an EmailTemplate by id. Absent →
// EmailService.enqueue with a templateId returns a useful error;
// templateless enqueues still work.

export interface MarketingTemplate {
  id: string;
  agencyId: AgencyId;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}

export interface MarketingTemplatePort {
  getTemplate(args: { agencyId: AgencyId; templateId: string }):
    Promise<MarketingTemplate | null>;
  // Optional — render with substitution. Returns post-substitution
  // strings; agency-marketing already exposes this via templates.renderHtml/renderSubject.
  render?(args: {
    agencyId: AgencyId;
    template: MarketingTemplate;
    vars: Record<string, string>;
  }): Promise<{ subject: string; html: string; text?: string }>;
}

// ─── Driver interface ────────────────────────────────────────────────────
//
// Each provider gets a driver. The DeliveryService picks the right
// one based on ProviderConfig.provider. Smoke tests inject a recording
// driver; production wires Postmark.

import type {
  EmailMessage,
  PostmarkWebhookEvent,
  ProviderKind,
  SendFailure,
  SendResult,
} from "../lib/domain";

export interface DriverContext {
  apiKey?: string;
  webhookSecret?: string;
  agencyId: AgencyId;
  // SMTP-specific transport config. Populated only when the active
  // provider is `smtp` so the SmtpDriver can dial. Other drivers
  // ignore this field.
  smtp?: import("../lib/domain").SmtpConfig;
}

export interface EmailDriver {
  readonly kind: ProviderKind;
  send(args: { ctx: DriverContext; message: EmailMessage }): Promise<SendResult | SendFailure>;
  // Postmark + others sign their delivery webhooks; the driver knows
  // how to verify. Returns the parsed event, or null when the
  // signature didn't verify.
  verifyWebhook?(args: {
    ctx: DriverContext;
    rawBody: string;
    signatureHeader: string;
  }): Promise<PostmarkWebhookEvent | null>;
}
