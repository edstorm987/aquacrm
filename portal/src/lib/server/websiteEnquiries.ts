import "server-only";
import { cache } from "react";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enquiryBelongsToAgency } from "@/lib/supabase/ownedEnquiry";
import { isMissingAgencyIdColumnRead } from "@/lib/supabase/enquiryAgencyColumn";
import { isWebsiteEnquiryClassification, type WebsiteEnquiryClassification } from "@/lib/enquiries/enquiryClassification";
import { publicAquaSite, publicAquaSiteName, resolvePublicAquaSite } from "@/lib/public/publicSites";
import { isTradingBrandSlug, tradingBrandDefinition } from "@/lib/brands/tradingBrands";
import type { InboxOutboundAttachment } from "@/lib/inbox/media";
import {
  resolveContactIdentity,
  upsertIdentityResolutionReview,
  type IdentityResolutionInput,
} from "@/lib/server/identityResolution";
import { synchroniseClientRecordLedger } from "@/lib/server/clients/clientRecordLedger";
import { upsertPerson } from "@/server/persons";
import { listTradingCompanies } from "@/server/tradingCompanies";
import type { IdentityResolutionResult, IdentityResolutionStatus } from "@/server/types";

export type WebsiteEnquiryChannel = "form" | "chatbot" | "support";
export type WebsiteEnquiryPriority = "urgent" | "high" | "normal";
export type WebsiteEnquiryStatus = "open" | "reviewed" | "resolved";

export interface WebsiteEnquiryReply {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  subject?: string;
  message: string;
  recipient: string;
  senderId?: string;
  senderLabel?: string;
  sentAt: number;
  sentBy: string;
  status: "sent" | "failed";
  via: "resend" | "smtp" | "twilio" | "unconfigured";
  externalMessageId?: string;
  error?: string;
  attachments: InboxOutboundAttachment[];
}

export interface WebsiteEnquiryCall {
  id: string;
  phone: string;
  senderId: string;
  senderLabel: string;
  startedAt: number;
  endedAt?: number;
  durationSeconds?: number;
  status: "in-progress" | "completed";
  outcome?: "connected" | "voicemail" | "no-answer" | "follow-up" | "wrong-number";
  notes?: string;
  followUpAt?: number;
  createdBy: string;
  via?: "device" | "twilio";
  externalCallId?: string;
  recording?: {
    url: string;
    fileName: string;
    contentType: string;
    size: number;
    consentConfirmed: true;
  };
}

export interface WebsiteEnquiry {
  id: string;
  brand: string;
  brandName: string;
  source: string;
  channel: WebsiteEnquiryChannel;
  status: WebsiteEnquiryStatus;
  classification: WebsiteEnquiryClassification;
  classificationAt?: number;
  routeNote?: string;
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
  // Captured at submission and, until now, never surfaced. Whether somebody
  // agreed to be contacted is not optional detail — it decides what you are
  // allowed to do next.
  consent?: boolean;
  consentPurpose?: string;
  consentVersion?: number;
  consentCapturedAt?: number;
  services: string[];
  message?: string;
  /**
   * The submission as it stood — which form, on which page, what it was for,
   * and every answer given. Absent on enquiries captured before the Aqua Tag
   * started recording it, which is why the inbox has to say so rather than
   * render an empty section.
   */
  formCapture?: WebsiteEnquiryFormCapture;
  sourceUrl?: string;
  campaign?: string;
  submittedAt: number;
  /**
   * The trading company this submission was routed to, because the site it came
   * from is registered against one of Ed's own companies rather than a client.
   * Written by `brand-enquiry` and `form-capture` at submission; absent for
   * everything that lands in the agency inbox, which is most enquiries.
   */
  routedCompanyId?: string;
  /**
   * The routed company's current name, resolved at read time — the id alone is
   * unreadable in an inbox. Undefined when the company has since been deleted,
   * which is why the surface labels the badge rather than assuming a name.
   */
  routedCompanyName?: string;
  leadId?: string;
  contactId?: string;
  clientId?: string;
  // Canonical Person for this enquirer, set by synchroniseWebsiteEnquiryIdentities.
  personId?: string;
  identityStatus?: IdentityResolutionStatus;
  identityConfidence?: number;
  identityExplanation?: string;
  leadLinkedAt?: number;
  reviewedAt?: number;
  resolvedAt?: number;
  firstRespondedAt?: number;
  lastRespondedAt?: number;
  replies: WebsiteEnquiryReply[];
  calls: WebsiteEnquiryCall[];
  notification: "sent" | "failed" | "not-configured" | "pending" | "unknown";
}

export type BrandEnquiryRow = {
  id: string;
  brand_slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_method: string | null;
  consent: boolean | null;
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

export interface WebsiteEnquiryFormCapture {
  /** "Hero enquiry · /pricing" — the question the operator actually has. */
  formLabel: string;
  formName?: string;
  purpose?: string;
  /** Whether the purpose was declared, chosen by the visitor, or guessed. */
  purposeSource?: string;
  capturedAt?: number;
  fields: Array<{ key: string; label?: string; value: string; type?: string }>;
  /** The answers Aqua has no column of its own for. */
  additional: Array<{ key: string; label?: string; value: string; type?: string }>;
}

function readFormCapture(metadata: Record<string, unknown>): WebsiteEnquiryFormCapture | undefined {
  const raw = metadata.formCapture as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return undefined;
  const form = (raw.form ?? {}) as Record<string, unknown>;
  const fields = Array.isArray(raw.fields) ? raw.fields as WebsiteEnquiryFormCapture["fields"] : [];
  return {
    formLabel: typeof raw.formLabel === "string" ? raw.formLabel : "Website form",
    formName: typeof form.formName === "string" ? form.formName : undefined,
    purpose: typeof form.purpose === "string" ? form.purpose : undefined,
    purposeSource: typeof form.purposeSource === "string" ? form.purposeSource : undefined,
    capturedAt: typeof raw.capturedAt === "string" ? Date.parse(raw.capturedAt) || undefined : undefined,
    fields,
    additional: Array.isArray(raw.additional) ? raw.additional as WebsiteEnquiryFormCapture["additional"] : [],
  };
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
      || typeof value.message !== "string"
      || typeof value.recipient !== "string"
      || typeof value.sentAt !== "number"
      || typeof value.sentBy !== "string"
      || (value.status !== "sent" && value.status !== "failed")
      || !["resend", "smtp", "twilio", "unconfigured"].includes(String(value.via))
    ) return [];
    const channel: WebsiteEnquiryReply["channel"] = value.channel === "sms" || value.channel === "whatsapp" ? value.channel : "email";
    const attachments = Array.isArray(value.attachments) ? value.attachments.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const attachment = item as Record<string, unknown>;
      if (typeof attachment.id !== "string" || typeof attachment.name !== "string" || typeof attachment.url !== "string" || typeof attachment.token !== "string" || typeof attachment.size !== "number" || typeof attachment.contentType !== "string" || !["image", "audio", "video", "file"].includes(String(attachment.kind))) return [];
      return [{ id: attachment.id, name: attachment.name, url: attachment.url, token: attachment.token, size: attachment.size, contentType: attachment.contentType, kind: attachment.kind as InboxOutboundAttachment["kind"] }];
    }) : [];
    return [{
      id: value.id,
      channel,
      subject: typeof value.subject === "string" ? value.subject : undefined,
      message: value.message,
      recipient: value.recipient,
      senderId: typeof value.senderId === "string" ? value.senderId : undefined,
      senderLabel: typeof value.senderLabel === "string" ? value.senderLabel : undefined,
      sentAt: value.sentAt,
      sentBy: value.sentBy,
      status: value.status as WebsiteEnquiryReply["status"],
      via: value.via as WebsiteEnquiryReply["via"],
      externalMessageId: typeof value.externalMessageId === "string" ? value.externalMessageId : undefined,
      error: typeof value.error === "string" ? value.error : undefined,
      attachments,
    }];
  }).sort((a, b) => a.sentAt - b.sentAt);
}

function inboxCalls(metadata: Record<string, unknown>): WebsiteEnquiryCall[] {
  if (!Array.isArray(metadata.inboxCalls)) return [];
  return metadata.inboxCalls.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (
      typeof value.id !== "string"
      || typeof value.phone !== "string"
      || typeof value.senderId !== "string"
      || typeof value.senderLabel !== "string"
      || typeof value.startedAt !== "number"
      || typeof value.createdBy !== "string"
      || (value.status !== "in-progress" && value.status !== "completed")
    ) return [];
    const recordingValue = value.recording && typeof value.recording === "object" ? value.recording as Record<string, unknown> : null;
    const recording = recordingValue
      && typeof recordingValue.url === "string"
      && typeof recordingValue.fileName === "string"
      && typeof recordingValue.contentType === "string"
      && typeof recordingValue.size === "number"
      && recordingValue.consentConfirmed === true
      ? {
          url: recordingValue.url,
          fileName: recordingValue.fileName,
          contentType: recordingValue.contentType,
          size: recordingValue.size,
          consentConfirmed: true as const,
        }
      : undefined;
    const outcome = ["connected", "voicemail", "no-answer", "follow-up", "wrong-number"].includes(String(value.outcome))
      ? value.outcome as WebsiteEnquiryCall["outcome"]
      : undefined;
    const via: WebsiteEnquiryCall["via"] = value.via === "twilio" ? "twilio" : value.via === "device" ? "device" : undefined;
    return [{
      id: value.id,
      phone: value.phone,
      senderId: value.senderId,
      senderLabel: value.senderLabel,
      startedAt: value.startedAt,
      endedAt: typeof value.endedAt === "number" ? value.endedAt : undefined,
      durationSeconds: typeof value.durationSeconds === "number" ? value.durationSeconds : undefined,
      status: value.status as WebsiteEnquiryCall["status"],
      outcome,
      notes: typeof value.notes === "string" ? value.notes : undefined,
      followUpAt: typeof value.followUpAt === "number" ? value.followUpAt : undefined,
      createdBy: value.createdBy,
      via,
      externalCallId: typeof value.externalCallId === "string" ? value.externalCallId : undefined,
      recording,
    }];
  }).sort((a, b) => a.startedAt - b.startedAt);
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

export async function synchroniseWebsiteEnquiryIdentities(
  agencyId: string,
  enquiries: WebsiteEnquiry[],
): Promise<WebsiteEnquiry[]> {
  const reconciled: WebsiteEnquiry[] = [];
  // Company routing is resolved for every enquiry, spam included — an enquiry
  // routed to one of Ed's companies still belongs to that company whatever it
  // turns out to be, and the inbox filter has to be able to find it.
  for (const enquiry of attachRoutedCompanyNames(enquiries, listTradingCompanies(agencyId, true))) {
    if (enquiry.classification === "spam") {
      reconciled.push(enquiry);
      continue;
    }
    const input: IdentityResolutionInput = {
      agencyId,
      sourceType: "website-enquiry",
      sourceId: enquiry.id,
      sourceLabel: `${enquiry.siteName} · ${enquiry.name}`,
      sourceHref: `/portal/agency/inbox?view=all&thread=${encodeURIComponent(`website:${enquiry.id}`)}`,
      name: enquiry.name,
      email: enquiry.email,
      phone: enquiry.phone,
      company: enquiry.name,
      clientId: enquiry.clientId,
      leadId: enquiry.leadId,
      contactId: enquiry.contactId,
    };
    const resolution = resolveContactIdentity(input);
    upsertIdentityResolutionReview(input, resolution);

    // A company route claims the enquiry, exactly as the capture endpoint
    // decided at submission (`brand-enquiry/route.ts` sets
    // `owningClientId = undefined` when `routedCompanyId` is set). Without this
    // the read side quietly undid that: the identity guess would auto-link the
    // enquiry to a client here, on every inbox render, and file it on that
    // client's record — so the company route appeared to do nothing.
    // The suggestion review above is still written, because a human can still
    // decide this really was a client; what is refused is the automatic link.
    const attributedClientId = enquiry.routedCompanyId ? undefined : resolution.clientId;

    // Every non-spam enquiry resolves to a canonical Person immediately, even
    // before anyone classifies it — an unclassified enquiry IS a person in the
    // "enquiry" state. Without this the classify alert has no card to open,
    // because the Person would not exist until classification happened.
    const { person } = upsertPerson(agencyId, {
      emails: [enquiry.email],
      phones: [enquiry.phone],
      name: enquiry.name,
      source: `website:${enquiry.siteName}`,
      facets: {
        enquiryIds: [enquiry.id],
        leadId: enquiry.leadId,
        contactId: enquiry.contactId,
        clientIds: attributedClientId ? [attributedClientId] : undefined,
      },
    });

    const next: WebsiteEnquiry = {
      ...enquiry,
      personId: person.id,
      clientId: enquiry.routedCompanyId ? undefined : (resolution.clientId ?? enquiry.clientId),
      identityStatus: resolution.status,
      identityConfidence: resolution.confidence,
      identityExplanation: resolution.explanation,
    };
    if (attributedClientId) {
      synchroniseWebsiteEnquiryLedgerEvents(agencyId, attributedClientId, next);
      if (enquiry.clientId !== attributedClientId || enquiry.identityStatus !== resolution.status) {
        await recordWebsiteEnquiryIdentityResolution(enquiry.id, resolution);
      }
    }
    reconciled.push(next);
  }
  return reconciled;
}

export function synchroniseWebsiteEnquiryLedgerEvents(agencyId: string, clientId: string, enquiry: WebsiteEnquiry) {
  const href = `/portal/agency/inbox?view=all&thread=${encodeURIComponent(`website:${enquiry.id}`)}`;
  return synchroniseClientRecordLedger({
    agencyId,
    clientId,
    events: [
      {
        sourceType: "enquiry",
        sourceId: `website-enquiry:${enquiry.id}`,
        group: "messages",
        title: `${enquiry.channel === "chatbot" ? "Chat" : enquiry.channel === "support" ? "Support" : "Website"} enquiry from ${enquiry.name}`,
        body: enquiry.message || `Submitted via ${enquiry.siteName}.`,
        occurredAt: enquiry.submittedAt,
        eyebrow: `${enquiry.siteName} · inbound · ${enquiry.status}`,
        visibility: "inherent",
        href,
        attention: enquiry.priority === "urgent" ? "critical" : enquiry.priority === "high" ? "warning" : undefined,
      },
      ...enquiry.replies.map(reply => ({
        sourceType: "message" as const,
        sourceId: `website-enquiry:${enquiry.id}:reply:${reply.id}`,
        group: "messages" as const,
        title: `${reply.channel.toUpperCase()} reply to ${enquiry.name}`,
        body: reply.message,
        occurredAt: reply.sentAt,
        eyebrow: `${reply.senderLabel || reply.sentBy} · outbound · ${reply.status}`,
        visibility: "inherent" as const,
        href,
        parentSourceId: `website-enquiry:${enquiry.id}`,
      })),
      ...enquiry.calls.map(call => ({
        sourceType: "call" as const,
        sourceId: `website-enquiry:${enquiry.id}:call:${call.id}`,
        group: "calls" as const,
        title: `Call with ${enquiry.name}`,
        body: [call.outcome ? `Outcome: ${call.outcome.replaceAll("-", " ")}.` : undefined, call.notes, call.recording ? `Recording: ${call.recording.fileName}` : undefined].filter(Boolean).join(" ") || "Call logged.",
        occurredAt: call.startedAt,
        eyebrow: `${call.senderLabel} · ${call.status}${call.durationSeconds ? ` · ${Math.ceil(call.durationSeconds / 60)} min` : ""}`,
        visibility: "internal" as const,
        href,
        parentSourceId: `website-enquiry:${enquiry.id}`,
      })),
    ],
  });
}

export async function recordWebsiteEnquiryIdentityResolution(enquiryId: string, resolution: IdentityResolutionResult): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("brand_enquiries").select("id, metadata").eq("id", enquiryId).maybeSingle();
  if (error || !data) return false;
  const current = data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : {};
  const metadata = {
    ...current,
    clientId: resolution.clientId ?? null,
    clientLinkedAt: resolution.clientId ? new Date(resolution.resolvedAt).toISOString() : null,
    identityResolution: {
      status: resolution.status,
      confidence: resolution.confidence,
      explanation: resolution.explanation,
      clientId: resolution.clientId ?? null,
      clientName: resolution.clientName ?? null,
      resolvedAt: new Date(resolution.resolvedAt).toISOString(),
    },
  };
  const { error: updateError } = await supabase.from("brand_enquiries").update({ metadata }).eq("id", enquiryId);
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

// Request-scoped dedup for the enquiry read. A single agency render fans out
// to this from several independent engines (radar, operational alerts, source
// inspection, person interactions, resolution plans) — each previously its own
// Supabase round-trip for the SAME rows, because the query is `cache: "no-store"`
// so Next.js can't dedupe it. React cache() collapses same-limit calls within
// one request into one network trip. The `limit` is normalised through a
// wrapper so `()` and `(250)` share a key rather than caching twice.
// The raw function below is untouched: API routes, scripts and tests keep
// exactly the behaviour they had.
const cachedWebsiteEnquiries = cache(
  (agencyId: string, limit: number): Promise<WebsiteEnquiry[]> => listWebsiteEnquiries(agencyId, limit),
);

export function getRequestWebsiteEnquiries(agencyId: string, limit = 250): Promise<WebsiteEnquiry[]> {
  return cachedWebsiteEnquiries(agencyId, limit);
}

/** The non-ownership columns every enquiry read projects. */
const ENQUIRY_READ_COLUMNS =
  "id, brand_slug, name, email, phone, contact_method, services, message, source_url, campaign, consent, created_at, metadata";

/**
 * The narrow slice of the admin client this read uses. Declared so a test can
 * inject a fake table without standing up the whole Supabase surface — the raw
 * function stays exercisable against a mixed-tenant fixture.
 */
export interface EnquiryReadClient {
  from(table: string): {
    select(columns: string): {
      order(column: string, options: { ascending: boolean }): {
        limit(count: number): PromiseLike<{
          data: unknown;
          error: { code?: string | null; message?: string | null } | null;
        }>;
      };
    };
  };
}

/**
 * Every website enquiry that belongs to `agencyId`, newest first.
 *
 * SECURITY — this reads through the RLS-bypassing service-role client, so the
 * query returns EVERY tenant's `brand_enquiries` rows. Ownership is therefore
 * enforced in the app: rows are filtered through `enquiryBelongsToAgency` before
 * they are mapped, so a caller only ever sees its own agency's enquiries. The
 * predicate works both before and after the hand-applied `agency_id` migration
 * (column when present, `metadata.agencyId` otherwise), so behaviour for the
 * current single tenant is unchanged — its own rows still come back exactly as
 * before; only other agencies' rows are excluded.
 *
 * `agencyId` is REQUIRED so a missed caller is a compile error, never a silent
 * unscoped read. `deps.supabase` is a test seam; production omits it.
 */
export async function listWebsiteEnquiries(
  agencyId: string,
  limit = 250,
  deps: { supabase?: EnquiryReadClient } = {},
): Promise<WebsiteEnquiry[]> {
  const supabase = deps.supabase ?? (createSupabaseAdminClient() as unknown as EnquiryReadClient);
  const cap = Math.min(Math.max(limit, 1), 500);
  const load = (columns: string) =>
    supabase
      .from("brand_enquiries")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(cap);

  // Project the authoritative `agency_id` column. Pre-migration it does not
  // exist and Postgres answers 42703 — retry without it and let the predicate
  // fall back to `metadata.agencyId`, exactly as the per-row guard does.
  let { data, error } = await load(`agency_id, ${ENQUIRY_READ_COLUMNS}`);
  if (error && isMissingAgencyIdColumnRead(error)) {
    ({ data, error } = await load(ENQUIRY_READ_COLUMNS));
  }

  if (error) throw new Error(`Could not load website enquiries: ${error.message}`);

  return ((data ?? []) as Array<BrandEnquiryRow & { agency_id?: string | null }>)
    .filter(row => enquiryBelongsToAgency(row, agencyId))
    .map(mapBrandEnquiryRow);
}

/**
 * One live `brand_enquiries` row → the inbox item. Pure: no Supabase, no state,
 * no clock beyond the row's own timestamps. Split out of `listWebsiteEnquiries`
 * so the mapping can be driven directly by a row fixture — the live table is the
 * only source of these rows and there is no local sandbox for it, so a test that
 * needed the query could only ever assert against Ed's real data.
 */
export function mapBrandEnquiryRow(row: BrandEnquiryRow): WebsiteEnquiry {
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
    const classification = isWebsiteEnquiryClassification(metadata.enquiryClassification)
      ? metadata.enquiryClassification
      : "unclassified";
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
    const identity = storedIdentityResolution(metadata.identityResolution);

    return {
      id: row.id,
      brand: row.brand_slug,
      brandName,
      source: typeof metadata.source === "string" ? metadata.source : `website:${row.brand_slug}`,
      channel,
      status,
      classification,
      classificationAt: metadataStamp(metadata, "enquiryClassificationAt"),
      routeNote: typeof metadata.enquiryRouteNote === "string" ? metadata.enquiryRouteNote : undefined,
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
      formCapture: readFormCapture(metadata),
      consent: row.consent ?? undefined,
      consentPurpose: typeof metadata.consentPurpose === "string" ? metadata.consentPurpose : undefined,
      consentVersion: typeof metadata.consentVersion === "number" ? metadata.consentVersion : undefined,
      consentCapturedAt: metadataStamp(metadata, "consentCapturedAt"),
      services: row.services ?? [],
      message: row.message || undefined,
      sourceUrl: row.source_url || undefined,
      campaign: row.campaign || undefined,
      submittedAt: safeStamp(row.created_at),
      // Written at submission when the site is registered to one of Ed's own
      // companies. Everything else — every enquiry that predates the Aqua Tag,
      // and every catch-all site — simply has no key here and stays undefined.
      routedCompanyId: typeof metadata.routedCompanyId === "string" && metadata.routedCompanyId.trim()
        ? metadata.routedCompanyId
        : undefined,
      leadId: typeof metadata.leadId === "string" ? metadata.leadId : undefined,
      contactId: typeof metadata.contactId === "string" ? metadata.contactId : undefined,
      clientId: typeof metadata.clientId === "string" ? metadata.clientId : identity.clientId,
      identityStatus: identity.status,
      identityConfidence: identity.confidence,
      identityExplanation: identity.explanation,
      leadLinkedAt: metadataStamp(metadata, "leadLinkedAt"),
      reviewedAt: metadataStamp(metadata, "firstReviewedAt") ?? metadataStamp(metadata, "reviewedAt"),
      resolvedAt: metadataStamp(metadata, "lastResolvedAt") ?? metadataStamp(metadata, "resolvedAt"),
      firstRespondedAt: metadataStamp(metadata, "firstRespondedAt"),
      lastRespondedAt: metadataStamp(metadata, "lastRespondedAt"),
      replies: inboxReplies(metadata),
      calls: inboxCalls(metadata),
      notification,
    };
}

/**
 * Fill in each routed enquiry's company name from the agency's trading
 * companies. Pure — the caller passes the companies, so the read surface can be
 * driven by fixtures instead of by whatever happens to be in the live store.
 *
 * A company that has since been deleted leaves the name undefined rather than
 * dropping the routing: the enquiry still belongs to a company, and the surface
 * says so with a fallback label instead of an empty badge.
 */
export function attachRoutedCompanyNames(
  enquiries: WebsiteEnquiry[],
  companies: Array<{ id: string; name: string }>,
): WebsiteEnquiry[] {
  if (!enquiries.some(enquiry => enquiry.routedCompanyId)) return enquiries;
  const names = new Map(companies.map(company => [company.id, company.name]));
  return enquiries.map(enquiry => enquiry.routedCompanyId
    ? { ...enquiry, routedCompanyName: names.get(enquiry.routedCompanyId) ?? enquiry.routedCompanyName }
    : enquiry);
}

/**
 * "all" (everything), "none" (only what belongs to the agency inbox), or a
 * company id. The inbox filter control keeps the same three values, so an
 * unrecognised value can only ever narrow to nothing rather than mis-attribute.
 */
export const ROUTED_COMPANY_FILTER_ALL = "all";
export const ROUTED_COMPANY_FILTER_NONE = "none";

/** What a routed enquiry is called when its company record has gone. */
export const ROUTED_COMPANY_FALLBACK_NAME = "Your company";

export function matchesRoutedCompanyFilter(
  enquiry: Pick<WebsiteEnquiry, "routedCompanyId">,
  filter: string,
): boolean {
  if (filter === ROUTED_COMPANY_FILTER_ALL) return true;
  if (filter === ROUTED_COMPANY_FILTER_NONE) return !enquiry.routedCompanyId;
  return enquiry.routedCompanyId === filter;
}

export function filterEnquiriesByRoutedCompany(
  enquiries: WebsiteEnquiry[],
  filter: string,
): WebsiteEnquiry[] {
  return enquiries.filter(enquiry => matchesRoutedCompanyFilter(enquiry, filter));
}

/**
 * The companies actually represented in this batch of enquiries — the filter
 * offers a company only when there is something to see under it, so an agency
 * that routes nothing to a company never grows a dead control.
 */
export function routedCompanyFilterOptions(
  enquiries: Array<Pick<WebsiteEnquiry, "routedCompanyId" | "routedCompanyName">>,
): Array<{ id: string; name: string }> {
  const options = new Map<string, string>();
  for (const enquiry of enquiries) {
    if (!enquiry.routedCompanyId) continue;
    const existing = options.get(enquiry.routedCompanyId);
    if (!existing || existing === ROUTED_COMPANY_FALLBACK_NAME) {
      options.set(enquiry.routedCompanyId, enquiry.routedCompanyName || ROUTED_COMPANY_FALLBACK_NAME);
    }
  }
  return [...options.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

function storedIdentityResolution(value: unknown): {
  status?: IdentityResolutionStatus;
  confidence?: number;
  explanation?: string;
  clientId?: string;
} {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const status = raw.status === "resolved" || raw.status === "ambiguous" || raw.status === "unmatched" ? raw.status : undefined;
  return {
    status,
    confidence: typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? raw.confidence : undefined,
    explanation: typeof raw.explanation === "string" ? raw.explanation : undefined,
    clientId: typeof raw.clientId === "string" ? raw.clientId : undefined,
  };
}

function safeStamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}
