export const DEFAULT_VISITOR_CONTACT_CONSENT =
  "I agree that this business may use these details to respond to my request.";

/**
 * Keep the wording a visitor sees and the wording the server records on one
 * canonical byte representation. Whitespace and Unicode presentation
 * differences must not create a different consent statement accidentally.
 */
export function normaliseVisitorContactConsentStatement(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_VISITOR_CONTACT_CONSENT;
  const statement = value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 1_000);
  return statement || DEFAULT_VISITOR_CONTACT_CONSENT;
}

/** A public, non-secret binding between the rendered statement and request. */
export async function visitorContactConsentDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(normaliseVisitorContactConsentStatement(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}
