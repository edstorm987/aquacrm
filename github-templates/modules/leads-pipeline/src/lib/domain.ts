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

// ─── Lead ─────────────────────────────────────────────────────────────────

export interface Lead {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;             // never set in v1 (agency-scope)
  email: string;                   // canonical (lowercased + trimmed)
  name?: string;
  phone?: string;
  company?: string;
  tags: string[];
  source: string;                  // free-form: "csv:<filename>" / "public-funnel" / "manual" / etc.
  capturedAt: number;              // epoch ms
  lastContactedAt?: number;        // last campaign-send epoch ms
  notes?: string;
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
  name?: string;
  phone?: string;
  company?: string;
  tags?: string[];
  source: string;
  notes?: string;
  capturedAt?: number;
}

export interface UpdateLeadPatch {
  name?: string;
  phone?: string;
  company?: string;
  tags?: string[];
  notes?: string;
  lastContactedAt?: number;
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

export type ContactType = "lead" | "customer" | "vendor";

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
  notes?: string;
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
  promotedFromLeadId?: string;
}

export interface ContactFilter {
  query?: string;
  type?: ContactType;
  tag?: string;
}

// ─── Campaign ─────────────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent";

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
  subject: string;
  bodyHtml: string;
  bodyText?: string;
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
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  audienceFilter: AudienceFilter;
  scheduleAt?: number;
}

export interface UpdateCampaignPatch {
  name?: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
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
