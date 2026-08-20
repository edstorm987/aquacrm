/**
 * What a website form actually contained, kept as submitted.
 *
 * The old contract accepted twelve fixed keys — name, email, phone, contact
 * method, services, message — and silently dropped everything else. A form
 * asking for budget, company size or how somebody heard about you lost those
 * answers on arrival, and every submission looked identical in the inbox: no
 * form name, no page beyond "/", no way to tell a hero form from a careers
 * form from a chatbot.
 *
 * Worse, `contactMethod` was mandatory. A chatbot or careers form that never
 * asked "how would you like to be contacted?" could not submit at all unless
 * the website invented an answer — so the inbox showed a preference the person
 * never expressed. Aqua now records what was asked and says so plainly when
 * something was not.
 */

/** What the form was for. Decides where it routes; never what the inbox shows. */
export const FORM_PURPOSES = [
  "enquiry",
  "careers",
  "support",
  "quote",
  "booking",
  "newsletter",
  "feedback",
  "other",
] as const;

export type FormPurpose = typeof FORM_PURPOSES[number];

export function isFormPurpose(value: unknown): value is FormPurpose {
  return typeof value === "string" && (FORM_PURPOSES as readonly string[]).includes(value);
}

/** One answer, as the form labelled it. */
export interface CapturedField {
  /** The input's `name`, which is what the website's own code calls it. */
  key: string;
  /** The visible label, so the inbox can show what the person was actually asked. */
  label?: string;
  value: string;
  /** `select`, `checkbox`, `textarea`… — a checkbox "yes" reads differently to typed text. */
  type?: string;
}

export interface FormIdentity {
  /** `data-aqua-form`, the form's `name`, or its `id` — whatever it has. */
  formName?: string;
  formId?: string;
  /** The page it sat on, so two forms on one site are distinguishable. */
  pagePath?: string;
  purpose?: FormPurpose;
  /** How the purpose was decided, so a wrong guess can be traced. */
  purposeSource?: "declared" | "field" | "inferred" | "default";
}

/**
 * Field names that answer "what is this form for", used when the form did not
 * declare a purpose but asked the visitor directly.
 *
 * Ed's forms often carry a dropdown — "I'm enquiring about…" — and that answer
 * is better evidence than anything inferred from the page it sat on.
 */
const PURPOSE_FIELD_KEYS = /^(purpose|enquiry[_-]?type|enquiry[_-]?about|reason|subject|topic|i[_-]?am[_-]?enquiring[_-]?about|how[_-]?can[_-]?we[_-]?help)$/i;

/**
 * The same question as a human wrote it on the page.
 *
 * Labels are prose — "What is your enquiry about?" — so they cannot be matched
 * with the anchored pattern used for input names, where a whole-string match
 * is what makes `subject` meaningful and `subject_line` not. A loose match is
 * safe here because the answer still has to look like a purpose before it
 * counts for anything.
 */
const PURPOSE_FIELD_LABELS = /\b(enquir|inquir|purpose|reason|regarding|about|help you|interested in)\b/i;

const PURPOSE_PATTERNS: Array<[RegExp, FormPurpose]> = [
  [/\b(career|job|vacanc|recruit|apply|application|cv|resume|hiring)\b/i, "careers"],
  [/\b(support|help|issue|problem|bug|fault|complaint|ticket)\b/i, "support"],
  [/\b(quote|quotation|estimate|pricing)\b/i, "quote"],
  [/\b(book|booking|appointment|reservation|schedule)\b/i, "booking"],
  [/\b(newsletter|subscribe|mailing[_-]?list|updates)\b/i, "newsletter"],
  [/\b(feedback|review|testimonial|survey)\b/i, "feedback"],
  [/\b(enquir|inquir|contact|sales|new business)\b/i, "enquiry"],
];

/**
 * Works out what a form was for, preferring evidence over inference.
 *
 * Order matters and is the whole point: what the site declared beats what the
 * visitor picked, which beats what the form is called. Only when nothing says
 * anything does it fall back to "enquiry" — and it records which of those
 * happened, so a careers form landing as an enquiry can be traced to the guess
 * that made it rather than looking like the system being wrong at random.
 */
export function derivePurpose(input: {
  declared?: string;
  fields?: CapturedField[];
  formName?: string;
  pagePath?: string;
}): { purpose: FormPurpose; purposeSource: FormIdentity["purposeSource"] } {
  if (isFormPurpose(input.declared)) return { purpose: input.declared, purposeSource: "declared" };

  for (const field of input.fields ?? []) {
    const asksPurpose = PURPOSE_FIELD_KEYS.test(field.key)
      || (field.label ? PURPOSE_FIELD_LABELS.test(field.label) : false);
    if (!asksPurpose) continue;
    const match = PURPOSE_PATTERNS.find(([pattern]) => pattern.test(field.value));
    if (match) return { purpose: match[1], purposeSource: "field" };
  }

  const haystack = `${input.formName ?? ""} ${input.pagePath ?? ""}`;
  const inferred = PURPOSE_PATTERNS.find(([pattern]) => pattern.test(haystack));
  if (inferred) return { purpose: inferred[1], purposeSource: "inferred" };

  // Nothing said. "Enquiry" is the safe default because it lands in front of a
  // human rather than in a queue nobody watches — but it is marked as a
  // default so it is never mistaken for something the form actually said.
  return { purpose: "enquiry", purposeSource: "default" };
}

/**
 * A one-line description of which form this was, for the inbox row.
 *
 * "Hero enquiry · /pricing" answers the question the operator actually has,
 * which "Website form · /" never did.
 */
export function describeForm(identity: FormIdentity): string {
  const name = identity.formName?.trim();
  const path = identity.pagePath?.trim();
  if (name && path && path !== "/") return `${name} · ${path}`;
  if (name) return name;
  if (path && path !== "/") return `Form on ${path}`;
  return "Website form";
}

/** Keys Aqua already stores in their own right — not repeated as extra answers. */
const CORE_KEYS = new Set([
  "name", "email", "phone", "message", "consent", "contactmethod", "contact_method",
  "services", "brand", "campaign", "sourceurl", "source_url", "website",
]);

export function isCoreField(key: string): boolean {
  return CORE_KEYS.has(key.toLowerCase().replace(/[\s-]/g, ""));
}

/**
 * Everything the visitor answered that Aqua does not already have a column
 * for — the part that used to be thrown away.
 */
export function additionalFields(fields: CapturedField[]): CapturedField[] {
  return fields.filter(field => !isCoreField(field.key) && field.value.trim());
}
