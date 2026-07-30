// Domain types for the leads-pipeline plugin.
//
// `Lead` and `Contact` are sibling records. A `Lead` is a marketing
// intake row (someone we want to convert); a `Contact` is the broader
// person record — `type: "lead"` mirrors the lead, `"customer"` after
// promotion (Pipeline-card moved to a "Won" column), `"vendor"` for
// supplier rolodex use. Promotion lifts the lead row to a Contact
// (idempotent on canonical email) and stamps `lastContactedAt`.
//
// `LeadCard` is the thin projection T1's `PipelineCard` discriminated
// union accepts as `kind: "lead"` snapshot data — same shape as the
// `LeadSnapshot` declared in the foundation's pipelines.ts (R034).
//
// All emails are stored in canonical (lowercased+trimmed) form so the
// CSV-import idempotency check + AudienceFilter resolution stay O(1).

import type { AgencyId, ClientId, UserId } from "./tenancy";

export type CustomFieldType = "text" | "number" | "date" | "url" | "select" | "multi-select" | "checkbox";
export type CustomFieldValue = string | string[] | boolean;

export type CommercialPartyKind = "lead" | "contact";
export type BillingCadence = "one-off" | "monthly" | "quarterly" | "annual" | "installments";
export type CommercialDocumentStatus = "draft" | "sent" | "accepted" | "paid" | "declined" | "void";
export type CommercialPaymentMethod = "stripe" | "bank-transfer" | "cash" | "other";
export type MeetingMode = "google-meet" | "phone" | "in-person" | "other";
export type MeetingStatus = "scheduled" | "confirmed" | "completed" | "no-show" | "cancelled" | "rescheduled";
export type MeetingAttemptChannel = "call" | "email" | "sms" | "whatsapp" | "in-person";
export type MeetingAttemptOutcome = "attempted" | "reached" | "reminder-sent" | "no-show" | "rescheduled" | "completed";

export interface MeetingAttempt {
  id: string;
  at: number;
  channel: MeetingAttemptChannel;
  outcome: MeetingAttemptOutcome;
  notes?: string;
}

export interface SalesPresentation {
  id: string;
  title: string;
  url: string;
}

export interface CommercialLineItem {
  description: string;
  quantity: number;
  unitCents: number;
}

export interface CommercialPayment {
  id: string;
  amountCents: number;
  method: CommercialPaymentMethod;
  reference?: string;
  paidAt: number;
  receiptSentAt?: number;
}

export interface CommercialPack {
  id: string;
  agencyId: AgencyId;
  companyId?: string;
  brandName?: string;
  legalEntityName?: string;
  productIds?: string[];
  partyKind: CommercialPartyKind;
  partyId: string;
  recipientName?: string;
  recipientEmail: string;
  publicToken: string;
  invoiceNumber: string;
  invoiceStatus: CommercialDocumentStatus;
  agreementStatus: CommercialDocumentStatus;
  lineItems: CommercialLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: "gbp" | "usd" | "eur";
  dueAt: number;
  billingCadence: BillingCadence;
  installmentCount?: number;
  serviceLevel: string;
  agreementTitle: string;
  agreementBody: string;
  notes?: string;
  signedDocumentName?: string;
  signedDocumentDataUrl?: string;
  payments: CommercialPayment[];
  stripeCheckoutId?: string;
  stripeCheckoutUrl?: string;
  stripeSubscriptionId?: string;
  financeInvoiceId?: string;
  emailMessageId?: string;
  sentAt?: number;
  acceptedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SaveCommercialPackInput {
  companyId?: string;
  brandName?: string;
  legalEntityName?: string;
  productIds?: string[];
  partyKind: CommercialPartyKind;
  partyId: string;
  recipientName?: string;
  recipientEmail: string;
  lineItems: CommercialLineItem[];
  taxCents?: number;
  currency?: CommercialPack["currency"];
  dueAt: number;
  billingCadence: BillingCadence;
  installmentCount?: number;
  serviceLevel: string;
  agreementTitle: string;
  agreementBody: string;
  notes?: string;
  signedDocumentName?: string;
  signedDocumentDataUrl?: string;
}

export interface CustomFieldDefinition {
  id: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  formName: string;
  required?: boolean;
}

// ─── Scouting prospect ───────────────────────────────────────────────────

export type ProspectStatus = "scouting" | "qualified" | "dismissed";

export interface Prospect {
  id: string;
  agencyId: AgencyId;
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  niche?: string;
  source: string;
  foundAt?: string;
  opportunity?: string;
  researchNotes?: string;
  nextStep?: string;
  status: ProspectStatus;
  qualifiedLeadId?: string;
  capturedAt: number;
  updatedAt: number;
}

export interface CreateProspectInput {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  niche?: string;
  source: string;
  foundAt?: string;
  opportunity?: string;
  researchNotes?: string;
  nextStep?: string;
}

export interface UpdateProspectPatch {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  niche?: string;
  source?: string;
  foundAt?: string;
  opportunity?: string;
  researchNotes?: string;
  nextStep?: string;
  status?: ProspectStatus;
  qualifiedLeadId?: string;
}

// ─── Lead ─────────────────────────────────────────────────────────────────

export interface Lead {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;             // never set in v1 (agency-scope)
  companyId?: string;              // primary trading company for fulfilment
  companyIds?: string[];           // complete cross-brand relationship history
  brandSlugs?: string[];
  serviceLines?: string[];
  email: string;                   // canonical (lowercased + trimmed)
  name?: string;
  phone?: string;
  company?: string;
  tags: string[];
  source: string;                  // free-form: "csv:<filename>" / "public-funnel" / "manual" / etc.
  capturedAt: number;              // epoch ms
  lastContactedAt?: number;        // last campaign-send epoch ms
  nextMeetingAt?: number;          // booked call / meetup epoch ms
  meetingLink?: string;
  meetingNotes?: string;
  meetingMode?: MeetingMode;
  meetingLocation?: string;
  meetingStatus?: MeetingStatus;
  meetingConfirmedAt?: number;
  meetingReminderAt?: number;
  meetingReminderSentAt?: number;
  meetingAttempts?: MeetingAttempt[];
  salesPresentations?: SalesPresentation[];
  callRecordingUrl?: string;
  sessionNotes?: string;
  inspirationLinks?: string[];
  potentialProblems?: string;
  potentialSolutions?: string;
  pricePoints?: string;
  budgetRange?: string;
  designFeedback?: string;
  supportNotes?: string;
  notes?: string;
  customFields?: Record<string, CustomFieldValue>;
  // Roll-up of campaigns the lead has been part of. Aggregate counter
  // — individual EmailMessage rows live in the email-sender plugin.
  sentCount?: number;
  // Link to the foundation `PipelineCard.id` once the leads pipeline
  // adds the lead. Null until the cross-plugin subscriber wires up
  // (foundation-pending — see chapter).
  pipelineCardId?: string;
}

export interface CreateLeadInput {
  email: string;
  companyId?: string;
  companyIds?: string[];
  brandSlugs?: string[];
  serviceLines?: string[];
  name?: string;
  phone?: string;
  company?: string;
  tags?: string[];
  source: string;
  notes?: string;
  customFields?: Record<string, CustomFieldValue>;
  capturedAt?: number;
}

export interface UpdateLeadPatch {
  companyId?: string;
  companyIds?: string[];
  brandSlugs?: string[];
  serviceLines?: string[];
  name?: string;
  phone?: string;
  company?: string;
  tags?: string[];
  notes?: string;
  customFields?: Record<string, CustomFieldValue>;
  lastContactedAt?: number;
  nextMeetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  meetingMode?: MeetingMode;
  meetingLocation?: string;
  meetingStatus?: MeetingStatus;
  meetingConfirmedAt?: number;
  meetingReminderAt?: number;
  meetingReminderSentAt?: number;
  meetingAttempts?: MeetingAttempt[];
  salesPresentations?: SalesPresentation[];
  callRecordingUrl?: string;
  sessionNotes?: string;
  inspirationLinks?: string[];
  potentialProblems?: string;
  potentialSolutions?: string;
  pricePoints?: string;
  budgetRange?: string;
  designFeedback?: string;
  supportNotes?: string;
  sentCount?: number;
  pipelineCardId?: string;
}

export interface LeadFilter {
  query?: string;
  tag?: string;
  source?: string;
  notContactedSinceMs?: number;
}

// `LeadCard` projection — one-shot snapshot the foundation pipelines
// service stores under `PipelineCard.snapshot` (kind `"lead"`).
export interface LeadCard {
  leadId: string;
  email: string;
  name?: string;
  company?: string;
  source: string;
}

export function projectLeadCard(lead: Lead): LeadCard {
  return {
    leadId: lead.id,
    email: lead.email,
    name: lead.name,
    company: lead.company,
    source: lead.source,
  };
}

// ─── Contact ──────────────────────────────────────────────────────────────

export type ContactType = "lead" | "customer" | "account" | "vendor" | "employee" | "other";

export interface Contact {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;
  email: string;                   // canonical
  name?: string;
  phone?: string;
  company?: string;
  tags: string[];
  type: ContactType;
  source: string;
  // Mirrors `Lead.id` when promoted from a lead. Vendors / direct-add
  // contacts have this undefined.
  promotedFromLeadId?: string;
  lastContactedAt?: number;
  nextMeetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  salesPresentations?: SalesPresentation[];
  callRecordingUrl?: string;
  sessionNotes?: string;
  inspirationLinks?: string[];
  potentialProblems?: string;
  potentialSolutions?: string;
  pricePoints?: string;
  budgetRange?: string;
  designFeedback?: string;
  supportNotes?: string;
  notes?: string;
  customFields?: Record<string, CustomFieldValue>;
  createdAt: number;
  updatedAt: number;
}

export interface CreateContactInput {
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  tags?: string[];
  type: ContactType;
  source: string;
  notes?: string;
  customFields?: Record<string, CustomFieldValue>;
  promotedFromLeadId?: string;
  nextMeetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  salesPresentations?: SalesPresentation[];
  callRecordingUrl?: string;
  sessionNotes?: string;
  inspirationLinks?: string[];
  potentialProblems?: string;
  potentialSolutions?: string;
  pricePoints?: string;
  budgetRange?: string;
  designFeedback?: string;
  supportNotes?: string;
}

export interface UpdateContactPatch {
  name?: string;
  phone?: string;
  company?: string;
  tags?: string[];
  type?: ContactType;
  notes?: string;
  customFields?: Record<string, CustomFieldValue>;
  lastContactedAt?: number;
  nextMeetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  salesPresentations?: SalesPresentation[];
  callRecordingUrl?: string;
  sessionNotes?: string;
  inspirationLinks?: string[];
  potentialProblems?: string;
  potentialSolutions?: string;
  pricePoints?: string;
  budgetRange?: string;
  designFeedback?: string;
  supportNotes?: string;
}

export interface ContactFilter {
  query?: string;
  type?: ContactType;
  tag?: string;
}

// ─── Campaign ─────────────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "sending" | "sent" | "completed";
export type CampaignChannel = "email" | "google-ads" | "meta-ads" | "linkedin-ads" | "organic" | "event" | "referral" | "other";

export interface AudienceFilter {
  tags?: string[];                 // OR — match any tag
  sourcedFrom?: string[];          // OR — match any source
  notContactedSinceMs?: number;    // exclude leads contacted within N ms
  pipelineColumn?: string;         // e.g. "New" | "Contacted" | "Qualified"
}

export interface Campaign {
  id: string;
  agencyId: AgencyId;
  name: string;
  channel?: CampaignChannel;
  sourceKey?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  budgetCents?: number;
  spendCents?: number;
  attributedRevenueCents?: number;
  startsAt?: number;
  endsAt?: number;
  externalUrl?: string;
  notes?: string;
  status: CampaignStatus;
  scheduleAt?: number;
  audienceFilter: AudienceFilter;
  // Snapshotted at send time so the campaign row is auditable even
  // after leads change tags / get archived.
  recipients: number;
  sentCount: number;
  // Stamped when status flips to `"sent"`.
  sentAt?: number;
  createdAt: number;
  updatedAt: number;
  createdBy: UserId;
}

export interface CreateCampaignInput {
  name: string;
  channel?: CampaignChannel;
  sourceKey?: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  budgetCents?: number;
  spendCents?: number;
  attributedRevenueCents?: number;
  startsAt?: number;
  endsAt?: number;
  externalUrl?: string;
  notes?: string;
  audienceFilter: AudienceFilter;
  scheduleAt?: number;
}

export interface UpdateCampaignPatch {
  name?: string;
  channel?: CampaignChannel;
  sourceKey?: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  budgetCents?: number;
  spendCents?: number;
  attributedRevenueCents?: number;
  startsAt?: number;
  endsAt?: number;
  externalUrl?: string;
  notes?: string;
  audienceFilter?: AudienceFilter;
  scheduleAt?: number;
  status?: CampaignStatus;
}

// ─── CSV import ───────────────────────────────────────────────────────────

export interface CsvImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

// Column header → lead field. The CSV parser walks the first row,
// lowercases each cell, and looks each up in this map. New variants
// land in this single table and the parser picks them up automatically.
export const CSV_COLUMN_VARIANTS: Record<string, "email" | "name" | "phone" | "company" | "tags" | "source" | "notes"> = {
  // email
  "email": "email",
  "e-mail": "email",
  "mail": "email",
  "email address": "email",
  // name
  "name": "name",
  "full name": "name",
  "fullname": "name",
  "contact": "name",
  // phone
  "phone": "phone",
  "mobile": "phone",
  "tel": "phone",
  "telephone": "phone",
  "cell": "phone",
  // company
  "company": "company",
  "organisation": "company",
  "organization": "company",
  "business": "company",
  // tags
  "tags": "tags",
  "labels": "tags",
  // source
  "source": "source",
  // notes
  "notes": "notes",
  "note": "notes",
  "comments": "notes",
};
