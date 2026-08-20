import "server-only";

import { sendResendEmail } from "@/lib/server/email/resendEmail";
import { resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";

type EnquiryEmailInput = {
  agencyId: string;
  id: string;
  brandName: string;
  name: string;
  email: string | null;
  phone: string | null;
  contactMethod: string;
  services: string[];
  message: string | null;
  sourceUrl: string | null;
  campaign: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function notifyBrandEnquiry(input: EnquiryEmailInput) {
  const managed = resolveIntegrationValues(input.agencyId, "resend");
  const apiKey = managed.apiKey || process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { attempted: false, sent: false };

  const notifyTo = managed.notifyTo || process.env.ENQUIRY_NOTIFY_TO?.trim() || "edwardhallam07@gmail.com";
  const senderEmail = managed.fromEmail || process.env.ENQUIRY_EMAIL_FROM?.trim() || "onboarding@resend.dev";
  const senderName = managed.fromName || input.brandName;
  const from = senderEmail.includes("<") ? senderEmail : `${senderName} <${senderEmail}>`;
  const services = input.services.length ? input.services.join(", ") : "Not specified";
  const details = [
    `Reference: ${input.id}`,
    `Brand: ${input.brandName}`,
    `Name: ${input.name}`,
    `Email: ${input.email || "Not provided"}`,
    `Phone: ${input.phone || "Not provided"}`,
    `Best contact: ${input.contactMethod}`,
    `Services: ${services}`,
    `Campaign: ${input.campaign || "None"}`,
    `Source: ${input.sourceUrl || "Unknown"}`,
  ];
  const subject = `New ${input.brandName} enquiry from ${input.name}`;
  const result = await sendResendEmail({
    apiKey,
    from,
    to: notifyTo,
    replyTo: input.email || undefined,
    subject,
    text: [...details, "", input.message || "No message supplied."].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;padding:28px;background:#f6f3ee"><div style="max-width:680px;margin:auto;padding:28px;background:#fff;border:1px solid #ded7cf"><p style="color:#8a6444">${escapeHtml(input.brandName)} · ${escapeHtml(input.id)}</p><h1>${escapeHtml(subject)}</h1><p style="white-space:pre-wrap;line-height:1.65">${escapeHtml(details.join("\n"))}</p><hr><p style="white-space:pre-wrap;line-height:1.65">${escapeHtml(input.message || "No message supplied.")}</p></div></div>`,
    idempotencyKey: `brand-enquiry:${input.id}`,
  });
  if (!result.ok) throw new Error(result.reason);
  return { attempted: true, sent: true };
}
