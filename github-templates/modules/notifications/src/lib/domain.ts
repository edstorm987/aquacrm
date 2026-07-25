// Notification routing domain.

import type { ActivityCategory, ClientId, UserId } from "./tenancy";

export type ChannelKey = "email" | "slack" | "whatsapp" | "webhook";

export const CHANNEL_KEYS: readonly ChannelKey[] = ["email", "slack", "whatsapp", "webhook"] as const;

export const CHANNEL_LABELS: Record<ChannelKey, string> = {
  email: "Email",
  slack: "Slack",
  whatsapp: "WhatsApp",
  webhook: "Webhook",
};

export interface NotificationRule {
  id: string;
  userId: UserId;
  // Empty array = match all categories.
  eventCategories: ActivityCategory[];
  channels: ChannelKey[];
  // Per-(userId, eventId) cooldown in seconds. 0 / undefined = no
  // cooldown — every match dispatches.
  cooldownSeconds?: number;
  // Optional client-scope filter. Empty = all clients in the agency.
  clientIds?: ClientId[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateRuleInput {
  userId: UserId;
  eventCategories?: ActivityCategory[];
  channels: ChannelKey[];
  cooldownSeconds?: number;
  clientIds?: ClientId[];
  enabled?: boolean;
}

export interface UpdateRulePatch {
  eventCategories?: ActivityCategory[];
  channels?: ChannelKey[];
  cooldownSeconds?: number;
  clientIds?: ClientId[];
  enabled?: boolean;
}

// Per-channel agency-level configuration. Each field is optional so
// the operator can fill them in over time; missing config makes the
// matching channel a no-op (with a logged "skipped: not_configured"
// dispatch result).
export interface ChannelConfig {
  email?: {
    fromAddress?: string;
    // When absent the email channel falls back to the email-sender
    // plugin via the foundation EmailSenderPort.
  };
  slack?: {
    webhookUrl?: string;
  };
  whatsapp?: {
    provider?: "twilio" | "meta-cloud";
    accountSid?: string;
    fromNumber?: string;
  };
  webhook?: {
    url?: string;
    secretHeaderName?: string;
    secret?: string;
  };
}

export interface DispatchInput {
  userId: UserId;
  channel: ChannelKey;
  subject: string;
  body: string;
  eventId: string;
  metadata?: Record<string, unknown>;
}

export type DispatchStatus = "sent" | "skipped" | "error";

export interface DispatchResult {
  channel: ChannelKey;
  status: DispatchStatus;
  reason?: string;
  attemptedAt: number;
}

export interface MatchedDispatch {
  ruleId: string;
  userId: UserId;
  channel: ChannelKey;
  // True when cooldown suppressed this dispatch — record kept for
  // observability without hitting the channel driver.
  suppressed: boolean;
  result?: DispatchResult;
}

export interface ActivityShape {
  id: string;
  agencyId: string;
  clientId?: ClientId;
  category: ActivityCategory;
  action: string;
  message: string;
  ts: number;
}
