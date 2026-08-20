import type { WebsiteEnquiryFormCapture } from "@/lib/server/websiteEnquiries";
import type { AquaFormSchema } from "@/server/types";

/**
 * Lay a submission out in the shape of its real form (enquiry-detail-card plan,
 * Phase 3).
 *
 * Phase 1 rendered only the fields a visitor actually filled in. With the form's
 * imported schema (Phase 2) we can show the *whole* form: every field in the
 * form's own order, each carrying the submitted value or left blank where the
 * visitor skipped it — so a sparse enquiry still reads as the form it came from.
 * Answers the imported template doesn't know about (the form changed, or the tag
 * captured extras) are kept as `extras` rather than dropped.
 *
 * Pure and type-only imports, so it is safe in the client card and in tests.
 */

export interface MergedFormRow {
  key: string;
  label: string;
  /** The submitted value, or "" when the field was left blank. */
  value: string;
  type?: string;
  /** Whether the visitor actually answered this field. */
  submitted: boolean;
}

export interface MergedFormLayout {
  /** The template's fields, in the form's order, with values overlaid. */
  rows: MergedFormRow[];
  /** Submitted answers the imported template didn't contain. */
  extras: MergedFormRow[];
}

export function mergeFormLayout(capture: WebsiteEnquiryFormCapture, schema: AquaFormSchema): MergedFormLayout {
  const answers = [...capture.fields, ...capture.additional];
  const byName = new Map<string, { label?: string; value: string; type?: string }>();
  for (const answer of answers) {
    const key = answer.key.toLowerCase();
    if (!byName.has(key)) byName.set(key, answer);
  }

  const rows: MergedFormRow[] = schema.fields.map(field => {
    const hit = byName.get(field.name.toLowerCase());
    return {
      key: field.name,
      label: field.label || field.name,
      value: hit?.value ?? "",
      type: field.type,
      submitted: hit !== undefined,
    };
  });

  const inTemplate = new Set(schema.fields.map(field => field.name.toLowerCase()));
  const seen = new Set<string>();
  const extras: MergedFormRow[] = answers
    .filter(answer => {
      const key = answer.key.toLowerCase();
      if (inTemplate.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(answer => ({ key: answer.key, label: answer.label || answer.key, value: answer.value, type: answer.type, submitted: true }));

  return { rows, extras };
}
