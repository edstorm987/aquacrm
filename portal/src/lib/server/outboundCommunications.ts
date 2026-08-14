import "server-only";

import type { IntegrationProvider } from "@/lib/integrations/catalog";
import {
  getIntegrationConnection,
  listIntegrationConnections,
  resolveIntegrationConnectionValues,
  resolveIntegrationValues,
} from "@/lib/server/integrationConnections";

export type OutboundCommunicationChannel = "email" | "sms" | "whatsapp" | "call";

export interface CommunicationSenderIdentity {
  id: string;
  channel: OutboundCommunicationChannel;
  provider: "resend" | "smtp" | "twilio" | "device";
  label: string;
  address: string;
  connectionId?: string;
}

export interface OutboundCommunicationReadiness {
  senders: CommunicationSenderIdentity[];
  emailConfigured: boolean;
  smsConfigured: boolean;
  whatsappConfigured: boolean;
}

export interface SendPhoneMessageResult {
  delivered: boolean;
  via: "twilio" | "unconfigured";
  externalMessageId?: string;
  reason?: string;
}

export function outboundCommunicationReadiness(agencyId: string): OutboundCommunicationReadiness {
  const senders: CommunicationSenderIdentity[] = [];
  const connections = listIntegrationConnections(agencyId);
  for (const connection of connections) {
    if (connection.provider === "resend" || connection.provider === "smtp") {
      const address = connection.config.fromEmail?.trim();
      if (address) senders.push({
        id: `connection:${connection.id}:email`,
        channel: "email",
        provider: connection.provider,
        label: connection.label,
        address,
        connectionId: connection.id,
      });
    }
    if (connection.provider === "twilio") {
      const smsFrom = connection.config.smsFrom?.trim();
      const whatsappFrom = connection.config.whatsappFrom?.trim();
      const voiceFrom = connection.config.voiceFrom?.trim();
      const agentPhone = connection.config.agentPhone?.trim();
      if (smsFrom) senders.push({
        id: `connection:${connection.id}:sms`,
        channel: "sms",
        provider: "twilio",
        label: `${connection.label} · SMS`,
        address: smsFrom,
        connectionId: connection.id,
      });
      if (whatsappFrom) senders.push({
        id: `connection:${connection.id}:whatsapp`,
        channel: "whatsapp",
        provider: "twilio",
        label: `${connection.label} · WhatsApp`,
        address: whatsappFrom,
        connectionId: connection.id,
      });
      if (voiceFrom && agentPhone) senders.push({
        id: `connection:${connection.id}:call`,
        channel: "call",
        provider: "twilio",
        label: `${connection.label} · Voice`,
        address: voiceFrom,
        connectionId: connection.id,
      });
    }
  }

  addEnvironmentSender(senders, "resend", agencyId, "email", "Environment Resend", "fromEmail");
  addEnvironmentSender(senders, "smtp", agencyId, "email", "Environment SMTP", "fromEmail");
  addEnvironmentSender(senders, "twilio", agencyId, "sms", "Environment Twilio · SMS", "smsFrom");
  addEnvironmentSender(senders, "twilio", agencyId, "whatsapp", "Environment Twilio · WhatsApp", "whatsappFrom");
  addEnvironmentSender(senders, "twilio", agencyId, "call", "Environment Twilio · Voice", "voiceFrom");
  senders.push({ id: "device:call", channel: "call", provider: "device", label: "This device", address: "Device dialler" });

  return {
    senders,
    emailConfigured: senders.some(sender => sender.channel === "email"),
    smsConfigured: senders.some(sender => sender.channel === "sms"),
    whatsappConfigured: senders.some(sender => sender.channel === "whatsapp"),
  };
}

function addEnvironmentSender(
  senders: CommunicationSenderIdentity[],
  provider: Extract<IntegrationProvider, "resend" | "smtp" | "twilio">,
  agencyId: string,
  channel: OutboundCommunicationChannel,
  label: string,
  addressField: string,
) {
  if (senders.some(sender => sender.provider === provider && sender.channel === channel)) return;
  const values = resolveIntegrationValues(agencyId, provider);
  const address = values[addressField]?.trim();
  const credentialsReady = provider === "resend"
    ? Boolean(values.apiKey)
    : provider === "smtp"
      ? Boolean(values.host && values.port && values.username && values.password)
      : Boolean(values.accountSid && values.authToken && (channel !== "call" || values.agentPhone));
  if (!address || !credentialsReady) return;
  senders.push({ id: `environment:${provider}:${channel}`, channel, provider, label, address });
}

export function resolveCommunicationSender(
  agencyId: string,
  senderId: string,
  channel: OutboundCommunicationChannel,
): CommunicationSenderIdentity | null {
  return outboundCommunicationReadiness(agencyId).senders.find(sender => sender.id === senderId && sender.channel === channel) ?? null;
}

export async function sendPhoneMessage(input: {
  agencyId: string;
  sender: CommunicationSenderIdentity;
  channel: "sms" | "whatsapp";
  to: string;
  body: string;
  mediaUrls?: string[];
}): Promise<SendPhoneMessageResult> {
  if (input.sender.provider !== "twilio") return { delivered: false, via: "unconfigured", reason: "The selected sender is not a messaging number." };
  const values = input.sender.connectionId
    ? valuesForConnection(input.agencyId, input.sender.connectionId, "twilio")
    : resolveIntegrationValues(input.agencyId, "twilio");
  if (!values.accountSid || !values.authToken) {
    return { delivered: false, via: "unconfigured", reason: "Connect the selected Twilio account before sending." };
  }

  const to = normalisePhone(input.to);
  if (!to) return { delivered: false, via: "twilio", reason: "The enquiry does not have a valid international phone number." };
  const from = input.channel === "whatsapp" ? values.whatsappFrom : values.smsFrom;
  if (!from) return { delivered: false, via: "unconfigured", reason: `The selected account has no ${input.channel === "sms" ? "SMS" : "WhatsApp"} sender.` };
  const form = new URLSearchParams({
    To: input.channel === "whatsapp" ? `whatsapp:${to}` : to,
    From: input.channel === "whatsapp" ? `whatsapp:${normalisePhone(from) || from}` : normalisePhone(from) || from,
    Body: input.body.trim().slice(0, 1_600),
  });
  input.mediaUrls?.slice(0, 10).forEach(url => form.append("MediaUrl", url));
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(values.accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${values.accountSid}:${values.authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: form,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { sid?: string; message?: string } | null;
  if (!response.ok || !payload?.sid) return { delivered: false, via: "twilio", reason: payload?.message || `Twilio returned ${response.status}.` };
  return { delivered: true, via: "twilio", externalMessageId: payload.sid };
}

export async function initiatePhoneCall(input: {
  agencyId: string;
  sender: CommunicationSenderIdentity;
  customerPhone: string;
}): Promise<{ initiated: boolean; via: "device" | "twilio"; externalCallId?: string; reason?: string }> {
  if (input.sender.provider === "device") return { initiated: false, via: "device" };
  if (input.sender.provider !== "twilio") return { initiated: false, via: "device", reason: "The selected phone identity cannot place calls." };
  const values = input.sender.connectionId
    ? valuesForConnection(input.agencyId, input.sender.connectionId, "twilio")
    : resolveIntegrationValues(input.agencyId, "twilio");
  const customer = normalisePhone(input.customerPhone);
  const agent = normalisePhone(values.agentPhone ?? "");
  const from = normalisePhone(values.voiceFrom ?? "");
  if (!values.accountSid || !values.authToken || !customer || !agent || !from) {
    return { initiated: false, via: "twilio", reason: "The selected voice account needs a caller ID, answering phone and valid Twilio credentials." };
  }
  const twiml = `<Response><Dial callerId="${escapeXml(from)}"><Number>${escapeXml(customer)}</Number></Dial></Response>`;
  const form = new URLSearchParams({ To: agent, From: from, Twiml: twiml });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(values.accountSid)}/Calls.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${values.accountSid}:${values.authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: form,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { sid?: string; message?: string } | null;
  if (!response.ok || !payload?.sid) return { initiated: false, via: "twilio", reason: payload?.message || `Twilio returned ${response.status}.` };
  return { initiated: true, via: "twilio", externalCallId: payload.sid };
}

function valuesForConnection(agencyId: string, connectionId: string, provider: IntegrationProvider): Record<string, string> {
  const connection = getIntegrationConnection(agencyId, connectionId);
  if (!connection || connection.provider !== provider) throw new Error("communication_sender_not_found");
  return resolveIntegrationConnectionValues(agencyId, connectionId);
}

export function normalisePhone(value: string): string | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (trimmed.startsWith("00")) return `+${digits.slice(2)}`;
  if (trimmed.startsWith("0")) return `+44${digits.slice(1)}`;
  return `+${digits}`;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
