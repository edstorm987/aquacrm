// Client-CRM domain. Persisted under per-install plugin storage.
//
// Scope: per-client (Felicia's CRM is hers, not the agency's). All
// rows carry both `agencyId` and `clientId`. `endCustomerUserId` is
// the foundation User id when the contact is also a logged-in
// end-customer; null when the contact was imported / manually
// entered without a corresponding User row.

import type { AgencyId, ClientId, UserId } from "./tenancy";

// ─── Contact ─────────────────────────────────────────────────────────────

export type ContactSource =
  | "signup"             // foundation User signed up via end-customer flow
  | "manual"             // agency staff typed it in
  | "import"             // bulk-imported from CSV-shaped POST
  | "form-block"         // captured via the storefront crm-contact-form block
  | "order";             // first appeared as an ecommerce order

export type ContactStatus =
  | "active"
  | "unsubscribed"       // opted out of marketing
  | "bounced"            // email failed
  | "deleted";           // soft delete; preserved for audit

export interface Contact {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  endCustomerUserId?: UserId;
  email: string;
  name?: string;
  phone?: string;
  source: ContactSource;
  status: ContactStatus;
  segmentIds: string[];
  tags: string[];
  attributes: Record<string, string>;     // custom fields per agency/client
  firstSeenAt: number;
  lastSeenAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateContactInput {
  email: string;
  name?: string;
  phone?: string;
  endCustomerUserId?: UserId;
  source?: ContactSource;
  tags?: string[];
  attributes?: Record<string, string>;
  segmentIds?: string[];
}

export interface UpdateContactPatch {
  email?: string;
  name?: string;
  phone?: string;
  status?: ContactStatus;
  endCustomerUserId?: UserId | null;
  tags?: string[];
  attributes?: Record<string, string>;
  segmentIds?: string[];
}

export interface ContactFilter {
  segmentId?: string;
  tag?: string;
  status?: ContactStatus;
  query?: string;
}

// ─── Segment ─────────────────────────────────────────────────────────────

export type SegmentRuleField =
  | "tag"
  | "source"
  | "status"
  | "membershipPlanId"
  | "lastSeenAt"
  | "firstSeenAt"
  | "customAttr";

export type SegmentRuleOp =
  | "eq" | "neq"
  | "in" | "nin"
  | "before" | "after"             // for *SeenAt fields, value is epoch ms
  | "contains";

export interface SegmentRule {
  field: SegmentRuleField;
  op: SegmentRuleOp;
  value: string | string[] | number;
  attrKey?: string;                // when field === "customAttr"
}

export type SegmentStatus = "active" | "archived";

export interface Segment {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  name: string;
  description?: string;
  rules: SegmentRule[];            // AND-of-conditions
  isDefault: boolean;              // seeded; non-deletable
  status: SegmentStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CreateSegmentInput {
  name: string;
  description?: string;
  rules?: SegmentRule[];
}

export interface UpdateSegmentPatch {
  name?: string;
  description?: string;
  rules?: SegmentRule[];
  status?: SegmentStatus;
}

// ─── ActivityRecord ──────────────────────────────────────────────────────

export type ActivityKind =
  | "signup"
  | "login"
  | "order"
  | "subscription_started"
  | "subscription_canceled"
  | "affiliate_referral"
  | "note"
  | "email_sent"
  | "page_view"
  | "custom";

export interface ActivityRecord {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  contactId: string;
  kind: ActivityKind;
  summary: string;
  details?: Record<string, unknown>;
  occurredAt: number;
  createdAt: number;
}

export interface ActivityFilter {
  contactId?: string;
  kind?: ActivityKind;
  fromOccurredAt?: number;
  toOccurredAt?: number;
  limit?: number;
}

// ─── Cross-plugin event shapes (consumed by /events/ingest) ──────────────

export interface IngestOrderCreatedPayload {
  orderId: string;
  endCustomerUserId?: UserId;
  customerEmail?: string;
  amountTotal: number;
  currency: string;
  occurredAt?: number;
}

export interface IngestSubscriptionEventPayload {
  endCustomerUserId: UserId;
  planId: string;
  status: "started" | "canceled";
  occurredAt?: number;
}

export interface IngestAffiliateAttributionPayload {
  affiliateUserId?: UserId;
  affiliateEmail?: string;
  orderId: string;
  amountCents: number;
  occurredAt?: number;
}

// ─── Bulk import shape ───────────────────────────────────────────────────

export interface ImportContactRow {
  email: string;
  name?: string;
  phone?: string;
  tags?: string[];
  attributes?: Record<string, string>;
}

export interface ImportResult {
  total: number;
  created: number;
  updated: number;             // existing email → patched
  skipped: number;             // row missing email or other validation fail
  contactIds: string[];        // ids of the affected rows
}
