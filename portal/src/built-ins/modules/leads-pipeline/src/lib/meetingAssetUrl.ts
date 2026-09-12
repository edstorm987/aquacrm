const ALLOWED_MEETING_ASSET_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Return the canonical, browser-safe form of a meeting or recording URL.
 *
 * This is deliberately strict: relative URLs and credential-bearing URLs are
 * not valid external meeting assets. Callers that render legacy data can use
 * this as a filter; persistence callers should use
 * `cleanMeetingAssetUrlForStorage` so unsafe input is rejected explicitly.
 */
export function safeMeetingAssetUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim();
  if (!candidate) return undefined;

  try {
    const parsed = new URL(candidate);
    if (!ALLOWED_MEETING_ASSET_PROTOCOLS.has(parsed.protocol)) return undefined;
    if (!parsed.hostname || parsed.username || parsed.password) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

/**
 * Validate an optional meeting asset at a write boundary. Blank/null values
 * clear the field; a supplied unsafe value fails the whole mutation.
 */
export function cleanMeetingAssetUrlForStorage(
  value: unknown,
  label: "Meeting link" | "Call recording URL",
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;

  const safe = safeMeetingAssetUrl(value);
  if (!safe) {
    throw new Error(`${label} must be a valid HTTP or HTTPS URL without embedded credentials.`);
  }
  return safe;
}
