// Brand-field validation, shared between the founder editor and the settings hub.
//
// These rules lived only inside `lib/server/editing/appConfigAdapter.ts`,
// behind a route that 404s every non-founder — which meant the only validator
// for a brand colour sat somewhere a manager could never reach, and any
// manager-facing write path would have had to grow a second, drifting copy.
// Extracted 2026-08-30 so the new `/api/portal/agency/identity` route and the
// adapter validate with the SAME rules. The adapter re-imports from here.
//
// Pure module on purpose: no "server-only", no imports. Client forms may use it
// for inline feedback; the server MUST use it again on write.

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ASSET_PATH = /^(?:https?:\/\/[^\s"'()<>\\]{3,480}|\/[^\s"'()<>\\]{0,480})$/;

export function hexColour(value: string): string | null {
  return HEX.test(value) ? null : "Use a hex colour like #0B6F6D or #0BF.";
}

export function assetPath(value: string): string | null {
  return ASSET_PATH.test(value) ? null : "Use a full https:// URL or a path starting with /.";
}

/**
 * The brand keys a non-founder may write, and nothing else.
 *
 * Deliberately NOT the whole BrandKit. `customCSS` reaches a <style> tag
 * verbatim through `brandToStyleString`, and the font/radius fields are only
 * deeply wired through the founder editor. A short allow-list a reviewer can
 * read beats a block-list somebody has to remember to extend.
 */
export const EDITABLE_BRAND_KEYS = ["primaryColor", "secondaryColor", "accentColor", "logoUrl"] as const;
export type EditableBrandKey = typeof EDITABLE_BRAND_KEYS[number];

/**
 * Validate a brand patch from a settings form. Returns the clean patch, or the
 * first problem as a sentence — a bad paste should read as feedback, not ship
 * as a broken stylesheet.
 */
export function validateBrandPatch(value: unknown):
  | { ok: true; patch: Partial<Record<EditableBrandKey, string>> }
  | { ok: false; error: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Brand must be an object." };
  }
  const record = value as Record<string, unknown>;
  const patch: Partial<Record<EditableBrandKey, string>> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (!(EDITABLE_BRAND_KEYS as readonly string[]).includes(key)) {
      // Refused rather than ignored: a silently dropped `customCSS` teaches the
      // caller the field works.
      return { ok: false, error: `"${key}" cannot be set here.` };
    }
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw !== "string") return { ok: false, error: `${key} must be text.` };
    const trimmed = raw.trim();
    const problem = key === "logoUrl" ? assetPath(trimmed) : hexColour(trimmed);
    if (problem) return { ok: false, error: `${key}: ${problem}` };
    patch[key as EditableBrandKey] = trimmed;
  }
  return { ok: true, patch };
}
