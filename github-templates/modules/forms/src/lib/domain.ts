// Forms domain. Per-install plugin storage. `scopePolicy: "either"` —
// install can sit at agency scope (Milesy's lead capture) or client
// scope (Felicia's customer surveys). Each install owns its own
// FormDefinitions + Submissions; data doesn't cross install boundaries.

import type { AgencyId, ClientId, UserId } from "./tenancy";

// ─── Field definition ────────────────────────────────────────────────────

export type FormFieldKind =
  | "text" | "email" | "phone" | "textarea"
  | "select" | "multiselect" | "radio" | "checkbox"
  | "number" | "date" | "hidden";

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;          // regex source — compiled at submission validation
  min?: number;
  max?: number;
}

export interface FormField {
  id: string;
  kind: FormFieldKind;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  defaultValue?: string;
  options?: FormFieldOption[];   // for select/multiselect/radio
  validation?: FormFieldValidation;
  // When integrated with client-CRM, set this to the Contact attribute
  // key the value should land in. Foundation's event router can use
  // this hint when fanning forms.submission.created → CRM ingest.
  attributeKey?: string;
}

// ─── Submit action ───────────────────────────────────────────────────────

export type SubmitActionKind = "store-only" | "redirect" | "thank-you" | "external-webhook";

export interface SubmitAction {
  kind: SubmitActionKind;
  redirectUrl?: string;
  thankYouMessage?: string;
  webhookUrl?: string;             // POSTed to on submission when kind === "external-webhook"
  notifyEmails?: string[];         // staff emails to enqueue notifications for
}

// ─── FormDefinition ──────────────────────────────────────────────────────

export type FormStatus = "draft" | "published" | "archived";

export interface FormDefinition {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;             // null = agency-scoped form
  name: string;
  description?: string;
  fields: FormField[];
  submitAction: SubmitAction;
  status: FormStatus;
  publishedAt?: number;
  submissionCount: number;         // running counter — bumped on each submission record
  // Spam-protection knobs. v1 keeps it minimal: a per-IP rate-limit window
  // that the public submit endpoint enforces.
  spamProtection?: {
    enabled: boolean;
    minSecondsBetweenSubmits?: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface CreateFormInput {
  name: string;
  description?: string;
  fields: FormField[];
  submitAction: SubmitAction;
  spamProtection?: FormDefinition["spamProtection"];
}

export interface UpdateFormPatch {
  name?: string;
  description?: string;
  fields?: FormField[];
  submitAction?: SubmitAction;
  status?: FormStatus;
  spamProtection?: FormDefinition["spamProtection"];
}

export interface FormFilter {
  status?: FormStatus;
  query?: string;
}

// ─── Submission ──────────────────────────────────────────────────────────

export type SubmissionStatus = "pending" | "reviewed" | "converted" | "spam" | "deleted";

export interface SubmissionMeta {
  ip?: string;
  userAgent?: string;
  referer?: string;
  submittedAt: number;
}

export interface Submission {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;
  formId: string;
  values: Record<string, string | string[]>;
  meta: SubmissionMeta;
  status: SubmissionStatus;
  endCustomerUserId?: UserId;
  // Idempotency key (derived from formId + email-or-id + values hash);
  // duplicate POSTs collapse into the existing row.
  idempotencyKey: string;
  createdAt: number;
}

export interface RecordSubmissionInput {
  formId: string;
  values: Record<string, string | string[]>;
  meta?: Partial<SubmissionMeta>;
  endCustomerUserId?: UserId;
}

export interface UpdateSubmissionPatch {
  status?: SubmissionStatus;
}

export interface SubmissionFilter {
  formId?: string;
  status?: SubmissionStatus;
  fromCreatedAt?: number;
  toCreatedAt?: number;
}

// ─── Templates (seeded on install) ───────────────────────────────────────

export type TemplateCategory = "contact" | "newsletter" | "lead" | "survey" | "other";

export interface FormTemplate {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;
  name: string;
  description?: string;
  category: TemplateCategory;
  fields: FormField[];
  submitAction: SubmitAction;
  isDefault: boolean;
  status: "active" | "archived";
  createdAt: number;
  updatedAt: number;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  category: TemplateCategory;
  fields: FormField[];
  submitAction: SubmitAction;
}

// ─── Validation result ───────────────────────────────────────────────────

export interface SubmissionValidationError {
  fieldId: string;
  reason: string;
}

export interface SubmissionRecordResult {
  ok: true;
  submission: Submission;
  duplicate: boolean;              // true if collapsed into an existing row
}

export interface SubmissionRecordFailure {
  ok: false;
  errors: SubmissionValidationError[];
}

// ─── Cross-plugin event payload ──────────────────────────────────────────
//
// Foundation event router reads this from `forms.submission.created`
// emits and fans it out to client-CRM's `/events/ingest`, the form's
// own webhook URL (if external-webhook), etc. Schema is stable so
// downstream consumers can pin against it.

export interface SubmissionCreatedEvent {
  formId: string;
  formName: string;
  submissionId: string;
  email?: string;                  // best-guess from values[email-field]
  endCustomerUserId?: UserId;
  values: Record<string, string | string[]>;
  occurredAt: number;
}

export interface NotificationRequestedEvent {
  submissionId: string;
  formId: string;
  formName: string;
  webhookUrl?: string;
  notifyEmails?: string[];
  payload: Record<string, unknown>;
  occurredAt: number;
}
