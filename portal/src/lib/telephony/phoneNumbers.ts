// One phone-number normaliser, for the whole system.
//
// ── Why this is its own file ──────────────────────────────────────────────
//
// Until 2026-08-29 the only normaliser lived inside
// `lib/server/email/outboundCommunications.ts`, where it was used to place a
// call. Inbound identification needs the SAME rules, and that is not a
// nice-to-have: if the outbound path turns `07700 900123` into `+447700900123`
// and the inbound matcher does anything different, a prospect you cold-called
// on Monday rings back on Tuesday and arrives as an unknown number. The whole
// point of the caller screen is that this cannot happen.
//
// So: one implementation, pure, no server imports, driven by tests.
// `outboundCommunications` re-exports it rather than keeping a second copy.
//
// ── The UK default is deliberate ──────────────────────────────────────────
//
// A bare leading `0` becomes `+44`. This is an assumption, and it is the right
// one for a UK agency cold-calling UK businesses off a CSV where half the rows
// will be `01204 …` and `07…` with no country code at all. It is stated here
// rather than buried so that the day it needs to be configurable, it is one
// obvious place.

/** The default country for numbers written without any international prefix. */
export const DEFAULT_DIALLING_PREFIX = "+44";

/**
 * A number in E.164, or null when it cannot be one.
 *
 * Null means "do not dial this and do not try to match it" — a CSV column full
 * of blanks, extensions or "ask for Dave" must not become a phone call.
 */
export function normalisePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  // 7 is shorter than any dialable UK number and 15 is the E.164 maximum.
  // Outside that range it is an extension, a reference, or junk.
  if (digits.length < 7 || digits.length > 15) return null;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (trimmed.startsWith("00")) return `+${digits.slice(2)}`;
  if (trimmed.startsWith("0")) return `${DEFAULT_DIALLING_PREFIX}${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * The key two records must share to be the same person.
 *
 * Just the normalised number — but expressed as its own function because
 * matching and dialling are different jobs that happen to agree today, and a
 * future looser match (last 9 digits, say, for numbers stored without a
 * country code) belongs here rather than sprinkled through the callers.
 */
export function phoneMatchKey(value: string | null | undefined): string | null {
  return normalisePhone(value);
}

/** Do these two written-down numbers refer to the same line? */
export function samePhoneNumber(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = phoneMatchKey(left);
  const b = phoneMatchKey(right);
  return a !== null && a === b;
}

/**
 * Readable on a screen, without pretending to be a full formatting library.
 *
 * UK mobiles and landlines are the two shapes that actually appear in this
 * product; anything else is returned as E.164, which is correct if plain.
 */
export function formatPhoneForDisplay(value: string | null | undefined): string {
  const e164 = normalisePhone(value);
  if (!e164) return (value ?? "").trim();
  if (e164.startsWith("+44") && e164.length === 13) {
    // +447700900123 → 07700 900123
    return `0${e164.slice(3, 7)} ${e164.slice(7)}`;
  }
  if (e164.startsWith("+44") && e164.length === 12) {
    // +441204123456 → 01204 123456
    return `0${e164.slice(3, 7)} ${e164.slice(7)}`;
  }
  return e164;
}
