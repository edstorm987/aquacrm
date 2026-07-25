// Bundled channel drivers — each is small + dependency-free so the
// plugin tsc-cleans + smokes standalone. Foundations can replace any
// driver via `registerNotificationFoundation({ drivers: { slack: … } })`.

import { now } from "../lib/time";
import type { ChannelConfig, DispatchInput, DispatchResult } from "../lib/domain";
import type { ChannelDriver, EmailSenderPort, UserPort } from "./ports";

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; text?: () => Promise<string> }>;

const globalFetch = (globalThis as unknown as { fetch?: FetchLike }).fetch;

interface DriverDeps {
  fetch?: FetchLike;
  emailSender?: EmailSenderPort | null;
  user?: UserPort | null;
  agencyId: string;
}

function notConfigured(channel: DispatchInput["channel"], reason: string): DispatchResult {
  return { channel, status: "skipped", reason, attemptedAt: now() };
}

function ok(channel: DispatchInput["channel"]): DispatchResult {
  return { channel, status: "sent", attemptedAt: now() };
}

function err(channel: DispatchInput["channel"], reason: string): DispatchResult {
  return { channel, status: "error", reason, attemptedAt: now() };
}

export function emailDriver(deps: DriverDeps): ChannelDriver {
  return {
    channel: "email",
    async dispatch(input, _config) {
      if (!deps.emailSender) return notConfigured("email", "email_sender_not_installed");
      const user = deps.user ? await deps.user.getUser(input.userId) : null;
      if (!user?.email) return notConfigured("email", "user_has_no_email");
      try {
        const r = await deps.emailSender.send({
          agencyId: deps.agencyId,
          to: user.email,
          subject: input.subject,
          body: input.body,
        });
        return r.ok ? ok("email") : err("email", r.error ?? "send_failed");
      } catch (e) {
        return err("email", e instanceof Error ? e.message : "send_threw");
      }
    },
  };
}

export function slackDriver(deps: DriverDeps): ChannelDriver {
  return {
    channel: "slack",
    async dispatch(input, config) {
      const url = config.slack?.webhookUrl;
      if (!url) return notConfigured("slack", "slack_webhook_url_missing");
      const fetchFn = deps.fetch ?? globalFetch;
      if (!fetchFn) return notConfigured("slack", "fetch_unavailable");
      try {
        const r = await fetchFn(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: `*${input.subject}*\n${input.body}` }),
        });
        if (!r.ok) return err("slack", `http_${r.status}`);
        return ok("slack");
      } catch (e) {
        return err("slack", e instanceof Error ? e.message : "fetch_threw");
      }
    },
  };
}

export function whatsappDriver(_deps: DriverDeps): ChannelDriver {
  // v1 stub — operator will paste Twilio / Meta Cloud creds and we
  // wire the real driver shape later (R+1). For now log a "skipped:
  // stub_driver" so dispatch records make it through.
  return {
    channel: "whatsapp",
    dispatch(_input, config) {
      if (!config.whatsapp?.provider) return notConfigured("whatsapp", "whatsapp_not_configured");
      return notConfigured("whatsapp", "whatsapp_driver_stub");
    },
  };
}

export function webhookDriver(deps: DriverDeps): ChannelDriver {
  return {
    channel: "webhook",
    async dispatch(input, config) {
      const url = config.webhook?.url;
      if (!url) return notConfigured("webhook", "webhook_url_missing");
      const fetchFn = deps.fetch ?? globalFetch;
      if (!fetchFn) return notConfigured("webhook", "fetch_unavailable");
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (config.webhook?.secretHeaderName && config.webhook?.secret) {
        headers[config.webhook.secretHeaderName] = config.webhook.secret;
      }
      try {
        const r = await fetchFn(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            subject: input.subject,
            body: input.body,
            eventId: input.eventId,
            metadata: input.metadata,
          }),
        });
        if (!r.ok) return err("webhook", `http_${r.status}`);
        return ok("webhook");
      } catch (e) {
        return err("webhook", e instanceof Error ? e.message : "fetch_threw");
      }
    },
  };
}

export function defaultDrivers(deps: DriverDeps): Record<string, ChannelDriver> {
  return {
    email: emailDriver(deps),
    slack: slackDriver(deps),
    whatsapp: whatsappDriver(deps),
    webhook: webhookDriver(deps),
  };
}
