// Who is on the phone, and what you need to know before you speak.
//
// Ed, 2026-08-29: *"I also need incoming calls in this with categories so I
// know when I answer the phone who it is — if contact is there what stage, so
// if I cold called them no answer I'll know in sales etc, if client I know
// it's a client."*
//
// ── The one job ───────────────────────────────────────────────────────────
//
// Turn a ringing number into a sentence you can act on in the two seconds
// before you say hello. That is a CLASSIFICATION problem, and it is pure: the
// records go in, an identity comes out. Kept out of the route and out of the
// component so it can be driven by a test, the same way `devConsoleLoad` and
// `pluginHealth` are.
//
// ── Why "client" beats "lead" beats "cold" ────────────────────────────────
//
// One human can be all three at once: a contact row from a bought CSV, a lead
// captured from the website, and a live client. Answering "this is a cold
// prospect" to a paying client is the single worst thing this screen could do,
// so the precedence is fixed and tested rather than left to whichever record
// the storage happened to return first.
//
// ── Never say "unknown" when you know something ───────────────────────────
//
// A number with no record still carries information — whether it is on the
// do-not-call list, whether you dialled it twenty minutes ago. An identity is
// therefore always returned; `kind: "unknown"` means "no record", not "no
// answer available".

import { phoneMatchKey } from "@/lib/telephony/phoneNumbers";

/** What kind of relationship the caller already has with you. */
export type CallerKind = "client" | "lead" | "prospect" | "unknown";

/**
 * A record that carries a phone number, flattened to the fields that decide an
 * identity. Structural on purpose: contacts, leads and client-linked rows all
 * satisfy it without this file importing any of their modules.
 */
export interface CallerRecord {
  /** Distinguishes a contact row from a lead row from a client link. */
  source: "contact" | "lead";
  id: string;
  phone?: string;
  /** For the OUTBOUND email suppression check — inbound calls never use it. */
  email?: string;
  name?: string;
  company?: string;
  tags?: string[];
  /** Set when this row is attached to a real client workspace. */
  clientId?: string;
  /** The client's journey stage, when `clientId` resolves to one. */
  clientStage?: string;
  clientName?: string;
  /** The lead's own pipeline status, when this is a lead row. */
  leadStatus?: string;
  doNotCall?: boolean;
  lastContactedAt?: number;
  /** The outcome you logged last time you rang — "no answer", "callback". */
  lastCallOutcome?: string;
}

export interface CallerIdentity {
  /** E.164, or the raw string when it could not be normalised. */
  phone: string;
  kind: CallerKind;
  /** The line you read first: "Karen Webb · Bolton Dental". */
  displayName: string;
  company?: string;
  /** "Client · live", "Lead · contacted", "Cold prospect". Read this second. */
  categoryLabel: string;
  clientId?: string;
  clientStage?: string;
  contactId?: string;
  leadId?: string;
  doNotCall: boolean;
  lastContactedAt?: number;
  lastCallOutcome?: string;
  /**
   * Every record that matched, best first.
   *
   * Kept because one human really can be a contact AND a lead AND a client,
   * and hiding the other two would make the screen quietly wrong rather than
   * usefully brief.
   */
  matches: CallerRecord[];
}

/** Tags that mean "never ring this number again", however they were typed. */
const DO_NOT_CALL_TAGS = new Set(["do-not-call", "donotcall", "dnc", "do not call", "opt-out", "opted-out"]);

/**
 * Is this row flagged not to be called?
 *
 * Both an explicit boolean and a tag are honoured. The tag exists because it
 * works today with no migration and can be typed by whoever is on the phone the
 * moment somebody says "take me off your list" — which is exactly when the
 * flag needs setting, and exactly when nobody is going to open a settings page.
 */
export function isDoNotCall(record: Pick<CallerRecord, "doNotCall" | "tags">): boolean {
  if (record.doNotCall) return true;
  return (record.tags ?? []).some(tag => DO_NOT_CALL_TAGS.has(tag.trim().toLowerCase()));
}

/** Client beats lead beats cold prospect. Lower sorts first. */
function rank(record: CallerRecord): number {
  if (record.clientId) return 0;
  if (record.source === "lead") return 1;
  return 2;
}

function kindOf(record: CallerRecord): CallerKind {
  if (record.clientId) return "client";
  if (record.source === "lead") return "lead";
  return "prospect";
}

/** Title-case a stage or status id for reading: "in-progress" → "In progress". */
function humanise(value: string): string {
  const spaced = value.replace(/[-_]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "";
}

/**
 * The line that tells you how to answer the phone.
 *
 * A client's STAGE is included because "Client · onboarding" and "Client ·
 * live" are different conversations. A cold prospect's last outcome is
 * included for the same reason: "you rang them yesterday, no answer" changes
 * the opening sentence.
 */
export function categoryLabelFor(record: CallerRecord | null): string {
  if (!record) return "Unknown number";
  if (record.clientId) {
    const stage = record.clientStage ? humanise(record.clientStage) : "";
    return stage ? `Client · ${stage}` : "Client";
  }
  if (record.source === "lead") {
    const status = record.leadStatus ? humanise(record.leadStatus) : "";
    return status ? `Lead · ${status}` : "Lead";
  }
  const outcome = record.lastCallOutcome?.trim();
  if (outcome) return `Cold prospect · ${humanise(outcome)}`;
  return record.lastContactedAt ? "Cold prospect · contacted" : "Cold prospect";
}

/** The name to show, falling back through company before giving up. */
function displayNameFor(record: CallerRecord | null, phone: string): string {
  if (!record) return phone;
  const name = record.name?.trim();
  if (name) return name;
  // A client workspace name is a real answer when the person's name is blank.
  const clientName = record.clientName?.trim();
  if (clientName) return clientName;
  const company = record.company?.trim();
  if (company) return company;
  return phone;
}

/**
 * Identify a ringing (or about-to-be-dialled) number against known records.
 *
 * `records` is every row the caller could possibly be — the server hands in
 * contacts and leads and this picks. Matching is on the shared normalised key,
 * so it agrees with what the dialler actually dialled.
 */
export function resolveCallerIdentity(rawPhone: string, records: CallerRecord[]): CallerIdentity {
  const key = phoneMatchKey(rawPhone);
  const phone = key ?? rawPhone.trim();

  const matches = key === null
    ? []
    : records
        .filter(record => phoneMatchKey(record.phone) === key)
        .sort((left, right) => rank(left) - rank(right));

  const best = matches[0] ?? null;

  return {
    phone,
    kind: best ? kindOf(best) : "unknown",
    displayName: displayNameFor(best, phone),
    ...(best?.company ? { company: best.company } : {}),
    categoryLabel: categoryLabelFor(best),
    ...(best?.clientId ? { clientId: best.clientId } : {}),
    ...(best?.clientStage ? { clientStage: best.clientStage } : {}),
    ...(best && best.source === "contact" ? { contactId: best.id } : {}),
    ...(best && best.source === "lead" ? { leadId: best.id } : {}),
    // ANY matching record forbidding the call forbids it. A person who opted
    // out on their lead row has not consented via a stale contact row.
    doNotCall: matches.some(isDoNotCall),
    ...(best?.lastContactedAt ? { lastContactedAt: best.lastContactedAt } : {}),
    ...(best?.lastCallOutcome ? { lastCallOutcome: best.lastCallOutcome } : {}),
    matches,
  };
}
