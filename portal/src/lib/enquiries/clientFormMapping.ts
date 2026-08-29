// Turning a client's own database columns into the fields Aqua already knows.
//
// Ed, 2026-08-27: *"the whole form mapping is just database connecting
// mapping"* — and, on the same day: *"make sure this all complies together
// please client facing and internal facing and of course dev facing."*
//
// ── The vocabulary is NOT new ────────────────────────────────────────────
//
// That second sentence is the one that shaped this file. Aqua already has a
// canonical enquiry vocabulary — `name`, `email`, `phone`, `message` — declared
// in `formCapture.ts` as `CORE_KEYS` and used by the internal path
// (`/api/public/brand-enquiry`, the Aqua Tag, the master inbox). A client's
// submission arriving from their own Supabase must land in the SAME fields, or
// the portal grows a second set of words for the same things and the two
// inboxes stop being comparable.
//
// So this module maps *onto* that vocabulary and reuses `isCoreField` rather
// than restating it. If a term is added there, it is added once.
//
// ── Why detection, with overrides, rather than configuration ─────────────
//
// A form built by us will call its columns `name`, `email`, `message`. Making
// somebody configure five mappings to describe the obvious is the kind of setup
// step that gets half-done and then quietly mis-attributes an enquiry. So the
// ordinary names are recognised, and the override exists for the table that
// calls its message column something else.
//
// Explicit always wins: a configured column is a statement, and detection is a
// guess. Where a guess is made, `detected` records it, so an enquiry showing
// the wrong field can be traced to the inference that caused it rather than
// looking like the system being wrong at random — the same discipline
// `derivePurpose` already applies next door.

import { isCoreField } from "./formCapture";

/** How a canonical field was decided. */
export type ClientFormFieldSource = "configured" | "detected" | "absent";

export interface ClientFormColumnOverrides {
  columnName?: string;
  columnEmail?: string;
  columnPhone?: string;
  columnMessage?: string;
  columnSubmittedAt?: string;
}

export interface MappedClientFormSubmission {
  /**
   * Aqua's own enquiry words — the same ones the internal path uses.
   *
   * `submittedAt` is not in `CORE_KEYS` because an internal enquiry carries
   * Aqua's own timestamp; here the row's timestamp is the client's, and the two
   * should not be confused.
   */
  core: {
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
    submittedAt?: string;
  };
  /** Which column each core field came from, and how that was decided. */
  provenance: Record<keyof MappedClientFormSubmission["core"], { column?: string; source: ClientFormFieldSource }>;
  /**
   * Everything else the visitor answered.
   *
   * Kept, never dropped. A client's form may ask anything — "which branch?",
   * "how did you hear about us?" — and a portal that silently showed only the
   * four fields it recognised would misrepresent what the customer actually
   * said. Same reasoning as `additionalFields` on the internal path.
   */
  additional: Array<{ key: string; value: string }>;
}

type CoreField = keyof MappedClientFormSubmission["core"];

/**
 * Column names that mean each canonical field.
 *
 * Anchored whole-string matches, deliberately: `email` and `contact_email` are
 * both an email, but `email_opt_in` is a consent checkbox and matching it
 * loosely would put "true" in the address line. The internal path anchors its
 * key patterns for exactly this reason.
 */
const COLUMN_PATTERNS: Array<[CoreField, RegExp]> = [
  ["email", /^(e[_-]?mail|email[_-]?address|contact[_-]?email|from[_-]?email)$/i],
  ["name", /^(name|full[_-]?name|your[_-]?name|contact[_-]?name|customer[_-]?name|sender[_-]?name)$/i],
  ["phone", /^(phone|phone[_-]?number|telephone|tel|mobile|contact[_-]?number|cell)$/i],
  ["message", /^(message|enquiry|inquiry|comments?|details|body|question|notes?|how[_-]?can[_-]?we[_-]?help)$/i],
  ["submittedAt", /^(created[_-]?at|submitted[_-]?at|inserted[_-]?at|timestamp|date[_-]?submitted)$/i],
];

/**
 * A name built from parts — `first_name` + `last_name` — joined only when
 * there is no single name column, so a table carrying both does not lose the
 * surname and a table carrying one is not second-guessed.
 */
/**
 * Labels are PROSE, so they are matched loosely — "How can we help?" is a
 * message field and no anchored pattern will ever say so.
 *
 * This is the same split `formCapture.ts` already makes next door, and for the
 * same reason it gives: a whole-string match is what makes `subject` meaningful
 * and `subject_line` not, and that logic simply does not transfer to a sentence
 * somebody wrote on a page. Names stay anchored; only labels get this.
 *
 * The order matters — a label containing both "email" and "name" ("Email
 * name"?) resolves to whichever role is tried first, and email is the one it
 * would hurt most to get wrong.
 */
const LABEL_PATTERNS: Array<[CoreField, RegExp]> = [
  ["email", /\be-?mail\b/i],
  ["phone", /\b(phone|telephone|mobile|contact number)\b/i],
  ["message", /\b(message|enquir|inquir|comment|detail|question|how can we help|tell us)\b/i],
  ["name", /\bname\b/i],
  ["submittedAt", /\b(submitted|received|date)\b/i],
];

const FIRST_NAME = /^(first[_-]?name|forename|given[_-]?name)$/i;
const LAST_NAME = /^(last[_-]?name|surname|family[_-]?name)$/i;

const OVERRIDE_KEYS: Record<CoreField, keyof ClientFormColumnOverrides> = {
  name: "columnName",
  email: "columnEmail",
  phone: "columnPhone",
  message: "columnMessage",
  submittedAt: "columnSubmittedAt",
};


/**
 * Which column plays which role, decided from names alone.
 *
 * Extracted so the SCHEMA mapper and the SUBMISSION mapper cannot drift. Ed
 * asked for a button that maps a form the Aqua Tag has scanned; that button and
 * the reader must agree about which column is the email, or the preview shows
 * one thing and the enquiry arrives as another.
 *
 * Takes names and labels rather than values, because at schema time there are
 * no values — the Tag has read the form's markup, not a submission.
 */
export function detectClientFormFieldRoles(
  fields: Array<{ name: string; label?: string }>,
  overrides: ClientFormColumnOverrides = {},
): Record<CoreField, { column?: string; source: ClientFormFieldSource }> {
  const out = {} as Record<CoreField, { column?: string; source: ClientFormFieldSource }>;
  const taken = new Set<string>();

  for (const [field, pattern] of COLUMN_PATTERNS) {
    const configured = (overrides[OVERRIDE_KEYS[field]] ?? "").trim().toLowerCase();
    if (configured) {
      const hit = fields.find(entry => entry.name.toLowerCase() === configured);
      if (hit) { out[field] = { column: hit.name, source: "configured" }; taken.add(hit.name.toLowerCase()); }
      else out[field] = { column: configured, source: "absent" };
      continue;
    }
    // The field's own name first; its visible label only as a fallback, since a
    // label is prose ("Your email address") and a name is an identifier.
    const byName = fields.find(entry => pattern.test(entry.name));
    const labelPattern = LABEL_PATTERNS.find(([candidate]) => candidate === field)?.[1];
    const byLabel = byName || !labelPattern
      ? undefined
      : fields.find(entry => entry.label && labelPattern.test(entry.label) && !taken.has(entry.name.toLowerCase()));
    const hit = byName ?? byLabel;
    if (hit) { out[field] = { column: hit.name, source: "detected" }; taken.add(hit.name.toLowerCase()); }
    else out[field] = { source: "absent" };
  }

  if (!out.name?.column) {
    const first = fields.find(entry => FIRST_NAME.test(entry.name));
    const last = fields.find(entry => LAST_NAME.test(entry.name));
    if (first || last) {
      out.name = { column: [first?.name, last?.name].filter(Boolean).join(" + "), source: "detected" };
      if (first) taken.add(first.name.toLowerCase());
      if (last) taken.add(last.name.toLowerCase());
    }
  }
  return out;
}

/**
 * The mapping for a form the Aqua Tag has scanned, ready to show in a
 * "map this form" step — including the fields it could not place, because a
 * mapping preview that silently omits three questions is how somebody approves
 * a mapping that loses them.
 */
export function mapScannedForm(
  fields: Array<{ name: string; label?: string }>,
  overrides: ClientFormColumnOverrides = {},
): {
  roles: Record<CoreField, { column?: string; source: ClientFormFieldSource }>;
  unmapped: Array<{ name: string; label?: string }>;
} {
  const roles = detectClientFormFieldRoles(fields, overrides);
  const claimed = new Set(
    Object.values(roles)
      .flatMap(role => (role.column ?? "").split(" + "))
      .map(name => name.trim().toLowerCase())
      .filter(Boolean),
  );
  return {
    roles,
    unmapped: fields.filter(entry => !claimed.has(entry.name.toLowerCase()) && !isCoreField(entry.name)),
  };
}

/** Map one row's fields onto Aqua's enquiry vocabulary. */
export function mapClientFormSubmission(
  fields: Array<{ key: string; value: string }>,
  overrides: ClientFormColumnOverrides = {},
): MappedClientFormSubmission {
  // ONE detector, shared with `mapScannedForm`.
  //
  // This function used to run its own copy of the same matching, and a probe
  // showed what that costs: loosening the name patterns broke the scanned-form
  // guard while the submission guard carried on passing, because they were two
  // implementations agreeing by coincidence. The test that claimed they "share
  // one detector" was comparing outputs, not construction — which is the kind
  // of green that means nothing.
  //
  // Now the roles are decided once, from names and labels, and this function
  // only looks up the values behind them.
  const roles = detectClientFormFieldRoles(
    fields.map(field => ({ name: field.key })),
    overrides,
  );
  const byKey = new Map(fields.map(field => [field.key.toLowerCase(), field]));

  const core: MappedClientFormSubmission["core"] = {};
  const provenance = {} as MappedClientFormSubmission["provenance"];
  const consumed = new Set<string>();

  for (const [field, role] of Object.entries(roles) as Array<[CoreField, { column?: string; source: ClientFormFieldSource }]>) {
    provenance[field] = role;
    if (!role.column || role.source === "absent") continue;

    // A joined name — "first_name + last_name" — needs both values.
    if (role.column.includes(" + ")) {
      const parts = role.column.split(" + ").map(name => name.trim());
      const joined = parts.map(name => byKey.get(name.toLowerCase())?.value ?? "").filter(part => part.trim()).join(" ").trim();
      if (joined) core[field] = joined;
      parts.forEach(name => consumed.add(name.toLowerCase()));
      continue;
    }

    const hit = byKey.get(role.column.toLowerCase());
    if (hit) {
      core[field] = hit.value;
      consumed.add(hit.key.toLowerCase());
    }
  }

  // Everything else the visitor answered. `isCoreField` is the INTERNAL path's
  // own test, reused rather than restated, so both inboxes agree on what counts
  // as an ordinary field.
  const additional = fields.filter(field => {
    if (consumed.has(field.key.toLowerCase())) return false;
    if (!field.value.trim()) return false;
    // Their database's own bookkeeping is not something the customer said.
    if (/^(id|uuid|submission[_-]?id|updated[_-]?at|deleted[_-]?at)$/i.test(field.key)) return false;
    return !isCoreField(field.key);
  });

  return { core, provenance, additional };
}
