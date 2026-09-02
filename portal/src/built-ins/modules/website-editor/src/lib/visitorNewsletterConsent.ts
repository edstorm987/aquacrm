/** The only purpose the newsletter facade records consent for. */
export const VISITOR_NEWSLETTER_CONSENT_PURPOSE = "newsletter-subscription" as const;

// Deliberately a plain consent statement. Nothing in this module sends an
// email or connects a campaign provider, so the default wording must not
// promise a confirmation message or an unsubscribe link that does not exist.
export const DEFAULT_VISITOR_NEWSLETTER_CONSENT =
  "I agree that this business may send its newsletter to this email address.";

/**
 * Keep the wording a visitor sees and the wording the server records on one
 * canonical byte representation. Whitespace and Unicode presentation
 * differences must not create a different consent statement accidentally.
 */
export function normaliseVisitorNewsletterConsentStatement(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_VISITOR_NEWSLETTER_CONSENT;
  const statement = value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 1_000);
  return statement || DEFAULT_VISITOR_NEWSLETTER_CONSENT;
}

/** A public, non-secret binding between the rendered statement and request. */
export async function visitorNewsletterConsentDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(normaliseVisitorNewsletterConsentStatement(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}
