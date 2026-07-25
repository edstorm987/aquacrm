// Submission service. Records form submissions with field validation
// + idempotency.
//
// Storage:
//   submissions/by-id/<id>             → Submission
//   submissions/by-form/<formId>       → string[] of submission ids
//   submissions/idem/<key>             → submissionId  (collapse double-submits)
//   submissions/index                  → string[] of all submission ids
//
// Idempotency key = fnv1a(formId + ":" + emailOrId + ":" + valuesHash).
// Two POSTs with the same form + same email + same value-set → same row.

import { fnv1a, makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  FormDefinition,
  FormField,
  RecordSubmissionInput,
  Submission,
  SubmissionFilter,
  SubmissionRecordFailure,
  SubmissionRecordResult,
  SubmissionStatus,
  SubmissionValidationError,
  UpdateSubmissionPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import type { FormService } from "./forms";

const SUB_INDEX_KEY = "submissions/index";
const subKey = (id: string): string => `submissions/by-id/${id}`;
const byFormKey = (fid: string): string => `submissions/by-form/${fid}`;
const idemKey = (k: string): string => `submissions/idem/${k}`;

export class SubmissionService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId | undefined,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private forms: FormService,
  ) {}

  async list(filter?: SubmissionFilter): Promise<Submission[]> {
    const ids = filter?.formId
      ? ((await this.storage.get<string[]>(byFormKey(filter.formId))) ?? [])
      : ((await this.storage.get<string[]>(SUB_INDEX_KEY)) ?? []);
    const out: Submission[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Submission>(subKey(id));
      if (row) out.push(row);
    }
    return out
      .filter(s => !filter?.status || s.status === filter.status)
      .filter(s => !filter?.fromCreatedAt || s.createdAt >= filter.fromCreatedAt)
      .filter(s => !filter?.toCreatedAt || s.createdAt <= filter.toCreatedAt)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<Submission | null> {
    const row = await this.storage.get<Submission>(subKey(id));
    if (!row) return null;
    if (row.agencyId !== this.agencyId) return null;
    if (row.clientId !== this.clientId) return null;
    return row;
  }

  async listForForm(formId: string): Promise<Submission[]> {
    return this.list({ formId });
  }

  // Public-entry record. Validates against the form's published fields,
  // computes idempotency key, collapses duplicate POSTs.
  async record(input: RecordSubmissionInput): Promise<SubmissionRecordResult | SubmissionRecordFailure> {
    const form = await this.forms.getPublishedForm(input.formId);
    if (!form) {
      return { ok: false, errors: [{ fieldId: "_form", reason: "Form not found or not published." }] };
    }
    const errors = validate(form, input.values);
    if (errors.length > 0) {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "forms.submission.validation_failed",
        { formId: form.id, errors },
      );
      return { ok: false, errors };
    }

    const submittedAt = input.meta?.submittedAt ?? now();
    const idemValue = computeIdempotencyKey(form, input.values, input.endCustomerUserId);

    // Idempotency: prior submission with same key → return collapsed.
    const priorId = await this.storage.get<string>(idemKey(idemValue));
    if (priorId) {
      const prior = await this.get(priorId);
      if (prior) {
        return { ok: true, submission: prior, duplicate: true };
      }
    }

    const id = makeId("sub");
    const ts = now();
    const row: Submission = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      formId: form.id,
      values: input.values,
      meta: {
        ip: input.meta?.ip,
        userAgent: input.meta?.userAgent,
        referer: input.meta?.referer,
        submittedAt,
      },
      status: "pending",
      endCustomerUserId: input.endCustomerUserId,
      idempotencyKey: idemValue,
      createdAt: ts,
    };
    await this.storage.set(subKey(id), row);
    await this.storage.set(idemKey(idemValue), id);
    const ix = (await this.storage.get<string[]>(SUB_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(SUB_INDEX_KEY, [...ix, id]);
    }
    const fIx = (await this.storage.get<string[]>(byFormKey(form.id))) ?? [];
    if (!fIx.includes(id)) {
      await this.storage.set(byFormKey(form.id), [...fIx, id]);
    }
    await this.forms._incrementSubmissionCount(form.id);

    const email = extractEmail(form, input.values);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      category: "forms",
      action: "forms.submission.created",
      message: `New submission on "${form.name}"${email ? ` from ${email}` : ""}.`,
      metadata: { submissionId: id, formId: form.id, email },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "forms.submission.created",
      {
        formId: form.id,
        formName: form.name,
        submissionId: id,
        email,
        endCustomerUserId: input.endCustomerUserId,
        values: input.values,
        occurredAt: submittedAt,
      },
    );
    return { ok: true, submission: row, duplicate: false };
  }

  async update(id: string, patch: UpdateSubmissionPatch, actor: UserId): Promise<Submission | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (patch.status && patch.status !== existing.status) {
      const next: Submission = { ...existing, ...patch };
      await this.storage.set(subKey(id), next);
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: this.clientId,
        actorUserId: actor,
        category: "forms",
        action: "forms.submission.status_changed",
        message: `Submission ${id}: ${existing.status} → ${patch.status}.`,
        metadata: { submissionId: id, fromStatus: existing.status, toStatus: patch.status },
      });
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "forms.submission.status_changed",
        { submissionId: id, status: patch.status },
      );
      return next;
    }
    return existing;
  }

  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    await this.storage.del(subKey(id));
    await this.storage.del(idemKey(existing.idempotencyKey));
    const ix = (await this.storage.get<string[]>(SUB_INDEX_KEY)) ?? [];
    await this.storage.set(SUB_INDEX_KEY, ix.filter(x => x !== id));
    const fIx = (await this.storage.get<string[]>(byFormKey(existing.formId))) ?? [];
    await this.storage.set(byFormKey(existing.formId), fIx.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "forms",
      action: "forms.submission.deleted",
      message: `Deleted submission ${id}.`,
      metadata: { submissionId: id },
    });
    return true;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function validate(form: FormDefinition, values: Record<string, string | string[]>): SubmissionValidationError[] {
  const errors: SubmissionValidationError[] = [];
  for (const field of form.fields) {
    const v = values[field.id];
    const isEmpty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (field.required && isEmpty) {
      errors.push({ fieldId: field.id, reason: `${field.label} is required.` });
      continue;
    }
    if (isEmpty) continue;

    // Per-kind validation.
    if (field.kind === "email" && typeof v === "string") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        errors.push({ fieldId: field.id, reason: `${field.label} must be a valid email.` });
      }
    }
    if (field.kind === "number" && typeof v === "string" && Number.isNaN(Number(v))) {
      errors.push({ fieldId: field.id, reason: `${field.label} must be a number.` });
    }
    if ((field.kind === "select" || field.kind === "radio") && typeof v === "string" && field.options) {
      if (!field.options.some(o => o.value === v)) {
        errors.push({ fieldId: field.id, reason: `${field.label} value not in options.` });
      }
    }
    if (field.kind === "multiselect" && Array.isArray(v) && field.options) {
      const allowed = new Set(field.options.map(o => o.value));
      if (!v.every(x => allowed.has(x))) {
        errors.push({ fieldId: field.id, reason: `${field.label} value not in options.` });
      }
    }

    // Validation rules.
    if (field.validation && typeof v === "string") {
      const { minLength, maxLength, pattern, min, max } = field.validation;
      if (minLength !== undefined && v.length < minLength) {
        errors.push({ fieldId: field.id, reason: `${field.label} too short (min ${minLength}).` });
      }
      if (maxLength !== undefined && v.length > maxLength) {
        errors.push({ fieldId: field.id, reason: `${field.label} too long (max ${maxLength}).` });
      }
      if (pattern) {
        try {
          if (!new RegExp(pattern).test(v)) {
            errors.push({ fieldId: field.id, reason: `${field.label} does not match required format.` });
          }
        } catch {
          // Bad regex in the form definition — surface as a soft error.
          errors.push({ fieldId: field.id, reason: `${field.label} validation pattern is invalid.` });
        }
      }
      if (field.kind === "number") {
        const n = Number(v);
        if (min !== undefined && n < min) {
          errors.push({ fieldId: field.id, reason: `${field.label} below min (${min}).` });
        }
        if (max !== undefined && n > max) {
          errors.push({ fieldId: field.id, reason: `${field.label} above max (${max}).` });
        }
      }
    }
  }
  return errors;
}

// Extract a likely email from values — first email-kind field gets used
// for the event payload + idempotency key.
function extractEmail(form: FormDefinition, values: Record<string, string | string[]>): string | undefined {
  const emailField = form.fields.find(f => f.kind === "email");
  if (!emailField) return undefined;
  const v = values[emailField.id];
  return typeof v === "string" ? v.toLowerCase().trim() : undefined;
}

// Idempotency key: form + identifier + sorted values hash.
function computeIdempotencyKey(
  form: FormDefinition,
  values: Record<string, string | string[]>,
  endCustomerUserId?: string,
): string {
  const email = extractEmail(form, values);
  const identifier = endCustomerUserId ?? email ?? "anon";
  const sortedEntries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));
  const valuesStr = sortedEntries
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.slice().sort().join(",") : v}`)
    .join("|");
  return `${form.id}:${identifier}:${fnv1a(valuesStr)}`;
}
