// Integrations domain.
//
// Per-client + per-agency integrations registry. Records connection
// intent + config-shape for the supported kinds. Credentials live in
// @aqua/plugin-credentials-vault — this plugin stores a `credentialsRef`
// (vault entry id) and never sees plaintext.

import type { UserId } from "./tenancy";

export type IntegrationKind =
  | "stripe"
  | "mailchimp"
  | "google"
  | "meta"
  | "slack"
  | "zapier"
  | "custom-webhook";

export const INTEGRATION_KINDS: readonly IntegrationKind[] = [
  "stripe", "mailchimp", "google", "meta", "slack", "zapier", "custom-webhook",
] as const;

export const KIND_LABELS: Record<IntegrationKind, string> = {
  stripe: "Stripe",
  mailchimp: "Mailchimp",
  google: "Google",
  meta: "Meta",
  slack: "Slack",
  zapier: "Zapier",
  "custom-webhook": "Custom webhook",
};

// State machine: intended → configured → verified, or → failed.
// "intended" — operator chose the kind but hasn't supplied creds.
// "configured" — credentialsRef set; verify not yet attempted (or pending).
// "verified" — last verify succeeded.
// "failed" — last verify failed; lastError populated.
export type IntegrationStatus = "intended" | "configured" | "verified" | "failed";

export const INTEGRATION_STATUSES: readonly IntegrationStatus[] = [
  "intended", "configured", "verified", "failed",
] as const;

// Per-kind config shape — operator-paste fields. Real OAuth scopes /
// signature secrets / access tokens go through credentials-vault;
// these are the public/identifying fields the operator records here.
export interface ConfigField {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
}

export const KIND_CONFIG_SHAPES: Record<IntegrationKind, ConfigField[]> = {
  stripe: [
    { id: "accountId", label: "Stripe account id", required: true, hint: "acct_…" },
    { id: "publishableKey", label: "Publishable key (pk_…)", required: true },
  ],
  mailchimp: [
    { id: "audienceId", label: "Audience (list) id", required: true },
    { id: "serverPrefix", label: "Server prefix (e.g. us21)", required: true },
  ],
  google: [
    { id: "workspaceDomain", label: "Workspace domain" },
    { id: "scopes", label: "Scopes (comma-separated)", hint: "drive.file, calendar" },
  ],
  meta: [
    { id: "businessId", label: "Meta business id", required: true },
    { id: "pageId", label: "Page id" },
    { id: "adAccountId", label: "Ad account id" },
  ],
  slack: [
    { id: "workspaceUrl", label: "Workspace URL", required: true, hint: "https://acme.slack.com" },
    { id: "channel", label: "Default channel", hint: "#alerts" },
  ],
  zapier: [
    { id: "webhookUrl", label: "Inbound webhook URL", required: true },
  ],
  "custom-webhook": [
    { id: "url", label: "Endpoint URL", required: true },
    { id: "method", label: "Method", hint: "POST" },
  ],
};

export interface Integration {
  id: string;
  agencyId: string;
  clientId?: string;          // undefined = agency-scope install
  kind: IntegrationKind;
  label: string;
  status: IntegrationStatus;
  config: Record<string, string>;   // public/identifying fields per KIND_CONFIG_SHAPES
  credentialsRef?: string;          // vault entry id; service does NOT dereference
  lastVerifiedAt?: number;
  lastError?: string;
  createdBy?: UserId;
  createdAt: number;
  updatedAt: number;
}

export interface CreateIntegrationInput {
  kind: IntegrationKind;
  label: string;
  config?: Record<string, string>;
  credentialsRef?: string;
}

export interface UpdateIntegrationPatch {
  label?: string;
  config?: Record<string, string>;
  credentialsRef?: string | null;   // null = clear
}

export interface IntegrationFilter {
  kind?: IntegrationKind;
  status?: IntegrationStatus;
}

// Webhook log — placeholder ring-buffer (bounded to MAX_LOG_ENTRIES per
// scope so a chatty integration can't blow storage). Real receivers
// land in T6.
export type WebhookDirection = "incoming" | "outgoing";

export interface WebhookLogEntry {
  id: string;
  agencyId: string;
  clientId?: string;
  integrationId?: string;     // optional — incoming entries may not be matched yet
  direction: WebhookDirection;
  ts: number;
  url?: string;
  method?: string;
  status?: number;            // HTTP status when known
  ok: boolean;
  bodyPreview?: string;       // first 1KB only — full bodies belong elsewhere
  error?: string;
}

export const MAX_LOG_ENTRIES = 200;

export interface VerifyResult {
  ok: boolean;
  message?: string;
}
