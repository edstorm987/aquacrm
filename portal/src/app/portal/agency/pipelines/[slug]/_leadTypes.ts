// Lead shapes shared between the pipeline workspace and the views split out of it.
//
// Created 2026-08-29. An adversarial check on extracting `ConvertLeadModal`
// refuted it on exactly one ground: `LeadView`, `AgencyProductOption` and
// `ClientConversionPackage` are module-scope interfaces the PARENT keeps using,
// so a child importing them back — while the parent imports the child — is a
// circular import. Type-only, and erased at build time, but recorded in the
// source for no reason.
//
// Same resolution as `_radarShared.ts` for the Command Centre: a third module
// both sides import. The parent re-exports these for its own importers, so
// nothing outside this directory changes.

import type { PortalCustomFieldValues } from "@/components/forms/PortalCustomFields";
import type { LeadTimingSnapshot } from "@/lib/enquiries/leadTiming";
import type { LeadRelationshipCategory } from "@/built-ins/modules/leads-pipeline/src/lib/domain";
import type { PortalFormFieldDefinition } from "@/server/types";
import type { WebsiteEnquiryClassification } from "@/lib/enquiries/enquiryClassification";

export interface LeadView {
  id: string;
  clientId?: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  source: string;
  relationshipCategory?: LeadRelationshipCategory;
  tags: string[];
  notes?: string;
  capturedAt: number;
  lastEnquiryAt?: number;
  lastEnquiryRespondedAt?: number;
  enquiryCount?: number;
  firstContactedAt?: number;
  lastContactedAt?: number;
  currentStageId?: string;
  stageEnteredAt?: number;
  convertedAt?: number;
  journeyEvents?: LeadJourneyEventView[];
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
  existingServicePlan?: string;
  existingProductId?: string;
  existingProjectValue?: string;
  existingBillingCadence?: string;
  niche?: string;
  sentCount?: number;
  columnId: string;
  brandId?: string;
  brandName?: string;
  serviceIds: string[];
  serviceNames: string[];
  enquiryId?: string;
  enquiryClassification?: WebsiteEnquiryClassification;
  customFields: PortalCustomFieldValues;
}

export interface AgencyProductOption {
  id: string;
  kind: "product" | "package";
  name: string;
  category: string;
  description: string;
  buyerHeadline?: string;
  portalRequirement: "required" | "optional" | "none";
  includedProductIds: string[];
  pricing: "fixed" | "from" | "recurring" | "custom";
  priceCents?: number;
  billingInterval?: "month" | "quarter" | "year";
}

export interface ClientConversionPackage {
  productId: string;
  createPortal: boolean;
  projectValue: string;
  billingCadence: string;
}

export interface LeadJourneyEventView {
  id: string;
  type: "lead-captured" | "enquiry-received" | "contact-recorded" | "stage-changed" | "meeting-scheduled" | "converted" | "archived" | "restored";
  at: number;
  source?: string;
  enquiryId?: string;
  fromStage?: string;
  toStage?: string;
  channel?: string;
  outcome?: string;
  note?: string;
  scheduledFor?: number;
  clientId?: string;
}

export type MeetingMode = "google-meet" | "phone" | "in-person" | "other";

export type MeetingStatus = "scheduled" | "confirmed" | "completed" | "no-show" | "cancelled" | "rescheduled";

export type AttemptChannel = "call" | "email" | "sms" | "whatsapp" | "in-person";

export type AttemptOutcome = "attempted" | "reached" | "reminder-sent" | "no-show" | "rescheduled" | "completed";

export interface MeetingAttempt {
  id: string;
  at: number;
  channel: AttemptChannel;
  outcome: AttemptOutcome;
  notes?: string;
}

export interface SalesPresentation {
  id: string;
  title: string;
  url: string;
}

export interface LeadDetailsPatch {
  email?: string;
  name?: string;
  phone?: string;
  company?: string;
  relationshipCategory?: LeadRelationshipCategory;
  tags?: string[];
  notes?: string;
  callRecordingUrl?: string;
  sessionNotes?: string;
  inspirationLinks?: string[];
  potentialProblems?: string;
  potentialSolutions?: string;
  pricePoints?: string;
  budgetRange?: string;
  designFeedback?: string;
  supportNotes?: string;
  customFields?: PortalCustomFieldValues;
}

export interface LeadSaveResult {
  ok: boolean;
  error?: string;
}

export interface LeadMeetingDraft {
  date: string;
  link: string;
  notes: string;
  mode: MeetingMode;
  location: string;
  status: MeetingStatus;
  confirmed: boolean;
  reminderAt: string;
  attemptChannel: AttemptChannel;
  attemptOutcome: AttemptOutcome | "";
  attemptNotes: string;
  salesPresentations: SalesPresentation[];
}
