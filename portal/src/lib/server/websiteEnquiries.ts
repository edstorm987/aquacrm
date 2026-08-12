import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publicAquaSite, publicAquaSiteName, resolvePublicAquaSite } from "@/lib/publicSites";
import { isTradingBrandSlug, tradingBrandDefinition } from "@/lib/tradingBrands";

export type WebsiteEnquiryChannel = "form" | "chatbot" | "support";
export type WebsiteEnquiryPriority = "urgent" | "high" | "normal";
export type WebsiteEnquiryStatus = "open" | "reviewed" | "resolved";

export interface WebsiteEnquiryReply {
  id: string;
  subject: string;
  message: string;
  recipient: string;
  sentAt: number;
  sentBy: string;
  status: "sent" | "failed";
  via: "resend" | "unconfigured";
  error?: string;
}

export interface WebsiteEnquiry {
  id: string;
  brand: string;
  brandName: string;
  source: string;
  channel: WebsiteEnquiryChannel;
  status: WebsiteEnquiryStatus;
  priority: WebsiteEnquiryPriority;
  topic: string;
  suggestedAction: string;
  siteKey?: string;
  propertyId: string;
  siteName: string;
  siteHost?: string;
  pagePath: string;
  name: string;
  email?: string;
  phone?: string;
  contactMethod?: string;
  services: string[];
  message?: string;
  sourceUrl?: string;
  campaign?: string;
  submittedAt: number;
  leadId?: string;
  leadLinkedAt?: number;
  reviewedAt?: number;
  resolvedAt?: number;
  firstRespondedAt?: number;
  lastRespondedAt?: number;
  replies: WebsiteEnquiryReply[];
  notification: "sent" | "failed" | "not-configured" | "pending" | "unknown";
}

type BrandEnquiryRow = {
  id: string;
  brand_slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_method: string | null;
  services: string[] | null;
  message: string | null;
  source_url: string | null;
  campaign: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const NOTIFICATION_STATES = new Set(["sent", "failed", "not-configured", "pending"]);
const CHANNELS = new Set<WebsiteEnquiryChannel>(["form", "chatbot", "support"]);
const STATUSES = new Set<WebsiteEnquiryStatus>(["open", "reviewed", "resolved"]);

function inferChannel(row: BrandEnquiryRow, metadata: Record<string, unknown>): WebsiteEnquiryChannel {
  const explicit = typeof metadata.channel === "string" ? metadata.channel : "";
  if (CHANNELS.has(explicit as WebsiteEnquiryChannel)) return explicit as WebsiteEnquiryChannel;
  if (row.contact_method === "chat" || row.services?.some(service => /\b(chat|chatbot)\b/i.test(service))) return "chatbot";
  if (row.contact_method === "support" || row.services?.some(service => /\b(support|ticket)\b/i.test(service))) return "support";
  return "form";
}

function sourceParts(sourceUrl: string | null): { host?: string; pagePath: string; origin?: string } {
  if (!sourceUrl) return { pagePath: "/" };
  try {
    const parsed = new URL(sourceUrl);
    return { host: parsed.host, pagePath: parsed.pathname || "/", origin: parsed.origin };
  } catch {
    return { pagePath: "/" };
  }
}

function metadataStamp(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? stamp : undefined;
}

function inboxReplies(metadata: Record<string, unknown>): WebsiteEnquiryReply[] {
  if (!Array.isArray(metadata.inboxReplies)) return [];
  return metadata.inboxReplies.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (
      typeof value.id !== "string"
      || typeof value.subject !== "string"
      || typeof value.message !== "string"
      || typeof value.recipient !== "string"
      || typeof value.sentAt !== "number"
      || typeof value.sentBy !== "string"
      || (value.status !== "sent" && value.status !== "failed")
      || (value.via !== "resend" && value.via !== "unconfigured")
    ) return [];
    return [{
      id: value.id,
      subject: value.subject,
      message: value.message,
      recipient: value.recipient,
      sentAt: value.sentAt,
      sentBy: value.sentBy,
      status: value.status as WebsiteEnquiryReply["status"],
      via: value.via as WebsiteEnquiryReply["via"],
      error: typeof value.error === "string" ? value.error : undefined,
    }];
  }).sort((a, b) => a.sentAt - b.sentAt);
}

export async function recordWebsiteEnquiryResponse(enquiryId: string, respondedAt: number, actorUserId: string): Promise<boolean> {
  if (!enquiryId.trim() || !Number.isFinite(respondedAt)) return false;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("brand_enquiries")
    .select("id, metadata")
    .eq("id", enquiryId)
    .maybeSingle();
  if (error || !data) return false;
  const current = data.metadata && typeof data.metadata === "object"
    ? data.metadata as Record<string, unknown>
    : {};
  const responseAt = new Date(respondedAt).toISOString();
  const metadata = {
    ...current,
    firstRespondedAt: typeof current.firstRespondedAt === "string" ? current.firstRespondedAt : responseAt,
    lastRespondedAt: responseAt,
    lastRespondedBy: actorUserId,
  };
  const { error: updateError } = await supabase
    .from("brand_enquiries")
    .update({ metadata })
    .eq("id", enquiryId);
  return !updateError;
}

export function triageWebsiteEnquiry(channel: WebsiteEnquiryChannel, message?: string): Pick<WebsiteEnquiry, "priority" | "topic" | "suggestedAction"> {
  const text = message?.toLowerCase() ?? "";
  if (/\b(data breach|hacked|security incident|compromised|site down|website down|outage|server down)\b/.test(text)) {
    return { priority: "urgent", topic: "Outage or security", suggestedAction: "Check the affected service now, then contact the sender." };
  }
  if (/\b(can(?:not|'t) log in|login|password|locked out|access code)\b/.test(text)) {
    return { priority: "high", topic: "Account access", suggestedAction: "Verify the account and reply with the safest recovery step." };
  }
  if (/\b(invoice|payment|charged|refund|billing|direct debit)\b/.test(text)) {
    return { priority: "high", topic: "Billing", suggestedAction: "Check the finance record before replying." };
  }
  if (/\b(broken|error|not working|failed|bug|urgent|asap)\b/.test(text)) {
    return { priority: "high", topic: "Technical issue", suggestedAction: "Reproduce the issue, record impact, and update the sender." };
  }
  if (channel === "support") {
    return { priority: "high", topic: "Support", suggestedAction: "Review the request and acknowledge it with a clear next step." };
  }
  if (channel === "chatbot") {
    return { priority: "normal", topic: "Chat enquiry", suggestedAction: "Reply through the preferred channel and qualify what they need." };
  }
  return { priority: "normal", topic: "New enquiry", suggestedAction: "Review the brief, create or open the lead, and record the next action." };
}

export async function listWebsiteEnquiries(limit = 250): Promise<WebsiteEnquiry[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("brand_enquiries")
    .select("id, brand_slug, name, email, phone, contact_method, services, message, source_url, campaign, created_at, metadata")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));

  if (error) throw new Error(`Could not load website enquiries: ${error.message}`);

  return ((data ?? []) as BrandEnquiryRow[]).map((row) => {
    const metadata = row.metadata ?? {};
    const notificationValue = typeof metadata.notification === "string" ? metadata.notification : "unknown";
    const notification = NOTIFICATION_STATES.has(notificationValue)
      ? notificationValue as WebsiteEnquiry["notification"]
      : "unknown";
    const brandName = isTradingBrandSlug(row.brand_slug)
      ? tradingBrandDefinition(row.brand_slug).name
      : row.brand_slug.replaceAll("-", " ");
    const channel = inferChannel(row, metadata);
    const statusValue = typeof metadata.inboxStatus === "string" ? metadata.inboxStatus : "open";
    const status = STATUSES.has(statusValue as WebsiteEnquiryStatus) ? statusValue as WebsiteEnquiryStatus : "open";
    const source = sourceParts(row.source_url);
    const siteKey = typeof metadata.siteKey === "string" ? metadata.siteKey : undefined;
    const storedSite = siteKey ? publicAquaSite(siteKey) : null;
    const resolvedSite = resolvePublicAquaSite(row.brand_slug, source.origin);
    const propertyId = typeof metadata.propertyId === "string"
      ? metadata.propertyId
      : storedSite?.propertyId ?? resolvedSite?.propertyId ?? row.brand_slug;
    const siteName = typeof metadata.siteName === "string"
      ? metadata.siteName
      : siteKey ? publicAquaSiteName(siteKey) ?? brandName : resolvedSite?.siteName ?? brandName;
    const triage = triageWebsiteEnquiry(channel, row.message || undefined);

    return {
      id: row.id,
      brand: row.brand_slug,
      brandName,
      source: typeof metadata.source === "string" ? metadata.source : `website:${row.brand_slug}`,
      channel,
      status,
      ...triage,
      siteKey: siteKey ?? resolvedSite?.siteKey,
      propertyId,
      siteName,
      siteHost: source.host,
      pagePath: typeof metadata.pagePath === "string" ? metadata.pagePath : source.pagePath,
      name: row.name,
      email: row.email || undefined,
      phone: row.phone || undefined,
      contactMethod: row.contact_method || undefined,
      services: row.services ?? [],
      message: row.message || undefined,
      sourceUrl: row.source_url || undefined,
      campaign: row.campaign || undefined,
      submittedAt: Date.parse(row.created_at),
      leadId: typeof metadata.leadId === "string" ? metadata.leadId : undefined,
      leadLinkedAt: metadataStamp(metadata, "leadLinkedAt"),
      reviewedAt: metadataStamp(metadata, "firstReviewedAt") ?? metadataStamp(metadata, "reviewedAt"),
      resolvedAt: metadataStamp(metadata, "lastResolvedAt") ?? metadataStamp(metadata, "resolvedAt"),
      firstRespondedAt: metadataStamp(metadata, "firstRespondedAt"),
      lastRespondedAt: metadataStamp(metadata, "lastRespondedAt"),
      replies: inboxReplies(metadata),
      notification,
    };
  });
}
