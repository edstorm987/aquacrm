import "server-only";

import { sendResendEmail } from "@/lib/server/email/resendEmail";
import { resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";

type EnquiryEmailInput = {
  agencyId: string;
  /**
   * The client this site's enquiries belong to, when one is configured.
   *
   * Ed, 2026-08-30: *"as i add more clients they may do there own emails etc."*
   * With this set the alert leaves through THAT client's own Resend connection
   * and lands in THAT client's inbox. Absent — an agency-inbox site, or one of
   * Ed's own trading companies — it uses the workspace connection, which is the
   * behaviour every site had before.
   */
  clientId?: string;
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

export interface EnquiryNotificationRouting {
  apiKey: string;
  notifyTo: string;
  senderEmail: string;
  senderName: string;
  /** Where the credentials came from — a saved connection, or the deployment. */
  source: "connection" | "environment" | "none";
  /** Where the RECIPIENT came from, which can differ from the credentials. */
  recipientSource: "connection" | "environment" | "support-email" | "none";
}

/**
 * Which mailbox a site's enquiry alert leaves from, and lands in.
 *
 * Exported so the screen that lets Ed choose a destination can SHOW him the
 * answer rather than making him infer it from four environment variables and a
 * vault.
 *
 * Resolved TWICE on purpose: "this scope saved a connection" and "this scope is
 * running on the deployment's environment" are different facts, and blurring
 * them is how a client's verified sender ends up posting to somebody else's
 * inbox — the client's connection supplies `fromEmail` but leaves `notifyTo`
 * blank, and a bare `process.env` read quietly fills the gap from the wrong
 * tenant.
 *
 * The environment is therefore only ever consulted THROUGH
 * `resolveIntegrationValues`, which gates it on `mayUseEnvironmentCredentials`
 * (integrationConnections.ts:257). The `|| process.env.RESEND_API_KEY` that
 * used to be here walked straight past that gate, so a second company's
 * enquiries were mailed on the founder's key regardless.
 */
export function resolveEnquiryNotificationRouting(
  agencyId: string,
  clientId?: string,
): EnquiryNotificationRouting {
  const saved = resolveIntegrationValues(agencyId, "resend", { clientId, includeEnvironmentFallback: false });
  const usingSaved = Object.keys(saved).length > 0;
  const values = usingSaved ? saved : resolveIntegrationValues(agencyId, "resend", { clientId });
  const fromEnvironment = !usingSaved && Object.keys(values).length > 0;
  const source = usingSaved ? "connection" as const : fromEnvironment ? "environment" as const : "none" as const;
  const configuredNotifyTo = values.notifyTo?.trim() || "";
  // An in-app, per-agency address, editable in Business details. It replaces
  // the literal `edwardhallam07@gmail.com` that used to sit here: a second
  // company's unconfigured enquiries now reach that company, or nobody at all,
  // but never the founder's personal inbox.
  const supportEmail = getAgencyWorkspaceSettings(agencyId).supportEmail?.trim() || "";
  return {
    apiKey: values.apiKey?.trim() || "",
    notifyTo: configuredNotifyTo || supportEmail,
    senderEmail: values.fromEmail?.trim()
      || (fromEnvironment ? process.env.ENQUIRY_EMAIL_FROM?.trim() || "" : ""),
    senderName: values.fromName?.trim() || "",
    source,
    recipientSource: configuredNotifyTo ? source : supportEmail ? "support-email" : "none",
  };
}

export async function notifyBrandEnquiry(input: EnquiryEmailInput) {
  const routing = resolveEnquiryNotificationRouting(input.agencyId, input.clientId);
  const { apiKey, notifyTo, senderEmail } = routing;
  // No key, no recipient, or no verified sender → nothing is sent, and the
  // caller records "not-configured". That is the same answer
  // `sendTransactionalEmail` gives: it never invents a recipient or a sender.
  // The enquiry itself is already committed and showing in the inbox by the
  // time this runs, so an unconfigured notification costs a nudge, not the
  // enquiry.
  //
  // What used to be here instead: a client's customer data posted to a literal
  // personal address, from Resend's shared `onboarding@resend.dev` sandbox
  // domain — which only ever delivers to the Resend account owner anyway.
  if (!apiKey || !notifyTo || !senderEmail) return { attempted: false, sent: false };

  const senderName = routing.senderName || input.brandName;
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
